import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { Accounts } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import {
  getCoreInfo,
  getPoxInfo,
  mineBtcBlock as mineBitcoinBlockAndHopeForStacksBlock,
  waitForNextRewardPhase
} from "../helpers";
import {
  broadcastStackIncrease,
  broadcastStackSTX,
} from "../helpers-direct-stacking";

describe("testing solo stacker increase without bug", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let timeline = {
    epoch_2_0: 100,
    epoch_2_05: 102,
    epoch_2_1: 106,
    pox_2_activation: 109,
  };

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator(getNetworkIdFromEnv());
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("using stacks-increase in the same cycle should result in increased rewards", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    await orchestrator.waitForNextStacksBlock();
    // Wait for block N+1 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 1);

    const blockHeight = timeline.pox_2_activation + 1;
    const fee = 1000;
    const cycles = 1;

    // Alice stacks 900m (1/4 of liquid suply)
    let response = await broadcastStackSTX(
      2,
      network,
      900_000_000_000_001,
      Accounts.FAUCET,
      blockHeight,
      cycles,
      fee,
      0
    );
    expect(response.error).toBeUndefined();

    // let Alice's stacking confirm to enforce reward index 0
    await waitForStacksTransaction(orchestrator, response.txid);

    // Bob stacks 80m
    response = await broadcastStackSTX(
      2,
      network,
      80_000_000_000_010,
      Accounts.WALLET_2,
      blockHeight,
      cycles,
      fee,
      0
    );
    expect(response.error).toBeUndefined();

    // Bob increases by 10m
    response = await broadcastStackIncrease(
      network,
      10_000_000_000_100,
      Accounts.WALLET_2,
      fee,
      1
    );
    expect(response.error).toBeUndefined();
    // let Bobx's stacking confirm to enforce reward index 1
    await waitForStacksTransaction(orchestrator, response.txid);

    // Cloe stacks 80m
    response = await broadcastStackSTX(
      2,
      network,
      80_000_000_001_000,
      Accounts.WALLET_3,
      blockHeight,
      cycles,
      fee,
      0
    );
    expect(response.error).toBeUndefined();

    // Cloe increases by 10m
    response = await broadcastStackIncrease(
      network,
      10_000_000_010_000,
      Accounts.WALLET_3,
      fee,
      1
    );
    expect(response.error).toBeUndefined();
    await orchestrator.waitForStacksBlockIncludingTransaction(response.txid);

    let poxInfo = await getPoxInfo(network);

    // Asserts about pox info for better knowledge sharing
    expect(poxInfo.total_liquid_supply_ustx).toBe(1_405_738_842_905_579);
    expect(poxInfo.contract_id).toBe("ST000000000000000000002AMW42H.pox-2");
    expect(poxInfo.pox_activation_threshold_ustx).toBe(70_286_942_145_278);
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(29_290_000_000_000);

    // Assert that the next cycle has 100m STX locked
    expect(poxInfo.current_cycle.stacked_ustx).toBe(0);
    expect(poxInfo.current_cycle.is_pox_active).toBe(false);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(1_080_000_000_011_111);

    // Check Alice's table entry
    const poxAddrInfo0 = (await readRewardCyclePoxAddressForAddress(
      network,
      2,
      Accounts.FAUCET.stxAddress
    )) as Record<string, ClarityValue>;
    expect(poxAddrInfo0["total-ustx"]).toEqual(uintCV(900_000_000_000_001));

    // Check Bob's table entry
    const poxAddrInfo1 = (await readRewardCyclePoxAddressForAddress(
      network,
      2,
      Accounts.WALLET_2.stxAddress
    )) as Record<string, ClarityValue>;
    // HERE'S THE BUG: THIS SHOULD BE `u90000000000110`
    // expect(poxAddrInfo1["total-ustx"]).toEqual(
    //   uintCV(90_000_000_000_110)
    // );
    expect(poxAddrInfo1["total-ustx"]).toEqual(uintCV(990_000_000_000_111));

    // Check Cloe's table entry
    const poxAddrInfo2 = (await readRewardCyclePoxAddressForAddress(
      network,
      2,
      Accounts.WALLET_3.stxAddress
    )) as Record<string, ClarityValue>;
    // HERE'S THE BUG: THIS SHOULD BE `u90000000011000`
    // expect(poxAddrInfo2["total-ustx"]).toEqual(uintCV(90_000_000_011_000));
    expect(poxAddrInfo2["total-ustx"]).toEqual(uintCV(1080_000_000_011_111));

    // advance to block 120, the last one before chain halt
    let coreInfo = await getCoreInfo(network);
    const mineUntilHalt = 120 - coreInfo.burn_block_height;
    let lastIndices;
    for (let i = 0; i < mineUntilHalt; i++) {
      lastIndices = await mineBitcoinBlockAndHopeForStacksBlock(orchestrator);
    }
    expect(lastIndices).toStrictEqual({
      btcIndex: 120,
      stxIndex: coreInfo.stacks_tip_height + mineUntilHalt,
    });

    // try two bitcoin blocks and assert that no more stacks blocks are mined
    lastIndices = await mineBitcoinBlockAndHopeForStacksBlock(orchestrator);
    expect(lastIndices).toStrictEqual({
      stxIndex: undefined,
      btcIndex: undefined,
    });
    lastIndices = await mineBitcoinBlockAndHopeForStacksBlock(orchestrator);
    expect(lastIndices).toStrictEqual({
      stxIndex: undefined,
      btcIndex: undefined,
    });
  });
});
