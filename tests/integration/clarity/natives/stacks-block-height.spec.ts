import {
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  TxBroadcastResultOk,
  makeContractCall,
  SignedContractCallOptions,
  sponsorTransaction,
} from "@stacks/transactions";
import { StacksNetwork, StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  waitForStacksTransaction,
  getNetworkIdFromEnv,
  getChainInfo,
  FAST_FORWARD_TO_EPOCH_2_4,
} from "../../helpers";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";

describe("stacks-block-height", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let network: StacksNetwork;

  let networkId: number;

  beforeAll(() => {
    networkId = getNetworkIdFromEnv();
    console.log(`network #${networkId}`);
    const timeline = FAST_FORWARD_TO_EPOCH_2_4;
    orchestrator = buildDevnetNetworkOrchestrator(networkId, timeline);
    orchestrator.start();
    network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  const codeBody = `(define-public (test-1)
    (ok stacks-block-height)
)`;

  it("is invalid before 2.5", async () => {
    // Build the transaction to deploy the contract
    const contractName = "test-2-4";
    let deployTxOptions = {
      senderKey: Accounts.DEPLOYER.secretKey,
      contractName,
      codeBody,
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
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      transaction.txid(),
    );
    expect(block.bitcoin_anchor_block_identifier.index).toBeLessThanOrEqual(
      Constants.DEVNET_DEFAULT_EPOCH_2_5,
    );
    expect(tx.description).toBe(
      `deployed: ${Accounts.DEPLOYER.stxAddress}.${contractName}`,
    );
    expect(tx.success).toBeFalsy();
  });

  describe("in 2.5", () => {
    beforeAll(async () => {
      // Wait for 2.5 to go live
      await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
        Constants.DEVNET_DEFAULT_EPOCH_2_5,
      );
      await orchestrator.waitForNextStacksBlock();
    });

    it("is valid", async () => {
      const contractName = "test-2-5";
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName,
        codeBody,
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
        nonce: 1,
      };

      let transaction = await makeContractDeploy(deployTxOptions);

      // Broadcast transaction
      let result = await broadcastTransaction(transaction, network);
      if (result.error) {
        console.log(result);
      }
      expect((<TxBroadcastResultOk>result).error).toBeUndefined();

      // Wait for the transaction to be processed
      let [block, tx] = await waitForStacksTransaction(
        orchestrator,
        transaction.txid(),
      );
      expect(tx.description).toBe(
        `deployed: ${Accounts.DEPLOYER.stxAddress}.${contractName}`,
      );
      expect(tx.success).toBeTruthy();
    });

    it("works across tenures", async () => {
      const contractName = "test-2-5";

      // Build a transaction to call the contract
      let callTxOptions: SignedContractCallOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName,
        functionName: "test-1",
        functionArgs: [],
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
        nonce: 0,
      };
      let transaction = await makeContractCall(callTxOptions);

      // Broadcast transaction
      let result = await broadcastTransaction(transaction, network);
      if (result.error) {
        console.log(result);
      }
      expect((<TxBroadcastResultOk>result).error).toBeUndefined();

      // Wait for the transaction to be processed
      let [block, tx] = await waitForStacksTransaction(
        orchestrator,
        transaction.txid(),
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.${contractName}::test-1()`,
      );
      expect(tx.result).toBe("(ok 141)");
      expect(tx.success).toBeTruthy();
    });
  });

  describe("in 3.0", () => {
    beforeAll(async () => {
      // Wait for 3.0 to go live
      await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
        Constants.DEVNET_DEFAULT_EPOCH_3_0,
      );
      await orchestrator.waitForNextStacksBlock();
    });
    it("works across tenures", async () => {
      const contractName = "test-2-5";

      // Build a transaction to call the contract
      let callTxOptions: SignedContractCallOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName,
        functionName: "test-1",
        functionArgs: [],
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
        nonce: 0,
      };
      let transaction = await makeContractCall(callTxOptions);

      // Broadcast transaction
      let result = await broadcastTransaction(transaction, network);
      if (result.error) {
        console.log(result);
      }
      expect((<TxBroadcastResultOk>result).error).toBeUndefined();

      // Wait for the transaction to be processed
      let [block, tx] = await waitForStacksTransaction(
        orchestrator,
        transaction.txid(),
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.${contractName}::test-1()`,
      );
      expect(tx.result).toBe("(ok 146)");
      expect(tx.success).toBeTruthy();
    });
  });
});
