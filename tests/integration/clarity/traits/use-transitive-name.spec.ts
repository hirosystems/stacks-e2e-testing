import {
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  TxBroadcastResultOk,
} from "@stacks/transactions";
import { StacksNetwork, StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  getBitcoinBlockHeight,
  waitForStacksTransaction,
  getNetworkIdFromEnv,
} from "../../helpers";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";

describe("use transitive trait name", () => {
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
  const useMathTraitName = `(use-trait math-alias .use-math-trait.math)

  (define-public (add-call (math-contract <math-alias>) (x uint) (y uint))
    (contract-call? math-contract add x y)
  )
  
  (define-public (sub-call (math-contract <math-alias>) (x uint) (y uint))
    (contract-call? math-contract sub x y)
  )`;

  it("in 2.05", async () => {
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
    await waitForStacksTransaction(orchestrator, transaction.txid());

    // Build the transaction to deploy the contract
    deployTxOptions = {
      senderKey: Accounts.DEPLOYER.secretKey,
      contractName: "use-math-trait",
      codeBody: useMathTrait,
      fee: 2000,
      network,
      anchorMode: AnchorMode.OnChainOnly,
      postConditionMode: PostConditionMode.Allow,
      nonce: 1,
      clarityVersion: undefined,
    };

    transaction = await makeContractDeploy(deployTxOptions);

    // Broadcast transaction
    result = await broadcastTransaction(transaction, network);
    expect((<TxBroadcastResultOk>result).error).toBeUndefined();

    // Wait for the transaction to be processed
    await waitForStacksTransaction(orchestrator, transaction.txid());

    // Build the transaction to deploy the contract
    deployTxOptions = {
      senderKey: Accounts.DEPLOYER.secretKey,
      contractName: "use-math-trait-transitive-name",
      codeBody: useMathTraitName,
      fee: 2000,
      network,
      anchorMode: AnchorMode.OnChainOnly,
      postConditionMode: PostConditionMode.Allow,
      nonce: 2,
      clarityVersion: undefined,
    };

    transaction = await makeContractDeploy(deployTxOptions);

    // Broadcast transaction
    result = await broadcastTransaction(transaction, network);
    expect((<TxBroadcastResultOk>result).error).toBeUndefined();

    // Wait for the transaction to be processed
    let [_, tx] = await waitForStacksTransaction(
      orchestrator,
      transaction.txid()
    );
    expect(tx.description).toBe(
      `deployed: ${Accounts.DEPLOYER.stxAddress}.use-math-trait-transitive-name`
    );
    expect(tx.success).toBeTruthy();

    // Make sure we stayed in 2.05
    let chainUpdate = await orchestrator.waitForNextStacksBlock();
    expect(getBitcoinBlockHeight(chainUpdate)).toBeLessThanOrEqual(
      STACKS_2_1_EPOCH
    );
  });

  describe("in 2.1", () => {
    beforeAll(async () => {
      // Wait for 2.1 to go live
      await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
        STACKS_2_1_EPOCH + 1
      );
    });

    it("Clarity1", async () => {
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        clarityVersion: 1,
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "use-math-trait-transitive-name-c1",
        codeBody: useMathTraitName,
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
        nonce: 3,
      };

      let transaction = await makeContractDeploy(deployTxOptions);

      // Broadcast transaction
      let result = await broadcastTransaction(transaction, network);
      // todo(brice): fails with 'Versioned smart contract transactions are not supported in this epoch'
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
        `deployed: ${Accounts.DEPLOYER.stxAddress}.use-math-trait-transitive-name-c1`
      );
      expect(tx.success).toBeTruthy();
    });

    describe("Clarity2", () => {
      it("using Clarity1 trait", async () => {
        // Build the transaction to deploy the contract
        let deployTxOptions = {
          clarityVersion: 2,
          senderKey: Accounts.DEPLOYER.secretKey,
          contractName: "use-math-trait-transitive-name-c2",
          codeBody: useMathTraitName,
          fee: 2000,
          network,
          anchorMode: AnchorMode.OnChainOnly,
          postConditionMode: PostConditionMode.Allow,
          nonce: 4,
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
          `deployed: ${Accounts.DEPLOYER.stxAddress}.use-math-trait-transitive-name-c2`
        );
        expect(tx.success).toBeTruthy();
      });

      it("using Clarity2 trait", async () => {
        // Build the transaction to deploy the contract
        let deployTxOptions = {
          senderKey: Accounts.WALLET_1.secretKey,
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
        await waitForStacksTransaction(orchestrator, transaction.txid());

        // Build the transaction to deploy the contract
        deployTxOptions = {
          senderKey: Accounts.WALLET_1.secretKey,
          contractName: "use-math-trait",
          codeBody: useMathTrait,
          fee: 2000,
          network,
          anchorMode: AnchorMode.OnChainOnly,
          postConditionMode: PostConditionMode.Allow,
          nonce: 1,
        };

        transaction = await makeContractDeploy(deployTxOptions);

        // Broadcast transaction
        result = await broadcastTransaction(transaction, network);
        expect((<TxBroadcastResultOk>result).error).toBeUndefined();

        // Wait for the transaction to be processed
        await waitForStacksTransaction(orchestrator, transaction.txid());

        // Build the transaction to deploy the contract
        deployTxOptions = {
          senderKey: Accounts.WALLET_1.secretKey,
          contractName: "use-math-trait-transitive-name",
          codeBody: useMathTraitName,
          fee: 2000,
          network,
          anchorMode: AnchorMode.OnChainOnly,
          postConditionMode: PostConditionMode.Allow,
          nonce: 2,
        };

        transaction = await makeContractDeploy(deployTxOptions);

        // Broadcast transaction
        result = await broadcastTransaction(transaction, network);
        expect((<TxBroadcastResultOk>result).error).toBeUndefined();

        // Wait for the transaction to be processed
        let [_, tx] = await waitForStacksTransaction(
          orchestrator,
          transaction.txid()
        );
        expect(tx.description).toBe(
          `deployed: ${Accounts.WALLET_1.stxAddress}.use-math-trait-transitive-name`
        );
        expect(tx.success).toBeFalsy();
      });
    });
  });
});
