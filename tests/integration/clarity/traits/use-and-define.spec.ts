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
  DEFAULT_EPOCH_TIMELINE,
} from "../../helpers";
import {
  DevnetNetworkOrchestrator,
  StacksTransactionMetadata,
  stacksNodeVersion,
} from "@hirosystems/stacks-devnet-js";

describe("use and define trait with same name", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let version: string;
  if (typeof stacksNodeVersion === "function") {
    version = stacksNodeVersion();
  } else {
    version = "2.1";
  }
  const timeline = {
    ...DEFAULT_EPOCH_TIMELINE,
    epoch_2_1: 112,
    pox_2_activation: 120,
    epoch_2_2: 128,
    pox_2_unlock_height: 129,
  };
  let network: StacksNetwork;

  let networkId: number;

  beforeAll(() => {
    networkId = getNetworkIdFromEnv();
    console.log(`network #${networkId}`);
    orchestrator = buildDevnetNetworkOrchestrator(
      getNetworkIdFromEnv(),
      version,
      timeline
    );
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
      clarityVersion: undefined,
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
      clarityVersion: undefined,
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
    expect(getBitcoinBlockHeight(chainUpdate)).toBeLessThan(timeline.epoch_2_1);
  });

  describe("in 2.1", () => {
    beforeAll(async () => {
      // Wait for 2.1 to go live
      await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
        timeline.epoch_2_1 + 1
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
      // todo(brice): fails with 'Versioned smart contract transactions are not supported in this epoch'
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
