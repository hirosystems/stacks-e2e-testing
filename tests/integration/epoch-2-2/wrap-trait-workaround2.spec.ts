import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import {
  AnchorMode,
  PostConditionMode,
  broadcastTransaction,
  contractPrincipalCV,
  makeContractCall,
  uintCV,
} from "@stacks/transactions";
import { Accounts } from "../constants";
import {
  DEFAULT_EPOCH_TIMELINE,
  asyncExpectStacksTransactionSuccess,
  buildDevnetNetworkOrchestrator,
  deployContract,
  getNetworkIdFromEnv,
} from "../helpers";

describe("trait parameter with wrapped implementation in Stacks 2.2", () => {
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

  const codeBodyImplTraitWrapper = `(define-public (foo (a uint))
  (contract-call? .impl-trait foo a)
)`;

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator(
      getNetworkIdFromEnv(),
      timeline,
    );
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("work around bug by wrapping the implementor should fail in Stacks 2.2", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    await orchestrator.waitForNextStacksBlock();

    // Deploy a contract defining and using the trait
    let { transaction, response } = await deployContract(
      network,
      Accounts.DEPLOYER,
      0,
      "test-trait",
      codeBodyTestTrait,
    );
    expect(response.error).toBeUndefined();

    ({ transaction, response } = await deployContract(
      network,
      Accounts.DEPLOYER,
      1,
      "impl-trait",
      codeBodyImplTrait,
    ));
    expect(response.error).toBeUndefined();
    let [block, tx] = await asyncExpectStacksTransactionSuccess(
      orchestrator,
      transaction.txid(),
    );

    await orchestrator.waitForNextStacksBlock();

    // Wait for the 2.2 activation, then check again
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_2,
    );

    // Deploy a wrapper contract
    ({ transaction, response } = await deployContract(
      network,
      Accounts.DEPLOYER,
      2,
      "impl-trait-wrapper",
      codeBodyImplTraitWrapper,
    ));
    expect(response.error).toBeUndefined();
    [block, tx] = await asyncExpectStacksTransactionSuccess(
      orchestrator,
      transaction.txid(),
    );

    // Call the public function
    let callTxOptions = {
      senderKey: Accounts.WALLET_1.secretKey,
      contractAddress,
      contractName: "test-trait",
      functionName: "call-foo",
      functionArgs: [
        contractPrincipalCV(contractAddress, "impl-trait-wrapper"),
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
    expect(response.error).toBe("transaction rejected");
  });
});
