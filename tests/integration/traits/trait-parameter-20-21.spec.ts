import {
  DevnetNetworkOrchestrator,
  StacksTransactionMetadata,
} from "@hirosystems/stacks-devnet-js";
import { StacksNetwork, StacksTestnet } from "@stacks/network";
import {
  AnchorMode,
  PostConditionMode,
  SignedContractCallOptions,
  broadcastTransaction,
  callReadOnlyFunction,
  contractPrincipalCV,
  cvToString,
  makeContractCall,
  responseOkCV,
  uintCV,
} from "@stacks/transactions";
import { Accounts } from "../constants";
import {
  Account,
  DEFAULT_EPOCH_TIMELINE,
  asyncExpectStacksTransactionSuccess,
  buildDevnetNetworkOrchestrator,
  deployContract,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../helpers";
import { errorToCV } from "../pox/helpers";

const fee = 2000;

describe("trait user deployed in 2.0, trait implementer deployed in 2.1", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  const timeline = {
    ...DEFAULT_EPOCH_TIMELINE,
    epoch_2_2: 118,
  };

  const contractAddress = Accounts.DEPLOYER.stxAddress;

  const codeBodyTestTrait = `(define-trait test-trait
  ((foo (uint) (response uint uint))))

(define-read-only (foo-arg (f <test-trait>))
  (contract-of f)
)

(define-public (call-foo (f <test-trait>) (a uint))
  (contract-call? f foo a)
)`;

  const codeBodyImplTrait = `(define-public (foo (a uint))
(ok a)
)`;

  const callReadOnlyTestTraitFooArg = (network: StacksNetwork) => {
    return callReadOnlyFunction({
      contractName: "test-trait",
      contractAddress,
      functionName: "foo-arg",
      functionArgs: [contractPrincipalCV(contractAddress, "impl-trait")],
      network,
      senderAddress: Accounts.WALLET_1.stxAddress,
    });
  };

  const callReadOnlyTestTraitCallFoo = (
    network: StacksNetwork,
    { a }: { a: number }
  ) => {
    return callReadOnlyFunction({
      contractName: "test-trait",
      contractAddress,
      functionName: "call-foo",
      functionArgs: [
        contractPrincipalCV(contractAddress, "impl-trait"),
        uintCV(a),
      ],
      network,
      senderAddress: Accounts.WALLET_1.stxAddress,
    });
  };

  const broadcastTestImplCallFoo = async (
    network: StacksNetwork,
    sender: Account,
    nonce: number,
    { a }: { a: number }
  ) => {
    let callTxOptions: SignedContractCallOptions = {
      senderKey: sender.secretKey,
      contractAddress,
      contractName: "test-trait",
      functionName: "call-foo",
      functionArgs: [
        contractPrincipalCV(contractAddress, "impl-trait"),
        uintCV(a),
      ],
      fee,
      network,
      anchorMode: AnchorMode.OnChainOnly,
      postConditionMode: PostConditionMode.Allow,
      nonce,
    };
    let transaction = await makeContractCall(callTxOptions);
    let response = await broadcastTransaction(transaction, network);
    return { transaction, response };
  };

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator(
      getNetworkIdFromEnv(),
      timeline
    );
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("passing a trait parameter should work in Stacks 2.1", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    await orchestrator.waitForNextStacksBlock();

    let { response, transaction } = await deployContract(
      network,
      Accounts.DEPLOYER,
      0,
      "test-trait",
      codeBodyTestTrait
    );
    expect(response.error).toBeUndefined();
    await asyncExpectStacksTransactionSuccess(orchestrator, transaction.txid());

    // Wait for the 2.1 activation
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_1
    );

    ({ response, transaction } = await deployContract(
      network,
      Accounts.DEPLOYER,
      1,
      "impl-trait",
      codeBodyImplTrait
    ));
    expect(response.error).toBeUndefined();
    await asyncExpectStacksTransactionSuccess(orchestrator, transaction.txid());

    await orchestrator.waitForNextStacksBlock();

    // Call the readonly function
    let output = await callReadOnlyTestTraitFooArg(network);
    expect(output, cvToString(output)).toEqual(
      contractPrincipalCV(contractAddress, "impl-trait")
    );

    // call public function as readonly
    output = await callReadOnlyTestTraitCallFoo(network, { a: 1 });
    expect(output, cvToString(output)).toEqual(responseOkCV(uintCV(1)));

    // Call the public function
    ({ response, transaction } = await broadcastTestImplCallFoo(
      network,
      Accounts.WALLET_1,
      0,
      { a: 1 }
    ));
    expect(response.error).toBeUndefined();
    let [_, tx] = await asyncExpectStacksTransactionSuccess(
      orchestrator,
      transaction.txid()
    );
    expect((tx as StacksTransactionMetadata).result).toEqual("(ok u1)");
  });

  it("passing a trait parameter should not work in Stacks 2.2", async () => {
    const network = new StacksTestnet({
      url: orchestrator.getStacksNodeUrl(),
    });

    // Wait for the 2.2 activation, then check again
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_2 + 2
    );

    // Call the readonly function
    let output = await callReadOnlyTestTraitFooArg(network).catch((e: Error) =>
      errorToCV(e)
    );

    expect(cvToString(output), cvToString(output)).toContain(
      "Unchecked(TypeValueError(TraitReferenceType"
    );

    // call public function as readonly
    output = await callReadOnlyTestTraitCallFoo(network, { a: 2 }).catch(
      (e: Error) => errorToCV(e)
    );

    expect(cvToString(output), cvToString(output)).toContain(
      "Unchecked(TypeValueError(TraitReferenceType"
    );

    // Call the public function
    let { response } = await broadcastTestImplCallFoo(
      network,
      Accounts.WALLET_1,
      1,
      { a: 2 }
    );
    expect(response.error).toEqual("transaction rejected");
  });

  it("passing a trait parameter should work in Stacks 2.3", async () => {
    const network = new StacksTestnet({
      url: orchestrator.getStacksNodeUrl(),
    });
    // Wait for the 2.3 activation, then check again
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_3 + 2
    );

    // Call the readonly function
    let output = await callReadOnlyTestTraitFooArg(network);
    expect(output).toEqual(contractPrincipalCV(contractAddress, "impl-trait"));

    // call public function as readonly
    output = await callReadOnlyTestTraitCallFoo(network, { a: 3 });
    expect(output).toEqual(responseOkCV(uintCV(3)));

    // Call the public function
    let { response, transaction } = await broadcastTestImplCallFoo(
      network,
      Accounts.WALLET_1,
      1, // use nonce again
      { a: 3 }
    );
    expect(response.error).toBeUndefined();
    let [_, tx] = await waitForStacksTransaction(
      orchestrator,
      transaction.txid()
    );
    expect(tx.result).toEqual("(ok u3)");
  });
});
