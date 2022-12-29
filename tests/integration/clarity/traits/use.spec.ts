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
  getBitcoinBlockHeight,
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

  const mathTrait = `(define-trait math (
        (add (uint uint) (response uint uint))
        (sub (uint uint) (response uint uint))
      ))`;

  const useMathTrait = `(use-trait math-alias .math-trait.math)

  (define-public (add-call (math-contract <math-alias>) (x uint) (y uint))
    (contract-call? math-contract add x y)
  )
  
  (define-public (sub-call (math-contract <math-alias>) (x uint) (y uint))
    (contract-call? math-contract sub x y)
  )`;

  describe("in 2.05", () => {
    afterAll(async () => {
      // Make sure this we stayed in 2.05
      let chainInfo = await getChainInfo(network);
      expect(chainInfo.burn_block_height).toBeLessThanOrEqual(STACKS_2_1_EPOCH);
    });

    it("publish the trait", async () => {
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "math-trait",
        codeBody: mathTrait,
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
        nonce: 0,
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
        `deployed: ${Accounts.DEPLOYER.stxAddress}.math-trait`
      );
      expect(tx.success).toBeTruthy();
    });
  });

  describe("in 2.05", () => {
    it("use trait", async () => {
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "use-math-trait",
        codeBody: useMathTrait,
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
      expect(block.bitcoin_anchor_block_identifier.index).toBeLessThan(
        STACKS_2_1_EPOCH
      );
      expect(tx.description).toBe(
        `deployed: ${Accounts.DEPLOYER.stxAddress}.use-math-trait`
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

    describe("use trait", () => {
      it("Clarity1", async () => {
        // Build the transaction to deploy the contract
        let deployTxOptions = {
          clarityVersion: 1,
          senderKey: Accounts.DEPLOYER.secretKey,
          contractName: "use-math-trait-2-clarity-1",
          codeBody: useMathTrait,
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
        let [_, tx] = await waitForStacksTransaction(
          orchestrator,
          transaction.txid()
        );
        expect(tx.description).toBe(
          `deployed: ${Accounts.DEPLOYER.stxAddress}.use-math-trait-2-clarity-1`
        );
        expect(tx.success).toBeTruthy();
      });

      it("Clarity2", async () => {
        // Build the transaction to deploy the contract
        let deployTxOptions = {
          clarityVersion: 2,
          senderKey: Accounts.DEPLOYER.secretKey,
          contractName: "use-math-trait-2-clarity-2",
          codeBody: useMathTrait,
          fee: 2000,
          network,
          anchorMode: AnchorMode.OnChainOnly,
          postConditionMode: PostConditionMode.Allow,
          nonce: 3,
        };

        let transaction = await makeContractDeploy(deployTxOptions);

        // Broadcast transaction
        let result = await broadcastTransaction(transaction, network);
        if (result.error) {
          console.log(result);
        }
        expect((<TxBroadcastResultOk>result).error).toBeUndefined();

        // Wait for the transaction to be processed
        let [_, tx] = await waitForStacksTransaction(
          orchestrator,
          transaction.txid()
        );
        expect(tx.description).toBe(
          `deployed: ${Accounts.DEPLOYER.stxAddress}.use-math-trait-2-clarity-2`
        );
        expect(tx.success).toBeTruthy();
      });
    });
  });
});
