import { StacksNetwork, StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromCtx,
  getChainInfo,
} from "../../helpers";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { contract_call, load_versioned } from "./helper";
import { someCV } from "@stacks/transactions";
import { contractPrincipalCV } from "@stacks/transactions/dist/clarity/types/principalCV";
import { describe, expect, it, beforeAll, afterAll } from 'vitest'

const STACKS_2_1_EPOCH = 112;

describe("call functions with nested traits", () => {
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
    await load_versioned(Accounts.DEPLOYER, "empty", network, orchestrator);
    await load_versioned(
      Accounts.DEPLOYER,
      "empty-trait",
      network,
      orchestrator
    );
    await load_versioned(
      Accounts.DEPLOYER,
      "math-trait",
      network,
      orchestrator
    );
    await load_versioned(
      Accounts.DEPLOYER,
      "nested-trait-2",
      network,
      orchestrator
    );
    let res = await contract_call(
      Accounts.WALLET_1,
      Accounts.DEPLOYER.stxAddress,
      "nested-trait-2",
      "foo",
      [someCV(contractPrincipalCV(Accounts.DEPLOYER.stxAddress, "empty"))],
      network,
      orchestrator
    );
    expect(res.ok).toBeFalsy();

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

    it("Clarity1", async () => {
      await load_versioned(Accounts.WALLET_1, "empty", network, orchestrator);
      await load_versioned(
        Accounts.WALLET_1,
        "empty-trait",
        network,
        orchestrator,
        1
      );
      await load_versioned(
        Accounts.WALLET_1,
        "math-trait",
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
      let res = await contract_call(
        Accounts.WALLET_2,
        Accounts.WALLET_1.stxAddress,
        "nested-trait-2",
        "foo",
        [someCV(contractPrincipalCV(Accounts.WALLET_1.stxAddress, "empty"))],
        network,
        orchestrator
      );
      expect(res.ok).toBeFalsy();
    });

    it("Clarity2", async () => {
      await load_versioned(Accounts.WALLET_2, "empty", network, orchestrator);
      await load_versioned(
        Accounts.WALLET_2,
        "empty-trait",
        network,
        orchestrator,
        2
      );
      await load_versioned(
        Accounts.WALLET_2,
        "math-trait",
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
      let res = await contract_call(
        Accounts.WALLET_3,
        Accounts.WALLET_2.stxAddress,
        "nested-trait-2",
        "foo",
        [someCV(contractPrincipalCV(Accounts.WALLET_2.stxAddress, "empty"))],
        network,
        orchestrator
      );
      expect(res.ok).toBeTruthy();
    });
  });
});
