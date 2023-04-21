import { Contracts } from "../constants";
import {
  StacksChainUpdate,
  DevnetNetworkOrchestrator,
  StacksTransactionMetadata,
} from "@hirosystems/stacks-devnet-js";
import { StacksNetwork } from "@stacks/network";
import {
  AnchorMode,
  broadcastTransaction,
  bufferCV,
  getNonce,
  makeContractCall,
  PostConditionMode,
  tupleCV,
  TxBroadcastResult,
  uintCV,
} from "@stacks/transactions";

import { decodeBtcAddress } from "@stacks/stacking";
import { toBytes } from "@stacks/common";
import { expect } from "vitest";
import { Account } from "./helpers";
const fetch = require("node-fetch");

export const broadcastStackSTX = async (
  poxVersion: number,

  network: StacksNetwork,
  amount: number,
  account: Account,
  blockHeight: number,
  cycles: number,
  fee: number,
  nonce: number
): Promise<TxBroadcastResult> => {
  const { version, data } = decodeBtcAddress(account.btcAddress);
  const address = {
    version: bufferCV(toBytes(new Uint8Array([version.valueOf()]))),
    hashbytes: bufferCV(data),
  };

  const txOptions = {
    contractAddress: Contracts.POX_1.address,
    contractName: poxVersion == 1 ? Contracts.POX_1.name : Contracts.POX_2.name,
    functionName: "stack-stx",
    functionArgs: [
      uintCV(amount),
      tupleCV(address),
      uintCV(blockHeight),
      uintCV(cycles),
    ],
    fee,
    nonce,
    network,
    anchorMode: AnchorMode.OnChainOnly,
    postConditionMode: PostConditionMode.Allow,
    senderKey: account.secretKey,
  };
  const tx = await makeContractCall(txOptions);
  // Broadcast transaction to our Devnet stacks node
  const result = await broadcastTransaction(tx, network);
  return result;
};

export const broadcastStackIncrease = async (
  network: StacksNetwork,
  amount: number,
  account: Account,
  fee: number,
  nonce: number
): Promise<TxBroadcastResult> => {

  const txOptions = {
    contractAddress: Contracts.POX_2.address,
    contractName: Contracts.POX_2.name,
    functionName: "stack-increase",
    functionArgs: [
      uintCV(amount),
    ],
    fee,
    nonce,
    network,
    anchorMode: AnchorMode.OnChainOnly,
    postConditionMode: PostConditionMode.Allow,
    senderKey: account.secretKey,
  };
  const tx = await makeContractCall(txOptions);
  // Broadcast transaction to our Devnet stacks node
  const result = await broadcastTransaction(tx, network);
  return result;
};

export const broadcastStackExtend = async (
  network: StacksNetwork,
  account: Account,
  cycles: number,
  fee: number,
  nonce: number
): Promise<TxBroadcastResult> => {
  const { version, data } = decodeBtcAddress(account.btcAddress);
  const address = {
    version: bufferCV(toBytes(new Uint8Array([version.valueOf()]))),
    hashbytes: bufferCV(data),
  };

  const txOptions = {
    contractAddress: Contracts.POX_2.address,
    contractName: Contracts.POX_2.name,
    functionName: "stack-extend",
    functionArgs: [
      tupleCV(address),
      uintCV(cycles),
    ],
    fee,
    nonce,
    network,
    anchorMode: AnchorMode.OnChainOnly,
    postConditionMode: PostConditionMode.Allow,
    senderKey: account.secretKey,
  };
  const tx = await makeContractCall(txOptions);
  // Broadcast transaction to our Devnet stacks node
  const result = await broadcastTransaction(tx, network);
  return result;
};
