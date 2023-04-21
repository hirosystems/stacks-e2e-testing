import {
  buildDevnetNetworkOrchestrator,
  getBitcoinBlockHeight,
  getNetworkIdFromEnv,
} from "../../helpers";
import {
  waitForNextPreparePhase,
  waitForNextRewardPhase,
  getPoxInfo,
  waitForRewardCycleId,
} from "../helpers";
import { Accounts } from "../../constants";
import { StacksTestnet } from "@stacks/network";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { broadcastStackIncrease, broadcastStackSTX, broadcastStackExtend } from "../helpers-direct-stacking";
import { expectAccountToBe } from "../helpers.ts";

describe("testing stacking under epoch 2.1", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let timeline = {
    epoch_2_0: 100,
    epoch_2_05: 101,
    epoch_2_1: 103,
    pox_2_activation: 110,
  };

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator(getNetworkIdFromEnv());
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("using stacks-increase in the same cycle should result in increased rewards", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();
    // Wait for block N+1 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 1);

    const blockHeight = timeline.pox_2_activation + 1;
    const fee = 1000;
    const cycles = 1;

    let response = await broadcastStackSTX(
      2,
      network,
      150_000_000_000_000,
      Accounts.WALLET_1,
      blockHeight,
      cycles,
      fee,
      0
    )
    expect(response.error).toBeUndefined();

    response = await broadcastStackSTX(
      2,
      network,
      30_000_000_000_000,
      Accounts.WALLET_2,
      blockHeight,
      cycles,
      fee,
      0
    )
    expect(response.error).toBeUndefined();

    response = await broadcastStackIncrease(
      network,
      20_000_000_000_000,
      Accounts.WALLET_2,
      fee,
      1
    )
    expect(response.error).toBeUndefined();

    await orchestrator.waitForNextStacksBlock()
    const poxInfo = await getPoxInfo(network);

    // Assert
    expect(poxInfo.contract_id).toBe("ST000000000000000000002AMW42H.pox-2");
    expect(poxInfo.pox_activation_threshold_ustx).toBe(50_000_000_000_000);
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(20_960_000_000_000);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(150_000_000_000_000);
    expect(poxInfo.current_cycle.is_pox_active).toBe(true);

    await waitForNextRewardPhase(network, orchestrator, 1);

        // Assert
        expect(poxInfo.contract_id).toBe("ST000000000000000000002AMW42H.pox-2");
        expect(poxInfo.current_cycle.total_stacked).toBe(150_000_000_000_000);
        expect(poxInfo.current_cycle.is_pox_active).toBe(true);
    
  });
});
