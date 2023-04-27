import {
  DevnetNetworkOrchestrator,
  stacksNodeVersion,
} from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { uintCV } from "@stacks/transactions";
import { Accounts, Constants } from "../../constants";
import {
  DEFAULT_EPOCH_TIMELINE,
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
  broadcastDelegateStackIncrease,
  broadcastStackAggregationCommitIndexed,
} from "../helpers-pooled-stacking";

describe("testing mixed direct and pooled stacking under epoch 2.1", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let version: string;
  if (typeof stacksNodeVersion === "function") {
    version = stacksNodeVersion();
  } else {
    version = "2.1";
  }
  const fee = 1000;

  beforeAll(() => {
    const timeline = {
      ...DEFAULT_EPOCH_TIMELINE,
      epoch_2_2: 2000,
      pox_2_unlock_height: 2001,
    };
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

  it("delegate-stack-increase should add more locked stx to direct stacker (cycle #1)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();
    // Wait for block N+1 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 1);

    const blockHeight = Constants.DEVNET_DEFAULT_POX_2_ACTIVATION + 1;
    const cycles = 1;

    // Faucet stacks 75m STX
    let response = await broadcastStackSTX(
      { poxVersion: 2, network, account: Accounts.FAUCET, fee, nonce: 0 },
      { amount: 75_000_000_000_000, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();

    // Faucet delegates 1_100m to Bob
    response = await broadcastDelegateSTX(
      { poxVersion: 2, network, account: Accounts.FAUCET, fee, nonce: 1 },
      { amount: 1_100_000_000_000_000, poolAddress: Accounts.WALLET_2 }
    );
    expect(response.error).toBeUndefined();
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.success).toBeTruthy();

    // Bob increase delegation by 920m
    response = await broadcastDelegateStackIncrease(
      { poxVersion: 2, network, account: Accounts.WALLET_2, fee, nonce: 0 },
      {
        stacker: Accounts.FAUCET,
        poolRewardAccount: Accounts.WALLET_2,
        increaseByAmountUstx: 920_000_000_000_000,
      }
    );
    expect(response.error).toBeUndefined();

    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success, tx.result).toBeTruthy();

    // Bob commits 920m
    response = await broadcastStackAggregationCommitIndexed(
      { poxVersion: 2, network, account: Accounts.WALLET_2, fee, nonce: 1 },
      { poolRewardAccount: Accounts.WALLET_2, cycleId: 2 }
    );
    expect(response.error).toBeUndefined();

    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.result).toBe("(ok u1)");
    expect(tx.success).toBeTruthy();

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 995m STX locked
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(29_290_000_000_000);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(995_000_000_000_000);

    // Check Faucets's table entry
    let poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      0
    );
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(75_000_000_000_000));

    // Check Bob's table entry
    let poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      1
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(920_000_000_000_000));
  });

  it("auto-unlock does not remove locked amount from delegation (BUG) (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();

    // move on to the next cycle after unlock (N+5)
    await waitForNextRewardPhase(network, orchestrator, 5);

    let poxInfo = await getPoxInfo(network);
    // Assert that the current cycle has 920m STX locked and earning
    expect(poxInfo.current_cycle.id).toBe(2);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(920_000_000_000_000);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(76_670_000_000_000);

    // Alice's table entry has been removed
    // Check Bob's table entry
    let poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      0
    );
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(920_000_000_000_000));

    let poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      1
    );
    expect(poxAddrInfo1?.["total-ustx"]).toBeUndefined();

    // THIS IS THE BUG
    // Faucet has no locked STX but Bob's pool still has 920m locked
    await expectAccountToBe(
      network,
      Accounts.FAUCET.stxAddress,
      1_000_000_000_000_000 - fee * 2,
      0
    );
  });
});
