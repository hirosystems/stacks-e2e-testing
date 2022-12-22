import {
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  TxBroadcastResultOk,
  makeContractCall,
  SignedContractCallOptions,
  bufferCV,
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
import { stringCV } from "@stacks/transactions/dist/clarity/types/stringCV";
import { describe, expect, it, beforeAll, afterAll } from "vitest";

describe("principal-construct?", () => {
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

  it("is invalid before 2.1", async () => {
    // Build the transaction to deploy the contract
    let deployTxOptions = {
      senderKey: Accounts.DEPLOYER.secretKey,
      contractName: "test-2-05",
      codeBody: `(define-public (test-literal-1)
    (principal-construct? 0x1a 0xfa6bf38ed557fe417333710d6033e9419391a320)
)
(define-public (test-literal-2)
    (principal-construct? 0x1a 0xfa6bf38ed557fe417333710d6033e9419391a320 "foo")
)
(define-public (test (version (buff 1)) (pkh (buff 20)))
    (principal-construct? version pkh)
)
(define-public (test-2 (version (buff 1)) (pkh (buff 20)) (contract (string-ascii 40)))
    (principal-construct? version pkh contract)
)`,
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
      transaction.txid()
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
      await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
        Constants.DEVNET_DEFAULT_EPOCH_2_1
      );
    });

    it("is valid", async () => {
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "test-2-1",
        codeBody: `(define-public (test-literal-1)
    (principal-construct? 0x1a 0xfa6bf38ed557fe417333710d6033e9419391a320)
)
(define-public (test-literal-2)
    (principal-construct? 0x1a 0xfa6bf38ed557fe417333710d6033e9419391a320 "foo")
)
(define-public (test-1 (version (buff 1)) (pkh (buff 20)))
    (principal-construct? version pkh)
)
(define-public (test-2 (version (buff 1)) (pkh (buff 20)) (contract (string-ascii 40)))
    (principal-construct? version pkh contract)
)`,
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
        transaction.txid()
      );
      expect(tx.description).toBe(
        `deployed: ${Accounts.DEPLOYER.stxAddress}.test-2-1`
      );
      expect(tx.success).toBeTruthy();
    });

    it("works with literals for a standard principal", async () => {
      // Build a transaction to call the contract
      let callTxOptions: SignedContractCallOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName: "test-2-1",
        functionName: "test-literal-1",
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
        transaction.txid()
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test-literal-1()`
      );
      expect(tx.result).toBe("(ok ST3X6QWWETNBZWGBK6DRGTR1KX50S74D3425Q1TPK)");
      expect(tx.success).toBeTruthy();
    });

    it("works with literals for a contract principal", async () => {
      // Build a transaction to call the contract
      let callTxOptions: SignedContractCallOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName: "test-2-1",
        functionName: "test-literal-2",
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
        transaction.txid()
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test-literal-2()`
      );
      expect(tx.result).toBe(
        "(ok ST3X6QWWETNBZWGBK6DRGTR1KX50S74D3425Q1TPK.foo)"
      );
      expect(tx.success).toBeTruthy();
    });

    it("works for a standard principal", async () => {
      // Build a transaction to call the contract
      let version = bufferCV(Uint8Array.from(Buffer.from("1a", "hex")));
      let pkh = bufferCV(
        Uint8Array.from(
          Buffer.from("fa6bf38ed557fe417333710d6033e9419391a320", "hex")
        )
      );
      let callTxOptions: SignedContractCallOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName: "test-2-1",
        functionName: "test-1",
        functionArgs: [version, pkh],
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
        transaction.txid()
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test-1(0x1a, 0xfa6bf38ed557fe417333710d6033e9419391a320)`
      );
      expect(tx.result).toBe("(ok ST3X6QWWETNBZWGBK6DRGTR1KX50S74D3425Q1TPK)");
      expect(tx.success).toBeTruthy();
    });

    it("works for a contract principal", async () => {
      // Build a transaction to call the contract
      let version = bufferCV(Uint8Array.from(Buffer.from("1a", "hex")));
      let pkh = bufferCV(
        Uint8Array.from(
          Buffer.from("fa6bf38ed557fe417333710d6033e9419391a320", "hex")
        )
      );
      let callTxOptions: SignedContractCallOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName: "test-2-1",
        functionName: "test-2",
        functionArgs: [version, pkh, stringCV("foo", "ascii")],
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
        transaction.txid()
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test-2(0x1a, 0xfa6bf38ed557fe417333710d6033e9419391a320, "foo")`
      );
      expect(tx.result).toBe(
        "(ok ST3X6QWWETNBZWGBK6DRGTR1KX50S74D3425Q1TPK.foo)"
      );
      expect(tx.success).toBeTruthy();
    });

    it("gives proper error for invalid version", async () => {
      // Build a transaction to call the contract
      let version = bufferCV(Uint8Array.from(Buffer.from("16", "hex")));
      let pkh = bufferCV(
        Uint8Array.from(
          Buffer.from("fa6bf38ed557fe417333710d6033e9419391a320", "hex")
        )
      );
      let callTxOptions: SignedContractCallOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName: "test-2-1",
        functionName: "test-1",
        functionArgs: [version, pkh],
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
        transaction.txid()
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test-1(0x16, 0xfa6bf38ed557fe417333710d6033e9419391a320)`
      );
      expect(tx.result).toBe(
        "(err (tuple (error_code u0) (value (some SP3X6QWWETNBZWGBK6DRGTR1KX50S74D3433WDGJY))))"
      );
      expect(tx.success).toBeFalsy();
    });

    it("gives proper error for invalid version (contract principal)", async () => {
      // Build a transaction to call the contract
      let version = bufferCV(Uint8Array.from(Buffer.from("16", "hex")));
      let pkh = bufferCV(
        Uint8Array.from(
          Buffer.from("fa6bf38ed557fe417333710d6033e9419391a320", "hex")
        )
      );
      let callTxOptions: SignedContractCallOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName: "test-2-1",
        functionName: "test-2",
        functionArgs: [version, pkh, stringCV("foo", "ascii")],
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
        transaction.txid()
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test-2(0x16, 0xfa6bf38ed557fe417333710d6033e9419391a320, "foo")`
      );
      expect(tx.result).toBe(
        "(err (tuple (error_code u0) (value (some SP3X6QWWETNBZWGBK6DRGTR1KX50S74D3433WDGJY.foo))))"
      );
      expect(tx.success).toBeFalsy();
    });

    it("gives proper error for bad version length (0)", async () => {
      // Build a transaction to call the contract
      let version = bufferCV(new Uint8Array());
      let pkh = bufferCV(
        Uint8Array.from(
          Buffer.from("fa6bf38ed557fe417333710d6033e9419391a320", "hex")
        )
      );
      let callTxOptions: SignedContractCallOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName: "test-2-1",
        functionName: "test-1",
        functionArgs: [version, pkh],
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
        transaction.txid()
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test-1(0x, 0xfa6bf38ed557fe417333710d6033e9419391a320)`
      );
      expect(tx.result).toBe("(err (tuple (error_code u1) (value none)))");
      expect(tx.success).toBeFalsy();
    });

    it("gives proper error for bad pkh length", async () => {
      // Build a transaction to call the contract
      let version = bufferCV(Uint8Array.from(Buffer.from("1a", "hex")));
      let pkh = bufferCV(
        Uint8Array.from(
          Buffer.from("fa6bf38ed557fe417333710d6033e9419391a3", "hex")
        )
      );
      let callTxOptions: SignedContractCallOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName: "test-2-1",
        functionName: "test-1",
        functionArgs: [version, pkh],
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
        transaction.txid()
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test-1(0x1a, 0xfa6bf38ed557fe417333710d6033e9419391a3)`
      );
      expect(tx.result).toBe("(err (tuple (error_code u1) (value none)))");
      expect(tx.success).toBeFalsy();
    });

    it("gives proper error for bad version length (2)", async () => {
      // Build a transaction to call the contract
      let version = bufferCV(Uint8Array.from(Buffer.from("20", "hex")));
      let pkh = bufferCV(
        Uint8Array.from(
          Buffer.from("fa6bf38ed557fe417333710d6033e9419391a320", "hex")
        )
      );
      let callTxOptions: SignedContractCallOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName: "test-2-1",
        functionName: "test-1",
        functionArgs: [version, pkh],
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
        transaction.txid()
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test-1(0x20, 0xfa6bf38ed557fe417333710d6033e9419391a320)`
      );
      expect(tx.result).toBe("(err (tuple (error_code u1) (value none)))");
      expect(tx.success).toBeFalsy();
    });

    it("gives proper error for empty contract name", async () => {
      // Build a transaction to call the contract
      let version = bufferCV(Uint8Array.from(Buffer.from("1a", "hex")));
      let pkh = bufferCV(
        Uint8Array.from(
          Buffer.from("fa6bf38ed557fe417333710d6033e9419391a320", "hex")
        )
      );
      let callTxOptions: SignedContractCallOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName: "test-2-1",
        functionName: "test-2",
        functionArgs: [version, pkh, stringCV("", "ascii")],
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
        transaction.txid()
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test-2(0x1a, 0xfa6bf38ed557fe417333710d6033e9419391a320, "")`
      );
      expect(tx.result).toBe("(err (tuple (error_code u2) (value none)))");
      expect(tx.success).toBeFalsy();
    });

    it("gives proper error for illegal contract name", async () => {
      // Build a transaction to call the contract
      let version = bufferCV(Uint8Array.from(Buffer.from("1a", "hex")));
      let pkh = bufferCV(
        Uint8Array.from(
          Buffer.from("fa6bf38ed557fe417333710d6033e9419391a320", "hex")
        )
      );
      let callTxOptions: SignedContractCallOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName: "test-2-1",
        functionName: "test-2",
        functionArgs: [version, pkh, stringCV("foo[", "ascii")],
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
        transaction.txid()
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test-2(0x1a, 0xfa6bf38ed557fe417333710d6033e9419391a320, "foo[")`
      );
      expect(tx.result).toBe("(err (tuple (error_code u2) (value none)))");
      expect(tx.success).toBeFalsy();
    });
  });
});
