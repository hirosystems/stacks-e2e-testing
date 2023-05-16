import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import {
  cvToString,
  principalCV,
  responseOkCV,
  tupleCV,
  uintCV,
} from "@stacks/transactions";
import { Accounts, DEFAULT_FEE } from "../../constants";
import {
  FAST_FORWARD_TO_EPOCH_2_4,
  asyncExpectStacksTransactionSuccess,
  buildDevnetNetworkOrchestrator,
  getChainInfo,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import {
  getCoreInfo,
  getPoxInfo,
  readRewardCyclePoxAddressForAddress,
  readRewardCyclePoxAddressListAtIndex,
  waitForNextRewardPhase
} from "../helpers";
import {
  broadcastDelegateSTX,
  broadcastDelegateStackExtend,
  broadcastDelegateStackSTX,
  broadcastStackAggregationCommitIndexed
} from "../helpers-pooled-stacking";

describe("testing pooled stacking for sbtc mini under epoch 2.4", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let timeline = FAST_FORWARD_TO_EPOCH_2_4;
  let fee = DEFAULT_FEE;
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

    // Alice delegates 95m STX to Chloe
    let response = await broadcastDelegateSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_1,
        fee,
        nonce: aliceNonce++,
      },
      { amount: 95_000_000_000_000, poolAddress: Accounts.WALLET_3 }
    );
    expect(response.error).toBeUndefined();

    // Bob delegates 10m STX to Chloe (below minimum)
    response = await broadcastDelegateSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_2,
        fee,
        nonce: bobNonce++,
      },
      { amount: 10_000_000_000_000, poolAddress: Accounts.WALLET_3 }
    );
    expect(response.error).toBeUndefined();

    const chainInfo = await getChainInfo(network);
    const blockHeight = chainInfo.burn_block_height;

    // Chloe locks 90m for Alice using wallet_3.btcAddress
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
        amount: 90_000_000_000_000,
        poolRewardAccount: Accounts.WALLET_3,
        startBurnHeight: blockHeight,
        lockPeriodCycles: 1,
      }
    );
    expect(response.error).toBeUndefined();

    // Chloe commits 90m
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
    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);

    // Chloe locks 10m for Bob using wallet_2.btcAddress
    // Chloe does NOT commit (because wallet_3.btcAddress was selected)
    response = await broadcastDelegateStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
      },
      {
        stacker: Accounts.WALLET_2,
        amount: 10_000_000_000_000,
        poolRewardAccount: Accounts.WALLET_2,
        startBurnHeight: blockHeight,
        lockPeriodCycles: 1,
      }
    );
    expect(response.error).toBeUndefined();

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

    // Check Pool operators/Chloe's table entry
    const poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      2,
      0
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(90_000_000_000_000));
  });

  it("pool operator can extend using different pox address (cycle #1)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Chloe extends Alice 90m by 1 cycle using wallet_2.btcAddress
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
        poolRewardAccount: Accounts.WALLET_2,
        extendByCount: 1,
      }
    );
    expect(response.error).toBeUndefined();
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.success).toBeTruthy();
    expect(tx.result).toBe(
      cvToString(
        responseOkCV(
          tupleCV({
            stacker: principalCV(Accounts.WALLET_1.stxAddress),
            "unlock-burn-height": uintCV(140),
          })
        )
      )
    );

    // Chloe extends Bobs 10m by 1 cycle using wallet_2.btcAddress
    response = await broadcastDelegateStackExtend(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
      },
      {
        stacker: Accounts.WALLET_2,
        poolRewardAccount: Accounts.WALLET_2,
        extendByCount: 1,
      }
    );
    expect(response.error).toBeUndefined();
    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success).toBeTruthy();
    expect(tx.result).toBe(
      cvToString(
        responseOkCV(
          tupleCV({
            stacker: principalCV(Accounts.WALLET_2.stxAddress),
            "unlock-burn-height": uintCV(140),
          })
        )
      )
    );

    // Chloe commits 100m for cycle #3 using wallet_2.btcAddress
    response = await broadcastStackAggregationCommitIndexed(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
      },
      { poolRewardAccount: Accounts.WALLET_2, cycleId: 3 }
    );
    expect(response.error).toBeUndefined();
    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success).toBeTruthy();
    expect(tx.result).toBe(cvToString(responseOkCV(uintCV(0))));

    let poxInfo = await getPoxInfo(network);

    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(0);
    expect(poxInfo.current_cycle.is_pox_active).toBe(false);
    // Assert that the cycle #2 has 90m STX locked
    expect(poxInfo.next_cycle.stacked_ustx).toBe(90_000_000_000_000);

    // Assert reward slots
    // Check Pool operators/Chloe's table entry
    const poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      2,
      0
    );

    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(90_000_000_000_000));
  });

  it("extended STX are locked for next cycle (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for block N+6 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 6);

    let coreInfo = await getCoreInfo(network);
    expect(coreInfo.burn_block_height).toBe(126);

    let poxInfo = await getPoxInfo(network);

    expect(poxInfo.current_cycle.id).toBe(2);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(90_000_000_000_000);
    expect(poxInfo.current_cycle.is_pox_active).toBe(true);
    // Assert that the next cycle has 100m STX locked
    expect(poxInfo.next_cycle.stacked_ustx).toBe(100_000_000_000_000);

    // Assert reward slots for cycle #3
    // Check Pool operators table entry
    // Neither should have entries
    const poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      3,
      0
    );
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(100_000_000_000_000));
  });
});
