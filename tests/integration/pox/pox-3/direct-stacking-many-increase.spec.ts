import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { cvToString } from "@stacks/transactions";
import { Accounts } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  getChainInfo,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import { readRewardCyclePoxAddressForAddress } from "../helpers";
import {
  broadcastStackIncrease,
  broadcastStackSTX,
} from "../helpers-direct-stacking";

describe("testing multiple stack-stx and stack-increase calls in the same block", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let timeline = {
    epoch_2_0: 100,
    epoch_2_05: 102,
    epoch_2_1: 104,
    pox_2_activation: 105,
    epoch_2_2: 106,
    epoch_2_3: 108,
    epoch_2_4: 112,
  };
  const fee = 1000;
  let aliceNonce = 0;
  let bobNonce = 0;

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator(
      getNetworkIdFromEnv(),
      timeline
    );
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  // This test would have failed due to the bug in pox-2
  it("multiple stack-stx and stack-increase calls in the same block", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for 2.4 to go live
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_4
    );
    await orchestrator.waitForNextStacksBlock();

    let chainInfo = await getChainInfo(network);
    const blockHeight = chainInfo.burn_block_height;

    // Alice stacks 80m STX
    let response = await broadcastStackSTX(
      {
        poxVersion: 3,
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
        poxVersion: 3,
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
        poxVersion: 3,
        network,
        account: Accounts.WALLET_1,
        fee,
        nonce: aliceNonce++,
      },
      { amount: increaseAmount }
    );

    const bobIncrease = broadcastStackIncrease(
      {
        poxVersion: 3,
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

    const [bobBlock, bobTx] = await waitForStacksTransaction(
      orchestrator,
      bobResponse.txid
    );
    expect(bobTx.success).toBeTruthy();

    // Read Alice and Bob's total-ustx values after the stack-increase transactions
    const alicePoxAddressInfo = await readRewardCyclePoxAddressForAddress(
      network,
      3,
      2, // the next cycle
      Accounts.WALLET_1.stxAddress
    );
    const bobPoxAddressInfo = await readRewardCyclePoxAddressForAddress(
      network,
      3,
      2, // the next cycle
      Accounts.WALLET_2.stxAddress
    );

    const aliceTotalUstx = alicePoxAddressInfo
      ? cvToString(alicePoxAddressInfo["total-ustx"])
      : "";
    const bobTotalUstx = bobPoxAddressInfo
      ? cvToString(bobPoxAddressInfo["total-ustx"])
      : "";

    // Alice and Bob's total-ustx values should be the same
    expect(aliceTotalUstx).toEqual(bobTotalUstx);
  });
});
