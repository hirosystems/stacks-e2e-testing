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
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import {
  broadcastStackSTX,
  getPoxInfo,
  waitForNextPreparePhase,
  waitForNextRewardPhase,
} from "../../pox/helpers";
import {
  buildDevnetNetworkOrchestrator,
  getBitcoinBlockHeight,
  waitForStacksTransaction,
  getNetworkIdFromCtx,
  getChainInfo,
} from "../../helpers";
import { principalCV } from "@stacks/transactions/dist/clarity/types/principalCV";

describe("stx-account", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let network: StacksNetwork;
  let nonce: number;

  beforeAll((ctx: any) => {
    let networkId = getNetworkIdFromCtx(ctx.id);
    nonce = 0;
    orchestrator = buildDevnetNetworkOrchestrator(networkId);
    orchestrator.start();
    network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
    ctx();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("is invalid before 2.1", async () => {
    // Build the transaction to deploy the contract
    let deployTxOptions = {
      senderKey: Accounts.DEPLOYER.secretKey,
      contractName: "test-2-05",
      codeBody: `(define-public (test-literal-1)
    (ok (stx-account 'SZ2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKQ9H6DPR))
)
(define-public (test-literal-2)
    (ok (stx-account 'SZ2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKQ9H6DPR.foo))
)
(define-public (test (p principal))
    (ok (stx-account p))
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
        Constants.DEVNET_DEFAULT_POX_2_ACTIVATION
      );
    });

    it("is valid", async () => {
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "test-2-1",
        codeBody: `(define-public (test-literal-1)
    (ok (stx-account 'SZ2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKQ9H6DPR))
)
(define-public (test-literal-2)
    (ok (stx-account 'SZ2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKQ9H6DPR.foo))
)
(define-public (test (p principal))
    (ok (stx-account p))
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

    it("works for a literal standard principal", async () => {
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
        nonce,
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
      expect(tx.result).toBe(
        "(ok (tuple (locked u0) (unlock-height u0) (unlocked u0)))"
      );
      expect(tx.success).toBeTruthy();
      nonce += 1;
    });

    it("works for a literal contract principal", async () => {
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
        nonce,
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
        "(ok (tuple (locked u0) (unlock-height u0) (unlocked u0)))"
      );
      expect(tx.success).toBeTruthy();
      nonce += 1;
    });

    it("works for a standard principal", async () => {
      // Build a transaction to call the contract
      let callTxOptions: SignedContractCallOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName: "test-2-1",
        functionName: "test",
        functionArgs: [
          principalCV("SZ2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKQ9H6DPR"),
        ],
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
        nonce,
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
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test(SZ2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKQ9H6DPR)`
      );
      expect(tx.result).toBe(
        "(ok (tuple (locked u0) (unlock-height u0) (unlocked u0)))"
      );
      expect(tx.success).toBeTruthy();
      nonce += 1;
    });

    it("works for a principal with a balance", async () => {
      // Build a transaction to call the contract
      let callTxOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName: "test-2-1",
        functionName: "test",
        functionArgs: [principalCV(Accounts.WALLET_1.stxAddress)],
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
        nonce,
      };
      let transaction = await makeContractCall(callTxOptions);

      // Broadcast transaction
      let result = await broadcastTransaction(transaction, network);
      expect((<TxBroadcastResultOk>result).error).toBeUndefined();

      // Wait for the transaction to be processed
      let [_, tx] = await waitForStacksTransaction(
        orchestrator,
        transaction.txid()
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test(${Accounts.WALLET_1.stxAddress})`
      );
      expect(tx.result).toBe(
        "(ok (tuple (locked u0) (unlock-height u0) (unlocked u99999999992000)))"
      );
      expect(tx.success).toBeTruthy();
      nonce += 1;
    });

    it("handles an invalid principal", async () => {
      // Build a transaction to call the contract
      let callTxOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName: "test-2-1",
        functionName: "test",
        functionArgs: [
          principalCV("SP3X6QWWETNBZWGBK6DRGTR1KX50S74D3433WDGJY"),
        ],
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
        nonce,
      };
      let transaction = await makeContractCall(callTxOptions);

      // Broadcast transaction
      let result = await broadcastTransaction(transaction, network);
      expect((<TxBroadcastResultOk>result).error).toBeUndefined();

      // Wait for the transaction to be processed
      let [_, tx] = await waitForStacksTransaction(
        orchestrator,
        transaction.txid()
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test(SP3X6QWWETNBZWGBK6DRGTR1KX50S74D3433WDGJY)`
      );
      expect(tx.result).toBe(
        "(ok (tuple (locked u0) (unlock-height u0) (unlocked u0)))"
      );
      expect(tx.success).toBeTruthy();
      nonce += 1;
    });

    it("returns expected results when stacking", async () => {
      // Wait for block N-2 where N is the height of the next prepare phase
      let chainUpdate = await waitForNextPreparePhase(
        network,
        orchestrator,
        -2
      );
      let blockHeight = getBitcoinBlockHeight(chainUpdate);

      // Broadcast some STX stacking orders
      let cycles = 12;
      let response = await broadcastStackSTX(
        2,
        network,
        25_000_000_000_000,
        Accounts.WALLET_1,
        blockHeight,
        cycles,
        1000
      );
      expect(response.error).toBeUndefined();

      // Compute the unlockHeight to avoid flakiness
      let poxInfo = await getPoxInfo(network);
      let unlockHeight =
        poxInfo.first_burnchain_block_height +
        (1 + poxInfo.current_cycle.id) * poxInfo.reward_cycle_length +
        cycles * poxInfo.reward_cycle_length;

      // Wait for block N+1 where N is the height of the next reward phase
      await waitForNextRewardPhase(network, orchestrator, 1);

      // Build a transaction to call the contract
      let callTxOptions = {
        senderKey: Accounts.WALLET_1.secretKey,
        contractAddress: Accounts.DEPLOYER.stxAddress,
        contractName: "test-2-1",
        functionName: "test",
        functionArgs: [principalCV(Accounts.WALLET_1.stxAddress)],
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
        transaction.txid()
      );
      expect(tx.description).toBe(
        `invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test(${Accounts.WALLET_1.stxAddress})`
      );
      expect(tx.result).toBe(
        `(ok (tuple (locked u25000000000000) (unlock-height u${unlockHeight}) (unlocked u74999999987000)))`
      );
      expect(tx.success).toBeTruthy();
    });
  });
});
