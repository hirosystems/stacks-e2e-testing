import {
  DevnetNetworkOrchestrator,
  stacksNodeVersion,
} from "@hirosystems/stacks-devnet-js";
import { StacksNetwork, StacksTestnet } from "@stacks/network";
import {
  AnchorMode,
  PostConditionMode,
  SignedContractCallOptions,
  broadcastTransaction,
  callReadOnlyFunction,
  makeContractCall,
  responseOkCV,
  uintCV,
} from "@stacks/transactions";
import { Accounts, DEFAULT_FEE } from "../constants";
import {
  Account,
  DEFAULT_EPOCH_TIMELINE,
  asyncExpectStacksTransactionSuccess,
  buildDevnetNetworkOrchestrator,
  deployContract,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../helpers";

describe("concrete trait parameter used in a wrapper", () => {
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

  const codeBodyTestTraitWrapper = `(define-public (call-foo (a uint))
  (contract-call? .test-trait call-foo .impl-trait a)
)
`;

  const callReadOnlyTestTraitWrapperCallFo = (
    network: StacksNetwork,
    { a }: { a: number }
  ) => {
    return callReadOnlyFunction({
      contractName: "test-trait-wrapper",
      contractAddress,
      functionName: "call-foo",
      functionArgs: [uintCV(a)],
      network,
      senderAddress: Accounts.WALLET_1.stxAddress,
    });
  };

  const broadcastTestTraitWrapperCallFoo = async (
    network: StacksNetwork,
    sender: Account,
    nonce: number,
    { a }: { a: number }
  ) => {
    let callTxOptions: SignedContractCallOptions = {
      senderKey: sender.secretKey,
      contractAddress,
      contractName: "test-trait-wrapper",
      functionName: "call-foo",
      functionArgs: [uintCV(a)],
      fee: DEFAULT_FEE,
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
      version,
      timeline
    );
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("using a concrete trait parameter should not work in Stacks 2.2", async () => {
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

    //
    // Wait for the 2.2 activation, then check
    //
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_2 + 2
    );

    ({ response, transaction } = await deployContract(
      network,
      Accounts.DEPLOYER,
      2,
      "test-trait-wrapper",
      codeBodyTestTraitWrapper
    ));
    expect(response.error).toBeUndefined();
    await asyncExpectStacksTransactionSuccess(orchestrator, transaction.txid());

    await orchestrator.waitForNextStacksBlock();

    // Call the public function
    ({ response, transaction } = await broadcastTestTraitWrapperCallFoo(
      network,
      Accounts.WALLET_1,
      0,
      { a: 3 }
    ));
    expect(response.error).toBeUndefined();
    let [_, tx] = await waitForStacksTransaction(
      orchestrator,
      transaction.txid()
    );
    expect(tx.result).toEqual("(err none)");

  });

  it("using a concrete trait parameter should work in Stacks 2.3", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
    //
    // Wait for the 2.3 activation, then check again
    //
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_3 + 2
    );

    // Call the public function
    let { response, transaction } = await broadcastTestTraitWrapperCallFoo(
      network,
      Accounts.WALLET_1,
      1,
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
