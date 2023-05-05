import {
  DevnetNetworkOrchestrator,
  stacksNodeVersion,
} from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { cvToString } from "@stacks/transactions";
import { Accounts, Constants } from "../../constants";
import {
  asyncExpectStacksTransactionSuccess,
  broadcastSTXTransfer,
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import {
  expectAccountToBe,
  getPoxInfo,
  readRewardCyclePoxAddressForAddress,
  waitForNextRewardPhase,
} from "../helpers";
import {
  broadcastStackIncrease,
  broadcastStackSTX,
} from "../helpers-direct-stacking";

describe("testing multiple stack-stx and stack-increase calls in the same block", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let version: string;
  if (typeof stacksNodeVersion === "function") {
    version = stacksNodeVersion();
  } else {
    version = "2.1";
  }
  const fee = 1000;
  let aliceNonce = 0;
  let bobNonce = 0;

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator(getNetworkIdFromEnv());
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("multiple stack-stx and stack-increase calls in the same block", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();
    // Wait for block N+1 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 1);

    const blockHeight = Constants.DEVNET_DEFAULT_POX_2_ACTIVATION + 1;

    // Alice stacks 80m STX
    let response = await broadcastStackSTX(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_1,
        fee,
        nonce: aliceNonce++,
      },
      {
        amount: 80_000_000_000_000,
        blockHeight,
        cycles: 1,
      }
    );
    expect(response.error).toBeUndefined();

    // Wait for Alice's stacking transaction to confirm
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.success).toBeTruthy();

    // Bob stacks 80m STX
    response = await broadcastStackSTX(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_2,
        fee,
        nonce: bobNonce++,
      },
      {
        amount: 80_000_000_000_000,
        blockHeight,
        cycles: 1,
      }
    );
    expect(response.error).toBeUndefined();

    // Wait for Bob's stacking transaction to confirm
    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success).toBeTruthy();

    // Alice and Bob both increase their stacks by 10m STX in the same block
    const increaseAmount = 10_000_000_000_000;
    const aliceIncrease = broadcastStackIncrease(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_1,
        fee,
        nonce: aliceNonce++,
      },
      { amount: increaseAmount }
    );

    const bobIncrease = broadcastStackIncrease(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_2,
        fee,
        nonce: bobNonce++,
      },
      { amount: increaseAmount }
    );

    // Wait for both stack-increase transactions to confirm
    const [aliceResponse, bobResponse] = await Promise.all([
      aliceIncrease,
      bobIncrease,
    ]);

    expect(aliceResponse.error).toBeUndefined();
    expect(bobResponse.error).toBeUndefined();

    const [aliceBlock, aliceTx] = await waitForStacksTransaction(
      orchestrator,
      aliceResponse.txid
    );
    expect(aliceTx.success).toBeTruthy();

    // Read Alice and Bob's total-ustx values after the stack-increase transactions
    const alicePoxAddressInfo = await readRewardCyclePoxAddressForAddress(
      network,
      2, // the next cycle
      Accounts.WALLET_1.stxAddress
    );
    const bobPoxAddressInfo = await readRewardCyclePoxAddressForAddress(
      network,
      2, // the next cycle
      Accounts.WALLET_2.stxAddress
    );

    const aliceTotalUstx = alicePoxAddressInfo
      ? cvToString(alicePoxAddressInfo["total-ustx"])
      : "";
    const bobTotalUstx = bobPoxAddressInfo
      ? cvToString(bobPoxAddressInfo["total-ustx"])
      : "";

    // The total-ustx values should be different due to the bug in stack-increase
    expect(aliceTotalUstx).not.toEqual(bobTotalUstx);
  });

  it("everything unlocks as expected upon v2 unlock height", async () => {
    // This test should only run when running a 2.2 node
    if (version !== "2.2") {
      return;
    }
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for 2.2 activation and unlock
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      Constants.DEVNET_DEFAULT_EPOCH_2_2 + 2
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

    // Check Bob's account info
    await expectAccountToBe(
      network,
      Accounts.WALLET_2.stxAddress,
      100_000_000_000_000 - bobNonce * fee,
      0
    );

    // Verify that Bob's STX are really unlocked by doing a transfer
    response = await broadcastSTXTransfer(
      { network, account: Accounts.WALLET_2, fee, nonce: bobNonce++ },
      {
        amount: 100_000_000_000_000 - bobNonce * fee,
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
