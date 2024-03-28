import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { ClarityValue, uintCV } from "@stacks/transactions";
import { Accounts } from "../../constants";
import {
  FAST_FORWARD_TO_EPOCH_2_4,
  buildDevnetNetworkOrchestrator,
  getChainInfo,
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
  const timeline = FAST_FORWARD_TO_EPOCH_2_4;
  const fee = 1000;
  let aliceNonce = 0;

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator(
      getNetworkIdFromEnv(),
      timeline,
    );
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("stacking and then extending should result in rewards for 3 cycles", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for 2.4 to go live
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_4,
    );
    await orchestrator.waitForNextStacksBlock();

    let chainInfo = await getChainInfo(network);
    const blockHeight = chainInfo.burn_block_height;

    // Alice stacks 80m STX for 1 cycle
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
      },
    );
    expect(response.error).toBeUndefined();
    // Wait for Alice's stacking transaction to confirm
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid,
    );
    expect(tx.success).toBeTruthy();

    // Alice extends stacking for another 2 cycles
    response = await broadcastStackExtend(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_1,
        fee,
        nonce: aliceNonce++,
      },
      { cycles: 2 },
    );
    expect(response.error).toBeUndefined();
    // Wait for Alice's stacking extension transaction to confirm
    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success).toBeTruthy();

    // Check rewards for 3 cycles
    for (let cycle = 1; cycle <= 3; cycle++) {
      let poxInfo = await getPoxInfo(network);
      // Asserts about pox info for better knowledge sharing
      expect(poxInfo.contract_id).toBe("ST000000000000000000002AMW42H.pox-3");
      expect(poxInfo.current_cycle.id).toBe(cycle);

      const poxAddrInfo = (await readRewardCyclePoxAddressForAddress(
        network,
        3,
        cycle + 1, // cycle + 1 because we are checking the next cycle, including rewards
        Accounts.WALLET_1.stxAddress,
      )) as Record<string, ClarityValue>;
      expect(poxAddrInfo?.["total-ustx"]).toEqual(uintCV(80_000_000_000_000));

      // Wait for 1 reward cycle
      await waitForNextRewardPhase(network, orchestrator, 1);
    }
  });
});
