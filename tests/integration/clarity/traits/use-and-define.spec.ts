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

describe("use and define trait with same name", () => {
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

  const aTrait = `(define-trait a (
    (do-it () (response bool bool))
  ))`;
  const useAndDefine = `(use-trait a-alias .a-trait.a)

  (define-trait a (
    (do-that () (response bool bool))
  ))
  
  (define-public (call-do-it (a-contract <a-alias>))
    (contract-call? a-contract do-it)
  )`;

  it("in 2.05", async () => {
    // Build the transaction to deploy the contract
    let deployTxOptions = {
      senderKey: Accounts.DEPLOYER.secretKey,
      contractName: "a-trait",
      codeBody: aTrait,
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
      contractName: "use-original-and-define-a-trait",
      codeBody: useAndDefine,
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
      `deployed: ${Accounts.DEPLOYER.stxAddress}.use-original-and-define-a-trait`
    );
    expect(tx.success).toBeFalsy();

    // Make sure we stayed in 2.05
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
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        clarityVersion: 1,
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "use-original-and-define-a-trait-c1",
        codeBody: useAndDefine,
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
        `deployed: ${Accounts.DEPLOYER.stxAddress}.use-original-and-define-a-trait-c1`
      );
      expect(tx.success).toBeFalsy();
    });

    describe("Clarity2", () => {
      it("using Clarity1 trait", async () => {
        // Build the transaction to deploy the contract
        let deployTxOptions = {
          clarityVersion: 2,
          senderKey: Accounts.DEPLOYER.secretKey,
          contractName: "use-original-and-define-a-trait-c2",
          codeBody: useAndDefine,
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
          `deployed: ${Accounts.DEPLOYER.stxAddress}.use-original-and-define-a-trait-c2`
        );
        expect(tx.success).toBeTruthy();
      });

      it("using Clarity2 trait", async () => {
        // Build the transaction to deploy the contract
        let deployTxOptions = {
          clarityVersion: 2,
          senderKey: Accounts.WALLET_1.secretKey,
          contractName: "a-trait",
          codeBody: aTrait,
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
        await waitForStacksTransaction(orchestrator, Accounts.WALLET_1.stxAddress);

        // Build the transaction to deploy the contract
        deployTxOptions = {
          clarityVersion: 2,
          senderKey: Accounts.WALLET_1.secretKey,
          contractName: "use-original-and-define-a-trait",
          codeBody: useAndDefine,
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
          Accounts.WALLET_1.stxAddress
        );
        expect(tx.description).toBe(
          `deployed: ${Accounts.WALLET_1.stxAddress}.use-original-and-define-a-trait`
        );
        expect(tx.success).toBeTruthy();
      });
    });
  });
});
