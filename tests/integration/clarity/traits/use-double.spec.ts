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
  getNetworkIdFromCtx,
  getChainInfo,
} from "../../helpers";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { describe, expect, it, beforeAll, afterAll } from 'vitest'

const STACKS_2_1_EPOCH = 112;

describe("use", () => {
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

  const doubleTrait = `(define-trait double-method (
    (foo (uint) (response uint uint))
    (foo (bool) (response bool bool))
  ))`;
  const partialDouble1 = `(define-read-only (foo (x uint)) (ok x) )`;
  const useDouble = `(use-trait double .double-trait.double-method)

  (define-public (call-double-1 (double <double>))
    (contract-call? double foo u5)
  )
  
  (define-public (call-double-2 (double <double>))
    (contract-call? double foo true)
  )`;

  describe("in 2.05", () => {
    afterAll(async () => {
      // Make sure this we stayed in 2.05
      let chainInfo = await getChainInfo(network);
      expect(chainInfo.burn_block_height).toBeLessThanOrEqual(
        STACKS_2_1_EPOCH
      );
    });

    it("use a trait with duplicate method names", async () => {
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
      await waitForStacksTransaction(orchestrator, Accounts.DEPLOYER.stxAddress);

      // Build the transaction to deploy the contract
      deployTxOptions = {
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "partial-double-trait-1",
        codeBody: partialDouble1,
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
      await waitForStacksTransaction(orchestrator, Accounts.DEPLOYER.stxAddress);

      // Build the transaction to deploy the contract
      deployTxOptions = {
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "use-double-trait",
        codeBody: useDouble,
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
      let [_, tx] = await waitForStacksTransaction(
        orchestrator,
        Accounts.DEPLOYER.stxAddress
      );
      expect(tx.description).toBe(
        `deployed: ${Accounts.DEPLOYER.stxAddress}.use-double-trait`
      );
      expect(tx.success).toBeFalsy();
    });
  });

  describe("in 2.1", () => {
    beforeAll(async () => {
      // Wait for 2.1 to go live
      await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(STACKS_2_1_EPOCH)
    });

    it("Clarity1", async () => {
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        clarityVersion: 1,
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "use-double-trait-2-c1",
        codeBody: useDouble,
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
      let [_, tx] = await waitForStacksTransaction(
        orchestrator,
        Accounts.DEPLOYER.stxAddress
      );
      expect(tx.description).toBe(
        `deployed: ${Accounts.DEPLOYER.stxAddress}.use-double-trait-2-c1`
      );
      expect(tx.success).toBeFalsy();
    });

    it("Clarity2", async () => {
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        clarityVersion: 2,
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "use-double-trait-2-c2",
        codeBody: useDouble,
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
      let [_, tx] = await waitForStacksTransaction(
        orchestrator,
        Accounts.DEPLOYER.stxAddress
      );
      expect(tx.description).toBe(
        `deployed: ${Accounts.DEPLOYER.stxAddress}.use-double-trait-2-c2`
      );
      expect(tx.success).toBeFalsy();
    });
  });
});
