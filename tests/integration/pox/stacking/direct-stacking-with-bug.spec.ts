import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { uintCV } from "@stacks/transactions";
import { Accounts, Constants } from "../../constants";
import {
  DEFAULT_EPOCH_TIMELINE,
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  getStacksNodeVersion,
  waitForStacksTransaction,
} from "../../helpers";
import {
  getCoreInfo,
  getPoxInfo,
  mineBtcBlock as mineBitcoinBlockAndHopeForStacksBlock,
  readRewardCyclePoxAddressForAddress,
  waitForNextRewardPhase,
} from "../helpers";
import {
  broadcastStackIncrease,
  broadcastStackSTX,
} from "../helpers-direct-stacking";

describe("testing solo stacker increase with bug", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  const version = getStacksNodeVersion();

  beforeAll(() => {
    const timeline = {
      epoch_2_2: 118,
    };
    orchestrator = buildDevnetNetworkOrchestrator(
      getNetworkIdFromEnv(),
      timeline
    );
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

    const blockHeight = Constants.DEVNET_DEFAULT_POX_2_ACTIVATION + 1;
    const fee = 1000;
    const cycles = 1;

    // Faucet stacks 900m (1/4 of liquid suply)
    let response = await broadcastStackSTX(
      { poxVersion: 2, network, account: Accounts.FAUCET, fee, nonce: 0 },
      { amount: 900_000_000_000_001, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();

    // let Faucet's stacking confirm to enforce reward index 0
    await waitForStacksTransaction(orchestrator, response.txid);

    // Bob stacks 80m
    response = await broadcastStackSTX(
      { poxVersion: 2, network, account: Accounts.WALLET_2, fee, nonce: 0 },
      { amount: 80_000_000_000_010, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();

    // Bob increases by 10m
    response = await broadcastStackIncrease(
      { poxVersion: 2, network, account: Accounts.WALLET_2, fee, nonce: 1 },
      { amount: 10000000000100 }
    );
    expect(response.error).toBeUndefined();
    // let Bobx's stacking confirm to enforce reward index 1
    await waitForStacksTransaction(orchestrator, response.txid);

    // Cloe stacks 80m
    response = await broadcastStackSTX(
      { poxVersion: 2, network, account: Accounts.WALLET_3, fee, nonce: 0 },
      { amount: 80_000_000_001_000, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();

    // Cloe increases by 10m
    response = await broadcastStackIncrease(
      { poxVersion: 2, network, account: Accounts.WALLET_3, fee, nonce: 1 },
      { amount: 10_000_000_010_000 }
    );
    expect(response.error).toBeUndefined();
    await orchestrator.waitForStacksBlockIncludingTransaction(response.txid);

    let poxInfo = await getPoxInfo(network);

    expect(poxInfo.current_cycle.id).toBe(1);

    // Assert that the next cycle has 1_080m STX locked
    // that is more than the liquidity of 1_405m STX
    expect(poxInfo.next_cycle.stacked_ustx).toBe(1_080_000_000_011_111);

    // Check Faucets's table entry
    const poxAddrInfo0 = await readRewardCyclePoxAddressForAddress(
      network,
      2,
      Accounts.FAUCET.stxAddress
    );
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(900_000_000_000_001));

    // Check Bob's table entry
    const poxAddrInfo1 = await readRewardCyclePoxAddressForAddress(
      network,
      2,
      Accounts.WALLET_2.stxAddress
    );
    // HERE'S THE BUG: THIS SHOULD BE `u90000000000110`
    // expect(poxAddrInfo1["total-ustx"]).toEqual(
    //   uintCV(90_000_000_000_110)
    // );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(990_000_000_000_111));

    // Check Cloe's table entry
    const poxAddrInfo2 = await readRewardCyclePoxAddressForAddress(
      network,
      2,
      Accounts.WALLET_3.stxAddress
    );
    // HERE'S THE BUG: THIS SHOULD BE `u90000000011000`
    // expect(poxAddrInfo2["total-ustx"]).toEqual(uintCV(90_000_000_011_000));
    expect(poxAddrInfo2?.["total-ustx"]).toEqual(uintCV(1080_000_000_011_111));

    // advance to block 120, the last one before chain halt
    let coreInfo = await getCoreInfo(network);
    const mineUntilHalt = 120 - coreInfo.burn_block_height;
    const potentialCrashHeight = coreInfo.stacks_tip_height + mineUntilHalt;
    let lastIndices;
    for (let i = 0; i < mineUntilHalt; i++) {
      lastIndices = await mineBitcoinBlockAndHopeForStacksBlock(orchestrator);
    }
    expect(lastIndices).toStrictEqual({
      btcIndex: 120,
      stxIndex: coreInfo.stacks_tip_height + mineUntilHalt,
    });

    if (Number(version) >= 2.2) {
      // Mine a couple more blocks and verify that the chain is still advancing
      await orchestrator.mineBitcoinBlockAndHopeForStacksBlock();
      await orchestrator.mineBitcoinBlockAndHopeForStacksBlock();
      coreInfo = await getCoreInfo(network);
      expect(coreInfo.burn_block_height).toBeGreaterThan(120);
      expect(coreInfo.stacks_tip_height).toBeGreaterThan(potentialCrashHeight);
    } else {
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
    }
  });
});
