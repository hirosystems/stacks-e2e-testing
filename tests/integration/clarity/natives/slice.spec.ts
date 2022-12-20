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
  getNetworkIdFromCtx,
  getChainInfo,
} from "../../helpers";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { describe, expect, it, beforeAll, afterAll } from 'vitest'

describe("slice?", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let network: StacksNetwork;

  beforeAll(async (ctx) => {
    let networkId = getNetworkIdFromCtx(ctx.id);
    orchestrator = buildDevnetNetworkOrchestrator(networkId);
    orchestrator.start();
    network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
  });

  afterAll(async () => {
    orchestrator.terminate();
  });

  const codeBody = `(define-public (test-1)
  (ok (slice? "blockchain" u5 u10))
)
(define-public (test-2)
  (ok (slice? (list 1 2 3 4 5) u5 u9))
)
(define-public (test-3)
  (ok (slice? (list 1 2 3 4 5) u3 u4))
)`;

  it("is invalid before 2.1", async () => {
    // Build the transaction to deploy the contract
    let deployTxOptions = {
      senderKey: Accounts.DEPLOYER.secretKey,
      contractName: "test-2-05",
      codeBody,
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
    expect(block.bitcoin_anchor_block_identifier.index).toBeLessThanOrEqual(
      Constants.DEVNET_DEFAULT_EPOCH_2_1
    );
    expect(tx.description).toBe(
      `deployed: ${Accounts.DEPLOYER.stxAddress}.test-2-05`
    );
    expect(tx.success).toBeFalsy();
  });

  describe("in 2.1", () => {
    beforeAll(async () => {
      // Wait for 2.1 to go live
      await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(Constants.DEVNET_DEFAULT_EPOCH_2_1)

    });

    it("is valid", async () => {
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "test-2-1",
        codeBody,
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
        `deployed: ${Accounts.DEPLOYER.stxAddress}.test-2-1`
      );
      expect(tx.success).toBeTruthy();
    });

    it("works for a string", async () => {
      // Build a transaction to call the contract
      let callTxOptions: SignedContractCallOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName: "test-2-1",
        functionName: "test-1",
        functionArgs: [],
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
      };
      let transaction = await makeContractCall(callTxOptions);

      // Broadcast transaction
      let result = await broadcastTransaction(transaction, network);
      expect((<TxBroadcastResultOk>result).error).toBeUndefined();

      // Wait for the transaction to be processed
      let [block, tx] = await waitForStacksTransaction(
        orchestrator,
        Accounts.WALLET_1.stxAddress
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test-1()`
      );
      expect(tx.result).toBe('(ok (some "chain"))');
      expect(tx.success).toBeTruthy();
    });

    it("returns none when out of bounds", async () => {
      // Build a transaction to call the contract
      let callTxOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName: "test-2-1",
        functionName: "test-2",
        functionArgs: [],
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
      };
      let transaction = await makeContractCall(callTxOptions);

      // Broadcast transaction
      let result = await broadcastTransaction(transaction, network);
      expect((<TxBroadcastResultOk>result).error).toBeUndefined();

      // Wait for the transaction to be processed
      let [_, tx] = await waitForStacksTransaction(
        orchestrator,
        Accounts.WALLET_1.stxAddress
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test-2()`
      );
      expect(tx.result).toBe("(ok none)");
      expect(tx.success).toBeTruthy();
    });

    it("works for list of ints", async () => {
      // Build a transaction to call the contract
      let callTxOptions: SignedContractCallOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName: "test-2-1",
        functionName: "test-3",
        functionArgs: [],
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
      };
      let transaction = await makeContractCall(callTxOptions);

      // Broadcast transaction
      let result = await broadcastTransaction(transaction, network);
      expect((<TxBroadcastResultOk>result).error).toBeUndefined();

      // Wait for the transaction to be processed
      let [block, tx] = await waitForStacksTransaction(
        orchestrator,
        Accounts.WALLET_1.stxAddress
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test-3()`
      );
      expect(tx.result).toBe("(ok (some (4)))");
      expect(tx.success).toBeTruthy();
    });
  });
});
