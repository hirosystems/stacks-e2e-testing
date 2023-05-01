import {
  DevnetNetworkOrchestrator,
  StacksTransactionMetadata,
  stacksNodeVersion,
} from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import {
  AnchorMode,
  PostConditionMode,
  SignedContractCallOptions,
  broadcastTransaction,
  callReadOnlyFunction,
  contractPrincipalCV,
  makeContractCall,
  makeContractDeploy,
  uintCV,
} from "@stacks/transactions";
import { Accounts } from "../constants";
import {
  DEFAULT_EPOCH_TIMELINE,
  asyncExpectStacksTransactionSuccess,
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
} from "../helpers";

describe("trait parameter", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let version: string;
  if (typeof stacksNodeVersion === "function") {
    version = stacksNodeVersion();
  } else {
    version = "2.1";
  }
  const timeline = {
    ...DEFAULT_EPOCH_TIMELINE,
    epoch_2_2: 118,
    pox_2_unlock_height: 119,
  };

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator(
      getNetworkIdFromEnv(),
      version,
      timeline
    );
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("passing a trait parameter should work", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    await orchestrator.waitForNextStacksBlock();

    let codeBody = `(define-trait test-trait
      ((foo (uint) (response uint uint))))
    
    (define-read-only (foo-arg (f <test-trait>))
      (contract-of f)
    )
    
    (define-public (call-foo (f <test-trait>) (a uint))
      (contract-call? f foo a)
    )`;

    // Build the transaction to deploy the contract
    let deployTxOptions = {
      senderKey: Accounts.DEPLOYER.secretKey,
      contractName: "test-trait",
      codeBody,
      fee: 2000,
      network,
      anchorMode: AnchorMode.OnChainOnly,
      postConditionMode: PostConditionMode.Allow,
      nonce: 0,
      clarityVersion: undefined,
    };

    let transaction = await makeContractDeploy(deployTxOptions);
    let response = await broadcastTransaction(transaction, network);
    expect(response.error).toBeUndefined();
    await asyncExpectStacksTransactionSuccess(orchestrator, transaction.txid());

    codeBody = `(define-public (foo (a uint))
    (ok a)
  )`;

    // Build the transaction to deploy the contract
    deployTxOptions = {
      senderKey: Accounts.DEPLOYER.secretKey,
      contractName: "impl-trait",
      codeBody,
      fee: 2000,
      network,
      anchorMode: AnchorMode.OnChainOnly,
      postConditionMode: PostConditionMode.Allow,
      nonce: 1,
      clarityVersion: undefined,
    };

    transaction = await makeContractDeploy(deployTxOptions);
    response = await broadcastTransaction(transaction, network);
    expect(response.error).toBeUndefined();
    await asyncExpectStacksTransactionSuccess(orchestrator, transaction.txid());

    await orchestrator.waitForNextStacksBlock();

    // Call the readonly function
    let output = await callReadOnlyFunction({
      contractName: "test-trait",
      contractAddress: Accounts.DEPLOYER.stxAddress,
      functionName: "foo-arg",
      functionArgs: [
        contractPrincipalCV(Accounts.DEPLOYER.stxAddress, "impl-trait"),
      ],
      network,
      senderAddress: Accounts.WALLET_1.stxAddress,
    });
    expect(output).toEqual(
      contractPrincipalCV(Accounts.DEPLOYER.stxAddress, "impl-trait")
    );

    // Call the public function
    let callTxOptions: SignedContractCallOptions = {
      senderKey: Accounts.WALLET_1.secretKey,
      contractAddress: Accounts.DEPLOYER.stxAddress,
      contractName: "test-trait",
      functionName: "call-foo",
      functionArgs: [
        contractPrincipalCV(Accounts.DEPLOYER.stxAddress, "impl-trait"),
        uintCV(3),
      ],
      fee: 2000,
      network,
      anchorMode: AnchorMode.OnChainOnly,
      postConditionMode: PostConditionMode.Allow,
      nonce: 0,
    };
    transaction = await makeContractCall(callTxOptions);
    response = await broadcastTransaction(transaction, network);
    let [_, tx] = await asyncExpectStacksTransactionSuccess(
      orchestrator,
      transaction.txid()
    );
    expect((tx as StacksTransactionMetadata).result).toEqual("(ok u3)");

    // Wait for the 2.2 activation, then check again
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_2
    );

    // Call the readonly function
    output = await callReadOnlyFunction({
      contractName: "test-trait",
      contractAddress: Accounts.DEPLOYER.stxAddress,
      functionName: "foo-arg",
      functionArgs: [
        contractPrincipalCV(Accounts.DEPLOYER.stxAddress, "impl-trait"),
      ],
      network,
      senderAddress: Accounts.WALLET_1.stxAddress,
    });
    expect(output).toEqual(
      contractPrincipalCV(Accounts.DEPLOYER.stxAddress, "impl-trait")
    );

    // Call the public function
    callTxOptions = {
      senderKey: Accounts.WALLET_1.secretKey,
      contractAddress: Accounts.DEPLOYER.stxAddress,
      contractName: "test-trait",
      functionName: "call-foo",
      functionArgs: [
        contractPrincipalCV(Accounts.DEPLOYER.stxAddress, "impl-trait"),
        uintCV(3),
      ],
      fee: 2000,
      network,
      anchorMode: AnchorMode.OnChainOnly,
      postConditionMode: PostConditionMode.Allow,
      nonce: 1,
    };
    transaction = await makeContractCall(callTxOptions);
    response = await broadcastTransaction(transaction, network);
    [_, tx] = await asyncExpectStacksTransactionSuccess(
      orchestrator,
      transaction.txid()
    );
    expect((tx as StacksTransactionMetadata).result).toEqual("(ok u3)");
  });
});
