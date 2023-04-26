import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../../constants";
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
  const fee = 1000;

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

    // Alice delegates 90m STX
    let response = await broadcastDelegateSTX(
      { poxVersion: 2, network, account: Accounts.WALLET_1, fee, nonce: 0 },
      { amount: 90_000_000_000_000, poolAddress: Accounts.WALLET_3 }
    );
    expect(response.error).toBeUndefined();

    // Bob delegates 50m STX
    response = await broadcastDelegateSTX(
      { poxVersion: 2, network, account: Accounts.WALLET_2, fee, nonce: 0 },
      { amount: 50_000_000_000_000, poolAddress: Accounts.WALLET_3 }
    );
    expect(response.error).toBeUndefined();

    // Cloe locks 80m for Alice
    response = await broadcastDelegateStackSTX(
      { poxVersion: 2, network, account: Accounts.WALLET_3, fee, nonce: 0 },
      {
        stacker: Accounts.WALLET_1,
        amount: 80_000_000_000_000,
        poolRewardAccount: Accounts.WALLET_3,
        startBurnHeight: Constants.DEVNET_DEFAULT_POX_2_ACTIVATION + 6,
        lockPeriodCycles: 1,
      }
    );
    expect(response.error).toBeUndefined();

    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.success).toBeTruthy();

    // Cloe commits 80m
    response = await broadcastStackAggregationCommitIndexed(
      { poxVersion: 2, network, account: Accounts.WALLET_3, fee, nonce: 1 },
      { poolRewardAccount: Accounts.WALLET_3, cycleId: 2 }
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

    // Cloe locks 50m for Bob (below minimum for normal stack aggregation commit)
    let response = await broadcastDelegateStackSTX(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: 2,
      },
      {
        stacker: Accounts.WALLET_2,
        amount: 50000000000000,
        poolRewardAccount: Accounts.WALLET_3,
        startBurnHeight: Constants.DEVNET_DEFAULT_POX_2_ACTIVATION + 6,
        lockPeriodCycles: 1,
      }
    );
    expect(response.error).toBeUndefined();

    // Cloe increases the commits by 50m
    response = await broadcastStackAggregationIncrease(
      {
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: 3,
      },
      {
        poolRewardAccount: Accounts.WALLET_3,
        cycleId: 2,
        rewardIndex: 0, // reward index 0 because we are the only stackers
      }
    );
    expect(response.error).toBeUndefined();
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.success).toBeTruthy();

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 130m STX locked
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

    let poxInfo = await getPoxInfo(network);
    expect(poxInfo.current_cycle.id).toBe(2);

    // Bob revokes delegation
    let response = await broadcastRevokeDelegateStx({
      poxVersion: 2,
      network,
      account: Accounts.WALLET_2,
      fee,
      nonce: 1,
    });
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

    // Cloe tries to stack 80m for Alice
    let response = await broadcastDelegateStackSTX(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: 4,
      },
      {
        stacker: Accounts.WALLET_1,
        amount: 80000000000000,
        poolRewardAccount: Accounts.WALLET_3,
        startBurnHeight: Constants.DEVNET_DEFAULT_POX_2_ACTIVATION + 16,
        lockPeriodCycles: 1,
      }
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

    // Cloe locks extends Alice's locking (90m) for 1 cycle
    // until #3
    let response = await broadcastDelegateStackExtend(
      { poxVersion: 2, network, account: Accounts.WALLET_3, fee, nonce: 5 },
      {
        stacker: Accounts.WALLET_1,
        poolRewardAccount: Accounts.WALLET_3,
        extendByCount: 1,
      }
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

    // Cloe increases Alice stacking by 10m
    let response = await broadcastDelegateStackIncrease(
      { poxVersion: 2, network, account: Accounts.WALLET_3, fee, nonce: 6 },
      {
        stacker: Accounts.WALLET_1,
        poolRewardAccount: Accounts.WALLET_3,
        increaseByAmountUstx: 10000000000000,
      }
    );
    expect(response.error).toBeUndefined();

    // Cloe commits 80m
    response = await broadcastStackAggregationCommitIndexed(
      { poxVersion: 2, network, account: Accounts.WALLET_3, fee, nonce: 7 },
      { poolRewardAccount: Accounts.WALLET_3, cycleId: 3 }
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
