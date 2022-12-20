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
  getNetworkIdFromCtx,
} from "../../helpers";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { describe, expect, it, beforeAll, afterAll } from 'vitest'

const STACKS_2_1_EPOCH = 109;

describe("define a trait with duplicate identical methods", () => {
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
  });

  afterAll(async () => {
    orchestrator.terminate();
  });

  const identicalDouble = `(define-trait identical-double-method (
    (foo (bool) (response bool bool))
    (foo (bool) (response bool bool))
  ))`;
  const implIdenticalDouble = `(impl-trait .identical-double-trait.identical-double-method)
  (define-read-only (foo (x bool)) (ok x) )`;

  describe("in 2.05", () => {
    beforeAll(async (ctx) => {
      // Wait for Stacks 2.05 to start
      waitForStacksChainUpdate(
        orchestrator,
        Constants.DEVNET_DEFAULT_EPOCH_2_05
      );
    });

    afterAll(async () => {
      // Make sure this we stayed in 2.05
      let chainUpdate = await orchestrator.waitForNextStacksBlock();
      expect(getBitcoinBlockHeight(chainUpdate)).toBeLessThanOrEqual(
        STACKS_2_1_EPOCH
      );
    });

    it("test", async () => {
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "identical-double-trait",
        codeBody: identicalDouble,
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
        contractName: "impl-identical-double-trait",
        codeBody: implIdenticalDouble,
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
      let chainUpdate = await orchestrator.waitForNextStacksBlock();
      expect(chainUpdate.new_blocks[0].block.transactions.length).toBe(1);
    });
  });

  describe("in 2.1", () => {
    beforeAll(async (ctx) => {
      // Wait for 2.1 to go live
      waitForStacksChainUpdate(orchestrator, STACKS_2_1_EPOCH);
    });

    it("Clarity1", async () => {
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        clarityVersion: 1,
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "impl-identical-double-trait-c1",
        codeBody: implIdenticalDouble,
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
      let [block, tx] = await waitForStacksTransaction(
        orchestrator,
        Accounts.DEPLOYER.stxAddress
      );
      expect(tx.description).toBe(
        `deployed: ${Accounts.DEPLOYER.stxAddress}.impl-identical-double-trait-c1`
      );
      expect(tx.success).toBeTruthy();
    });

    it("Clarity2", async () => {
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        clarityVersion: 2,
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "impl-identical-double-trait-c2",
        codeBody: implIdenticalDouble,
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
      let [block, tx] = await waitForStacksTransaction(
        orchestrator,
        Accounts.DEPLOYER.stxAddress
      );
      expect(tx.description).toBe(
        `deployed: ${Accounts.DEPLOYER.stxAddress}.impl-identical-double-trait-c2`
      );
      expect(tx.success).toBeFalsy();
    });
  });
});
