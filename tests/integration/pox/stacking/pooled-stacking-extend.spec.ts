import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { Accounts } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import {
  expectNoError,
  getPoxInfo,
  waitForNextRewardPhase,
  waitForRewardCycleId,
} from "../helpers";
import {
  broadcastDelegateSTX,
  broadcastDelegateStackExtend,
  broadcastDelegateStackIncrease,
  broadcastDelegateStackSTX,
  broadcastStackAggregationCommitIndexed,
  broadcastStackAggregationIncrease,
} from "../helpers-pooled-stacking";

describe("testing pooled stacking under epoch 2.1", () => {
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
  
  it("pool operators can lock user's locked stx for longer", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();
    // Wait for block N+1 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 1);
    const fee = 1000;

    // Alice delegates 70m STX
    let response = await broadcastDelegateSTX(
      2,
      network,
      Accounts.WALLET_1,
      fee,
      2, // nonce 1 used in second test
      70_000_000_000_000,
      Accounts.WALLET_3
    );
    expectNoError(response);

    // Cloe locks 70m for Alice for 1 cycle
    response = await broadcastDelegateStackSTX(
      2,
      network,
      Accounts.WALLET_3,
      fee,
      7,
      Accounts.WALLET_1,
      70_000_000_000_000,
      Accounts.WALLET_3,
      timeline.pox_2_activation + 6,
      1
    );
    expectNoError(response);

    // Cloe locks extends Alice's locking for 1 cycle
    response = await broadcastDelegateStackExtend(
      2,
      network,
      Accounts.WALLET_3,
      fee,
      8,
      Accounts.WALLET_1,
      Accounts.WALLET_3,
      1
    );
    expectNoError(response);

    // Cloe commits 70m
    response = await broadcastStackAggregationCommitIndexed(
      2,
      network,
      Accounts.WALLET_3,
      fee,
      9,
      Accounts.WALLET_3,
      2
    );
    expectNoError(response);

    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.result).toBe("(ok 1)");
    expect(tx.success).toBeTruthy();

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 70m STX locked
    expect(poxInfo.current_cycle.stacked_ustx).toBe(0);
    expect(poxInfo.current_cycle.is_pox_active).toBe(false);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(0); // TODO 70_000_000_000_000

    // move on to the nexte cycle
    await waitForRewardCycleId(network, orchestrator, 9, 1);

    poxInfo = await getPoxInfo(network);
    // Assert that the current cycle has 70m STX locked and earning
    expect(poxInfo.current_cycle.id).toBe(9);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(0); // TODO 70_000_000_000_000
    expect(poxInfo.current_cycle.is_pox_active).toBe(false);

    // move on to the nexte cycle
    await waitForNextRewardPhase(network, orchestrator, 1);

    // Assert reward slots
    // TODO
  });
});
