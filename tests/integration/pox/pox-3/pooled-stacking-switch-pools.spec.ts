import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { uintCV } from "@stacks/transactions";
import { Accounts, Constants, DEFAULT_FEE } from "../../constants";
import {
  FAST_FORWARD_TO_EPOCH_2_4,
  asyncExpectStacksTransactionSuccess,
  buildDevnetNetworkOrchestrator,
  getChainInfo,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import {
  expectAccountToBe,
  getPoxInfo,
  readRewardCyclePoxAddressForAddress,
  readRewardCyclePoxAddressListAtIndex,
  waitForNextRewardPhase,
} from "../helpers";
import {
  broadcastDelegateSTX,
  broadcastDelegateStackExtend,
  broadcastDelegateStackSTX,
  broadcastRevokeDelegateStx,
  broadcastStackAggregationCommitIndexed,
} from "../helpers-pooled-stacking";
import { getCoreInfo } from "../helpers";

describe("testing pooled stacking under epoch 2.1", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let timeline = FAST_FORWARD_TO_EPOCH_2_4;

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

    // Alice delegates 95m STX to Cloe
    let response = await broadcastDelegateSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_1,
        fee: DEFAULT_FEE,
        nonce: aliceNonce++,
      },
      { amount: 95_000_000_000_000, poolAddress: Accounts.WALLET_3 }
    );
    expect(response.error).toBeUndefined();

    const chainInfo = await getChainInfo(network);
    const blockHeight = chainInfo.burn_block_height;

    // Cloe locks 90m for Alice
    response = await broadcastDelegateStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee: DEFAULT_FEE,
        nonce: chloeNonce++,
      },
      {
        stacker: Accounts.WALLET_1,
        amount: 90_000_000_000_000,
        poolRewardAccount: Accounts.WALLET_3,
        startBurnHeight: blockHeight,
        lockPeriodCycles: 1,
      }
    );
    expect(response.error).toBeUndefined();

    // Cloe commits 90m
    response = await broadcastStackAggregationCommitIndexed(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee: DEFAULT_FEE,
        nonce: chloeNonce++,
      },
      { poolRewardAccount: Accounts.WALLET_3, cycleId: 2 }
    );
    expect(response.error).toBeUndefined();
    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 90m STX locked
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(90_000_000_000_000);

    // Check Alice's table entry
    const poxAddrInfo0 = await readRewardCyclePoxAddressForAddress(
      network,
      3,
      2,
      Accounts.WALLET_1.stxAddress
    );
    expect(poxAddrInfo0).toBeNull();

    // Check Pool operators/Cloe's table entry
    const poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      2,
      0
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(90_000_000_000_000));
  });

  it("user cannot switch pools and new pool operator cannot extend (cycle #1)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Alice revokes, then delegates 95m STX to Bob
    let response = await broadcastRevokeDelegateStx({
      poxVersion: 3,
      network,
      account: Accounts.WALLET_1,
      fee: DEFAULT_FEE,
      nonce: aliceNonce++,
    });
    expect(response.error).toBeUndefined();

    response = await broadcastDelegateSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_1,
        fee: DEFAULT_FEE,
        nonce: aliceNonce++,
      },
      { amount: 95_000_000_000_000, poolAddress: Accounts.WALLET_2 }
    );
    expect(response.error).toBeUndefined();
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.success).toBeFalsy();
    expect(tx.result).toBe("(err 3)");

    // Bob tries to extend Alice 90m by 1 cycle
    response = await broadcastDelegateStackExtend(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_2,
        fee: DEFAULT_FEE,
        nonce: bobNonce++,
      },
      {
        stacker: Accounts.WALLET_1,
        poolRewardAccount: Accounts.WALLET_2,
        extendByCount: 1,
      }
    );
    expect(response.error).toBeUndefined();
    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success).toBeFalsy();
    expect(tx.result).toBe("(err 9)");

    // Bob commits 90m for cycle 3
    response = await broadcastStackAggregationCommitIndexed(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_2,
        fee: DEFAULT_FEE,
        nonce: bobNonce++,
      },
      { poolRewardAccount: Accounts.WALLET_2, cycleId: 3 }
    );
    expect(response.error).toBeUndefined();
    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success).toBeFalsy();
    expect(tx.result).toBe("(err 4)");

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 90m STX locked
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(0);
    expect(poxInfo.current_cycle.is_pox_active).toBe(false);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(90_000_000_000_000);

    // Assert reward slots
    // Check Pool operators/Cloe's table entry
    const poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      2,
      0
    );

    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(90_000_000_000_000));
  });

  it("extended STX are not locked for next cycle (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for block N+6 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 6);

    let coreInfo = await getCoreInfo(network);
    expect(coreInfo.burn_block_height).toBe(126);

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 90m STX locked
    expect(poxInfo.current_cycle.id).toBe(2);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(90_000_000_000_000);
    expect(poxInfo.current_cycle.is_pox_active).toBe(true);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(0);

    // Assert reward slots for cycle #3
    // Check Pool operators (Cloe's and Bob's) table entry
    // Neither should have entries
    const poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      3,
      0
    );
    expect(poxAddrInfo0?.["total-ustx"]).toBeUndefined();

    const poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      3,
      1
    );
    expect(poxAddrInfo1?.["total-ustx"]).toBeUndefined();
  });

  it("user can delegate to a new pool after previous lock-up is complete (cycle #3)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for block N+2 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 2);

    // Alice delegates 95m STX to Bob
    let response = await broadcastDelegateSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_1,
        fee: DEFAULT_FEE,
        nonce: aliceNonce++,
      },
      { amount: 95_000_000_000_000, poolAddress: Accounts.WALLET_2 }
    );
    expect(response.error).toBeUndefined();
    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);

    const chainInfo = await getChainInfo(network);
    const blockHeight = chainInfo.burn_block_height;

    // Bob locks 90m for Alice
    response = await broadcastDelegateStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_2,
        fee: DEFAULT_FEE,
        nonce: bobNonce++,
      },
      {
        stacker: Accounts.WALLET_1,
        amount: 90_000_000_000_000,
        poolRewardAccount: Accounts.WALLET_2,
        startBurnHeight: blockHeight,
        lockPeriodCycles: 1,
      }
    );
    expect(response.error).toBeUndefined();
    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);

    // Bob commits 90m
    response = await broadcastStackAggregationCommitIndexed(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_2,
        fee: DEFAULT_FEE,
        nonce: bobNonce++,
      },
      { poolRewardAccount: Accounts.WALLET_2, cycleId: 4 }
    );
    expect(response.error).toBeUndefined();
    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 90m STX locked
    expect(poxInfo.current_cycle.id).toBe(3);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(90_000_000_000_000);

    // Check Alice's table entry
    const poxAddrInfo0 = await readRewardCyclePoxAddressForAddress(
      network,
      3,
      2,
      Accounts.WALLET_1.stxAddress
    );
    expect(poxAddrInfo0).toBeNull();

    // Check Pool operators/Bob's table entry
    const poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      4,
      0
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(90_000_000_000_000));

    // Ensure Alice's STX are locked
    await expectAccountToBe(
      network,
      Accounts.WALLET_1.stxAddress,
      100_000_000_000_000 - 90_000_000_000_000 - aliceNonce * DEFAULT_FEE,
      90_000_000_000_000
    );
  });
});
