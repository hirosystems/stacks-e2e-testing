import {
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  TxBroadcastResultOk,
  makeContractCall,
  SignedContractCallOptions,
} from "@stacks/transactions";
import { StacksNetwork, StacksTestnet } from "@stacks/network";
import { Accounts, Constants } from "../../constants";
import {
  buildDevnetNetworkOrchestrator,
  getBitcoinBlockHeight,
  waitForStacksTransaction,
  getNetworkIdFromCtx,
  getChainInfo,
} from "../../helpers";
import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { describe, expect, it, beforeAll, afterAll } from 'vitest'

const STACKS_2_1_EPOCH = 112;

describe("use", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let network: StacksNetwork;

  beforeAll(async (ctx) => {
    let networkId = getNetworkIdFromCtx(ctx.id);
    orchestrator = buildDevnetNetworkOrchestrator(networkId,
      {
        epoch_2_0: 100,
        epoch_2_05: 102,
        epoch_2_1: STACKS_2_1_EPOCH,
        pox_2_activation: 120,
      },
      false
    );
    orchestrator.start();
    network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
  });

  afterAll(async () => {
    orchestrator.terminate();
  });

  const codeBody = `(define-trait foo (
    (foo (<bar>) (response bool bool))
  ))
  
  (define-trait bar (
    (bar (<baz>) (response bool bool))
  ))
  
  (define-trait baz (
  ))`;

  describe("in 2.05", () => {
    afterAll(async () => {
      // Make sure this we stayed in 2.05
    let chainInfo = await getChainInfo(network);
    expect(chainInfo.burn_block_height).toBeLessThanOrEqual(
      STACKS_2_1_EPOCH
    );
    });

    it("use traits out of order", async () => {
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "out-of-order-trait",
        codeBody,
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
      };

      let transaction = await makeContractDeploy(deployTxOptions);

      // Broadcast transaction
      let result = await broadcastTransaction(transaction, network);
      expect((<TxBroadcastResultOk>result).error).toBeUndefined();

      // Wait for the transaction to be processed
      let [block, tx] = await waitForStacksTransaction(
        orchestrator,
        Accounts.DEPLOYER.stxAddress
      );
      expect(tx.description).toBe(
        `deployed: ${Accounts.DEPLOYER.stxAddress}.out-of-order-trait`
      );
      // expect(tx.success).toBeFalsy(); // todo(brice)
    });
  });

  describe("in 2.1", () => {
    beforeAll(async () => {
      // Wait for 2.1 to go live
      await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(STACKS_2_1_EPOCH)
    });

    it("use traits out of order", async () => {
      // Build the transaction to deploy the contract
      let deployTxOptions = {
        senderKey: Accounts.DEPLOYER.secretKey,
        contractName: "out-of-order-trait-2",
        codeBody,
        fee: 2000,
        network,
        anchorMode: AnchorMode.OnChainOnly,
        postConditionMode: PostConditionMode.Allow,
      };

      let transaction = await makeContractDeploy(deployTxOptions);

      // Broadcast transaction
      let result = await broadcastTransaction(transaction, network);
      expect((<TxBroadcastResultOk>result).error).toBeUndefined();

      // Wait for the transaction to be processed
      let [block, tx] = await waitForStacksTransaction(
        orchestrator,
        Accounts.DEPLOYER.stxAddress
      );
      expect(tx.description).toBe(
        `deployed: ${Accounts.DEPLOYER.stxAddress}.out-of-order-trait-2`
      );
      // expect(tx.success).toBeFalsy(); // todo(brice)
    });
  });
});
