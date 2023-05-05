import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../../constants";
import {
  DEFAULT_EPOCH_TIMELINE,
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
} from "../../helpers";
import { getPoxInfo, waitForNextRewardPhase } from "../helpers";
import { broadcastStackSTX } from "../helpers-direct-stacking";

describe("testing stacking under epoch 2.1", () => {
  let orchestrator: DevnetNetworkOrchestrator;

  beforeAll(() => {
    const timeline = {
      ...DEFAULT_EPOCH_TIMELINE,
      epoch_2_2: 2000,
      epoch_2_3: 2001,
      epoch_2_4: 2002,
    };
    orchestrator = buildDevnetNetworkOrchestrator(
      getNetworkIdFromEnv(),
      timeline
    );
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("submitting stacks-stx through pox-2 contract during epoch 2.0 should succeed", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();

    // Wait for block N-2 where N is the height of the next prepare phase
    let blockHeight = Constants.DEVNET_DEFAULT_POX_2_ACTIVATION + 1;
    let chainUpdate =
      await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
        blockHeight
      );

    // Broadcast some STX stacking orders
    let fee = 1000;
    let cycles = 1;
    let response = await broadcastStackSTX(
      { poxVersion: 2, network, account: Accounts.WALLET_1, fee, nonce: 0 },
      { amount: 25_000_000_000_000, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();

    response = await broadcastStackSTX(
      { poxVersion: 2, network, account: Accounts.WALLET_2, fee, nonce: 0 },
      { amount: 50_000_000_000_000, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();

    response = await broadcastStackSTX(
      { poxVersion: 2, network, account: Accounts.WALLET_3, fee, nonce: 0 },
      { amount: 75_000_000_000_000, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();

    // Wait for block N+1 where N is the height of the next reward phase
    chainUpdate = await waitForNextRewardPhase(network, orchestrator, 1);
    let poxInfo = await getPoxInfo(network);

    // Assert
    expect(poxInfo.contract_id).toBe("ST000000000000000000002AMW42H.pox-2");
    expect(poxInfo.current_cycle.is_pox_active).toBe(true);
    expect(poxInfo.total);
  });
});
