import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { Accounts } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import {
  waitForNextRewardPhase,
  readRewardCyclePoxAddressForAddress,
} from "../helpers";
import {
  broadcastStackIncrease,
  broadcastStackSTX,
} from "../helpers-direct-stacking";
import { cvToString } from "@stacks/transactions";

describe("testing multiple stack-stx and stack-increase calls in the same block", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let timeline = {
    epoch_2_0: 100,
    epoch_2_05: 102,
    epoch_2_1: 106,
    pox_2_activation: 109,
  };

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

    const blockHeight = timeline.pox_2_activation + 1;
    const fee = 1000;

    // Alice stacks 80m STX
    let response = await broadcastStackSTX(
      { poxVersion: 2, network, account: Accounts.WALLET_1, fee, nonce: 0 },
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
      { poxVersion: 2, network, account: Accounts.WALLET_2, fee, nonce: 0 },
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
      { network, account: Accounts.WALLET_1, fee, nonce: 1 },
      { amount: increaseAmount }
    );

    const bobIncrease = broadcastStackIncrease(
      {
        network,
        account: Accounts.WALLET_2,
        fee,
        nonce: 1,
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
});
