import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { ClarityType, SomeCV, cvToString, uintCV } from "@stacks/transactions";
import { Accounts } from "../../constants";
import {
  asyncExpectStacksTransactionSuccess,
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
  broadcastDelegateStackExtend,
  broadcastDelegateStackIncrease,
  broadcastStackAggregationCommitIndexed,
} from "../helpers-pooled-stacking";
import { poxAddressToBtcAddress } from "@stacks/stacking";

describe("testing mixed direct and pooled stacking with extend under epoch 2.1", () => {
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

  it("delegate-stack-extend should extend locking to direct stacker (cycle #1)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();
    // Wait for block N+1 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 1);

    const blockHeight = timeline.pox_2_activation + 1;
    const cycles = 1;

    // Alice stacks 75m STX
    let response = await broadcastStackSTX(
      2,
      network,
      75_000_000_000_000,
      Accounts.WALLET_1,
      blockHeight,
      cycles,
      fee,
      0
    );
    expect(response.error).toBeUndefined();

    // Alice delegates 100m to Bob
    response = await broadcastDelegateSTX(
      2,
      network,
      Accounts.WALLET_1,
      fee,
      1,
      100_000_000_000_000,
      Accounts.WALLET_2
    );
    expect(response.error).toBeUndefined();
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.success, tx.result).toBeTruthy();

    // Bob extends delegation by 1 cycle
    response = await broadcastDelegateStackExtend(
      2,
      network,
      Accounts.WALLET_2,
      fee,
      0,
      Accounts.WALLET_1,
      Accounts.WALLET_2,
      1
    );
    expect(response.error).toBeUndefined();

    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success, tx.result).toBeTruthy();

    // Bob commits 75m for cycle #3
    // delegate-stack-extend only locks for the cycles after the current stacking
    response = await broadcastStackAggregationCommitIndexed(
      2,
      network,
      Accounts.WALLET_2,
      fee,
      1,
      Accounts.WALLET_2,
      3
    );
    expect(response.error).toBeUndefined();

    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.result).toBe("(ok u0)");

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 75m STX locked
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(29_290_000_000_000);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(75_000_000_000_000);

    // Check Alice's table entry
    let poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      0
    );
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(75_000_000_000_000));

    // Check Bob's table entry
    let poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      1
    );
    expect(poxAddrInfo1?.["total-ustx"]).toBeUndefined();
  });

  it("stacking more should increase the slot price (cycle #1)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    const blockHeight = timeline.pox_2_activation + 1;
    const cycles = 1;

    // Faucet stacks 900m (1/4 of liquid suply)
    let response = await broadcastStackSTX(
      2,
      network,
      900_000_000_000_000,
      Accounts.FAUCET,
      blockHeight,
      cycles,
      fee,
      0
    );
    expect(response.error).toBeUndefined();

    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 975m STX locked
    // and the slot price increased above Alice's stacking
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(29_290_000_000_000);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(975_000_000_000_000);
  });

  it("auto-unlock unlocks directly stacked amount and total_stacked is not updated (BUG) (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();

    // move on to the next cycle after unlock (N+5)
    await waitForNextRewardPhase(network, orchestrator, 5);

    let poxInfo = await getPoxInfo(network);
    // Assert that the current cycle has 975m STX locked from direct stacking
    // and locked 75m from pooled stacking for next cycle
    expect(poxInfo.current_cycle.id).toBe(2);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(975_000_000_000_000);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(81_250_000_000_000);
    // THIS IS A BUG
    // because Alice's STX are unlocked
    expect(poxInfo.next_cycle.stacked_ustx).toBe(75_000_000_000_000);

    // Check Alice's table entry for cycle 2
    let poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      0
    );
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(75_000_000_000_000));

    // Check Faucets's table entry for cycle 2
    let poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      1
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(900_000_000_000_000));
    expect(cvToString((poxAddrInfo1?.stacker as SomeCV).value)).toEqual(
      Accounts.FAUCET.stxAddress
    );
    // Check Alice's table entry for cycle 3
    poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(network, 3, 0);
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(75_000_000_000_000));

    // Check Bob's table entry
    poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(network, 3, 1);
    expect(poxAddrInfo1?.["total-ustx"]).toBeUndefined();

    await expectAccountToBe(
      network,
      Accounts.WALLET_1.stxAddress,
      100_000_000_000_000 - fee * 2,
      0
    );
  });

  it("stacking by other user should activate pox for cycle #3 (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
    const blockHeight = timeline.pox_2_activation + 11;
    const cycles = 1;

    // Cloe stacks 80m
    let response = await broadcastStackSTX(
      2,
      network,
      80_000_000_000_000,
      Accounts.WALLET_3,
      blockHeight,
      cycles,
      fee,
      0
    );
    expect(response.error).toBeUndefined();
    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);

    let poxInfo = await getPoxInfo(network);
    expect(poxInfo.current_cycle.id).toBe(2);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(155_000_000_000_000);
  });

  it("unlocked amount should be still unlocked, but STX are earning (BUG) (cycle #3)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();

    // move on to the next cycle after unlock (N+5)
    await waitForNextRewardPhase(network, orchestrator, 5);

    let poxInfo = await getPoxInfo(network);
    // Assert that the current cycle has 0m STX locked
    // and no STX locked for next cycle
    expect(poxInfo.current_cycle.id).toBe(3);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(155_000_000_000_000);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(29_290_000_000_000);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(0);
    expect(poxInfo.current_cycle.is_pox_active).toBe(true);

    // Check Alice's table entry for cycle 2
    let poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      0
    );
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(75_000_000_000_000));

    // Check Faucets's table entry for cycle 2
    let poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      1
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(80_000_000_000_000));
    expect(cvToString((poxAddrInfo1?.stacker as SomeCV).value)).toEqual(
      Accounts.WALLET_3.stxAddress
    );

    // THIS IS A BUG
    // Alice has unlocked tokens and a reward cycle pox address entry
    await expectAccountToBe(
      network,
      Accounts.WALLET_1.stxAddress,
      100_000_000_000_000 - fee * 2,
      0
    );
  });
});
