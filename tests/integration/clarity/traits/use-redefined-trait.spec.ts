import { StacksNetwork, StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  getBitcoinBlockHeight,
  getNetworkIdFromCtx,
  getChainInfo,
} from "../../helpers";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { load_versioned } from "./helper";
import { describe, expect, it, beforeAll, afterAll } from 'vitest'

const STACKS_2_1_EPOCH = 112;

describe("use redefined trait from contract that redefines it", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let network: StacksNetwork;

  beforeAll(async (ctx) => {
    let networkId = getNetworkIdFromCtx(ctx.id);
    orchestrator = buildDevnetNetworkOrchestrator(networkId,
      {
        epoch_2_0: 100,
        epoch_2_05: 102,
        epoch_2_1: STACKS_2_1_EPOCH,
        pox_2_activation: 120,
      },
      false
    );
    orchestrator.start();
    network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

  });

  afterAll(async () => {
    orchestrator.terminate();
  });

  it("in 2.05", async () => {
    await load_versioned(Accounts.DEPLOYER, "a-trait", network, orchestrator);
    await load_versioned(
      Accounts.DEPLOYER,
      "use-and-define-a-trait",
      network,
      orchestrator
    );
    let res = await load_versioned(
      Accounts.DEPLOYER,
      "use-a-trait-transitive-redefined",
      network,
      orchestrator
    );
    expect(res.ok).toBeTruthy();

    // Make sure this we stayed in 2.05
    let chainInfo = await getChainInfo(network);
    expect(chainInfo.burn_block_height).toBeLessThanOrEqual(
      STACKS_2_1_EPOCH
    );
  });

  describe("in 2.1", () => {
    beforeAll(async () => {
      // Wait for 2.1 to go live
      await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(STACKS_2_1_EPOCH)
    });

    describe("define a trait with duplicate method names", () => {
      it("Clarity1", async () => {
        await load_versioned(
          Accounts.WALLET_1,
          "a-trait",
          network,
          orchestrator
        );
        await load_versioned(
          Accounts.WALLET_1,
          "use-and-define-a-trait",
          network,
          orchestrator
        );
        let res = await load_versioned(
          Accounts.WALLET_1,
          "use-a-trait-transitive-redefined",
          network,
          orchestrator,
          1,
          "1"
        );
        expect(res.ok).toBeTruthy();
      });

      it("Clarity2", async () => {
        await load_versioned(
          Accounts.WALLET_2,
          "a-trait",
          network,
          orchestrator
        );
        await load_versioned(
          Accounts.WALLET_2,
          "use-and-define-a-trait",
          network,
          orchestrator
        );
        let res = await load_versioned(
          Accounts.WALLET_2,
          "use-a-trait-transitive-redefined",
          network,
          orchestrator,
          2,
          "2"
        );
        expect(res.ok).toBeTruthy();
      });
    });
  });
});
