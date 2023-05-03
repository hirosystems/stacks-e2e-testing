import {
  DevnetNetworkOrchestrator,
  stacksNodeVersion,
} from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { uintCV } from "@stacks/transactions";
import { Accounts, Constants } from "../../constants";
import {
  DEFAULT_EPOCH_TIMELINE,
  asyncExpectStacksTransactionSuccess,
  broadcastSTXTransfer,
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import {
  expectAccountToBe,
  getPoxInfo,
  readRewardCyclePoxAddressListAtIndex,
  waitForNextRewardPhase,
} from "../helpers";
import { broadcastStackSTX } from "../helpers-direct-stacking";
import {
  broadcastDelegateSTX,
  broadcastDelegateStackSTX,
  broadcastStackAggregationCommitIndexed,
} from "../helpers-pooled-stacking";

describe("testing direct stacker as pool operator without auto-unlock under epoch 2.1", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let version: string;
  if (typeof stacksNodeVersion === "function") {
    version = stacksNodeVersion();
  } else {
    version = "2.1";
  }
  const fee = 1000;
  const timeline = {
    ...DEFAULT_EPOCH_TIMELINE,
    epoch_2_2: 127,
    pox_2_unlock_height: 128,
  };
  let aliceNonce = 0;
  let faucetNonce = 0;

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator(
      getNetworkIdFromEnv(),
      version,
      timeline
    );
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("using direct stacking and delegate-stack-increase should not result in auto-unlock", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();
    // Wait for block N+1 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 1);

    const blockHeight = Constants.DEVNET_DEFAULT_POX_2_ACTIVATION + 1;
    const cycles = 1;

    // Alice stacks 80m STX
    let response = await broadcastStackSTX(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_1,
        fee,
        nonce: aliceNonce++,
      },
      { amount: 80_000_000_000_000, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();

    // Faucet delegates 999m to Alice address
    response = await broadcastDelegateSTX(
      {
        poxVersion: 2,
        network,
        account: Accounts.FAUCET,
        fee,
        nonce: faucetNonce++,
      },
      { amount: 999000000000000, poolAddress: Accounts.WALLET_1 }
    );
    expect(response.error).toBeUndefined();
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.success, tx.result).toBeTruthy();

    // Alice locks 999m as pool operator
    response = await broadcastDelegateStackSTX(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_1,
        fee,
        nonce: aliceNonce++,
      },
      {
        stacker: Accounts.FAUCET,
        amount: 999000000000000,
        poolRewardAccount: Accounts.WALLET_1,
        startBurnHeight: blockHeight,
        lockPeriodCycles: 1,
      }
    );
    expect(response.error).toBeUndefined();
    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success, tx.result).toBeTruthy();

    // Alice commits 999m
    response = await broadcastStackAggregationCommitIndexed(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_1,
        fee,
        nonce: aliceNonce++,
      },
      { poolRewardAccount: Accounts.WALLET_1, cycleId: 2 }
    );
    expect(response.error).toBeUndefined();

    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success, tx.result).toBeTruthy();

    let poxInfo = await getPoxInfo(network);

    expect(poxInfo.current_cycle.id).toBe(1);
    // Assert that the next cycle has 990m STX locked
    expect(poxInfo.next_cycle.stacked_ustx).toBe(1_079_000_000_000_000);

    // Check Alice's table entry
    let poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      0
    );
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(80_000_000_000_000));

    // Check Alice's second table entry
    let poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      1
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(999_000_000_000_000));

    await expectAccountToBe(
      network,
      Accounts.WALLET_1.stxAddress,
      100_000_000_000_000 - 80_000_000_000_000 - aliceNonce * fee,
      80_000_000_000_000
    );

    // Wait until unlock happens that is block N+5 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 5);

    poxInfo = await getPoxInfo(network);
    expect(poxInfo.current_cycle.id).toBe(2);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(89_920_000_000_000);
    // Assert that the next cycle has 10790m STX locked
    // Alice amount was not unlocked because the same
    // pox address was used as pool address
    // thereby, the total locked of 1079m was above the minimum of 89m.
    expect(poxInfo.current_cycle.stacked_ustx).toBe(1_079_000_000_000_000);

    // Check Alice's table entry
    poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(network, 2, 0);
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(80_000_000_000_000));

    // Check Alice's second table entry
    poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(network, 2, 1);
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(999_000_000_000_000));

    await expectAccountToBe(
      network,
      Accounts.WALLET_1.stxAddress,
      100_000_000_000_000 - 80_000_000_000_000 - aliceNonce * fee,
      80_000_000_000_000
    );
  });

  it("everything unlocks as expected upon v2 unlock height", async () => {
    // This test should only run when running a 2.2 node
    if (version !== "2.2") {
      return;
    }
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for 2.2 activation and unlock
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.pox_2_unlock_height + 1
    );

    // Check Alice's account info
    await expectAccountToBe(
      network,
      Accounts.WALLET_1.stxAddress,
      100_000_000_000_000 - aliceNonce * fee,
      0
    );

    // Verify that Alice's STX are really unlocked by doing a transfer
    let response = await broadcastSTXTransfer(
      { network, account: Accounts.WALLET_1, fee, nonce: aliceNonce++ },
      {
        amount: 100_000_000_000_000 - aliceNonce * fee,
        recipient: Accounts.WALLET_3.stxAddress,
      }
    );
    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);

    // Check Faucet's account info
    await expectAccountToBe(
      network,
      Accounts.FAUCET.stxAddress,
      1_000_000_000_000_000 - faucetNonce * fee,
      0
    );

    // Verify that Faucet's STX are really unlocked by doing a transfer
    response = await broadcastSTXTransfer(
      { network, account: Accounts.FAUCET, fee, nonce: faucetNonce++ },
      {
        amount: 1_000_000_000_000_000 - faucetNonce * fee,
        recipient: Accounts.WALLET_3.stxAddress,
      }
    );
    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);
  });

  it("PoX should stay disabled indefinitely", async () => {
    // This test should only run when running a 2.2 node
    if (version !== "2.2") {
      return;
    }

    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
    let poxInfo = await getPoxInfo(network);
    await waitForNextRewardPhase(
      network,
      orchestrator,
      poxInfo.current_cycle.id + 1
    );

    poxInfo = await getPoxInfo(network);
    expect(poxInfo.current_cycle.is_pox_active).toBeFalsy();
  });
});
