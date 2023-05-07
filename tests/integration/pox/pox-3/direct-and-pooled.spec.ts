import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { SomeCV, cvToString, uintCV } from "@stacks/transactions";
import { Accounts, Constants } from "../../constants";
import {
  asyncExpectStacksTransactionSuccess,
  buildDevnetNetworkOrchestrator,
  getChainInfo,
  getNetworkIdFromEnv,
  getStacksNodeVersion,
  waitForStacksTransaction,
} from "../../helpers";
import {
  expectAccountToBe,
  getPoxInfo,
  readRewardCyclePoxAddressForAddress,
  waitForNextRewardPhase,
} from "../helpers";
import { broadcastStackSTX } from "../helpers-direct-stacking";
import { broadcastDelegateSTX } from "../helpers-pooled-stacking";

describe("testing mixed direct and pooled stacking in pox-3", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  const version = getStacksNodeVersion();
  const fee = 1000;
  let timeline = {
    epoch_2_0: 100,
    epoch_2_05: 102,
    epoch_2_1: 104,
    pox_2_activation: 105,
    epoch_2_2: 106,
    epoch_2_3: 108,
    epoch_2_4: 112,
  };
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

  it("delegating after direct stacking should fail (cycle #1)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for 2.4 to go live
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_4
    );
    await orchestrator.waitForNextStacksBlock();

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
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.success).toBeFalsy();
    expect(tx.result).toBe("(err 3)");

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 75m STX locked
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(29_290_000_000_000);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(75_000_000_000_000);

    // Check Alice's table entry
    let poxAddrInfo0 = await readRewardCyclePoxAddressForAddress(
      network,
      3,
      2,
      Accounts.WALLET_1.stxAddress
    );
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(75_000_000_000_000));
  });

  it("stacking more should increase the slot price (cycle #1)", async () => {
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

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 975m STX locked
    // and the slot price increased above Alice's stacking
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(29_290_000_000_000);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(975_000_000_000_000);
  });

  it("auto-unlock unlocks directly stacked amount and total_stacked is updated (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();

    // move on to the next cycle after unlock (N+5)
    await waitForNextRewardPhase(network, orchestrator, 5);

    let poxInfo = await getPoxInfo(network);
    // Assert that the current cycle has 900m STX locked from direct stacking
    expect(poxInfo.current_cycle.id).toBe(2);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(900_000_000_000_000);
    // FIXME: Is this right? Alice has stacked 75M and she gets unlocked
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(75_000_000_000_000);

    // All STX are unlocked in the next cycle
    expect(poxInfo.next_cycle.stacked_ustx).toBe(0);

    // Check Alice's table entry for cycle 2 -- should be not found
    let poxAddrInfo0 = await readRewardCyclePoxAddressForAddress(
      network,
      3,
      2,
      Accounts.WALLET_1.stxAddress
    );
    expect(poxAddrInfo0).toBeNull();

    // Check Faucets's table entry for cycle 2
    let poxAddrInfo1 = await readRewardCyclePoxAddressForAddress(
      network,
      3,
      2,
      Accounts.FAUCET.stxAddress
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(900_000_000_000_000));

    // Check Alice's table entry for cycle 3 -- should be not found
    poxAddrInfo0 = await readRewardCyclePoxAddressForAddress(
      network,
      3,
      3,
      Accounts.WALLET_1.stxAddress
    );
    expect(poxAddrInfo0).toBeNull();

    await expectAccountToBe(
      network,
      Accounts.WALLET_1.stxAddress,
      100_000_000_000_000 - fee * 2,
      0
    );
  });

  it("stacking by other user should activate pox for cycle #3 (in cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
    let chainInfo = await getChainInfo(network);
    blockHeight = chainInfo.burn_block_height;
    const cycles = 1;

    // Cloe stacks 80m
    let response = await broadcastStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
      },
      { amount: 80_000_000_000_000, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();
    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);

    let poxInfo = await getPoxInfo(network);
    expect(poxInfo.current_cycle.id).toBe(2);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(80_000_000_000_000);
  });

  it("re-check locked amounts (cycle #3)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();

    // move on to the next cycle after unlock (N+5)
    await waitForNextRewardPhase(network, orchestrator, 5);

    let poxInfo = await getPoxInfo(network);
    console.log(poxInfo);
    // Assert that the current cycle has 80m STX locked
    // and no STX locked for next cycle
    expect(poxInfo.current_cycle.id).toBe(3);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(80_000_000_000_000);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(29_290_000_000_000);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(0);
    expect(poxInfo.current_cycle.is_pox_active).toBe(true);

    // Check Alice's table entry for cycle 3
    let poxAddrInfo0 = await readRewardCyclePoxAddressForAddress(
      network,
      3,
      3,
      Accounts.WALLET_1.stxAddress
    );
    expect(poxAddrInfo0).toBeNull();

    // Check Chloe's table entry for cycle 3
    let poxAddrInfo1 = await readRewardCyclePoxAddressForAddress(
      network,
      3,
      3,
      Accounts.WALLET_3.stxAddress
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(80_000_000_000_000));

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
      20_000_000_000_000 - chloeNonce * fee,
      0
    );

    // Faucet's STX are still unlocked
    await expectAccountToBe(
      network,
      Accounts.WALLET_3.stxAddress,
      1_000_000_000_000_000 - faucetNonce * fee,
      0
    );
  });
});
