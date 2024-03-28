import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { ClarityValue, uintCV } from "@stacks/transactions";
import { Accounts, Constants } from "../../constants";
import {
  DEFAULT_EPOCH_TIMELINE,
  asyncExpectStacksTransactionSuccess,
  broadcastSTXTransfer,
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  getStacksNodeVersion,
  waitForStacksTransaction,
} from "../../helpers";
import {
  expectAccountToBe,
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
  const version = getStacksNodeVersion();
  const timeline = {
    epoch_2_2: 143,
    epoch_2_3: 145,
    epoch_2_4: 147,
  };
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

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();
    // Wait for block N+1 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 1);

    const blockHeight = Constants.DEVNET_DEFAULT_POX_2_ACTIVATION + 1;

    // Alice stacks 80m STX for 1 cycle
    let response = await broadcastStackSTX(
      {
        poxVersion: 2,
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
        poxVersion: 2,
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
      expect(poxInfo.contract_id).toBe("ST000000000000000000002AMW42H.pox-2");
      expect(poxInfo.current_cycle.id).toBe(cycle);

      const poxAddrInfo = (await readRewardCyclePoxAddressForAddress(
        network,
        2,
        cycle + 1, // cycle + 1 because we are checking the next cycle, including rewards
        Accounts.WALLET_1.stxAddress,
      )) as Record<string, ClarityValue>;
      expect(poxAddrInfo?.["total-ustx"]).toEqual(uintCV(80_000_000_000_000));

      // Wait for 1 reward cycle
      await waitForNextRewardPhase(network, orchestrator, 1);
    }
  });

  it("everything unlocks as expected upon v2 unlock height", async () => {
    // This test should only run when running a 2.2 node
    if (Number(version) < 2.2) {
      return;
    }
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for 2.2 activation and unlock
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_2 + 2,
    );

    // Check Alice's account info
    await expectAccountToBe(
      network,
      Accounts.WALLET_1.stxAddress,
      100_000_000_000_000 - aliceNonce * fee,
      0,
    );

    // Verify that Alice's STX are really unlocked by doing a transfer
    let response = await broadcastSTXTransfer(
      { network, account: Accounts.WALLET_1, fee, nonce: aliceNonce++ },
      {
        amount: 100_000_000_000_000 - aliceNonce * fee,
        recipient: Accounts.WALLET_3.stxAddress,
      },
    );
    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);
  });

  it("PoX should stay disabled indefinitely in 2.2 and 2.3", async () => {
    if (version === "2.2" || version === "2.3") {
      const network = new StacksTestnet({
        url: orchestrator.getStacksNodeUrl(),
      });
      let poxInfo = await getPoxInfo(network);
      await waitForNextRewardPhase(
        network,
        orchestrator,
        poxInfo.current_cycle.id + 1,
      );

      poxInfo = await getPoxInfo(network);
      expect(poxInfo.current_cycle.is_pox_active).toBeFalsy();
    }
  });
});
