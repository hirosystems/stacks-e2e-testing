import {
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  TxBroadcastResultOk,
  makeContractCall,
  SignedContractCallOptions,
} from "@stacks/transactions";
import { StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../../constants";
import {
  Account,
  BitcoinBlockMetadata,
  StacksBlockMetadata,
  StacksChainUpdate,
  StacksDevnetOrchestrator,
  StacksTransactionMetadata,
} from "@hirosystems/stacks-devnet-js";
import { broadcastStackSTX } from "../../helpers";

const STACKS_2_1 = 107;

const orchestrator: StacksDevnetOrchestrator = new StacksDevnetOrchestrator({
  path: "./Clarinet.toml",
  logs: true,
  devnet: {
    bitcoin_controller_block_time: Constants.BITCOIN_BLOCK_TIME,
    epoch_2_0: 100,
    epoch_2_05: 100,
    epoch_2_1: STACKS_2_1,
  },
});

beforeAll(() => orchestrator.start());
afterAll(() => orchestrator.stop());

test("New method 'stx-account' errors in 2.05 and works in 2.1", async () => {
  // Wait for Stacks genesis and boot contracts blocks to be mined
  orchestrator.waitForStacksBlock();
  let chainEvent: StacksChainUpdate = orchestrator.waitForStacksBlock();
  let blockHeight = chainEvent.new_blocks[0].block.block_identifier.index;
  expect(blockHeight).toBe(2);

  const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

  // Build the transaction to deploy the contract
  let deployTxOptions = {
    senderKey: Accounts.DEPLOYER.secretKey,
    contractName: "test-2-05",
    codeBody: `(define-public (test)
    (ok (stx-account tx-sender))
)`,
    fee: 2000,
    nonce: 0,
    network,
    anchorMode: AnchorMode.OnChainOnly,
    postConditionMode: PostConditionMode.Allow,
  };

  let transaction = await makeContractDeploy(deployTxOptions);

  // Broadcast transaction
  let result = await broadcastTransaction(transaction, network);
  expect((<TxBroadcastResultOk>result).error).toBeUndefined();

  // Wait for the next block, and check that the transaction is included
  // and that it failed.
  chainEvent = orchestrator.waitForStacksBlock();
  expect(
    (<StacksBlockMetadata>chainEvent.new_blocks[0].block.metadata)
      .bitcoin_anchor_block_identifier.index
  ).toBeLessThan(STACKS_2_1);
  expect(
    (<StacksTransactionMetadata>(
      chainEvent.new_blocks[0].block.transactions[1].metadata
    )).description
  ).toBe(`deployed: ${Accounts.DEPLOYER.stxAddress}.test-2-05`);
  expect(
    (<StacksTransactionMetadata>(
      chainEvent.new_blocks[0].block.transactions[1].metadata
    )).success
  ).toBeFalsy();

  // Wait for 2.1 to go live
  while (true) {
    let chainEvent: StacksChainUpdate = orchestrator.waitForStacksBlock();
    let bitcoinHeight = (<StacksBlockMetadata>(
      chainEvent.new_blocks[0].block.metadata
    )).bitcoin_anchor_block_identifier.index;
    if (bitcoinHeight >= STACKS_2_1) break;
  }

  // Build the transaction to deploy the contract
  deployTxOptions = {
    senderKey: Accounts.DEPLOYER.secretKey,
    contractName: "test-2-1",
    codeBody: `(define-public (test)
    (ok (stx-account tx-sender))
)`,
    fee: 2000,
    nonce: 1,
    network,
    anchorMode: AnchorMode.OnChainOnly,
    postConditionMode: PostConditionMode.Allow,
  };

  transaction = await makeContractDeploy(deployTxOptions);

  // Broadcast transaction
  result = await broadcastTransaction(transaction, network);
  expect((<TxBroadcastResultOk>result).error).toBeUndefined();

  // Wait for the next block, and check that the transaction is included
  // and that it succeeded.
  chainEvent = orchestrator.waitForStacksBlock();
  expect(
    (<StacksTransactionMetadata>(
      chainEvent.new_blocks[0].block.transactions[1].metadata
    )).description
  ).toBe(`deployed: ${Accounts.DEPLOYER.stxAddress}.test-2-1`);
  expect(
    (<StacksTransactionMetadata>(
      chainEvent.new_blocks[0].block.transactions[1].metadata
    )).success
  ).toBeTruthy();

  // Build a transaction to call the contract
  let callTxOptions: SignedContractCallOptions = {
    senderKey: Accounts.WALLET_1.secretKey,
    contractAddress: Accounts.DEPLOYER.stxAddress,
    contractName: "test-2-1",
    functionName: "test",
    functionArgs: [],
    fee: 2000,
    nonce: 0,
    network,
    anchorMode: AnchorMode.OnChainOnly,
    postConditionMode: PostConditionMode.Allow,
  };
  transaction = await makeContractCall(callTxOptions);

  // Broadcast transaction
  result = await broadcastTransaction(transaction, network);
  expect((<TxBroadcastResultOk>result).error).toBeUndefined();

  // Wait for the next block, and check that the transaction is included
  // and that it succeeded with the proper result.
  chainEvent = orchestrator.waitForStacksBlock();
  expect(
    (<StacksTransactionMetadata>(
      chainEvent.new_blocks[0].block.transactions[1].metadata
    )).description
  ).toBe(`invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test()`);
  expect(
    (<StacksTransactionMetadata>(
      chainEvent.new_blocks[0].block.transactions[1].metadata
    )).result
  ).toBe(
    "(ok (tuple (locked u0) (unlock-height u0) (unlocked u99999999998000)))"
  );
  expect(
    (<StacksTransactionMetadata>(
      chainEvent.new_blocks[0].block.transactions[1].metadata
    )).success
  ).toBeTruthy();

  // Lock some stacks, then call again and check the results
  // Build a `stack-stx` transaction
  blockHeight = chainEvent.new_blocks[0].block.block_identifier.index;
  result = await broadcastStackSTX(
    2,
    network,
    50_000_000_000_000,
    Accounts.WALLET_1,
    blockHeight
  );
  console.log(result);
  chainEvent = orchestrator.waitForStacksBlock();

  callTxOptions = {
    senderKey: Accounts.WALLET_1.secretKey,
    contractAddress: Accounts.DEPLOYER.stxAddress,
    contractName: "test-2-1",
    functionName: "test",
    functionArgs: [],
    fee: 2000,
    nonce: 2,
    network,
    anchorMode: AnchorMode.OnChainOnly,
    postConditionMode: PostConditionMode.Allow,
  };
  console.log("make contract call...");
  transaction = await makeContractCall(callTxOptions);
  console.log("broadcast transaction...");
  result = await broadcastTransaction(transaction, network);
  expect((<TxBroadcastResultOk>result).error).toBeUndefined();

  // Wait for the next block, and check that the transaction is included
  // and that it succeeded with the proper result.
  console.log("wait for stacks block...");
  chainEvent = orchestrator.waitForStacksBlock();
  expect(
    (<StacksTransactionMetadata>(
      chainEvent.new_blocks[0].block.transactions[1].metadata
    )).description
  ).toBe(`invoked: ${Accounts.DEPLOYER.stxAddress}.test-2-1::test()`);
  expect(
    (<StacksTransactionMetadata>(
      chainEvent.new_blocks[0].block.transactions[1].metadata
    )).result
  ).toBe(
    "(ok (tuple (locked u50000000000000) (unlock-height u0) (unlocked u50000000000000)))"
  );
  expect(
    (<StacksTransactionMetadata>(
      chainEvent.new_blocks[0].block.transactions[1].metadata
    )).success
  ).toBeTruthy();
});
