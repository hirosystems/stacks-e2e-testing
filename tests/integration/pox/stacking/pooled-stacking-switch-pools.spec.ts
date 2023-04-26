import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { uintCV } from "@stacks/transactions";
import { Accounts, Constants } from "../../constants";
import {
  asyncExpectStacksTransactionSuccess,
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
} from "../helpers-pooled-stacking";

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

    // Alice delegates 90m STX to Cloe
    let response = await broadcastDelegateSTX(
      { poxVersion: 2, network, account: Accounts.WALLET_1, fee, nonce: 0 },
      { amount: 90_000_000_000_000, poolAddress: Accounts.WALLET_3 }
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

  it("user can swith pools and new pool operator can extend (cycle #1)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Alice revokes delegates 90m STX to Bob

    let response = await broadcastRevokeDelegateStx({
      poxVersion: 2,
      network,
      account: Accounts.WALLET_1,
      fee,
      nonce: 1,
    });
    expect(response.error).toBeUndefined();

    response = await broadcastDelegateSTX(
      { poxVersion: 2, network, account: Accounts.WALLET_1, fee, nonce: 2 },
      { amount: 90_000_000_000_000, poolAddress: Accounts.WALLET_2 }
    );
    expect(response.error).toBeUndefined();

    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);

    // Bob extends Alice 80m by 1 cycle
    response = await broadcastDelegateStackExtend(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_2,
        fee,
        nonce: 2,
      },
      {
        stacker: Accounts.WALLET_1,
        poolRewardAccount: Accounts.WALLET_2,
        extendByCount: 1,
      }
    );
    expect(response.error).toBeUndefined();
    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 130m STX locked
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(0);
    expect(poxInfo.current_cycle.is_pox_active).toBe(false);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(80_000_000_000_000);

    // Assert reward slots
    // Check Pool operators/Cloe's table entry
    const poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      0
    );

    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(80_000_000_000_000));
  });

  it("extended STX are locked for next cycle (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for block N+1 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 1);

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 130m STX locked
    expect(poxInfo.current_cycle.id).toBe(2);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(80_000_000_000_000);
    expect(poxInfo.current_cycle.is_pox_active).toBe(true);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(80_000_000_000_000);

    // Assert reward slots
    // Check Pool operators (Cloe's and Bob's) table entry
    const poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      0
    );

    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(80_000_000_000_000));

    const poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      1
    );

    expect(poxAddrInfo0?.["total-ustx"]).toBeUndefined();
  });
});
