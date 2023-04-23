import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { Accounts } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import { waitForNextRewardPhase } from "../helpers";
import { broadcastStackSTX } from "../helpers-direct-stacking";
import {
  broadcastDelegateSTX,
  broadcastDelegateStackIncrease,
} from "../helpers-pooled-stacking";

describe("testing stacker who is also a pool under epoch 2.1", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let timeline = {
    epoch_2_0: 100,
    epoch_2_05: 102,
    epoch_2_1: 106,
    pox_2_activation: 109,
  };
  const fee = 1000;

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator(getNetworkIdFromEnv());
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("using direct stacking and delegate-stack-increase throws ArithmeticUnderflow,", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();
    // Wait for block N+1 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 1);

    const blockHeight = timeline.pox_2_activation + 1;
    const cycles = 1;

    // Alice stacks 90m STX
    let response = await broadcastStackSTX(
      2,
      network,
      90_000_000_000_000,
      Accounts.WALLET_1,
      blockHeight,
      cycles,
      fee,
      0
    );
    expect(response.error).toBeUndefined();

    // Bob delegates 80m to Alice address
    response = await broadcastDelegateSTX(
      2,
      network,
      Accounts.WALLET_2,
      fee,
      0,
      80_000_000_000_000,
      Accounts.WALLET_1
    );
    expect(response.error).toBeUndefined();
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.success).toBeTruthy();

    // Alice tries to increase Bob's delegation by 80m
    response = await broadcastDelegateStackIncrease(
      2,
      network,
      Accounts.WALLET_1,
      fee,
      1,
      Accounts.WALLET_2,
      Accounts.WALLET_1,
      80_000_000_000_000
    );
    expect(response.error).toBeUndefined();
    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    // throws ArithmeticUnderflow
    // because Bob does not have any stacking yet
    // therefore no increase possible.
    // pox-2 does not handle this user error gracefully
    // because it assume stx-account.unlock-height to be > first-burnchain-block-height
    expect(tx.result).toBe("(err none)");
    expect(tx.success).toBeFalsy();
  });
});
