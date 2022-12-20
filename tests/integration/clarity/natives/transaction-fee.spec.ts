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

describe("transaction-fee", () => {

    test("fee is charged prior to execution", async () => {
        const orchestrator = buildDevnetNetworkOrchestrator();
        orchestrator.start();
        const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

        // Wait for Stacks 2.1 to start
        waitForStacksChainUpdate(orchestrator, Constants.DEVNET_DEFAULT_EPOCH_2_1);

        let deploy = deployContract(orchestrator, network);
        let tx = await deploy("test-2-1", "(define-public (test (p bool)) (ok p))");

        expect(tx.description).toBe(
            `deployed: ${Accounts.DEPLOYER.stxAddress}.test-2-1`
        );
    
        expect(tx.success).toBeTruthy();

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
