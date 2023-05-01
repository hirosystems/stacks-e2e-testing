import {
  DevnetNetworkOrchestrator,
  stacksNodeVersion,
} from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../../constants";
import {
  DEFAULT_EPOCH_TIMELINE,
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
} from "../../helpers";
import {
  expectAccountToBe,
  getPoxInfo,
  waitForNextRewardPhase,
} from "../helpers";
import { broadcastStackSTX } from "../helpers-direct-stacking";

describe("testing stacking under epoch 2.1", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let version: string;
  if (typeof stacksNodeVersion === "function") {
    version = stacksNodeVersion();
  } else {
    version = "2.1";
  }

  beforeAll(() => {
    const timeline = {
      ...DEFAULT_EPOCH_TIMELINE,
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

  it("stacked STX should unlock at unlock height", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();

    // Wait for block N + 1 where N activated pox-2
    // Block 111
    let blockHeight = Constants.DEVNET_DEFAULT_POX_2_ACTIVATION + 1;
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      blockHeight
    );

    // Broadcast a STX stacking order
    let fee = 1000;
    let cycles = 1;
    let response = await broadcastStackSTX(
      { poxVersion: 2, network, account: Accounts.WALLET_1, fee, nonce: 0 },
      { amount: 75_000_000_000_000, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();

    // Wait for block N+1 where N is the height of the next reward phase
    // block 121
    await waitForNextRewardPhase(network, orchestrator, 1);
    let poxInfo = await getPoxInfo(network, 1);

    // Assert that 2.2 disables pox
    // Assert 75m STX locked
    expect(poxInfo.current_cycle.is_pox_active).toBe(false);
    expect(poxInfo.current_cycle.id).toBe(2);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(75_000_000_000_000);

    expectAccountToBe(
      network,
      Accounts.WALLET_1.stxAddress,
      25_000_000_000_000 - fee,
      75_000_000_000_000
    );

    // wait for block 122 for unlocking
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      DEFAULT_EPOCH_TIMELINE.pox_2_unlock_height
    );

    expectAccountToBe(
      network,
      Accounts.WALLET_1.stxAddress,
      100_000_000_000_000 - fee,
      0
    );
  });
});
