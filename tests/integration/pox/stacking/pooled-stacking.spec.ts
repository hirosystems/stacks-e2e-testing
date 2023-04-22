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
  readRewardCyclePoxAddressForAddress,
  readRewardCyclePoxAddressList,
  readRewardCyclePoxAddressListAtIndex,
  waitForNextRewardPhase,
} from "../helpers";
import {
  broadcastDelegateSTX,
  broadcastDelegateStackExtend,
  broadcastDelegateStackIncrease,
  broadcastDelegateStackSTX,
  broadcastRevokeDelegateStx,
  broadcastStackAggregationCommitIndexed,
  broadcastStackAggregationIncrease,
} from "../helpers-pooled-stacking";
import { uintCV } from "@stacks/transactions";

describe("testing pooled stacking under epoch 2.1", () => {
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

  it("STX delegation and locking by pool operator should register STX for rewards", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();
    // Wait for block N+1 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 1);
    const fee = 1000;

    // Alice delegates 90m STX
    let response = await broadcastDelegateSTX(
      2,
      network,
      Accounts.WALLET_1,
      fee,
      0,
      90_000_000_000_000,
      Accounts.WALLET_3
    );
    expect(response.error).toBeUndefined();

    // Bob delegates 50m STX
    response = await broadcastDelegateSTX(
      2,
      network,
      Accounts.WALLET_2,
      fee,
      0,
      50_000_000_000_000,
      Accounts.WALLET_3
    );
    expect(response.error).toBeUndefined();

    // Cloe locks 30m for Alice
    response = await broadcastDelegateStackSTX(
      2,
      network,
      Accounts.WALLET_3,
      fee,
      0,
      Accounts.WALLET_1,
      80_000_000_000_000,
      Accounts.WALLET_3,
      timeline.pox_2_activation + 6,
      1
    );
    expect(response.error).toBeUndefined();

    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.success).toBeTruthy();

    // Cloe commits 80m
    response = await broadcastStackAggregationCommitIndexed(
      2,
      network,
      Accounts.WALLET_3,
      fee,
      1,
      Accounts.WALLET_3,
      2
    );
    expect(response.error).toBeUndefined();

    await orchestrator.waitForStacksBlockIncludingTransaction(response.txid);

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 80m STX locked
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(80_000_000_000_000);

    // Check Alice's table entry
    const poxAddrInfo0 = await readRewardCyclePoxAddressForAddress(
      network,
      2,
      Accounts.WALLET_1.stxAddress
    );
    expect(poxAddrInfo0).toBeNull();

    // Check Pool operators/Cloe's table entry
    const poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      0
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(80_000_000_000_000));
  });

  it("pool operator can add small amounts (cycle #1)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
    const fee = 1000;

    // Cloe locks 50m for Bob (below minimum for normal stack aggregation commit)
    let response = await broadcastDelegateStackSTX(
      2,
      network,
      Accounts.WALLET_3,
      fee,
      2,
      Accounts.WALLET_2,
      50_000_000_000_000,
      Accounts.WALLET_3,
      timeline.pox_2_activation + 6,
      1
    );
    expect(response.error).toBeUndefined();

    // Cloe increases the commits by 50m
    response = await broadcastStackAggregationIncrease(
      network,
      Accounts.WALLET_3,
      fee,
      3,
      Accounts.WALLET_3,
      2,
      0 // reward index 0 because we are the only stackers
    );
    expect(response.error).toBeUndefined();
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.success).toBeTruthy();

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 80m STX locked
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(0);
    expect(poxInfo.current_cycle.is_pox_active).toBe(false);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(130_000_000_000_000);

    // Assert reward slots
    // Check Pool operators/Cloe's table entry
    const poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      0
    );

    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(130_000_000_000_000));
  });

  it("Revoking delegation should not unlock STX (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for block N+1 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 1);
    const fee = 1000;

    let poxInfo = await getPoxInfo(network);
    expect(poxInfo.current_cycle.id).toBe(2);

    // Bob revokes delegation
    let response = await broadcastRevokeDelegateStx(
      2,
      network,
      Accounts.WALLET_2,
      fee,
      1
    );
    expect(response.error).toBeUndefined();

    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.result).toBe("(ok true)");

    // assert that Bob still has 50m locked
    await expectAccountToBe(
      network,
      Accounts.WALLET_2.stxAddress,
      100_000_000_000_000 - 50_000_000_000_000 - 2 * fee,
      50_000_000_000_000
    );
  });

  it("pool operator can't user delegate-stack-stx for already stacked users (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
    const fee = 1000;

    // Cloe tries to stack 80m for Alice
    let response = await broadcastDelegateStackSTX(
      2,
      network,
      Accounts.WALLET_3,
      fee,
      4,
      Accounts.WALLET_1,
      80_000_000_000_000,
      Accounts.WALLET_3,
      timeline.pox_2_activation + 16,
      1
    );
    expect(response.error).toBeUndefined();

    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.result).toBe("(err 3)");
    expect(tx.success).toBeFalsy();
  });

  it("pool operators can lock user's locked stx for longer (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
    const fee = 1000;

    // Cloe locks extends Alice's locking (90m) for 1 cycle
    // until #3
    let response = await broadcastDelegateStackExtend(
      2,
      network,
      Accounts.WALLET_3,
      fee,
      5,
      Accounts.WALLET_1,
      Accounts.WALLET_3,
      1
    );
    expect(response.error).toBeUndefined();

    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.success).toBeTruthy();
    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has no STX locked yet
    // because pool operator did not yet commit
    expect(poxInfo.current_cycle.id).toBe(2);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(130_000_000_000_000);
    expect(poxInfo.current_cycle.is_pox_active).toBe(true);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(0);

    // Assert reward slots
    // Check Pool operators/Cloe's table entry
    console.log(await readRewardCyclePoxAddressList(network, 3));
    const poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      0
    );

    expect(poxAddrInfo0).toBeNull();
  });

  it("pool operator can increase stacking amount for already stacked users (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
    const fee = 1000;

    // Cloe increases Alice stacking by 10m
    let response = await broadcastDelegateStackIncrease(
      2,
      network,
      Accounts.WALLET_3,
      fee,
      6,
      Accounts.WALLET_1,
      Accounts.WALLET_3,
      10_000_000_000_000
    );
    expect(response.error).toBeUndefined();

    // Cloe commits 80m
    response = await broadcastStackAggregationCommitIndexed(
      2,
      network,
      Accounts.WALLET_3,
      fee,
      7,
      Accounts.WALLET_3,
      3
    );
    expect(response.error).toBeUndefined();

    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.result).toBe("(ok u0)");
    expect(tx.success).toBeTruthy();

    let poxInfo = await getPoxInfo(network);

    // Assert that the current cycle has 130m STX pooled and stacked during cycle #1
    expect(poxInfo.current_cycle.stacked_ustx).toBe(130_000_000_000_000);
    expect(poxInfo.current_cycle.is_pox_active).toBe(true);

    expect(poxInfo.current_cycle.id).toBe(2);
    // Assert that the next cycle has 90m STX locked
    expect(poxInfo.next_cycle.stacked_ustx).toBe(90_000_000_000_000);

    // Assert reward slots
    // Check Pool operators/Cloe's table entry
    const poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      0
    );

    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(90_000_000_000_000));
  });

  it("without action from pool operator, stack unlocks (cycle #3)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
    const fee = 1000;

    // move on to the nexte cycle
    await waitForNextRewardPhase(network, orchestrator, 1);

    // we are in cycle #4
    let poxInfo = await getPoxInfo(network);
    // Assert that the current cycle has 90m STX locked and earning
    expect(poxInfo.current_cycle.id).toBe(3);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(90_000_000_000_000);
    expect(poxInfo.current_cycle.is_pox_active).toBe(true);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(0);

    // move on to the nexte cycle
    await waitForNextRewardPhase(network, orchestrator, 1);

    // we are in cycle #5
    poxInfo = await getPoxInfo(network);
    // Assert that the current cycle has 90m STX locked and earning
    expect(poxInfo.current_cycle.id).toBe(4);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(0);
    expect(poxInfo.current_cycle.is_pox_active).toBe(false);
  });
});
