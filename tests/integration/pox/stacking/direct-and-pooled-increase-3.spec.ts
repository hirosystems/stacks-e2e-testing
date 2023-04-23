import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { Accounts } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import {
  expectAccountToBe,
  getPoxInfo,
  readRewardCyclePoxAddressListAtIndex,
  waitForNextRewardPhase,
} from "../helpers";
import { broadcastStackSTX } from "../helpers-direct-stacking";
import {
  broadcastDelegateSTX,
  broadcastDelegateStackIncrease,
  broadcastDelegateStackSTX,
  broadcastStackAggregationCommitIndexed,
} from "../helpers-pooled-stacking";
import { uintCV } from "@stacks/transactions";

describe("testing direct stacker as pool operator with auto-unlock under epoch 2.1", () => {
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

  it("using direct stacking and delegate-stack-increase,", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();
    // Wait for block N+1 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 1);

    const blockHeight = timeline.pox_2_activation + 1;
    const cycles = 1;

    // Alice stacks 80m STX
    let response = await broadcastStackSTX(
      2,
      network,
      80_000_000_000_000,
      Accounts.WALLET_1,
      blockHeight,
      cycles,
      fee,
      0
    );
    expect(response.error).toBeUndefined();

    // Faucet delegates 999m to Alice address
    response = await broadcastDelegateSTX(
      2,
      network,
      Accounts.FAUCET,
      fee,
      0,
      999_000_000_000_000,
      Accounts.WALLET_1
    );
    expect(response.error).toBeUndefined();
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.success, tx.result).toBeTruthy();

    // Alice locks 999m as pool operator
    response = await broadcastDelegateStackSTX(
      2,
      network,
      Accounts.WALLET_1,
      fee,
      1,
      Accounts.FAUCET,
      999_000_000_000_000,
      Accounts.WALLET_1,
      blockHeight,
      1
    );
    expect(response.error).toBeUndefined();
    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success, tx.result).toBeTruthy();

    // Alice commits 999m
    response = await broadcastStackAggregationCommitIndexed(
      2,
      network,
      Accounts.WALLET_1,
      fee,
      2,
      Accounts.WALLET_1,
      2
    );
    expect(response.error).toBeUndefined();

    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success, tx.result).toBeTruthy();

    let poxInfo = await getPoxInfo(network);

    expect(poxInfo.current_cycle.id).toBe(1);
    // Assert that the next cycle has 990m STX locked
    expect(poxInfo.next_cycle.stacked_ustx).toBe(1_079_000_000_000_000);

    // Check Alice's table entry
    let poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      0
    );
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(80_000_000_000_000));

    // Check Alice's second table entry
    let poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      1
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(999_000_000_000_000));

    await expectAccountToBe(
      network,
      Accounts.WALLET_1.stxAddress,
      100_000_000_000_000 - 80_000_000_000_000 - fee * 3,
      80_000_000_000_000
    );

    // Wait until unlock happens that is block N+5 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 5);

    poxInfo = await getPoxInfo(network);
    expect(poxInfo.current_cycle.id).toBe(2);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(89_920_000_000_000);
    // Assert that the next cycle has 10790m STX locked
    // Alice amount was not unlocked because the same
    // pox address was used as pool address
    // thereby, the total locked of 1079m was above the minimum of 81m.
    expect(poxInfo.current_cycle.stacked_ustx).toBe(1_079_000_000_000_000);

    // Check Alice's table entry
    poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(network, 2, 0);
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(80_000_000_000_000));

    // Check Alice's second table entry
    poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(network, 2, 1);
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(999_000_000_000_000));

    await expectAccountToBe(
      network,
      Accounts.WALLET_1.stxAddress,
      100_000_000_000_000 - 80_000_000_000_000 - fee * 3,
      80_000_000_000_000
    );
  });
});
