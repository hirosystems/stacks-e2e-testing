import {
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  TxBroadcastResultOk,
  makeContractCall,
  SignedContractCallOptions,
  sponsorTransaction,
} from "@stacks/transactions";
import { StacksNetwork, StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  waitForStacksTransaction,
  getNetworkIdFromEnv,
  getChainInfo,
  FAST_FORWARD_TO_EPOCH_2_4,
} from "../../helpers";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";

describe("tenure-height", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let network: StacksNetwork;

  let networkId: number;

  beforeAll(() => {
    networkId = getNetworkIdFromEnv();
    console.log(`network #${networkId}`);
    orchestrator = buildDevnetNetworkOrchestrator(networkId);
    orchestrator.start();
    network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  const codeBody = `(define-public (test-1)
    (ok tenure-height)
)`;

  it("is invalid before 2.5", async () => {
    // Build the transaction to deploy the contract
    const contractName = "test-2-4";
    let deployTxOptions = {
      senderKey: Accounts.DEPLOYER.secretKey,
      contractName,
      codeBody,
      fee: 2000,
      network,
      anchorMode: AnchorMode.OnChainOnly,
      postConditionMode: PostConditionMode.Allow,
      nonce: 0,
      clarityVersion: undefined,
    };

    let transaction = await makeContractDeploy(deployTxOptions);

    // Broadcast transaction
    let result = await broadcastTransaction(transaction, network);
    if (result.error) {
      console.log(result);
    }
    expect((<TxBroadcastResultOk>result).error).toBeUndefined();

    // Wait for the transaction to be processed
    let [block, tx] = await waitForStacksTransaction(
      orchestrator,
      transaction.txid(),
    );
    expect(block.bitcoin_anchor_block_identifier.index).toBeLessThanOrEqual(
      Constants.DEVNET_DEFAULT_EPOCH_2_5,
    );
    expect(tx.description).toBe(
      `deployed: ${Accounts.DEPLOYER.stxAddress}.${contractName}`,
    );
    expect(tx.success).toBeFalsy();
  });

  describe("in 2.5", () => {
    beforeAll(async () => {
      // Wait for 2.5 to go live
      await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
        Constants.DEVNET_DEFAULT_EPOCH_2_5,
      );
      await orchestrator.waitForNextStacksBlock();
    });

    it("is valid", async () => {
      const contractName = "test-2-5";
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName,
        codeBody,
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
        nonce: 1,
      };

      let transaction = await makeContractDeploy(deployTxOptions);

      // Broadcast transaction
      let result = await broadcastTransaction(transaction, network);
      if (result.error) {
        console.log(result);
      }
      expect((<TxBroadcastResultOk>result).error).toBeUndefined();

      // Wait for the transaction to be processed
      let [block, tx] = await waitForStacksTransaction(
        orchestrator,
        transaction.txid(),
      );
      expect(tx.description).toBe(
        `deployed: ${Accounts.DEPLOYER.stxAddress}.${contractName}`,
      );
      expect(tx.success).toBeTruthy();
    });
  });
});
