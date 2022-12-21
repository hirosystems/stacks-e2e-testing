import {
    makeContractDeploy,
    broadcastTransaction,
    AnchorMode,
    PostConditionMode,
    TxBroadcastResultOk,
    makeContractCall,
    SignedContractCallOptions,
    ClarityVersion,
    ClarityValue,
    createLPString,
    contractPrincipalCV,
} from "@stacks/transactions";
import { StacksNetwork, StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../constants";
import { getAccount, expectAccountToBe } from '../pox/helpers'
import { principalCV } from "@stacks/transactions/dist/clarity/types/principalCV";
import {
    buildDevnetNetworkOrchestrator,
    waitForStacksTransaction,
} from "../helpers";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { describe, expect, it, test, beforeAll, afterAll } from 'vitest'

const CONTRACT_TRAIT = `
(define-trait foo
    (
        (lolwut () (response bool uint))
    )
)
`

const CONTRACT_IMPL_TRAIT = `
(impl-trait .foo.foo)
(define-public (lolwut)
    (ok true)
)
`

const CONTRACT_TRIGGER_CHECKERROR = `
(use-trait trait .foo.foo)

(define-public (test (ref <trait>))
    (ok (internal (some ref)))
)

(define-private (internal (ref (optional <trait>))) true)
`

describe("transaction-fee", () => {

    test("fee is charged prior to execution", async () => {
        const orchestrator = buildDevnetNetworkOrchestrator(3);
        orchestrator.start();
        const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

        // Wait for Stacks 2.1 to start
        await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(Constants.DEVNET_DEFAULT_EPOCH_2_1);

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

        //TODO: Get balance of current user. Call foo-test. Verify test failure, check balance after execution.
        let {balance: balanceBeforeFunctionCall} = await getAccount (network, Accounts.DEPLOYER.stxAddress);
        await expectAccountToBe (network, Accounts.DEPLOYER.stxAddress, balanceBeforeFunctionCall, 0);

        let contractPrincipalArg = contractPrincipalCV(
          Accounts.DEPLOYER.stxAddress,
          "foo-impl",
        );
    
        let contractName = "foo-test";
        let functionName = "test";
        let functionArgs = [contractPrincipalArg];

        let tx_function_call = await callFunction(orchestrator, network)(contractName, functionName, functionArgs, 4);
        console.log(tx_function_call);
        
        //TODO: Expect test to fail

        // Although the function invocation should have failed, the fee should have been charged
        let expectedBalanceAfterFunctionCall = balanceBeforeFunctionCall - 2000;
        await expectAccountToBe (network, Accounts.DEPLOYER.stxAddress, expectedBalanceAfterFunctionCall, 0);

        orchestrator.terminate();
    });
});

function callFunction(orchestrator : DevnetNetworkOrchestrator, network : StacksNetwork) {
    return async (contractName: string, functionName: string, functionArgs: ClarityValue[], nonce: number) => {
        let deployTxOptions = {
            senderKey: Accounts.DEPLOYER.secretKey,
            contractAddress: Accounts.DEPLOYER.stxAddress,
            contractName,
            functionName,
            functionArgs,
            fee: 2000,
            network,
            anchorMode: AnchorMode.OnChainOnly,
            clarityVersion: ClarityVersion.Clarity1,
            postConditionMode: PostConditionMode.Allow,
            nonce,
        };

        let tx = await makeContractCall(deployTxOptions);
        
        // Broadcast transaction
        let result = await broadcastTransaction(tx, network);
        expect((<TxBroadcastResultOk>result).error).toBeUndefined();

        // Wait for the transaction to be processed
        let [ _, transaction] = await waitForStacksTransaction(
            orchestrator,
            tx.txid()
        );
        return tx;
    }
}

function deployContract(orchestrator : DevnetNetworkOrchestrator, network : StacksNetwork) {
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
        let [ _, transaction] = await waitForStacksTransaction(
            orchestrator,
            tx.txid()
        );
        return transaction;
    }
}
