import {
  buildDevnetNetworkOrchestrator,
  getBitcoinBlockHeight,
  getNetworkIdFromEnv,
  DEFAULT_EPOCH_TIMELINE,
  FAST_FORWARD_TO_EPOCH_2_4,
} from "../../helpers";
import {
  // broadcastStackSTX,
  waitForNextPreparePhase,
  waitForNextRewardPhase,
  getPoxInfo,
  waitForRewardCycleId,
  broadcastDelegatedStackSTXThroughBitcoin,
  getAccount,
  callReadOnlystackerInfo,
  readDelegationStateForAddress,
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
    //   timeline
    //   // true
    // );
    // orchestrator.start();
  });

  afterAll(() => {
    // orchestrator.terminate();
  });

  it("submitting stacks-stx through pox-1 contract during epoch 2.0 should succeed", async () => {
    // const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block
    // await orchestrator.waitForNextStacksBlock();

    // let blockHeight = timeline.epoch_2_4 + 2;
    // let chainUpdate =
    //   await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
    //     blockHeight
    //   );

    // Broadcast some STX stacking orders through BTC
    let stx = await broadcastDelegatedStackSTXThroughBitcoin(
      orchestrator,
      "http://localhost:18443",
      "devnet",
      "devnet",
      Accounts.FAUCET,
      90_000_000_000_000,
      170,
      Accounts.DEPLOYER
    );
    console.log("RESULT", stx);

    // let poxInfo = await getPoxInfo(network);
    // console.log(poxInfo);

    // chainUpdate = await orchestrator.waitForNextStacksBlock();
    // console.log(JSON.stringify(chainUpdate));

    // let deployer = await getAccount(network, Accounts.DEPLOYER.stxAddress);
    // let deployerInfo = await callReadOnlystackerInfo(
    //   network,
    //   3,
    //   Accounts.DEPLOYER
    // );
    // let deployerState = await readDelegationStateForAddress(
    //   network,
    //   3,
    //   Accounts.DEPLOYER.stxAddress
    // );
    // console.log(
    //   "Deployer",
    //   Accounts.DEPLOYER.stxAddress,
    //   Accounts.DEPLOYER.btcAddress
    // );
    // console.log(deployer);
    // console.log(cvToString(deployerInfo));
    // console.log(cvToString(deployerState));
  });
});
