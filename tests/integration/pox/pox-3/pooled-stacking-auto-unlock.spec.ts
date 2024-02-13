import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { hexToBytes } from "@stacks/common";
import { StacksTestnet } from "@stacks/network";
import { bufferCV, cvToString, tupleCV, uintCV } from "@stacks/transactions";
import { Accounts, Constants } from "../../constants";
import {
  FAST_FORWARD_TO_EPOCH_2_4,
  buildDevnetNetworkOrchestrator,
  getChainInfo,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import {
  expectAccountToBe,
  getPoxInfo,
  readRewardCyclePoxAddressForAddress,
  readRewardCyclePoxAddressListAtIndex,
  waitForNextRewardPhase,
} from "../helpers";
import { broadcastStackSTX } from "../helpers-direct-stacking";
import {
  broadcastDelegateSTX,
  broadcastDelegateStackSTX,
  broadcastStackAggregationCommitIndexed,
} from "../helpers-pooled-stacking";

describe("testing pooled stacking with auto unlock", () => {
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

  it("STX delegation and locking by pool operator should register STX for rewards", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for 2.4 to go live
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_4,
    );
    await orchestrator.waitForNextStacksBlock();

    let chainInfo = await getChainInfo(network);
    const blockHeight = chainInfo.burn_block_height;
    const cycles = 1;

    // Alice delegates 90m STX to Chloe
    let response = await broadcastDelegateSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_1,
        fee,
        nonce: aliceNonce++,
      },
      { amount: 90_000_000_000_000, poolAddress: Accounts.WALLET_3 },
    );
    expect(response.error).toBeUndefined();

    // Bob delegates 95m STX
    response = await broadcastDelegateSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_2,
        fee,
        nonce: bobNonce++,
      },
      { amount: 95_000_000_000_000, poolAddress: Accounts.WALLET_3 },
    );
    expect(response.error).toBeUndefined();

    // Chloe locks 80m for Alice
    response = await broadcastDelegateStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
      },
      {
        stacker: Accounts.WALLET_1,
        amount: 80_000_000_000_000,
        poolRewardAccount: Accounts.WALLET_3,
        startBurnHeight: Constants.DEVNET_DEFAULT_POX_2_ACTIVATION + 6,
        lockPeriodCycles: 1,
      },
    );
    expect(response.error).toBeUndefined();

    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid,
    );
    expect(tx.success).toBeTruthy();

    // Chloe commits 80m
    response = await broadcastStackAggregationCommitIndexed(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
      },
      { poolRewardAccount: Accounts.WALLET_3, cycleId: 2 },
    );
    expect(response.error).toBeUndefined();

    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success).toBeTruthy();

    let poxInfo = await getPoxInfo(network);

    // Assert that the next cycle has 80m STX locked
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(80_000_000_000_000);

    // Check Pool operators/Chloe's table entry
    let poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      2,
      0,
    );
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(80_000_000_000_000));

    // Faucet stacks 999m
    response = await broadcastStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.FAUCET,
        fee,
        nonce: faucetNonce++,
      },
      { amount: 999_000_000_000_000, blockHeight, cycles },
    );
    expect(response.error).toBeUndefined();

    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    expect(tx.success).toBeTruthy();

    poxInfo = await getPoxInfo(network);
    // Assert that the next cycle has 1079m STX locked
    // and that the minimum is above 80m
    expect(poxInfo.current_cycle.id).toBe(1);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(29_290_000_000_000);
    expect(poxInfo.next_cycle.min_threshold_ustx).toBe(89_920_000_000_000);
    expect(poxInfo.next_cycle.stacked_ustx).toBe(1_079_000_000_000_000);
    // Assert that Alice STX is locked
    expectAccountToBe(
      network,
      Accounts.WALLET_1.stxAddress,
      100_000_000_000_000 - 80_000_000_000_000 - fee,
      80_000_000_000_000,
    );

    // Check Pool's table entry
    poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(network, 3, 2, 0);
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(80_000_000_000_000));
    expect(poxAddrInfo0 ? cvToString(poxAddrInfo0?.["pox-addr"]) : "").toEqual(
      cvToString(
        tupleCV({
          hashbytes: bufferCV(
            hexToBytes("a5180cc1ff6050df53f0ab766d76b630e14feb0c"),
          ),
          version: bufferCV(new Uint8Array([0])),
        }),
      ),
    );

    // Check Faucets's table entry
    const poxAddrInfo1 = await readRewardCyclePoxAddressForAddress(
      network,
      3,
      2,
      Accounts.FAUCET.stxAddress,
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(999_000_000_000_000));
  });

  it("Increased slot price should auto-unlock pool (cycle #2)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for block N+5 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 5);

    let poxInfo = await getPoxInfo(network);
    expect(poxInfo.current_cycle.id).toBe(2);
    expect(poxInfo.current_cycle.stacked_ustx).toBe(1_079_000_000_000_000);
    expect(poxInfo.current_cycle.min_threshold_ustx).toBe(89_920_000_000_000);

    // Alice STX are still locked
    expectAccountToBe(
      network,
      Accounts.WALLET_1.stxAddress,
      100_000_000_000_000 - 80_000_000_000_000 - fee,
      80_000_000_000_000,
    );

    // Table entries for cycle #2 is cleared due to auto unlocked.
    // Check Pool's table entry
    let poxAddrInfo0 = await readRewardCyclePoxAddressListAtIndex(
      network,
      3,
      2,
      0,
    );
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(80_000_000_000_000));

    // Check Faucet's table entry
    const poxAddrInfo1 = await readRewardCyclePoxAddressForAddress(
      network,
      3,
      2,
      Accounts.FAUCET.stxAddress,
    );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(999_000_000_000_000));
  });

  it("stackers below minimum should not have received any rewards (cycle #3)", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for block N+5 where N is the height of the next reward phase
    await waitForNextRewardPhase(network, orchestrator, 5);

    // FIXME: retrieve btc balance
    /*
    const balance = await getBtcBalance({
      bitcoinRpcUrl: "http://localhost:18443",
      bitcoinRpcUsername: "devnet",
      bitcoinRpcPassword: "devnet",
      btcAddress: Accounts.WALLET_3.btcAddress,
    });
    expect(JSON.stringify(balance)).toBe("0");
    */
  });
});
