import {
  DevnetNetworkOrchestrator,
  stacksNodeVersion,
} from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { ClarityValue, uintCV } from "@stacks/transactions";
import { Accounts, Constants } from "../../constants";
import {
  DEFAULT_EPOCH_TIMELINE,
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import {
  getPoxInfo,
  readRewardCyclePoxAddressForAddress,
  waitForNextRewardPhase,
} from "../helpers";
import {
  broadcastStackExtend,
  broadcastStackSTX,
} from "../helpers-direct-stacking";

describe("testing stack-extend functionality", () => {
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
      epoch_2_2: 2000,
      pox_2_unlock_height: 2001,
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

  it("stacking and then extending should result in rewards for 3 cycles", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();
    // Wait for block N+1 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 1);

    const blockHeight = Constants.DEVNET_DEFAULT_POX_2_ACTIVATION + 1;
    const fee = 1000;

    // Alice stacks 80m STX for 1 cycle
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

    // Alice extends stacking for another 2 cycles
    response = await broadcastStackExtend(
      { network, account: Accounts.WALLET_1, fee, nonce: 1 },
      { cycles: 2 }
    );
    expect(response.error).toBeUndefined();
    // Wait for Alice's stacking extension transaction to confirm
    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success).toBeTruthy();

    // Check rewards for 3 cycles
    for (let cycle = 1; cycle <= 3; cycle++) {
      let poxInfo = await getPoxInfo(network);
      // Asserts about pox info for better knowledge sharing
      expect(poxInfo.contract_id).toBe("ST000000000000000000002AMW42H.pox-2");
      expect(poxInfo.current_cycle.id).toBe(cycle);

      const poxAddrInfo = (await readRewardCyclePoxAddressForAddress(
        network,
        cycle + 1, // cycle + 1 because we are checking the next cycle, including rewards
        Accounts.WALLET_1.stxAddress
      )) as Record<string, ClarityValue>;
      expect(poxAddrInfo?.["total-ustx"]).toEqual(uintCV(80_000_000_000_000));

      // Wait for 1 reward cycle
      await waitForNextRewardPhase(network, orchestrator, 1);
    }
  });
});
