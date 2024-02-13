import { StacksNetwork, StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  getBitcoinBlockHeight,
  getNetworkIdFromEnv,
  getChainInfo,
} from "../../helpers";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { load_versioned } from "./helper";

describe("use redefined trait from contract that redefines it", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let network: StacksNetwork;
  const STACKS_2_1_EPOCH = 112;

  let networkId: number;

  beforeAll(() => {
    networkId = getNetworkIdFromEnv();
    console.log(`network #${networkId}`);
    orchestrator = buildDevnetNetworkOrchestrator(networkId, {
      epoch_2_0: 100,
      epoch_2_05: 102,
      epoch_2_1: STACKS_2_1_EPOCH,
      pox_2_activation: 120,
    });
    orchestrator.start();
    network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("in 2.05", async () => {
    await load_versioned(
      Accounts.DEPLOYER,
      "a-trait",
      0,
      network,
      orchestrator,
    );
    await load_versioned(
      Accounts.DEPLOYER,
      "use-and-define-a-trait",
      1,
      network,
      orchestrator,
    );
    let res = await load_versioned(
      Accounts.DEPLOYER,
      "use-a-trait-transitive-redefined",
      2,
      network,
      orchestrator,
    );
    expect(res.ok).toBeTruthy();

    // Make sure this we stayed in 2.05
    let chainInfo = await getChainInfo(network);
    expect(chainInfo.burn_block_height).toBeLessThanOrEqual(STACKS_2_1_EPOCH);
  });

  describe("in 2.1", () => {
    beforeAll(async () => {
      // Wait for 2.1 to go live
      await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
        STACKS_2_1_EPOCH + 1,
      );
    });

    describe("define a trait with duplicate method names", () => {
      it("Clarity1", async () => {
        await load_versioned(
          Accounts.WALLET_1,
          "a-trait",
          0,
          network,
          orchestrator,
        );
        await load_versioned(
          Accounts.WALLET_1,
          "use-and-define-a-trait",
          1,
          network,
          orchestrator,
        );
        let res = await load_versioned(
          Accounts.WALLET_1,
          "use-a-trait-transitive-redefined",
          2,
          network,
          orchestrator,
          1,
          "1",
        );
        expect(res.ok).toBeTruthy();
      });

      it("Clarity2", async () => {
        await load_versioned(
          Accounts.WALLET_2,
          "a-trait",
          0,
          network,
          orchestrator,
        );
        await load_versioned(
          Accounts.WALLET_2,
          "use-and-define-a-trait",
          1,
          network,
          orchestrator,
        );
        let res = await load_versioned(
          Accounts.WALLET_2,
          "use-a-trait-transitive-redefined",
          2,
          network,
          orchestrator,
          2,
          "2",
        );
        expect(res.ok).toBeTruthy();
      });
    });
  });
});
