import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../../constants";
import {
  asyncExpectStacksTransactionSuccess,
  broadcastSTXTransfer,
  buildDevnetNetworkOrchestrator,
  getAccountInfo,
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
import {
  ClarityValue,
  cvToString,
  uintCV,
  makeSTXTokenTransfer,
} from "@stacks/transactions";

describe("testing solo stacker increase without bug", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let timeline = {
    epoch_2_0: 100,
    epoch_2_05: 102,
    epoch_2_1: 106,
    pox_2_activation: 109,
    epoch_2_2: 122,
    pox_2_unlock_height: 123,
  };

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator(
      getNetworkIdFromEnv(),
      timeline,
      undefined,
      Constants.PROPOSED_2_2_STACKS_NODE_IMAGE_URL
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
    let bobNonce = 0;
    let aliceNonce = 0;
    let chloeNonce = 0;

    // Bob stacks 30m
    let response = await broadcastStackSTX(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_2,
        fee,
        nonce: bobNonce++,
      },
      { amount: 30_000_000_000_010, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();

    // Bob increases by 20m
    response = await broadcastStackIncrease(
      { network, account: Accounts.WALLET_2, fee, nonce: bobNonce++ },
      { amount: 20_000_000_000_100 }
    );
    expect(response.error).toBeUndefined();

    // let Bob's stacking confirm to enforce reward index 0
    await waitForStacksTransaction(orchestrator, response.txid);

    // Alice stacks 50m
    response = await broadcastStackSTX(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_1,
        fee,
        nonce: aliceNonce++,
      },
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
    expect(poxInfo.current_cycle.is_pox_active).toBeFalsy();
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
    expect(poxInfo.current_cycle.id).toBeGreaterThanOrEqual(lockedCycle);
    expect(poxInfo.current_cycle.id).toBeLessThan(lockedCycle + cycles);
    expect(poxInfo.current_cycle.is_pox_active).toBeFalsy();

    // Check Bob's account info
    const bobInfo = await getAccountInfo(network, Accounts.WALLET_2.stxAddress);
    expect(bobInfo.balance).toBe(100_000_000_000_000 - 2 * fee);
    expect(bobInfo.locked).toBe(0);

    // Verify that Bob's STX are really unlocked by doing a transfer
    response = await broadcastSTXTransfer(
      { network, account: Accounts.WALLET_2, fee, nonce: bobNonce++ },
      {
        amount: bobInfo.balance - fee,
        recipient: Accounts.WALLET_3.stxAddress,
      }
    );
    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);

    // Check Alice's account info
    const aliceInfo = await getAccountInfo(
      network,
      Accounts.WALLET_1.stxAddress
    );
    expect(aliceInfo.balance).toBe(100_000_000_000_000 - fee);
    expect(aliceInfo.locked).toBe(0);

    // Verify that Alice's STX are really unlocked by doing a transfer
    response = await broadcastSTXTransfer(
      { network, account: Accounts.WALLET_1, fee, nonce: aliceNonce++ },
      {
        amount: aliceInfo.balance - fee,
        recipient: Accounts.WALLET_3.stxAddress,
      }
    );
    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);

    // PoX should stay disabled indefinitely
    await waitForNextRewardPhase(
      network,
      orchestrator,
      poxInfo.current_cycle.id + 1
    );

    poxInfo = await getPoxInfo(network);
    expect(poxInfo.current_cycle.is_pox_active).toBeFalsy();

    // Chloe stacks 50m
    response = await broadcastStackSTX(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
      },
      { amount: 90_000_000_000_001, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();

    await orchestrator.waitForStacksBlockIncludingTransaction(response.txid);

    // Advance to the next cycle and ensure Chloe is not locked
    await waitForNextRewardPhase(
      network,
      orchestrator,
      poxInfo.current_cycle.id + 1
    );

    poxInfo = await getPoxInfo(network);
    expect(poxInfo.current_cycle.is_pox_active).toBeFalsy();

    // Check Chloe's account info
    const chloeInfo = await getAccountInfo(
      network,
      Accounts.WALLET_3.stxAddress
    );
    expect(chloeInfo.balance).toBe(299_999_999_994_000);
    expect(chloeInfo.locked).toBe(0);

    // Verify that Chloe's STX are really unlocked by doing a transfer
    response = await broadcastSTXTransfer(
      { network, account: Accounts.WALLET_3, fee, nonce: chloeNonce++ },
      {
        amount: 50_000_000_000_000,
        recipient: Accounts.WALLET_1.stxAddress,
      }
    );
    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);
  });
});
