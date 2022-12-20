import {
    makeContractDeploy,
    broadcastTransaction,
    AnchorMode,
    PostConditionMode,
    TxBroadcastResultOk,
    makeContractCall,
    SignedContractCallOptions,
    ClarityVersion,
} from "@stacks/transactions";
import { StacksNetwork, StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../../constants";
import { principalCV } from "@stacks/transactions/dist/clarity/types/principalCV";
import {
    buildDevnetNetworkOrchestrator,
    waitForStacksChainUpdate,
    waitForStacksTransaction,
} from "../../helpers";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";

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
        const orchestrator = buildDevnetNetworkOrchestrator();
        orchestrator.start();
        const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

        // Wait for Stacks 2.1 to start
        waitForStacksChainUpdate(orchestrator, Constants.DEVNET_DEFAULT_EPOCH_2_1);

        let deploy = deployContract(orchestrator, network);
        let tx_foo = await deploy("foo", CONTRACT_TRAIT);

        expect(tx_foo.description).toBe(
            `deployed: ${Accounts.DEPLOYER.stxAddress}.foo`
        );
        expect(tx_foo.success).toBeTruthy();
        
        let tx_foo_impl = await deploy("foo-impl", CONTRACT_IMPL_TRAIT);

        expect(tx_foo_impl.description).toBe(
            `deployed: ${Accounts.DEPLOYER.stxAddress}.foo-impl`
        );
        expect(tx_foo_impl.success).toBeTruthy();
        
        let tx_foo_test = await deploy("foo-test", CONTRACT_TRIGGER_CHECKERROR);

        expect(tx_foo_test.description).toBe(
            `deployed: ${Accounts.DEPLOYER.stxAddress}.foo-test`
        );
        expect(tx_foo_test.success).toBeTruthy();

        orchestrator.stop();
    });
});

function deployContract(orchestrator : DevnetNetworkOrchestrator, network : StacksNetwork) {
    return async (contractName : string, codeBody : string) => {
        let deployTxOptions = {
            senderKey: Accounts.DEPLOYER.secretKey,
            contractName,
            codeBody,
            fee: 2000,
            network,
            anchorMode: AnchorMode.OnChainOnly,
            clarityVersion: ClarityVersion.Clarity1,
            postConditionMode: PostConditionMode.Allow,
        };

        let transaction = await makeContractDeploy(deployTxOptions);

        // Broadcast transaction
        let result = await broadcastTransaction(transaction, network);
        expect((<TxBroadcastResultOk>result).error).toBeUndefined();

        // Wait for the transaction to be processed
        let [_block, tx] = waitForStacksTransaction(
            orchestrator,
            Accounts.DEPLOYER.stxAddress
        );
        return tx;
    }
}
