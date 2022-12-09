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
import {
  broadcastStackSTX,
  waitForNextPreparePhase,
  waitForNextRewardPhase,
} from "../../pox/helpers";
import {
  buildDevnetNetworkOrchestrator,
  getBitcoinBlockHeight,
  waitForStacksChainUpdate,
  waitForStacksTransaction,
} from "../../helpers";
import { principalCV } from "@stacks/transactions/dist/clarity/types/principalCV";

describe("get-burn-block-info?", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let network: StacksNetwork;

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator();
    orchestrator.start();
    network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
  });

  afterAll(() => {
    orchestrator.stop();
  });

  test("is invalid in 2.05", async () => {
    // Wait for Stacks 2.05 to start
    await waitForStacksChainUpdate(orchestrator, Constants.DEVNET_DEFAULT_EPOCH_2_05);

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
    };

    let transaction = await makeContractDeploy(deployTxOptions);

    // Broadcast transaction
    let result = await broadcastTransaction(transaction, network);
    expect((<TxBroadcastResultOk>result).error).toBeUndefined();

    // Wait for the transaction to be processed
    let [block, tx] = waitForStacksTransaction(
      orchestrator,
      Accounts.DEPLOYER.stxAddress
    );
    expect(block.bitcoin_anchor_block_identifier.index).toBeLessThan(
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
      await waitForStacksChainUpdate(
        orchestrator,
        Constants.DEVNET_DEFAULT_EPOCH_2_1
      );
    });

    test("is valid", async () => {
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
      };

      let transaction = await makeContractDeploy(deployTxOptions);

      // Broadcast transaction
      let result = await broadcastTransaction(transaction, network);
      expect((<TxBroadcastResultOk>result).error).toBeUndefined();

      // Wait for the transaction to be processed
      let [_, tx] = waitForStacksTransaction(
        orchestrator,
        Accounts.DEPLOYER.stxAddress
      );
      expect(tx.description).toBe(
        `deployed: ${Accounts.DEPLOYER.stxAddress}.test-2-1`
      );
      expect(tx.success).toBeTruthy();
    });

    test("returns valid header hash", async () => {
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
      let [_, tx] = waitForStacksTransaction(
        orchestrator,
        Accounts.WALLET_1.stxAddress
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test-1()`
      );
      expect(tx.result).toContain("(ok (some 0x");
      expect(tx.success).toBeTruthy();
    });
  });

  test("returns valid pox addrs", async () => {
    // Wait for pox-2 activation
    let chainUpdate = await waitForStacksChainUpdate(
      orchestrator,
      Constants.DEVNET_DEFAULT_EPOCH_2_1
    );

    // Wait for block N-2 where N is the height of the next prepare phase
    chainUpdate = await waitForNextPreparePhase(network, orchestrator, -2);
    let blockHeight = getBitcoinBlockHeight(chainUpdate);

    // Broadcast some STX stacking orders
    let response = await broadcastStackSTX(
      2,
      network,
      25_000_000_000_000,
      Accounts.WALLET_1,
      blockHeight,
      12,
      1000
    );
    expect(response.error).toBeUndefined();

    // Wait for block N+1 where N is the height of the next reward phase
    chainUpdate = await waitForNextRewardPhase(network, orchestrator, 1);
    let height = getBitcoinBlockHeight(chainUpdate);

    for (let index = 0; index < 12; index++) {
      orchestrator.waitForBitcoinBlock();
      // Build a transaction to call the contract
      let callTxOptions: SignedContractCallOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName: "test-2-1",
        functionName: "test-2",
        functionArgs: [uintCV(height + index)],
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
      };
      let transaction = await makeContractCall(callTxOptions);

      // Broadcast transaction
      let result = await broadcastTransaction(transaction, network);
      console.log("RESULT", <TxBroadcastResultOk>result);
      expect((<TxBroadcastResultOk>result).error).toBeUndefined();

      let callPoxTxOptions: SignedContractCallOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: "ST000000000000000000002AMW42H",
        contractName: "pox-2",
        functionName: "get-stacker-info",
        functionArgs: [principalCV(Accounts.WALLET_1.stxAddress)],
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
      };
      transaction = await makeContractCall(callPoxTxOptions);

      // Broadcast transaction
      result = await broadcastTransaction(transaction, network);
      console.log("RESULT", <TxBroadcastResultOk>result);

      // expect((<TxBroadcastResultOk>result).error).toBeUndefined();

      // Wait for the transaction to be processed
      let [_, tx] = waitForStacksTransaction(
        orchestrator,
        Accounts.WALLET_1.stxAddress
      );
      console.log("HEIGHT:", height + index);
      console.log("=== ", tx.result);

      // expect(tx.description).toBe(
      //   `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test-2(u${height+ index})`
      // );
      // expect(tx.result).toBe(
      //   "(ok (some (tuple (addrs ((tuple (hashbytes 0x0000000000000000000000000000000000000000) (version 0x00)) (tuple (hashbytes 0x0000000000000000000000000000000000000000) (version 0x00)))) (payout u10000))))"
      // );
      // expect(tx.success).toBeTruthy();
    }
  });
});
