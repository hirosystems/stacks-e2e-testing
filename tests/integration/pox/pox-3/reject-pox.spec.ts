import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { falseCV, trueCV } from "@stacks/transactions";
import { Accounts } from "../../constants";
import {
  FAST_FORWARD_TO_EPOCH_2_4,
  buildDevnetNetworkOrchestrator,
  getChainInfo,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import {
  broadcastRejectPox,
  callReadOnlyIsPoxActive,
  getPoxInfo,
  waitForNextRewardPhase,
} from "../helpers";
import { broadcastStackSTX } from "../helpers-direct-stacking";

describe("testing reject-pox", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  const timeline = FAST_FORWARD_TO_EPOCH_2_4;
  const fee = 1000;
  let aliceNonce = 0;
  let bobNonce = 0;
  let chloeNonce = 0;
  let faucetNonce = 0;

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator(
      getNetworkIdFromEnv(),
      timeline,
    );
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("pox should remain active if non-zero amount, but less than the limit reject", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for 2.4 to go live
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_4,
    );
    await orchestrator.waitForNextStacksBlock();

    let chainInfo = await getChainInfo(network);
    const blockHeight = chainInfo.burn_block_height;
    const cycles = 12;

    // Alice stacks 90m
    let response = await broadcastStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_1,
        fee,
        nonce: aliceNonce++,
      },
      { amount: 90_000_000_000_001, blockHeight, cycles },
    );
    expect(response.error).toBeUndefined();
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid,
    );
    expect(tx.success).toBeTruthy();

    // Bob stacks 90m
    response = await broadcastStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_2,
        fee,
        nonce: bobNonce++,
      },
      { amount: 90_000_000_000_010, blockHeight, cycles },
    );
    expect(response.error).toBeUndefined();
    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success).toBeTruthy();

    let poxInfo = await getPoxInfo(network);
    expect(poxInfo.contract_id).toBe("ST000000000000000000002AMW42H.pox-3");
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.rejection_votes_left_required).toBeGreaterThan(0);

    await waitForNextRewardPhase(network, orchestrator, 1);

    // Verify PoX is active
    poxInfo = await getPoxInfo(network);
    expect(poxInfo.current_cycle.is_pox_active).toBe(true);

    // Chloe rejects pox, but does not have enough to de-activate it
    response = await broadcastRejectPox({
      poxVersion: 3,
      network,
      account: Accounts.WALLET_3,
      fee,
      nonce: chloeNonce++,
    });
    expect(response.error).toBeUndefined();
    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success).toBeTruthy();

    let isPoxActive = await callReadOnlyIsPoxActive(
      3,
      network,
      Accounts.WALLET_1,
      poxInfo.current_cycle.id,
    );
    expect(isPoxActive).toEqual(trueCV());

    isPoxActive = await callReadOnlyIsPoxActive(
      3,
      network,
      Accounts.WALLET_1,
      poxInfo.next_cycle.id,
    );
    expect(isPoxActive).toEqual(trueCV());

    poxInfo = await getPoxInfo(network);
    expect(poxInfo.rejection_votes_left_required).toBeGreaterThan(0);
  });

  it("cannot reject-pox if already stacked", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Alice rejects pox, but has already stacked, so it fails
    let response = await broadcastRejectPox({
      poxVersion: 3,
      network,
      account: Accounts.WALLET_1,
      fee,
      nonce: aliceNonce++,
    });
    expect(response.error).toBeUndefined();
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid,
    );
    expect(tx.success).toBeFalsy();
    expect(tx.result).toBe("(err 3)");
  });

  it("pox should be disabled if enough STX reject", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    let response = await broadcastRejectPox({
      poxVersion: 3,
      network,
      account: Accounts.FAUCET,
      fee,
      nonce: faucetNonce++,
    });
    expect(response.error).toBeUndefined();
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid,
    );
    expect(tx.success).toBeTruthy();

    let poxInfo = await getPoxInfo(network);
    expect(poxInfo.rejection_votes_left_required).toBe(0);

    let isPoxActive = await callReadOnlyIsPoxActive(
      3,
      network,
      Accounts.WALLET_1,
      poxInfo.current_cycle.id,
    );
    expect(isPoxActive).toEqual(trueCV());

    isPoxActive = await callReadOnlyIsPoxActive(
      3,
      network,
      Accounts.WALLET_1,
      poxInfo.next_cycle.id,
    );
    expect(isPoxActive).toEqual(falseCV());

    await waitForNextRewardPhase(network, orchestrator, 1);

    poxInfo = await getPoxInfo(network);
    // This vote count is for the next cycle, so it should be reset.
    expect(poxInfo.rejection_votes_left_required).toBeGreaterThan(0);

    isPoxActive = await callReadOnlyIsPoxActive(
      3,
      network,
      Accounts.WALLET_1,
      poxInfo.current_cycle.id,
    );
    expect(isPoxActive).toEqual(falseCV());
  });

  it("pox should be re-enabled in the next cycle", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    await waitForNextRewardPhase(network, orchestrator, 1);

    let poxInfo = await getPoxInfo(network);
    expect(poxInfo.rejection_votes_left_required).toBeGreaterThan(0);

    let isPoxActive = await callReadOnlyIsPoxActive(
      3,
      network,
      Accounts.WALLET_1,
      poxInfo.current_cycle.id,
    );
    expect(isPoxActive).toEqual(trueCV());
  });
});
