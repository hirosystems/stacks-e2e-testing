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
  const partialDouble2 = `(define-read-only (foo (x bool)) (ok x) )`;
  const usePartialDouble2 = `(use-trait double .double-trait.double-method)

  (define-public (call-double (d <double>))
    (contract-call? d foo true)
  )`;

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

    test("use a partial implementation (last) of a trait with duplicate method names", async () => {
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
        contractName: "partial-double-trait-2",
        codeBody: partialDouble2,
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
      waitForStacksTransaction(orchestrator, Accounts.DEPLOYER.stxAddress);

      // Build the transaction to deploy the contract
      deployTxOptions = {
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "use-partial-double-trait-2",
        codeBody: usePartialDouble2,
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
      };

      transaction = await makeContractDeploy(deployTxOptions);

      // Broadcast transaction
      result = await broadcastTransaction(transaction, network);
      console.log(result);
      expect((<TxBroadcastResultOk>result).error).toBeUndefined();

      // Wait for the transaction to be processed
      let [_, tx] = waitForStacksTransaction(
        orchestrator,
        Accounts.DEPLOYER.stxAddress
      );
      expect(tx.description).toBe(
        `deployed: ${Accounts.DEPLOYER.stxAddress}.use-partial-double-trait-2`
      );
      expect(tx.success).toBeTruthy();
    });
  });

  describe("in 2.1", () => {
    beforeAll(() => {
      // Wait for 2.1 to go live
      waitForStacksChainUpdate(orchestrator, STACKS_2_1_EPOCH);
    });

    test("Clarity1", async () => {
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        clarityVersion: 1,
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "use-partial-double-trait-2-c1",
        codeBody: usePartialDouble2,
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
        `deployed: ${Accounts.DEPLOYER.stxAddress}.use-partial-double-trait-2-c1`
      );
      expect(tx.success).toBeTruthy();
    });

    test("Clarity2", async () => {
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        clarityVersion: 2,
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "use-partial-double-trait-2-c2",
        codeBody: usePartialDouble2,
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
        `deployed: ${Accounts.DEPLOYER.stxAddress}.use-partial-double-trait-2-c2`
      );
      expect(tx.success).toBeTruthy();
    });
  });
});
