import {
  DevnetNetworkOrchestrator,
  StacksTransactionMetadata,
} from "@hirosystems/stacks-devnet-js";
import {
  AnchorMode,
  broadcastTransaction,
  ClarityValue,
  makeContractCall,
  makeContractDeploy,
  PostConditionMode,
  SignedContractCallOptions,
  TxBroadcastResultOk,
} from "@stacks/transactions";
import * as fs from "fs";
import { waitForStacksTransaction } from "../../helpers";
import { StacksNetwork } from "@stacks/network";

export interface Sender {
  secretKey: string;
  stxAddress: string;
}

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const load_versioned = async (
  sender: Sender,
  contractName: string,
  network: StacksNetwork,
  orchestrator: DevnetNetworkOrchestrator,
  version?: number,
  suffix?: string
): Promise<Result<StacksTransactionMetadata>> => {
  let codeBody = fs.readFileSync(
    `tests/integration/clarity/traits/contracts/${contractName}.clar`,
    "utf8"
  );

  // Build the transaction to deploy the contract
  let deployTxOptions = {
    clarityVersion: version,
    senderKey: sender.secretKey,
    contractName: contractName + (suffix ? `-${suffix}` : ""),
    codeBody,
    fee: 2000,
    network,
    anchorMode: AnchorMode.OnChainOnly,
    postConditionMode: PostConditionMode.Allow,
  };

  let transaction = await makeContractDeploy(deployTxOptions);

  // Broadcast transaction
  let result = await broadcastTransaction(transaction, network);
  if ((<TxBroadcastResultOk>result).error) {
    return { ok: false, error: Error((<TxBroadcastResultOk>result).error) };
  }

  // Wait for the transaction to be processed
  let [_, tx] = await waitForStacksTransaction(
    orchestrator,
    transaction.txid()
  );
  if (!tx.success) {
    return { ok: false, error: Error(tx.description) };
  } else {
    return { ok: true, value: tx };
  }
};

export const contract_call = async (
  sender: Sender,
  contractAddress: string,
  contractName: string,
  functionName: string,
  functionArgs: ClarityValue[],
  network: StacksNetwork,
  orchestrator: DevnetNetworkOrchestrator
): Promise<Result<StacksTransactionMetadata>> => {
  // Build a transaction to call the contract
  let callTxOptions: SignedContractCallOptions = {
    senderKey: sender.secretKey,
    contractAddress,
    contractName,
    functionName,
    functionArgs,
    fee: 2000,
    network,
    anchorMode: AnchorMode.OnChainOnly,
    postConditionMode: PostConditionMode.Allow,
  };
  let transaction = await makeContractCall(callTxOptions);

  // Broadcast transaction
  let result = await broadcastTransaction(transaction, network);
  if ((<TxBroadcastResultOk>result).error) {
    return { ok: false, error: Error((<TxBroadcastResultOk>result).error) };
  }

  // Wait for the transaction to be processed
  let [_, tx] = await waitForStacksTransaction(
    orchestrator,
    transaction.txid()
  );
  if (!tx.success) {
    return { ok: false, error: Error(tx.description) };
  } else {
    return { ok: true, value: tx };
  }
};
