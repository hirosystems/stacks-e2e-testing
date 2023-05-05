import {
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  TxBroadcastResultOk,
  makeContractCall,
  SignedContractCallOptions,
} from "@stacks/transactions";
import { StacksNetwork, StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  waitForStacksTransaction,
  getNetworkIdFromEnv,
  getChainInfo,
} from "../../helpers";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";

describe("use", () => {
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

  const codeBody = `(define-trait double-method (
    (foo (uint) (response uint uint))
    (foo (bool) (response bool bool))
  ))`;

  describe("in 2.05", () => {
    afterAll(async () => {
      // Make sure this we stayed in 2.05
      let chainInfo = await getChainInfo(network);
      expect(chainInfo.burn_block_height).toBeLessThanOrEqual(STACKS_2_1_EPOCH);
    });

    it("define a trait with duplicate method names", async () => {
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "double-trait",
        codeBody,
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
        nonce: 0,
        clarityVersion: undefined,
      };

      let transaction = await makeContractDeploy(deployTxOptions);

      // Broadcast transaction
      let result = await broadcastTransaction(transaction, network);
      if (result.error) {
        console.log(result);
      }
      expect((<TxBroadcastResultOk>result).error).toBeUndefined();

      // Wait for the transaction to be processed
      let [block, tx] = await waitForStacksTransaction(
        orchestrator,
        transaction.txid()
      );
      expect(tx.description).toBe(
        `deployed: ${Accounts.DEPLOYER.stxAddress}.double-trait`
      );
      expect(tx.success).toBeTruthy();
    });
  });

  describe("in 2.1", () => {
    beforeAll(async () => {
      // Wait for 2.1 to go live
      await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
        STACKS_2_1_EPOCH + 1
      );
    });

    describe("define a trait with duplicate method names", () => {
      it("Clarity1", async () => {
        // Build the transaction to deploy the contract
        let deployTxOptions = {
          clarityVersion: 1,
          senderKey: Accounts.DEPLOYER.secretKey,
          contractName: "double-trait-2",
          codeBody,
          fee: 2000,
          network,
          anchorMode: AnchorMode.OnChainOnly,
          postConditionMode: PostConditionMode.Allow,
          nonce: 1,
        };

        let transaction = await makeContractDeploy(deployTxOptions);

        // Broadcast transaction
        let result = await broadcastTransaction(transaction, network);
        if (result.error) {
          console.log(result);
        }
        expect((<TxBroadcastResultOk>result).error).toBeUndefined();

        // Wait for the transaction to be processed
        let [block, tx] = await waitForStacksTransaction(
          orchestrator,
          transaction.txid()
        );
        expect(tx.description).toBe(
          `deployed: ${Accounts.DEPLOYER.stxAddress}.double-trait-2`
        );
        expect(tx.success).toBeTruthy();
      });

      it("Clarity2", async () => {
        // Build the transaction to deploy the contract
        let deployTxOptions = {
          clarityVersion: 2,
          senderKey: Accounts.DEPLOYER.secretKey,
          contractName: "double-trait-3",
          codeBody,
          fee: 2000,
          network,
          anchorMode: AnchorMode.OnChainOnly,
          postConditionMode: PostConditionMode.Allow,
          nonce: 2,
        };

        let transaction = await makeContractDeploy(deployTxOptions);

        // Broadcast transaction
        let result = await broadcastTransaction(transaction, network);
        if (result.error) {
          console.log(result);
        }
        expect((<TxBroadcastResultOk>result).error).toBeUndefined();

        // Wait for the transaction to be processed
        let [block, tx] = await waitForStacksTransaction(
          orchestrator,
          transaction.txid()
        );
        expect(tx.description).toBe(
          `deployed: ${Accounts.DEPLOYER.stxAddress}.double-trait-3`
        );
        expect(tx.success).toBeFalsy();
      });
    });
  });
});
