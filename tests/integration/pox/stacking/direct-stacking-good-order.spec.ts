import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { ClarityValue, cvToString, uintCV } from "@stacks/transactions";
import { Accounts, Constants } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import {
  getPoxInfo,
  readRewardCyclePoxAddressForAddress,
  waitForNextRewardPhase,
} from "../helpers";
import {
  broadcastStackIncrease,
  broadcastStackSTX,
} from "../helpers-direct-stacking";

describe("testing solo stacker increase without bug", () => {
  let orchestrator: DevnetNetworkOrchestrator;

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

    const blockHeight = Constants.DEVNET_DEFAULT_POX_2_ACTIVATION + 1;
    const fee = 1000;
    const cycles = 1;

    // Bob stacks 30m
    let response = await broadcastStackSTX(
      { poxVersion: 2, network, account: Accounts.WALLET_2, fee, nonce: 0 },
      { amount: 30_000_000_000_010, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();

    // Bob increases by 20m
    response = await broadcastStackIncrease(
      { network, account: Accounts.WALLET_2, fee, nonce: 1 },
      { amount: 20000000000100 }
    );

    expect(response.error).toBeUndefined();

    // let Bob's stacking confirm to enforce reward index 0
    await waitForStacksTransaction(orchestrator, response.txid);

    // Alice stacks 50m
    response = await broadcastStackSTX(
      { poxVersion: 2, network, account: Accounts.WALLET_1, fee, nonce: 0 },
      { amount: 50_000_000_000_001, blockHeight, cycles }
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

    const poxAddrInfo0 = (await readRewardCyclePoxAddressForAddress(
      network,
      2,
      Accounts.WALLET_2.stxAddress
    )) as Record<string, ClarityValue>;
    // There is no bug here because total stack was equal to Bob's stacked amount when Bob called stack-increase.
    expect(cvToString(poxAddrInfo0["total-ustx"])).toBe("u50000000000110");

    // There is no bug here because total stack was 0 when stack-increase was called.
    expect(poxAddrInfo0["total-ustx"]).toEqual(uintCV(50_000_000_000_110));

    const poxAddrInfo1 = (await readRewardCyclePoxAddressForAddress(
      network,
      2,
      Accounts.WALLET_1.stxAddress
    )) as Record<string, ClarityValue>;
    expect(poxAddrInfo1["total-ustx"]).toEqual(uintCV(50_000_000_000_001));
  });
});
