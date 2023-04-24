import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksNetwork, StacksTestnet } from "@stacks/network";
import { Accounts } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import {
  expectAccountToBe,
  getPoxInfo,
  readRewardCyclePoxAddressForAddress,
  waitForNextRewardPhase,
} from "../helpers";
import {
  broadcastStackIncrease,
  broadcastStackSTX,
} from "../helpers-direct-stacking";
import { uintCV } from "@stacks/transactions";

describe("testing solo stacker below minimum", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let timeline = {
    epoch_2_0: 100,
    epoch_2_05: 102,
    epoch_2_1: 106,
    pox_2_activation: 109,
  };
  const fee = 1000;

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator(getNetworkIdFromEnv());
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("stacking above minimum increment should succeed", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();
    // Wait for block N+1 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 1);

    const blockHeight = timeline.pox_2_activation + 1;
    const cycles = 1;

    // Alice stacks 80m
    let response = await broadcastStackSTX(
      { poxVersion: 2, network, account: Accounts.WALLET_1, fee, nonce: 0 },
      { amount: 80_000_000_000_000, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.success).toBeTruthy();

    // Faucet stacks 999m
    response = await broadcastStackSTX(
      { poxVersion: 2, network, account: Accounts.FAUCET, fee, nonce: 0 },
      { amount: 999_000_000_000_000, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();

    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success).toBeTruthy();

    let poxInfo = await getPoxInfo(network);
    // Assert that the next cycle has 1079m STX locked
    // and that the minimum is above 80m
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(29_290_000_000_000);
    expect(poxInfo.next_cycle.min_threshold_ustx).toBe(89_920_000_000_000);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(1_079_000_000_000_000);
    expectAccountToBe(
      network,
      Accounts.WALLET_1.stxAddress,
      100_000_000_000_000 - 80_000_000_000_000 - fee,
      80_000_000_000_000
    );

    // Check Alice's table entry
    const poxAddrInfo0 = await readRewardCyclePoxAddressForAddress(
      network,
      2,
      Accounts.WALLET_1.stxAddress
    );
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(80_000_000_000_000));

    // Check Faucets's table entry
    const poxAddrInfo1 = await readRewardCyclePoxAddressForAddress(
      network,
      2,
      Accounts.FAUCET.stxAddress
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(999_000_000_000_000));
  });

  it("Increased slot price should auto-unlock user (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for block N+5 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 5);

    let poxInfo = await getPoxInfo(network);
    expect(poxInfo.current_cycle.id).toBe(2);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(999_000_000_000_000);

    expectAccountToBe(
      network,
      Accounts.WALLET_1.stxAddress,
      100_000_000_000_000 - fee,
      0
    );

    // Table entries for cycle #2 is cleared for auto-unlocked stackers.
    // Check Alice's table entry
    const poxAddrInfo0 = await readRewardCyclePoxAddressForAddress(
      network,
      2,
      Accounts.WALLET_1.stxAddress
    );
    expect(poxAddrInfo0?.["total-ustx"]).toBeUndefined();

    // Check Faucet's table entry
    const poxAddrInfo1 = await readRewardCyclePoxAddressForAddress(
      network,
      2,
      Accounts.FAUCET.stxAddress
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(999_000_000_000_000));
  });
});
