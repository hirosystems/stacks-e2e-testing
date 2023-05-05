import {
  DevnetNetworkOrchestrator,
  StacksBlockMetadata,
} from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { uintCV } from "@stacks/transactions";
import { Accounts, Constants, DEFAULT_FEE } from "../../constants";
import {
  DEFAULT_EPOCH_TIMELINE,
  asyncExpectStacksTransactionSuccess,
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  getStacksNodeVersion,
} from "../../helpers";
import {
  getPoxInfo,
  readRewardCyclePoxAddressForAddress,
  readRewardCyclePoxAddressListAtIndex,
  waitForNextPreparePhase,
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

  const timeline = {
    ...DEFAULT_EPOCH_TIMELINE,
    epoch_2_2: 128,
    pox_2_unlock_height: 129,
    epoch_2_3: 138,
  };

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

    // Wait for the pox-2 activation
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.pox_2_activation
    );

    // Alice delegates 95m STX to Cloe
    let response = await broadcastDelegateSTX(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_1,
        fee: DEFAULT_FEE,
        nonce: 0,
      },
      { amount: 95_000_000_000_000, poolAddress: Accounts.WALLET_3 }
    );
    expect(response.error).toBeUndefined();

    // Cloe locks 90m for Alice
    response = await broadcastDelegateStackSTX(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_3,
        fee: DEFAULT_FEE,
        nonce: 0,
      },
      {
        stacker: Accounts.WALLET_1,
        amount: 90_000_000_000_000,
        poolRewardAccount: Accounts.WALLET_3,
        startBurnHeight: Constants.DEVNET_DEFAULT_POX_2_ACTIVATION + 6,
        lockPeriodCycles: 1,
      }
    );
    expect(response.error).toBeUndefined();

    // Cloe commits 90m
    response = await broadcastStackAggregationCommitIndexed(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_3,
        fee: DEFAULT_FEE,
        nonce: 1,
      },
      { poolRewardAccount: Accounts.WALLET_3, cycleId: 2 }
    );
    expect(response.error).toBeUndefined();
    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);

    // we are at block ~111

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 90m STX locked
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(90_000_000_000_000);

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
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(90_000_000_000_000));
  });

  it("user can switch pools and new pool operator can extend (cycle #1)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Alice revokes, then delegates 95m STX to Bob
    let response = await broadcastRevokeDelegateStx({
      poxVersion: 2,
      network,
      account: Accounts.WALLET_1,
      fee: DEFAULT_FEE,
      nonce: 1,
    });
    expect(response.error).toBeUndefined();

    response = await broadcastDelegateSTX(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_1,
        fee: DEFAULT_FEE,
        nonce: 2,
      },
      { amount: 95_000_000_000_000, poolAddress: Accounts.WALLET_2 }
    );
    expect(response.error).toBeUndefined();
    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);

    // we are at block ~112

    // Bob extends Alice 90m by 1 cycle
    response = await broadcastDelegateStackExtend(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_2,
        fee: DEFAULT_FEE,
        nonce: 0,
      },
      {
        stacker: Accounts.WALLET_1,
        poolRewardAccount: Accounts.WALLET_2,
        extendByCount: 1,
      }
    );
    expect(response.error).toBeUndefined();

    // Bob commits 90m for cycle 3
    response = await broadcastStackAggregationCommitIndexed(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_2,
        fee: DEFAULT_FEE,
        nonce: 1,
      },
      { poolRewardAccount: Accounts.WALLET_2, cycleId: 3 }
    );
    expect(response.error).toBeUndefined();
    let [block, tx] = await asyncExpectStacksTransactionSuccess(
      orchestrator,
      response.txid
    );

    expect(
      (block as StacksBlockMetadata).bitcoin_anchor_block_identifier.index
    ).toBeLessThan(timeline.epoch_2_2);

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
      2,
      0
    );

    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(90_000_000_000_000));
  });

  it("extended STX are locked for next cycle (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for block N+6 where N is the height of the next reward phase
    // block 126
    await waitForNextRewardPhase(network, orchestrator, 6);

    let coreInfo = await getCoreInfo(network);
    expect(coreInfo.burn_block_height).toBe(126);

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 90m STX locked
    expect(poxInfo.current_cycle.id).toBe(2);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(90_000_000_000_000);
    expect(poxInfo.current_cycle.is_pox_active).toBe(true);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(90_000_000_000_000);

    // Assert reward slots for cycle #3
    // Check Pool operators (Cloe's and Bob's) table entry
    // Only Bob has an entry
    const poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      0
    );
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(90_000_000_000_000));

    const poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      1
    );
    expect(poxAddrInfo1?.["total-ustx"]).toBeUndefined();
  });
});
