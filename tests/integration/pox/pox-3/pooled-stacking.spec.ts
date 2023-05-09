import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../../constants";
import {
  FAST_FORWARD_TO_EPOCH_2_4,
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  getStacksNodeVersion,
  waitForStacksTransaction,
} from "../../helpers";
import {
  callReadOnlystackerInfo,
  expectAccountToBe,
  getPoxInfo,
  readRewardCyclePoxAddressForAddress,
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
import {
  callReadOnlyFunction,
  cvToString,
  noneCV,
  uintCV,
} from "@stacks/transactions";

describe("testing pooled stacking under epoch 2.4", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  const fee = 1000;
  const timeline = FAST_FORWARD_TO_EPOCH_2_4;
  let aliceNonce = 0;
  let bobNonce = 0;
  let chloeNonce = 0;

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator(
      getNetworkIdFromEnv(),
      timeline
    );
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("STX delegation and locking by pool operator should register STX for rewards", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for 2.4 to go live
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_4
    );
    await orchestrator.waitForNextStacksBlock();

    // Alice delegates 90m STX to Chloe
    let response = await broadcastDelegateSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_1,
        fee,
        nonce: aliceNonce++,
      },
      { amount: 90_000_000_000_000, poolAddress: Accounts.WALLET_3 }
    );
    expect(response.error).toBeUndefined();

    // Bob delegates 50m STX
    response = await broadcastDelegateSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_2,
        fee,
        nonce: bobNonce++,
      },
      { amount: 50_000_000_000_000, poolAddress: Accounts.WALLET_3 }
    );
    expect(response.error).toBeUndefined();

    // Chloe locks 80m for Alice
    response = await broadcastDelegateStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
      },
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

    // Chloe commits 80m
    response = await broadcastStackAggregationCommitIndexed(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
      },
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
      3,
      2,
      Accounts.WALLET_1.stxAddress
    );
    expect(poxAddrInfo0).toBeNull();

    // Check Pool operators/Chloe's table entry
    const poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      2,
      0
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(80_000_000_000_000));
  });

  it("pool operator can add small amounts (cycle #1)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Chloe locks 50m for Bob (below minimum for normal stack aggregation commit)
    let response = await broadcastDelegateStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
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

    // Chloe increases the commits by 50m
    response = await broadcastStackAggregationIncrease(
      {
        network,
        poxVersion: 3,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
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
    // Check Pool operators/Chloe's table entry
    const poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
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
      poxVersion: 3,
      network,
      account: Accounts.WALLET_2,
      fee,
      nonce: bobNonce++,
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
      100_000_000_000_000 - 50_000_000_000_000 - bobNonce * fee,
      50_000_000_000_000
    );
  });

  it("pool operator can't use delegate-stack-stx for already stacked users (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Chloe tries to stack 80m for Alice
    let response = await broadcastDelegateStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
      },
      {
        stacker: Accounts.WALLET_1,
        amount: 80_000_000_000_000,
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
    expect(tx.result).toBe("(err 3)"); // ERR_STACKING_ALREADY_STACKED
    expect(tx.success).toBeFalsy();
  });

  it("pool operators can extend/lock user's locked stx for longer (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Chloe extends/locks Alice's locking (90m) for 1 cycle
    // until #3
    let response = await broadcastDelegateStackExtend(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
      },
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
    // Check Pool operators/Chloe's table entry
    const poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      3,
      0
    );

    expect(poxAddrInfo0).toBeNull();
  });

  it("pool operator can increase stacking amount for already stacked users (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Chloe increases Alice stacking by 10m
    let response = await broadcastDelegateStackIncrease(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
      },
      {
        stacker: Accounts.WALLET_1,
        poolRewardAccount: Accounts.WALLET_3,
        increaseByAmountUstx: 10000000000000,
      }
    );
    expect(response.error).toBeUndefined();

    // Chloe commits 80m
    response = await broadcastStackAggregationCommitIndexed(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
      },
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
    // Check Pool operators/Chloe's table entry
    const poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      3,
      0
    );

    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(90_000_000_000_000));
  });

  it("without action from pool operator, STXs unlock (cycle #3)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // move on to the nexte cycle
    await waitForNextRewardPhase(network, orchestrator, 1);

    // we are in cycle #3
    let poxInfo = await getPoxInfo(network);
    // Assert that the current cycle has 90m STX locked and earning
    expect(poxInfo.current_cycle.id).toBe(3);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(90_000_000_000_000);
    expect(poxInfo.current_cycle.is_pox_active).toBe(true);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(0);

    // move on to the nexte cycle
    await waitForNextRewardPhase(network, orchestrator, 1);

    // we are in cycle #4
    poxInfo = await getPoxInfo(network);
    // Assert that the current cycle has 90m STX locked and earning
    expect(poxInfo.current_cycle.id).toBe(4);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(0);
    expect(poxInfo.current_cycle.is_pox_active).toBe(false);
  });

  it("pool operator can't extend unlocked stx (cycle #4)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    const stackerInfo = await callReadOnlystackerInfo(
      network,
      3,
      Accounts.WALLET_1
    );
    expect(stackerInfo).toBe(cvToString(noneCV()));

    // Chloe tries to extend Alice 90m by 1 cycle
    let response = await broadcastDelegateStackExtend(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
      },
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
    expect(tx.success).toBeFalsy();
    // FIXME: expected ERR_STACKING_NOT_DELEGATED
    expect(tx.result).toBe("(err 9)"); // ERR_STACKING_PERMISSION_DENIED

    // Chloe commits 90m for cycle 5
    response = await broadcastStackAggregationCommitIndexed(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
      },
      { poolRewardAccount: Accounts.WALLET_3, cycleId: 5 }
    );
    expect(response.error).toBeUndefined();
    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success).toBeFalsy();
    expect(tx.result).toBe("(err 4)");
  });
});
