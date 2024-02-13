import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { ClarityValue, cvToString, uintCV } from "@stacks/transactions";
import { Accounts } from "../../constants";
import {
  FAST_FORWARD_TO_EPOCH_2_4,
  buildDevnetNetworkOrchestrator,
  getChainInfo,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import { getPoxInfo, readRewardCyclePoxAddressForAddress } from "../helpers";
import {
  broadcastStackIncrease,
  broadcastStackSTX,
} from "../helpers-direct-stacking";

describe("testing solo stacker increase without bug", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  const timeline = FAST_FORWARD_TO_EPOCH_2_4;
  const fee = 1000;
  let aliceNonce = 0;
  let bobNonce = 0;

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

  // The ordering of the stacking operations in this test would have triggered
  // the bug in pox-2.
  it("using stacks-increase in the same cycle should result in increased rewards", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for 2.4 to go live
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_4,
    );
    await orchestrator.waitForNextStacksBlock();

    let chainInfo = await getChainInfo(network);
    const blockHeight = chainInfo.burn_block_height;
    const cycles = 1;

    // Bob stacks 30m
    let response = await broadcastStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_2,
        fee,
        nonce: bobNonce++,
      },
      { amount: 30_000_000_000_010, blockHeight, cycles },
    );
    expect(response.error).toBeUndefined();
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid,
    );
    expect(tx.success).toBeTruthy();

    // Alice stacks 50m
    response = await broadcastStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_1,
        fee,
        nonce: aliceNonce++,
      },
      { amount: 50_000_000_000_001, blockHeight, cycles },
    );
    expect(response.error).toBeUndefined();
    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success).toBeTruthy();

    // Bob increases by 20m
    response = await broadcastStackIncrease(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_2,
        fee,
        nonce: bobNonce++,
      },
      { amount: 20000000000100 },
    );
    expect(response.error).toBeUndefined();
    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success).toBeTruthy();

    let poxInfo = await getPoxInfo(network);

    // Asserts about pox info for better knowledge sharing
    expect(poxInfo.contract_id).toBe("ST000000000000000000002AMW42H.pox-3");
    expect(poxInfo.current_cycle.id).toBe(1);

    // Assert that the next cycle has 100m STX locked
    expect(poxInfo.current_cycle.stacked_ustx).toBe(0);
    expect(poxInfo.current_cycle.is_pox_active).toBe(false);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(100_000_000_000_111);

    const poxAddrInfo0 = (await readRewardCyclePoxAddressForAddress(
      network,
      3,
      2,
      Accounts.WALLET_2.stxAddress,
    )) as Record<string, ClarityValue>;
    expect(cvToString(poxAddrInfo0["total-ustx"])).toBe("u50000000000110");

    expect(poxAddrInfo0["total-ustx"]).toEqual(uintCV(50_000_000_000_110));

    const poxAddrInfo1 = (await readRewardCyclePoxAddressForAddress(
      network,
      3,
      2,
      Accounts.WALLET_1.stxAddress,
    )) as Record<string, ClarityValue>;
    expect(poxAddrInfo1["total-ustx"]).toEqual(uintCV(50_000_000_000_001));
  });
});
