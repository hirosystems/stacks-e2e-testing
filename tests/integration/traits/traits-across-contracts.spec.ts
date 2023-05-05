import {
  DevnetNetworkOrchestrator,
  StacksTransactionMetadata,
} from "@hirosystems/stacks-devnet-js";
import { StacksNetwork, StacksTestnet } from "@stacks/network";
import {
  AnchorMode,
  BadFunctionArgumentRejection,
  PostConditionMode,
  SignedContractCallOptions,
  broadcastTransaction,
  callReadOnlyFunction,
  contractPrincipalCV,
  cvToString,
  makeContractCall,
  makeContractDeploy,
  responseErrorCV,
  responseOkCV,
  someCV,
  stringAsciiCV,
  stringCV,
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
import { errorToCV } from "../pox/helpers";

describe("traits across contracts", () => {
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

  const codeBodyMetaContract = `(use-trait test-trait .test-trait.test-trait)
(define-trait meta-trait
    ((call-foo (<test-trait> uint) (response uint uint))))  

(define-map contracts principal principal)

(define-public (register (optional-f (optional <meta-trait>)))
  (ok (match optional-f f (map-set contracts (contract-of f) (contract-of f)) true))
)`;

  const broadcastMetaContractRegister = async (
    network: StacksNetwork,
    sender: Account,
    nonce: number,
    { traitImplName }: { traitImplName: string }
  ) => {
    let callTxOptions: SignedContractCallOptions = {
      senderKey: sender.secretKey,
      contractAddress,
      contractName: "meta-contract",
      functionName: "register",
      functionArgs: [
        someCV(contractPrincipalCV(contractAddress, traitImplName)),
      ],
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
      timeline
    );
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("wrapped trait should be be accepted as parameter in Stacks 2.1", async () => {
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
      "test-trait-2",
      codeBodyTestTrait
    ));
    expect(response.error).toBeUndefined();
    await asyncExpectStacksTransactionSuccess(orchestrator, transaction.txid());

    ({ response, transaction } = await deployContract(
      network,
      Accounts.DEPLOYER,
      2,
      "meta-contract",
      codeBodyMetaContract
    ));
    expect(response.error).toBeUndefined();
    await asyncExpectStacksTransactionSuccess(orchestrator, transaction.txid());

    await orchestrator.waitForNextStacksBlock();

    // Call the public function
    ({ response, transaction } = await broadcastMetaContractRegister(
      network,
      Accounts.WALLET_1,
      0,
      { traitImplName: "test-trait" }
    ));
    // assert (ok true)
    expect(
      response.error,
      JSON.stringify(response.reason_data) + JSON.stringify(response.reason)
    ).toBeUndefined();
    let [_, tx] = await asyncExpectStacksTransactionSuccess(
      orchestrator,
      transaction.txid()
    );
    expect((tx as StacksTransactionMetadata).result).toEqual("(ok true)");

    ({ response, transaction } = await broadcastMetaContractRegister(
      network,
      Accounts.WALLET_1,
      1,
      { traitImplName: "test-trait-2" }
    ));
    expect(response.error).toBe("transaction rejected");
    expect(response.reason).toBe("BadFunctionArgument");
    expect(
      (response as BadFunctionArgumentRejection).reason_data?.message
    ).toBe('BadTraitImplementation("meta-trait", "call-foo")');
  });
});
