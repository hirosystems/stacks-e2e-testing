import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../../constants";
import {
  asyncExpectStacksTransactionSuccess,
  broadcastSTXTransfer,
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  getStacksNodeVersion,
  waitForStacksTransaction,
} from "../../helpers";
import {
  expectAccountToBe,
  getPoxInfo,
  waitForNextRewardPhase,
} from "../helpers";
import { broadcastStackSTX } from "../helpers-direct-stacking";
import {
  broadcastDelegateSTX,
  broadcastDelegateStackIncrease,
} from "../helpers-pooled-stacking";

describe("testing stacker who is a bad pool operator under epoch 2.1", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  const version = getStacksNodeVersion();
  const fee = 1000;
  let aliceNonce = 0;
  let bobNonce = 0;

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

    const blockHeight = Constants.DEVNET_DEFAULT_POX_2_ACTIVATION + 1;
    const cycles = 1;

    // Alice stacks 90m STX
    let response = await broadcastStackSTX(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_1,
        fee,
        nonce: aliceNonce++,
      },
      { amount: 90_000_000_000_000, blockHeight, cycles },
    );
    expect(response.error).toBeUndefined();

    // Bob delegates 80m to Alice address
    response = await broadcastDelegateSTX(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_2,
        fee,
        nonce: bobNonce++,
      },
      { amount: 80000000000000, poolAddress: Accounts.WALLET_1 },
    );
    expect(response.error).toBeUndefined();
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      response.txid,
    );
    expect(tx.success).toBeTruthy();

    // Alice tries to increase Bob's delegation by 80m
    response = await broadcastDelegateStackIncrease(
      {
        poxVersion: 2,
        network,
        account: Accounts.WALLET_1,
        fee,
        nonce: aliceNonce++,
      },
      {
        stacker: Accounts.WALLET_2,
        poolRewardAccount: Accounts.WALLET_1,
        increaseByAmountUstx: 80000000000000,
      },
    );
    expect(response.error).toBeUndefined();
    [block, tx] = await waitForStacksTransaction(orchestrator, response.txid);
    // throws ArithmeticUnderflow
    // because Bob does not have any stacking yet
    // therefore no increase possible.
    // pox-2 does not handle this user error gracefully
    // because it assume stx-account.unlock-height to be > first-burnchain-block-height
    expect(tx.result).toBe("(err none)");
    expect(tx.success).toBeFalsy();
  });

  it("everything unlocks as expected upon v2 unlock height", async () => {
    // This test should only run when running a 2.2 node
    if (Number(version) < 2.2) {
      return;
    }
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for 2.2 activation and unlock
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      Constants.DEVNET_DEFAULT_EPOCH_2_2 + 2,
    );

    // Check Alice's account info
    await expectAccountToBe(
      network,
      Accounts.WALLET_1.stxAddress,
      100_000_000_000_000 - aliceNonce * fee,
      0,
    );

    // Verify that Alice's STX are really unlocked by doing a transfer
    let response = await broadcastSTXTransfer(
      { network, account: Accounts.WALLET_1, fee, nonce: aliceNonce++ },
      {
        amount: 100_000_000_000_000 - aliceNonce * fee,
        recipient: Accounts.WALLET_3.stxAddress,
      },
    );
    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);

    // Check Bob's account info
    await expectAccountToBe(
      network,
      Accounts.WALLET_2.stxAddress,
      100_000_000_000_000 - bobNonce * fee,
      0,
    );

    // Verify that Bob's STX are really unlocked by doing a transfer
    response = await broadcastSTXTransfer(
      { network, account: Accounts.WALLET_2, fee, nonce: bobNonce++ },
      {
        amount: 100_000_000_000_000 - bobNonce * fee,
        recipient: Accounts.WALLET_3.stxAddress,
      },
    );
    await asyncExpectStacksTransactionSuccess(orchestrator, response.txid);
  });

  it("PoX should stay disabled indefinitely", async () => {
    // This test should only run when running a 2.2 node
    if (version === "2.2" || version === "2.3") {
      const network = new StacksTestnet({
        url: orchestrator.getStacksNodeUrl(),
      });
      let poxInfo = await getPoxInfo(network);
      await waitForNextRewardPhase(
        network,
        orchestrator,
        poxInfo.current_cycle.id + 1,
      );

      poxInfo = await getPoxInfo(network);
      expect(poxInfo.current_cycle.is_pox_active).toBeFalsy();
    }
  });
});
