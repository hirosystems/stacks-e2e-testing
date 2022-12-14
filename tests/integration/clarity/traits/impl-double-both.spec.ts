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
  waitForStacksChainUpdate,
  waitForStacksTransaction,
} from "../../helpers";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";

const STACKS_2_1_EPOCH = 109;

describe("use", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let network: StacksNetwork;

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator(
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
  });

  afterAll(() => {
    orchestrator.stop();
  });

  const doubleTrait = `(define-trait double-method (
    (foo (uint) (response uint uint))
    (foo (bool) (response bool bool))
  ))`;
  const implDoubleBoth = `(impl-trait .double-trait.double-method)
  (define-read-only (foo (x uint)) (ok x) )
  (define-read-only (foo (x bool)) (ok x) )`;

  describe("in 2.05", () => {
    beforeAll(() => {
      // Wait for Stacks 2.05 to start
      waitForStacksChainUpdate(
        orchestrator,
        Constants.DEVNET_DEFAULT_EPOCH_2_05
      );
    });

    afterAll(() => {
      // Make sure this we stayed in 2.05
      let chainUpdate = orchestrator.waitForStacksBlock();
      expect(getBitcoinBlockHeight(chainUpdate)).toBeLessThanOrEqual(
        STACKS_2_1_EPOCH
      );
    });

    test("implement a trait with duplicate method names", async () => {
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "double-trait",
        codeBody: doubleTrait,
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
      };

      let transaction = await makeContractDeploy(deployTxOptions);

      // Broadcast transaction
      let result = await broadcastTransaction(transaction, network);
      expect((<TxBroadcastResultOk>result).error).toBeUndefined();

      // Wait for the transaction to be processed
      waitForStacksTransaction(orchestrator, Accounts.DEPLOYER.stxAddress);

      // Build the transaction to deploy the contract
      deployTxOptions = {
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "impl-double-trait-both",
        codeBody: implDoubleBoth,
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
      };

      transaction = await makeContractDeploy(deployTxOptions);

      // Broadcast transaction
      result = await broadcastTransaction(transaction, network);
      expect((<TxBroadcastResultOk>result).error).toBeUndefined();

      // Wait a block and verify that the transaction was not included.
      // In 2.05, this transaction is just silently ignored by the miner.
      let chainUpdate = orchestrator.waitForStacksBlock();
      expect(chainUpdate.new_blocks[0].block.transactions.length).toBe(1);
    });
  });

  describe("in 2.1", () => {
    beforeAll(() => {
      // Wait for 2.1 to go live
      waitForStacksChainUpdate(orchestrator, STACKS_2_1_EPOCH);
    });

    describe("implement a trait with duplicate method names", () => {
      test("Clarity1", async () => {
        // Build the transaction to deploy the contract
        let deployTxOptions = {
          clarityVersion: 1,
          senderKey: Accounts.DEPLOYER.secretKey,
          contractName: "double-trait-2",
          codeBody: doubleTrait,
          fee: 2000,
          network,
          anchorMode: AnchorMode.OnChainOnly,
          postConditionMode: PostConditionMode.Allow,
        };

        let transaction = await makeContractDeploy(deployTxOptions);

        // Broadcast transaction
        let result = await broadcastTransaction(transaction, network);
        expect((<TxBroadcastResultOk>result).error).toBeUndefined();

        // Wait for the transaction to be processed
        waitForStacksTransaction(orchestrator, Accounts.DEPLOYER.stxAddress);

        // Build the transaction to deploy the contract
        deployTxOptions = {
          clarityVersion: 1,
          senderKey: Accounts.DEPLOYER.secretKey,
          contractName: "impl-double-trait-both-2",
          codeBody: implDoubleBoth,
          fee: 2000,
          network,
          anchorMode: AnchorMode.OnChainOnly,
          postConditionMode: PostConditionMode.Allow,
        };

        transaction = await makeContractDeploy(deployTxOptions);

        // Broadcast transaction
        result = await broadcastTransaction(transaction, network);
        expect((<TxBroadcastResultOk>result).error).toBeUndefined();

        // Wait for the transaction to be processed
        let [_, tx] = waitForStacksTransaction(
          orchestrator,
          Accounts.DEPLOYER.stxAddress
        );
        expect(tx.description).toBe(
          `deployed: ${Accounts.DEPLOYER.stxAddress}.impl-double-trait-both-2`
        );
        expect(tx.success).toBeFalsy();
      });

      test("Clarity2", async () => {
        // Build the transaction to deploy the contract
        let deployTxOptions = {
          clarityVersion: 2,
          senderKey: Accounts.DEPLOYER.secretKey,
          contractName: "impl-double-trait-both-2",
          codeBody: implDoubleBoth,
          fee: 2000,
          network,
          anchorMode: AnchorMode.OnChainOnly,
          postConditionMode: PostConditionMode.Allow,
        };

        let transaction = await makeContractDeploy(deployTxOptions);

        // Broadcast transaction
        let result = await broadcastTransaction(transaction, network);
        expect((<TxBroadcastResultOk>result).error).toBeUndefined();

        // Wait for the transaction to be processed
        let [_, tx] = waitForStacksTransaction(
          orchestrator,
          Accounts.DEPLOYER.stxAddress
        );
        expect(tx.description).toBe(
          `deployed: ${Accounts.DEPLOYER.stxAddress}.impl-double-trait-both-2`
        );
        expect(tx.success).toBeFalsy();
      });
    });
  });
});