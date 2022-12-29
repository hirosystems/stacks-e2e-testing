import {
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  TxBroadcastResultOk,
  makeContractCall,
  SignedContractCallOptions,
  uintCV,
} from "@stacks/transactions";
import { StacksNetwork, StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../../constants";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { broadcastStackSTX, waitForNextRewardPhase } from "../../pox/helpers";
import {
  buildDevnetNetworkOrchestrator,
  getBitcoinBlockHeight,
  waitForStacksTransaction,
  getNetworkIdFromEnv,
  getChainInfo,
} from "../../helpers";

describe("get-burn-block-info?", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let network: StacksNetwork;

  let networkId: number;

  beforeAll(() => {
    networkId = getNetworkIdFromEnv();
    console.log(`network #${networkId}`);
    orchestrator = buildDevnetNetworkOrchestrator(networkId);
    orchestrator.start();
    network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("is invalid before 2.1", async () => {
    // Build the transaction to deploy the contract
    let deployTxOptions = {
      senderKey: Accounts.DEPLOYER.secretKey,
      contractName: "test-2-05",
      codeBody: `(define-public (test-1)
    (ok (get-burn-block-info? header-hash u103))
)
(define-public (test-2 (height uint))
    (ok (get-burn-block-info? pox-addrs height))
)`,
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
        Constants.DEVNET_DEFAULT_EPOCH_2_1 + 1
      );
    });

    it("is valid", async () => {
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "test-2-1",
        codeBody: `(define-public (test-1)
    (ok (get-burn-block-info? header-hash u103))
)
(define-public (test-2 (height uint))
    (ok (get-burn-block-info? pox-addrs height))
)`,
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
      let [_, tx] = await waitForStacksTransaction(
        orchestrator,
        transaction.txid()
      );
      expect(tx.description).toBe(
        `deployed: ${Accounts.DEPLOYER.stxAddress}.test-2-1`
      );
      expect(tx.success).toBeTruthy();
    });

    it("returns valid header hash", async () => {
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
      let [_, tx] = await waitForStacksTransaction(
        orchestrator,
        transaction.txid()
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test-1()`
      );
      expect(tx.result).toContain("(ok (some 0x");
      expect(tx.success).toBeTruthy();
    });
  });

  it("returns valid pox addrs", async () => {
    let chainUpdate =
      await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
        Constants.DEVNET_DEFAULT_POX_2_ACTIVATION + 1
      );
    // Wait for block N-2 where N is the height of the next prepare phase
    let blockHeight = getBitcoinBlockHeight(chainUpdate);

    // Broadcast some STX stacking orders
    let response = await broadcastStackSTX(
      2,
      network,
      90_000_000_000_000,
      Accounts.WALLET_1,
      blockHeight,
      12,
      1000,
      1
    );
    expect(response.error).toBeUndefined();

    // Wait for block N+1 where N is the height of the next reward phase
    chainUpdate = await waitForNextRewardPhase(network, orchestrator, 1);
    let height = getBitcoinBlockHeight(chainUpdate);

    // Build a transaction to call the contract
    let callTxOptions: SignedContractCallOptions = {
      senderKey: Accounts.WALLET_1.secretKey,
      contractAddress: Accounts.DEPLOYER.stxAddress,
      contractName: "test-2-1",
      functionName: "test-2",
      functionArgs: [uintCV(height)],
      fee: 2000,
      network,
      anchorMode: AnchorMode.OnChainOnly,
      postConditionMode: PostConditionMode.Allow,
      nonce: 2,
    };
    let transaction = await makeContractCall(callTxOptions);

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
      `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test-2(u${height})`
    );
    // FIXME: verify this output once everything is working
    expect(tx.result).toBe(
      "(ok (some (tuple (addrs ((tuple (hashbytes 0x7321b74e2b6a7e949e6c4ad313035b1665095017) (version 0x00)) (tuple (hashbytes 0x7321b74e2b6a7e949e6c4ad313035b1665095017) (version 0x00)))) (payout u10000))))"
    );
    expect(tx.success).toBeTruthy();
  });
});
