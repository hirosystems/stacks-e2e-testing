import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import {
  bufferCV,
  cvToString,
  noneCV,
  tupleCV,
  uintCV,
} from "@stacks/transactions";
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
import { hexToBytes } from "@stacks/common";
import { getBtcBalance } from "../helpers-btc";

describe("testing btc addresses", () => {
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
      timeline
    );
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("check btc address", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for 2.4 to go live
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_4
    );
    await orchestrator.waitForNextStacksBlock();

    const balance = await getBtcBalance({
      bitcoinRpcUrl: orchestrator.getBitcoinNodeUrl(),
      bitcoinRpcUsername: "devnet",
      bitcoinRpcPassword: "devnet",
      btcAddress: Accounts.WALLET_3.btcAddress,
    });
    expect(JSON.stringify(balance)).toBe("abc");
  });
});
