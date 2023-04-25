import { StacksNetwork } from "@stacks/network";
import {
  AnchorMode,
  PostConditionMode,
  TxBroadcastResult,
  broadcastTransaction,
  bufferCV,
  makeContractCall,
  tupleCV,
  uintCV,
} from "@stacks/transactions";
import { Contracts } from "../constants";

import { toBytes } from "@stacks/common";
import { decodeBtcAddress } from "@stacks/stacking";
import { BroadcastOptionsPox } from "./helpers";
import { BroadcastOptions } from "../helpers";
const fetch = require("node-fetch");

export const broadcastStackSTX = async (
  { poxVersion, network, account, fee, nonce }: BroadcastOptionsPox,
  {
    amount,
    blockHeight,
    cycles,
  }: { amount: number; blockHeight: number; cycles: number }
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
  { network, account, fee, nonce }: BroadcastOptions,
  { amount }: { amount: number }
): Promise<TxBroadcastResult> => {
  const txOptions = {
    contractAddress: Contracts.POX_2.address,
    contractName: Contracts.POX_2.name,
    functionName: "stack-increase",
    functionArgs: [uintCV(amount)],
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
  { network, account, fee, nonce }: BroadcastOptions,
  { cycles }: { cycles: number }
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
    functionArgs: [uintCV(cycles), tupleCV(address)],
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
