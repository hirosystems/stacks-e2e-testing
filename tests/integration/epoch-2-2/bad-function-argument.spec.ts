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
  cvToString,
  makeContractCall,
  makeContractDeploy,
  responseOkCV,
  uintCV,
} from "@stacks/transactions";
import { Accounts } from "../constants";
import {
  DEFAULT_EPOCH_TIMELINE,
  asyncExpectStacksTransactionSuccess,
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../helpers";

const fee = 2000;

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

  it("passing a trait parameter should work in Stacks 2.1", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
    const contractAddress = Accounts.DEPLOYER.stxAddress;

    await orchestrator.waitForNextStacksBlock();

    let deployResponse = await deployContract(
      network,
      Accounts.DEPLOYER.secretKey,
      0,
      "test-trait",
      `(define-trait test-trait
        ((foo (uint) (response uint uint))))
      
      (define-read-only (foo-arg (f <test-trait>))
        (contract-of f)
      )
      
      (define-public (call-foo (f <test-trait>) (a uint))
        (contract-call? f foo a)
      )`
    );
    await asyncExpectStacksTransactionSuccess(
      orchestrator,
      deployResponse.transaction.txid()
    );

    deployResponse = await deployContract(
      network,
      Accounts.DEPLOYER.secretKey,
      1,
      "impl-trait",
      `(define-public (foo (a uint))
    (ok a)
  )`
    );

    await asyncExpectStacksTransactionSuccess(
      orchestrator,
      deployResponse.transaction.txid()
    );

    await orchestrator.waitForNextStacksBlock();

    // Call the readonly function
    let output = await callReadOnlyFunction({
      contractName: "test-trait",
      contractAddress,
      functionName: "foo-arg",
      functionArgs: [contractPrincipalCV(contractAddress, "impl-trait")],
      network,
      senderAddress: Accounts.WALLET_1.stxAddress,
    });
    expect(output, cvToString(output)).toEqual(
      contractPrincipalCV(contractAddress, "impl-trait")
    );

    // call public function as readonly
    output = await callReadOnlyFunction({
      contractName: "test-trait",
      contractAddress,
      functionName: "call-foo",
      functionArgs: [
        contractPrincipalCV(contractAddress, "impl-trait"),
        uintCV(1),
      ],
      network,
      senderAddress: Accounts.WALLET_1.stxAddress,
    });
    expect(output, cvToString(output)).toEqual(responseOkCV(uintCV(1)));

    // Call the public function
    let callTxOptions: SignedContractCallOptions = {
      senderKey: Accounts.WALLET_1.secretKey,
      contractAddress,
      contractName: "test-trait",
      functionName: "call-foo",
      functionArgs: [
        contractPrincipalCV(contractAddress, "impl-trait"),
        uintCV(3),
      ],
      fee,
      network,
      anchorMode: AnchorMode.OnChainOnly,
      postConditionMode: PostConditionMode.Allow,
      nonce: 0,
    };
    let transaction = await makeContractCall(callTxOptions);
    let response = await broadcastTransaction(transaction, network);
    let [_, tx] = await asyncExpectStacksTransactionSuccess(
      orchestrator,
      transaction.txid()
    );
    expect((tx as StacksTransactionMetadata).result).toEqual("(ok u3)");
  });

  it("passing a trait parameter should work not work in Stacks 2.2", async () => {
    const network = new StacksTestnet({
      url: orchestrator.getStacksNodeUrl(),
    });
    const contractAddress = Accounts.DEPLOYER.stxAddress;

    // Wait for the 2.2 activation, then check again
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_3 + 2
    );

    // deploy wrapper
    let deployResponse = await deployContract(
      network,
      Accounts.DEPLOYER.secretKey,
      2,
      "test-trait-wrapper",
      `(define-trait test-trait
        ((foo (uint) (response uint uint))))
      
      (define-public (call-foo (f <test-trait>) (a uint))
        (contract-call? .test-trait call-foo f a)
      )`
    );
    await asyncExpectStacksTransactionSuccess(
      orchestrator,
      deployResponse.transaction.txid()
    );

    // Call public function as readonly
    let output = await callReadOnlyFunction({
      contractName: "test-trait",
      contractAddress,
      functionName: "call-foo",
      functionArgs: [
        contractPrincipalCV(contractAddress, "impl-trait"),
        uintCV(1),
      ],
      network,
      senderAddress: Accounts.WALLET_1.stxAddress,
    });
    expect(output).toEqual(responseOkCV(uintCV(1)));

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
    let callTxOptions = {
      senderKey: Accounts.WALLET_1.secretKey,
      contractAddress,
      contractName: "test-trait",
      functionName: "call-foo",
      functionArgs: [
        contractPrincipalCV(contractAddress, "impl-trait"),
        uintCV(3),
      ],
      fee,
      network,
      anchorMode: AnchorMode.OnChainOnly,
      postConditionMode: PostConditionMode.Allow,
      nonce: 1,
    };
    let transaction = await makeContractCall(callTxOptions);
    await broadcastTransaction(transaction, network);

    let [_, tx] = await waitForStacksTransaction(
      orchestrator,
      transaction.txid()
    );
    expect(tx.result).toEqual("(ok u3)");
  });
});

async function deployContract(
  network: StacksTestnet,
  senderKey: string,
  nonce: number,
  contractName: string,
  codeBody: string
) {
  // Build the transaction to deploy the contract
  let deployTxOptions = {
    senderKey,
    contractName,
    codeBody,
    fee,
    network,
    anchorMode: AnchorMode.OnChainOnly,
    postConditionMode: PostConditionMode.Allow,
    nonce,
    clarityVersion: undefined,
  };

  let transaction = await makeContractDeploy(deployTxOptions);
  let response = await broadcastTransaction(transaction, network);
  expect(response.error).toBeUndefined();
  return { transaction, response };
}
