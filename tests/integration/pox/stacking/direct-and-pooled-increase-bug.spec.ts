import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { uintCV } from "@stacks/transactions";
import { Accounts } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import {
  expectAccountToBe,
  getPoxInfo,
  readRewardCyclePoxAddressListAtIndex,
  waitForNextRewardPhase,
} from "../helpers";
import { broadcastStackSTX } from "../helpers-direct-stacking";
import {
  broadcastDelegateSTX,
  broadcastDelegateStackIncrease,
  broadcastStackAggregationCommitIndexed,
} from "../helpers-pooled-stacking";

describe("testing mixed direct and pooled stacking under epoch 2.1", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let timeline = {
    epoch_2_0: 100,
    epoch_2_05: 102,
    epoch_2_1: 106,
    pox_2_activation: 109,
  };
  const fee = 1000;

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator(getNetworkIdFromEnv());
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("delegate-stack-increase should add more locked stx to direct stacker (cycle #1)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();
    // Wait for block N+1 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 1);

    const blockHeight = timeline.pox_2_activation + 1;
    const cycles = 1;

    // Faucet stacks 75m STX
    let response = await broadcastStackSTX(
      2,
      network,
      75_000_000_000_000,
      Accounts.FAUCET,
      blockHeight,
      cycles,
      fee,
      0
    );
    expect(response.error).toBeUndefined();

    // Faucet delegates 1_100m to Bob
    response = await broadcastDelegateSTX(
      2,
      network,
      Accounts.FAUCET,
      fee,
      1,
      1_100_000_000_000_000,
      Accounts.WALLET_2
    );
    expect(response.error).toBeUndefined();
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.success).toBeTruthy();

    // Bob increase delegation by 920m
    response = await broadcastDelegateStackIncrease(
      2,
      network,
      Accounts.WALLET_2,
      fee,
      0,
      Accounts.FAUCET,
      Accounts.WALLET_2,
      920_000_000_000_000
    );
    expect(response.error).toBeUndefined();

    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success, tx.result).toBeTruthy();

    // Bob commits 920m
    response = await broadcastStackAggregationCommitIndexed(
      2,
      network,
      Accounts.WALLET_2,
      fee,
      1,
      Accounts.WALLET_2,
      2
    );
    expect(response.error).toBeUndefined();

    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.result).toBe("(ok u1)");
    expect(tx.success).toBeTruthy();

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 995m STX locked
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(29_290_000_000_000);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(995_000_000_000_000);

    // Check Faucets's table entry
    let poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      0
    );
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(75_000_000_000_000));

    // Check Bob's table entry
    let poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      1
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(920_000_000_000_000));
  });

  it("auto-unlock does not remove locked amount from delegation (BUG) (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();

    // move on to the next cycle after unlock (N+5)
    await waitForNextRewardPhase(network, orchestrator, 5);

    let poxInfo = await getPoxInfo(network);
    // Assert that the current cycle has 920m STX locked and earning
    expect(poxInfo.current_cycle.id).toBe(2);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(920_000_000_000_000);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(76_670_000_000_000);

    // Alice's table entry has been removed
    // Check Bob's table entry
    let poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      0
    );
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(920_000_000_000_000));

    let poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      1
    );
    expect(poxAddrInfo1?.["total-ustx"]).toBeUndefined();

    // THIS IS THE BUG
    // Faucet has no locked STX but Bob's pool still has 920m locked
    await expectAccountToBe(
      network,
      Accounts.FAUCET.stxAddress,
      1_000_000_000_000_000 - fee * 2,
      0
    );
  });
});
