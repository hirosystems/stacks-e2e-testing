import { StacksTestnet } from "@stacks/network";
import { getPoxInfo, waitForNextRewardPhase } from "../helpers";
import {
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
} from "../../helpers";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";

describe("testing devnet settings", () => {
  let orchestrator: DevnetNetworkOrchestrator;

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator(getNetworkIdFromEnv());
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("testing pox info data after 2.1 activation (cycle #1)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();
    // Wait for block N+1 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 1);

    let poxInfo = await getPoxInfo(network);

    // Asserts about pox info for better knowledge sharing
    expect(poxInfo.total_liquid_supply_ustx).toBe(1_405_738_842_905_579);
    expect(poxInfo.contract_id).toBe("ST000000000000000000002AMW42H.pox-2");
    expect(poxInfo.pox_activation_threshold_ustx).toBe(70_286_942_145_278);
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(29_290_000_000_000);
  });
});
