import { StacksNetwork, StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  getBitcoinBlockHeight,
  waitForStacksChainUpdate,
  getNetworkIdFromCtx,
} from "../../helpers";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { load_versioned } from "./helper";
import { describe, expect, it, beforeAll, afterAll } from 'vitest'

const STACKS_2_1_EPOCH = 109;

describe("use redefined trait from contract that redefines it", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let network: StacksNetwork;

  beforeAll(async (ctx) => {
    orchestrator = buildDevnetNetworkOrchestrator(getNetworkIdFromCtx(ctx.id),
      {
        epoch_2_0: 100,
        epoch_2_05: 102,
        epoch_2_1: STACKS_2_1_EPOCH,
        pox_2_activation: 112,
      },
      false
    );
    orchestrator.start();
    network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks 2.05 to start
    waitForStacksChainUpdate(orchestrator, Constants.DEVNET_DEFAULT_EPOCH_2_05);
  });

  afterAll(async () => {
    orchestrator.terminate();
  });

  it("in 2.05", async () => {
    await load_versioned(
      Accounts.DEPLOYER,
      "empty-trait",
      network,
      orchestrator
    );
    await load_versioned(
      Accounts.DEPLOYER,
      "nested-trait-1",
      network,
      orchestrator
    );
    await load_versioned(
      Accounts.DEPLOYER,
      "nested-trait-2",
      network,
      orchestrator
    );
    await load_versioned(
      Accounts.DEPLOYER,
      "nested-trait-3",
      network,
      orchestrator
    );
    let res = await load_versioned(
      Accounts.DEPLOYER,
      "nested-trait-4",
      network,
      orchestrator
    );
    expect(res.ok).toBeTruthy();

    // Make sure this we stayed in 2.05
    let chainUpdate = await orchestrator.waitForNextStacksBlock();
    expect(getBitcoinBlockHeight(chainUpdate)).toBeLessThanOrEqual(
      STACKS_2_1_EPOCH
    );
  });

  describe("in 2.1", () => {
    beforeAll(async (ctx) => {
      // Wait for 2.1 to go live
      waitForStacksChainUpdate(orchestrator, STACKS_2_1_EPOCH);
    });

    it("Clarity1", async () => {
      await load_versioned(
        Accounts.WALLET_1,
        "empty-trait",
        network,
        orchestrator,
        1
      );
      await load_versioned(
        Accounts.WALLET_1,
        "nested-trait-1",
        network,
        orchestrator,
        1
      );
      await load_versioned(
        Accounts.WALLET_1,
        "nested-trait-2",
        network,
        orchestrator,
        1
      );
      await load_versioned(
        Accounts.WALLET_1,
        "nested-trait-3",
        network,
        orchestrator,
        1
      );
      let res = await load_versioned(
        Accounts.WALLET_1,
        "nested-trait-4",
        network,
        orchestrator,
        1
      );
      expect(res.ok).toBeTruthy();
    });

    it("Clarity2", async () => {
      await load_versioned(
        Accounts.WALLET_2,
        "empty-trait",
        network,
        orchestrator,
        2
      );
      await load_versioned(
        Accounts.WALLET_2,
        "nested-trait-1",
        network,
        orchestrator,
        2
      );
      await load_versioned(
        Accounts.WALLET_2,
        "nested-trait-2",
        network,
        orchestrator,
        2
      );
      await load_versioned(
        Accounts.WALLET_2,
        "nested-trait-3",
        network,
        orchestrator,
        2
      );
      let res = await load_versioned(
        Accounts.WALLET_2,
        "nested-trait-4",
        network,
        orchestrator,
        2
      );
      expect(res.ok).toBeTruthy();
    });
  });
});
