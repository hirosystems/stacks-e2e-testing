import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksNetwork, StacksTestnet } from "@stacks/network";
import {
  AnchorMode,
  ClarityValue,
  ClarityVersion,
  PostConditionMode,
  TxBroadcastResultOk,
  broadcastTransaction,
  contractPrincipalCV,
  makeContractCall,
  makeContractDeploy,
} from "@stacks/transactions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts, Constants } from "../constants";
import {
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../helpers";
import { expectAccountToBe, getAccount } from "../pox/helpers";

const CONTRACT_TRAIT = `
(define-trait foo
    (
        (lolwut () (response bool uint))
    )
)
`;

const CONTRACT_IMPL_TRAIT = `
(impl-trait .foo.foo)
(define-public (lolwut)
    (ok true)
)
`;

const CONTRACT_TRIGGER_CHECKERROR = `
(use-trait trait .foo.foo)

(define-public (test (ref <trait>))
    (ok (internal (some ref)))
)

(define-private (internal (ref (optional <trait>))) true)
`;

describe("transaction-fee", () => {
  let orchestrator: DevnetNetworkOrchestrator;

  beforeAll(async (ctx) => {
    orchestrator = buildDevnetNetworkOrchestrator(getNetworkIdFromEnv());
    orchestrator.start();
  });

  afterAll(async () => {
    orchestrator.terminate();
  });

  it("fee is charged prior to execution", async (ctx) => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks 2.1 to start
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      Constants.DEVNET_DEFAULT_EPOCH_2_1
    );

    let deploy = deployContract(orchestrator, network);
    let tx_foo = await deploy("foo", CONTRACT_TRAIT, 0);

    expect(tx_foo.description).toBe(
      `deployed: ${Accounts.DEPLOYER.stxAddress}.foo`
    );
    expect(tx_foo.success).toBeTruthy();

    let tx_foo_impl = await deploy("foo-impl", CONTRACT_IMPL_TRAIT, 1);

    expect(tx_foo_impl.description).toBe(
      `deployed: ${Accounts.DEPLOYER.stxAddress}.foo-impl`
    );
    expect(tx_foo_impl.success).toBeTruthy();

    let tx_foo_test = await deploy("foo-test", CONTRACT_TRIGGER_CHECKERROR, 2);

    expect(tx_foo_test.description).toBe(
      `deployed: ${Accounts.DEPLOYER.stxAddress}.foo-test`
    );
    expect(tx_foo_test.success).toBeTruthy();

    let { balance: balanceBeforeFunctionCall } = await getAccount(
      network,
      Accounts.DEPLOYER.stxAddress
    );

    let contractPrincipalArg = contractPrincipalCV(
      Accounts.DEPLOYER.stxAddress,
      "foo-impl"
    );

    let call = callFunction(orchestrator, network);
    let tx_function_call_1 = await call("foo-impl", "lolwut", [], 3);

    call = callFunction(orchestrator, network);
    let tx_function_call_2 = await call(
      "foo-test",
      "test",
      [contractPrincipalArg],
      4
    );

    expect(tx_function_call_1.success).toBeTruthy();
    expect(tx_function_call_2.success).toBeFalsy();

    // Although the function invocation should have failed, the fee should have been charged for both functions
    let expectedBalanceAfterFunctionCall =
      Number(balanceBeforeFunctionCall) - 4000; // 2000 * 2 = fee for two function invocations
    await expectAccountToBe(
      network,
      Accounts.DEPLOYER.stxAddress,
      expectedBalanceAfterFunctionCall,
      0
    );
  });
});

function callFunction(
  orchestrator: DevnetNetworkOrchestrator,
  network: StacksNetwork
) {
  return async (
    contractName: string,
    functionName: string,
    functionArgs: ClarityValue[],
    nonce: number
  ) => {
    let deployTxOptions = {
      senderKey: Accounts.DEPLOYER.secretKey,
      contractAddress: Accounts.DEPLOYER.stxAddress,
      contractName,
      functionName,
      functionArgs,
      fee: 2000,
      network,
      anchorMode: AnchorMode.OnChainOnly,
      postConditionMode: PostConditionMode.Allow,
      nonce,
    };

    let tx = await makeContractCall(deployTxOptions);

    // Broadcast transaction
    let result = await broadcastTransaction(tx, network);
    expect((<TxBroadcastResultOk>result).error).toBeUndefined();

    // Wait for the transaction to be processed
    let [_, transaction] = await waitForStacksTransaction(
      orchestrator,
      tx.txid()
    );
    return transaction;
  };
}

function deployContract(
  orchestrator: DevnetNetworkOrchestrator,
  network: StacksNetwork
) {
  return async (contractName: string, codeBody: string, nonce: number) => {
    let deployTxOptions = {
      senderKey: Accounts.DEPLOYER.secretKey,
      contractName,
      codeBody,
      fee: 2000,
      network,
      anchorMode: AnchorMode.OnChainOnly,
      clarityVersion: ClarityVersion.Clarity1,
      postConditionMode: PostConditionMode.Allow,
      nonce,
    };

    let tx = await makeContractDeploy(deployTxOptions);

    // Broadcast transaction
    let result = await broadcastTransaction(tx, network);
    expect((<TxBroadcastResultOk>result).error).toBeUndefined();

    // Wait for the transaction to be processed
    let [_, transaction] = await waitForStacksTransaction(
      orchestrator,
      tx.txid()
    );
    return transaction;
  };
}
