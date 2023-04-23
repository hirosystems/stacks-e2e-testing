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

  it("using direct stacking and delegate-stack-increase throws ArithmeticUnderflow,", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();
    // Wait for block N+1 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 1);

    const blockHeight = timeline.pox_2_activation + 1;
    const cycles = 1;

    // Faucet stacks 90m STX
    let response = await broadcastStackSTX(
      2,
      network,
      90_000_000_000_000,
      Accounts.FAUCET,
      blockHeight,
      cycles,
      fee,
      0
    );
    expect(response.error).toBeUndefined();

    // Faucet delegates 100m to Bob
    response = await broadcastDelegateSTX(
      2,
      network,
      Accounts.FAUCET,
      fee,
      1,
      200_000_000_000_000,
      Accounts.WALLET_2
    );
    expect(response.error).toBeUndefined();
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid
    );
    expect(tx.success).toBeTruthy();

    // Bob increase delegation by 80m
    response = await broadcastDelegateStackIncrease(
      2,
      network,
      Accounts.WALLET_2,
      fee,
      0,
      Accounts.FAUCET,
      Accounts.WALLET_2,
      80_000_000_000_000
    );
    expect(response.error).toBeUndefined();

    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success, tx.result).toBeTruthy();

    // Bob commits 80m
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

    // Assert that the next cycle has 170m STX locked
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(170_000_000_000_000);

    // Check Faucets's table entry
    const poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      0
    );
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(90_000_000_000_000));

    // Check Bob's table entry
    const poxAddrInfo1 = await readRewardCyclePoxAddressListAtIndex(
      network,
      2,
      1
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(80_000_000_000_000));

    // move on to the next cycle
    await waitForNextRewardPhase(network, orchestrator, 1);

    poxInfo = await getPoxInfo(network);
    // Assert that the current cycle has 170m STX locked and earning
    expect(poxInfo.current_cycle.id).toBe(2);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(170_000_000_000_000);
  });
});
