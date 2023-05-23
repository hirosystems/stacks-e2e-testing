import {
  buildDevnetNetworkOrchestrator,
  getBitcoinBlockHeight,
  getNetworkIdFromEnv,
  DEFAULT_EPOCH_TIMELINE,
  FAST_FORWARD_TO_EPOCH_2_4,
} from "../../helpers";
import {
  broadcastStackSTX,
  waitForNextPreparePhase,
  waitForNextRewardPhase,
  getPoxInfo,
  waitForRewardCycleId,
  broadcastStackSTXThroughBitcoin,
  readDelegationStateForAddress,
  callReadOnlystackerInfo,
  getAccount,
} from "../helpers";
import { Accounts } from "../../constants";
import { StacksTestnet } from "@stacks/network";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { cvToString } from "@stacks/transactions";

describe("testing stacking under epoch 2.1", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let timeline = FAST_FORWARD_TO_EPOCH_2_4;

  beforeAll(() => {
    // orchestrator = buildDevnetNetworkOrchestrator(
    //   getNetworkIdFromEnv(),
    //   timeline,
    //   true
    // );
    // orchestrator.start();
  });

  afterAll(() => {
    // orchestrator.terminate();
  });

  it("submitting stacks-stx through pox-1 contract during epoch 2.0 should succeed", async () => {
    // const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
    const network = new StacksTestnet({ url: "http://localhost:20443" });

    // Wait for Stacks genesis block
    // await orchestrator.waitForNextStacksBlock();

    let blockHeight = timeline.epoch_2_4 + 2;
    // let chainUpdate =
    //   await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
    //     blockHeight
    //   );

    // Broadcast some STX stacking orders through BTC
    let stx = await broadcastStackSTXThroughBitcoin(
      // orchestrator,
      "http://localhost:18443",
      "devnet",
      "devnet",
      Accounts.FAUCET,
      90_000_000_000_000,
      6
    );
    console.log("RESULT", stx);

    // await orchestrator.waitForNextStacksBlock();

    // let alice = await getAccount(network, Accounts.WALLET_1.stxAddress);
    // let aliceInfo = await callReadOnlystackerInfo(
    //   network,
    //   3,
    //   Accounts.WALLET_1
    // );
    // let aliceState = await readDelegationStateForAddress(
    //   network,
    //   3,
    //   Accounts.WALLET_1.stxAddress
    // );
    // console.log(
    //   "Alice",
    //   Accounts.WALLET_1.stxAddress,
    //   Accounts.WALLET_1.btcAddress
    // );
    // console.log(alice);
    // console.log(cvToString(aliceInfo));
    // console.log(cvToString(aliceState));

    // await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
    //   200
    // );
  });
});
