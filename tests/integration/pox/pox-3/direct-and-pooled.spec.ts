import {
  DevnetNetworkOrchestrator,
  StacksTransactionMetadata,
} from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { uintCV } from "@stacks/transactions";
import { Accounts } from "../../constants";
import {
  FAST_FORWARD_TO_EPOCH_2_4,
  asyncExpectStacksTransactionSuccess,
  buildDevnetNetworkOrchestrator,
  getChainInfo,
  getNetworkIdFromEnv,
  getStacksNodeVersion,
} from "../../helpers";
import {
  expectAccountToBe,
  getAccount,
  getPoxInfo,
  readRewardCyclePoxAddressForAddress,
  waitForNextRewardPhase,
} from "../helpers";
import { broadcastStackSTX } from "../helpers-direct-stacking";
import {
  broadcastDelegateSTX,
  broadcastDelegateStackSTX,
  broadcastStackAggregationCommitIndexed,
} from "../helpers-pooled-stacking";

describe("testing mixed direct and pooled stacking in pox-3", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  const version = getStacksNodeVersion();
  const fee = 1000;
  const timeline = FAST_FORWARD_TO_EPOCH_2_4;
  let blockHeight = 0;
  let aliceNonce = 0;
  let bobNonce = 0;
  let chloeNonce = 0;
  let faucetNonce = 0;

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

  it("delegating after direct stacking should fail (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for 2.4 to go live
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_4
    );

    // Wait for the next reward phase (#2)
    await waitForNextRewardPhase(network, orchestrator, 1);

    let chainInfo = await getChainInfo(network);
    blockHeight = chainInfo.burn_block_height;
    const cycles = 1;

    // Alice stacks 75m STX
    let response = await broadcastStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_1,
        fee,
        nonce: aliceNonce++,
      },
      { amount: 75_000_000_000_000, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();
    const stackTxid = response.txid;

    // Alice delegates 100m to Bob, but it fails.
    response = await broadcastDelegateSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_1,
        fee,
        nonce: aliceNonce++,
      },
      { amount: 100_000_000_000_000, poolAddress: Accounts.WALLET_2 }
    );
    expect(response.error).toBeUndefined();
    const delegateTxid = response.txid;

    // Bob tries to stack Alice's 90m STX
    response = await broadcastDelegateStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_2,
        fee: fee,
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
    const delegateStackTxid = response.txid;

    // Bob tries to commit 90m for cycle 3
    response = await broadcastStackAggregationCommitIndexed(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_2,
        fee: fee,
        nonce: bobNonce++,
      },
      { poolRewardAccount: Accounts.WALLET_2, cycleId: 3 }
    );
    expect(response.error).toBeUndefined();
    const commitTxid = response.txid;

    // Make sure all of those delegation transactions failed
    let chainUpdate = await orchestrator.waitForNextStacksBlock();
    let txCount = 0;
    for (const tx of chainUpdate.new_blocks[0].block.transactions) {
      let metadata = <StacksTransactionMetadata>tx.metadata;
      switch (tx.transaction_identifier.hash.substring(2)) {
        case stackTxid:
          expect(metadata.success).toBeTruthy();
          txCount++;
          break;
        case delegateTxid:
          expect(metadata.success).toBeTruthy();
          txCount++;
          break;
        case delegateStackTxid:
          expect(metadata.success).toBeFalsy();
          expect(metadata.result).toBe("(err 9)"); // ERR_STACKING_PERMISSION_DENIED
          txCount++;
          break;
        case commitTxid:
          expect(metadata.success).toBeFalsy();
          expect(metadata.result).toBe("(err 4)");
          txCount++;
          break;
        default:
          break;
      }
    }
    expect(txCount).toBe(4);

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 75m STX locked
    expect(poxInfo.current_cycle.id).toBe(2);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(29_290_000_000_000);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(75_000_000_000_000);

    // Check Alice's table entry for cycle 3
    let poxAddrInfo0 = await readRewardCyclePoxAddressForAddress(
      network,
      3,
      3,
      Accounts.WALLET_1.stxAddress
    );
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(75_000_000_000_000));
  });

  it("stacking more should increase the slot price (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
    const cycles = 1;

    // Faucet stacks 900m (1/4 of liquid suply)
    let response = await broadcastStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.FAUCET,
        fee,
        nonce: faucetNonce++,
      },
      { amount: 900_000_000_000_000, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();

    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);
    await orchestrator.waitForNextStacksBlock();

    // Assert that the next cycle has 975m STX locked
    // and the slot price increased above Alice's stacking
    let poxInfo = await getPoxInfo(network);
    expect(poxInfo.current_cycle.id).toBe(2);
    expect(poxInfo.current_burnchain_block_height).toBeLessThan(
      poxInfo.next_cycle.prepare_phase_start_block_height
    );
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(29_290_000_000_000);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(975_000_000_000_000);
    expect(poxInfo.next_cycle.min_threshold_ustx).toBe(81_250_000_000_000);
  });

  it("auto-unlock unlocks directly stacked amount and total_stacked is updated (cycle #3)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();

    // Move on to the next cycle after unlock (N+3)
    // when locked STXs are available again.
    await waitForNextRewardPhase(network, orchestrator, 2);

    // Assert that the current cycle has 900m STX locked from direct stacking
    let poxInfo = await getPoxInfo(network);
    expect(poxInfo.current_cycle.id).toBe(3);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(900_000_000_000_000);
    // NOTE: This is confusing, because if the min threshold was 75M, then
    // Alice would not have been unlocked. This value is calculated based on
    // the current chain tip, which includes the unlocks. In a future,
    // non-consensus-breaking update, we may want to update this value to
    // be computed at the pox anchor block instead.
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(75_000_000_000_000);

    // All STX are unlocked in the next cycle (because they were only stacked for 1 cycle)
    expect(poxInfo.next_cycle.stacked_ustx).toBe(0);

    // Check Alice's table entry for cycle 3 -- should be not found
    let poxAddrInfo0 = await readRewardCyclePoxAddressForAddress(
      network,
      3,
      3,
      Accounts.WALLET_1.stxAddress
    );
    expect(poxAddrInfo0).toBeNull();

    // Check Faucets's table entry for cycle 3
    let poxAddrInfo1 = await readRewardCyclePoxAddressForAddress(
      network,
      3,
      3,
      Accounts.FAUCET.stxAddress
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(900_000_000_000_000));

    // Check Alice's table entry for cycle 4 -- should be not found
    poxAddrInfo0 = await readRewardCyclePoxAddressForAddress(
      network,
      3,
      4,
      Accounts.WALLET_1.stxAddress
    );
    expect(poxAddrInfo0).toBeNull();

    const alice = await getAccount(network, Accounts.WALLET_1.stxAddress);
    expect(alice.unlock_height).toBe(poxInfo.current_burnchain_block_height!);

    // We need to wait one more block to see Alice's unlock take effect
    await orchestrator.waitForNextStacksBlock();

    // Alice's STX should be unlocked
    await expectAccountToBe(
      network,
      Accounts.WALLET_1.stxAddress,
      100_000_000_000_000 - aliceNonce * fee,
      0
    );
  });

  it("stacking by other user should activate pox for cycle #4 (in cycle #3)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
    let chainInfo = await getChainInfo(network);
    blockHeight = chainInfo.burn_block_height;
    const cycles = 1;

    // Chloe stacks 90m
    let response = await broadcastStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
      },
      { amount: 90_000_000_000_000, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();
    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);

    let poxInfo = await getPoxInfo(network);
    expect(poxInfo.current_cycle.id).toBe(3);
    expect(poxInfo.current_burnchain_block_height).toBeLessThan(
      poxInfo.next_cycle.prepare_phase_start_block_height
    );
    expect(poxInfo.next_cycle.stacked_ustx).toBe(90_000_000_000_000);
  });

  it("re-check locked amounts (cycle #4)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();

    // move on to the next cycle after unlock (N+5)
    await waitForNextRewardPhase(network, orchestrator, 5);

    // Assert that the current cycle has 90m STX locked
    // and no STX locked for next cycle
    let poxInfo = await getPoxInfo(network);
    expect(poxInfo.current_cycle.id).toBe(4);
    expect(poxInfo.pox_activation_threshold_ustx).toBe(70_286_942_145_278);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(90_000_000_000_000);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(29_290_000_000_000);
    expect(poxInfo.current_cycle.is_pox_active).toBe(true);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(0);

    // Check Alice's table entry for cycle 4
    let poxAddrInfo0 = await readRewardCyclePoxAddressForAddress(
      network,
      3,
      4,
      Accounts.WALLET_1.stxAddress
    );
    expect(poxAddrInfo0).toBeNull();

    // Check Chloe's table entry for cycle 4
    let poxAddrInfo1 = await readRewardCyclePoxAddressForAddress(
      network,
      3,
      4,
      Accounts.WALLET_3.stxAddress
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(90_000_000_000_000));

    // Alice's STX are still unlocked
    await expectAccountToBe(
      network,
      Accounts.WALLET_1.stxAddress,
      100_000_000_000_000 - aliceNonce * fee,
      0
    );

    // Chloe's STX are locked
    await expectAccountToBe(
      network,
      Accounts.WALLET_3.stxAddress,
      10_000_000_000_000 - chloeNonce * fee,
      90_000_000_000_000
    );

    // Faucet's STX are still unlocked
    await expectAccountToBe(
      network,
      Accounts.FAUCET.stxAddress,
      1_000_000_000_000_000 - faucetNonce * fee,
      0
    );
  });
});
