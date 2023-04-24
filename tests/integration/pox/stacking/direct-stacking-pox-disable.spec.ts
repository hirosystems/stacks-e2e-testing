import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { Accounts } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import {
  getPoxInfo,
  waitForNextRewardPhase,
  readRewardCyclePoxAddressForAddress,
} from "../helpers";
import {
  broadcastStackIncrease,
  broadcastStackSTX,
} from "../helpers-direct-stacking";
import { ClarityValue, cvToString, uintCV } from "@stacks/transactions";

describe("testing solo stacker increase without bug", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let timeline = {
    epoch_2_0: 100,
    epoch_2_05: 102,
    epoch_2_1: 106,
    pox_2_activation: 109,
    epoch_2_2: 120,
  };

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator(
      getNetworkIdFromEnv(),
      timeline,
      undefined,
      "blockstack/stacks-blockchain:sip-022-pox-disable-devnet"
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

    const blockHeight = timeline.pox_2_activation + 1;
    const fee = 1000;
    const cycles = 12;

    // Bob stacks 30m
    let response = await broadcastStackSTX(
      2,
      network,
      30_000_000_000_010,
      Accounts.WALLET_2,
      blockHeight,
      cycles,
      fee,
      0
    );
    expect(response.error).toBeUndefined();

    // Bob increases by 20m
    response = await broadcastStackIncrease(
      network,
      20_000_000_000_100,
      Accounts.WALLET_2,
      fee,
      1
    );
    expect(response.error).toBeUndefined();

    // let Bob's stacking confirm to enforce reward index 0
    await waitForStacksTransaction(orchestrator, response.txid);

    // Alice stacks 50m
    response = await broadcastStackSTX(
      2,
      network,
      50_000_000_000_001,
      Accounts.WALLET_1,
      blockHeight,
      cycles,
      fee,
      0
    );
    expect(response.error).toBeUndefined();

    await orchestrator.waitForStacksBlockIncludingTransaction(response.txid);

    let poxInfo = await getPoxInfo(network);

    // Asserts about pox info for better knowledge sharing
    expect(poxInfo.contract_id).toBe("ST000000000000000000002AMW42H.pox-2");
    expect(poxInfo.current_cycle.id).toBe(1);

    // Assert that the next cycle has 100m STX locked
    expect(poxInfo.current_cycle.stacked_ustx).toBe(0);
    expect(poxInfo.current_cycle.is_pox_active).toBe(false);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(100_000_000_000_111);
    const lockedCycle = poxInfo.next_cycle.id;

    let poxAddrInfo0 = (await readRewardCyclePoxAddressForAddress(
      network,
      2,
      Accounts.WALLET_2.stxAddress
    )) as Record<string, ClarityValue>;
    // There is no bug here because total stack was equal to Bob's stacked amount when Bob called stack-increase.
    expect(cvToString(poxAddrInfo0["total-ustx"])).toBe("u50000000000110");

    // There is no bug here because total stack was 0 when stack-increase was called.
    expect(poxAddrInfo0["total-ustx"]).toEqual(uintCV(50000000000110));

    let poxAddrInfo1 = (await readRewardCyclePoxAddressForAddress(
      network,
      2,
      Accounts.WALLET_1.stxAddress
    )) as Record<string, ClarityValue>;
    expect(poxAddrInfo1["total-ustx"]).toEqual(uintCV(50000000000001));

    // Wait for 2.2 activation and unlock
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_2 + 1
    );

    poxInfo = await getPoxInfo(network);
    console.log(poxInfo);
    expect(poxInfo.current_cycle.id).toBeGreaterThanOrEqual(lockedCycle);
    expect(poxInfo.current_cycle.id).toBeLessThan(lockedCycle + cycles);
    expect(poxInfo.current_cycle.is_pox_active).toBe(false);

    // PoX should stay disabled indefinitely
    await waitForNextRewardPhase(
      network,
      orchestrator,
      poxInfo.current_cycle.id + 1
    );

    poxInfo = await getPoxInfo(network);
    expect(poxInfo.current_cycle.is_pox_active).toBe(false);

    // Alice stacks 50m
    response = await broadcastStackSTX(
      2,
      network,
      90_000_000_000_001,
      Accounts.WALLET_1,
      blockHeight,
      cycles,
      fee,
      1
    );
    expect(response.error).toBeUndefined();

    await orchestrator.waitForStacksBlockIncludingTransaction(response.txid);
  });
});
