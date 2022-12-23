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
  getNetworkIdFromEnv,
  getChainInfo,
} from "../../helpers";
import {
  DevnetNetworkOrchestrator,
  StacksTransactionMetadata,
} from "@hirosystems/stacks-devnet-js";

describe("use and define trait with same name", () => {
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
      nonce: 0,
    };

    let tx = await makeContractDeploy(deployTxOptions);

    // Broadcast transaction
    let result = await broadcastTransaction(tx, network);
    if (result.error) {
      console.log(result);
    }
    expect((<TxBroadcastResultOk>result).error).toBeUndefined();

    // Wait for the transaction to be processed
    await orchestrator.waitForStacksBlockIncludingTransaction(tx.txid());

    // Build the transaction to deploy the contract
    deployTxOptions = {
      senderKey: Accounts.DEPLOYER.secretKey,
      contractName: "use-original-and-define-a-trait",
      codeBody: useAndDefine,
      fee: 2000,
      network,
      anchorMode: AnchorMode.OnChainOnly,
      postConditionMode: PostConditionMode.Allow,
      nonce: 1,
    };

    tx = await makeContractDeploy(deployTxOptions);

    // Broadcast transaction
    result = await broadcastTransaction(tx, network);
    expect((<TxBroadcastResultOk>result).error).toBeUndefined();

    // Wait for the transaction to be processed
    let { chainUpdate, transaction } =
      await orchestrator.waitForStacksBlockIncludingTransaction(tx.txid());
    let metadata = <StacksTransactionMetadata>transaction.metadata;
    expect(metadata.description).toBe(
      `deployed: ${Accounts.DEPLOYER.stxAddress}.use-original-and-define-a-trait`
    );
    expect(metadata.success).toBeFalsy();

    // Make sure we stayed in 2.05
    expect(getBitcoinBlockHeight(chainUpdate)).toBeLessThan(STACKS_2_1_EPOCH);
  });

  describe("in 2.1", () => {
    beforeAll(async () => {
      // Wait for 2.1 to go live
      await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
        STACKS_2_1_EPOCH
      );
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
        nonce: 2,
      };

      let tx = await makeContractDeploy(deployTxOptions);

      // Broadcast transaction
      let result = await broadcastTransaction(tx, network);
      if (result.error) {
        console.log(result);
      }
      expect((<TxBroadcastResultOk>result).error).toBeUndefined();

      // Wait for the transaction to be processed
      let { transaction } =
        await orchestrator.waitForStacksBlockIncludingTransaction(tx.txid());
      let metadata = <StacksTransactionMetadata>transaction.metadata;
      expect(metadata.description).toBe(
        `deployed: ${Accounts.DEPLOYER.stxAddress}.use-original-and-define-a-trait-c1`
      );
      expect(metadata.success).toBeFalsy();
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
          nonce: 3,
        };

        let tx = await makeContractDeploy(deployTxOptions);

        // Broadcast transaction
        let result = await broadcastTransaction(tx, network);
        if (result.error) {
          console.log(result);
        }
        expect((<TxBroadcastResultOk>result).error).toBeUndefined();

        // Wait for the transaction to be processed
        let { transaction } =
          await orchestrator.waitForStacksBlockIncludingTransaction(tx.txid());
        let metadata = <StacksTransactionMetadata>transaction.metadata;
        expect(metadata.description).toBe(
          `deployed: ${Accounts.DEPLOYER.stxAddress}.use-original-and-define-a-trait-c2`
        );
        expect(metadata.success).toBeTruthy();
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
          nonce: 0,
        };

        let tx = await makeContractDeploy(deployTxOptions);

        // Broadcast transaction
        let result = await broadcastTransaction(tx, network);
        if (result.error) {
          console.log(result);
        }
        expect((<TxBroadcastResultOk>result).error).toBeUndefined();

        // Wait for the transaction to be processed
        await orchestrator.waitForStacksBlockIncludingTransaction(tx.txid());

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
          nonce: 1,
        };

        tx = await makeContractDeploy(deployTxOptions);

        // Broadcast transaction
        result = await broadcastTransaction(tx, network);
        expect((<TxBroadcastResultOk>result).error).toBeUndefined();

        // Wait for the transaction to be processed
        let { transaction } =
          await orchestrator.waitForStacksBlockIncludingTransaction(tx.txid());
        let metadata = <StacksTransactionMetadata>transaction.metadata;
        expect(metadata.description).toBe(
          `deployed: ${Accounts.WALLET_1.stxAddress}.use-original-and-define-a-trait`
        );
        expect(metadata.success).toBeTruthy();
      });
    });
  });
});
