import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { Accounts } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import {
  getPoxInfo,
  waitForNextRewardPhase,
  readRewardCyclePoxAddressForAddress,
} from "../helpers";
import {
  broadcastStackExtend,
  broadcastStackSTX,
} from "../helpers-direct-stacking";
import { ClarityValue, cvToString, uintCV } from "@stacks/transactions";

describe("testing stack-extend functionality", () => {
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

  it("stacking and then extending should result in rewards for 3 cycles", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();
    // Wait for block N+1 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 1);

    const blockHeight = timeline.pox_2_activation + 1;
    const fee = 1000;

    // Alice stacks 80m STX for 1 cycle
    let response = await broadcastStackSTX(
      2,
      network,
      80_000_000_000_000,
      Accounts.WALLET_1,
      blockHeight,
      1,
      fee,
      0
    );
    expect(response.error).toBeUndefined();
    // Wait for Alice's stacking transaction to confirm
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.success).toBeTruthy();
    
    // Alice extends stacking for another 2 cycles
    response = await broadcastStackExtend(
      network,
      Accounts.WALLET_1,
      2,
      fee,
      1
    );
    expect(response.error).toBeUndefined();
    // Wait for Alice's stacking extension transaction to confirm
    [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.success).toBeTruthy();

    // Check rewards for 3 cycles
    for (let cycle = 1; cycle <= 3; cycle++) {

      let poxInfo = await getPoxInfo(network);
      // Asserts about pox info for better knowledge sharing
      expect(poxInfo.contract_id).toBe("ST000000000000000000002AMW42H.pox-2");
      expect(poxInfo.current_cycle.id).toBe(cycle);

      const poxAddrInfo = (await readRewardCyclePoxAddressForAddress(
        network,
        cycle+1, // cycle + 1 because we are checking the next cycle, including rewards
        Accounts.WALLET_1.stxAddress
      )) as Record<string, ClarityValue>;
      expect(poxAddrInfo?.["total-ustx"]).toEqual(uintCV(80_000_000_000_000));

      // Wait for Stacks genesis block
      await orchestrator.waitForNextStacksBlock();
      // Wait for 1 reward cycle
      await waitForNextRewardPhase(network, orchestrator, 1);
    }
  });
});