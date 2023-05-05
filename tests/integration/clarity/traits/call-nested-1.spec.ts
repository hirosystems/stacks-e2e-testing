import { StacksNetwork, StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  getChainInfo,
} from "../../helpers";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { contract_call, load_versioned } from "./helper";
import { listCV } from "@stacks/transactions";
import { contractPrincipalCV } from "@stacks/transactions/dist/clarity/types/principalCV";

describe("call functions with nested traits", () => {
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
    await load_versioned(Accounts.DEPLOYER, "empty", 0, network, orchestrator);
    await load_versioned(
      Accounts.DEPLOYER,
      "empty-trait",
      1,
      network,
      orchestrator
    );
    await load_versioned(
      Accounts.DEPLOYER,
      "math-trait",
      2,
      network,
      orchestrator
    );
    await load_versioned(
      Accounts.DEPLOYER,
      "nested-trait-1",
      3,
      network,
      orchestrator
    );
    let res = await contract_call(
      Accounts.WALLET_1,
      Accounts.DEPLOYER.stxAddress,
      "nested-trait-1",
      "foo",
      [
        listCV([
          contractPrincipalCV(Accounts.DEPLOYER.stxAddress, "empty"),
          contractPrincipalCV(Accounts.DEPLOYER.stxAddress, "math-trait"),
        ]),
      ],
      0,
      network,
      orchestrator
    );
    expect(res.ok).toBeFalsy();

    // Make sure this we stayed in 2.05
    let chainInfo = await getChainInfo(network);
    expect(chainInfo.burn_block_height).toBeLessThanOrEqual(STACKS_2_1_EPOCH);
  });

  describe("in 2.1", () => {
    beforeAll(async () => {
      // Wait for 2.1 to go live
      await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
        STACKS_2_1_EPOCH + 1
      );
    });

    it("Clarity1", async () => {
      await load_versioned(
        Accounts.WALLET_1,
        "empty",
        0, // Reuse nonce 0 since previous tx was rejected
        network,
        orchestrator
      );
      await load_versioned(
        Accounts.WALLET_1,
        "empty-trait",
        1,
        network,
        orchestrator,
        1
      );
      await load_versioned(
        Accounts.WALLET_1,
        "math-trait",
        2,
        network,
        orchestrator,
        1
      );
      await load_versioned(
        Accounts.WALLET_1,
        "nested-trait-1",
        3,
        network,
        orchestrator,
        1
      );
      let res = await contract_call(
        Accounts.WALLET_2,
        Accounts.WALLET_1.stxAddress,
        "nested-trait-1",
        "foo",
        [
          listCV([
            contractPrincipalCV(Accounts.WALLET_1.stxAddress, "empty"),
            contractPrincipalCV(Accounts.WALLET_1.stxAddress, "math-trait"),
          ]),
        ],
        0,
        network,
        orchestrator
      );
      expect(res.ok).toBeFalsy();
    });

    it("Clarity2", async () => {
      await load_versioned(
        Accounts.WALLET_2,
        "empty",
        0, // Reuse nonce 0 since previous tx was rejected
        network,
        orchestrator
      );
      await load_versioned(
        Accounts.WALLET_2,
        "empty-trait",
        1,
        network,
        orchestrator,
        2
      );
      await load_versioned(
        Accounts.WALLET_2,
        "math-trait",
        2,
        network,
        orchestrator,
        2
      );
      await load_versioned(
        Accounts.WALLET_2,
        "nested-trait-1",
        3,
        network,
        orchestrator,
        2
      );
      let res = await contract_call(
        Accounts.WALLET_3,
        Accounts.WALLET_2.stxAddress,
        "nested-trait-1",
        "foo",
        [
          listCV([
            contractPrincipalCV(Accounts.WALLET_2.stxAddress, "empty"),
            contractPrincipalCV(Accounts.WALLET_2.stxAddress, "math-trait"),
          ]),
        ],
        0,
        network,
        orchestrator
      );
      expect(res.ok).toBeTruthy();
    });
  });
});
