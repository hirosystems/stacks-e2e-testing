import { StacksNetwork } from "@stacks/network";
import {
  AnchorMode,
  PostConditionMode,
  TxBroadcastResult,
  broadcastTransaction,
  bufferCV,
  makeContractCall,
  noneCV,
  principalCV,
  someCV,
  tupleCV,
  uintCV,
} from "@stacks/transactions";
import { Contracts } from "../constants";

import { toBytes } from "@stacks/common";
import { decodeBtcAddress } from "@stacks/stacking";
import { Account } from "./helpers";
const fetch = require("node-fetch");

export const broadcastDelegateSTX = async (
  poxVersion: number,
  network: StacksNetwork,
  account: Account,
  fee: number,
  nonce: number,
  amount: number,
  poolAddress: string,
  poolRewardAccount?: Account,
  untilBurnHeight?: number
): Promise<TxBroadcastResult> => {
  let poxAddressCV;
  if (poolRewardAccount) {
    const { version, data } = decodeBtcAddress(poolRewardAccount.btcAddress);
    const poxAddress = {
      version: bufferCV(toBytes(new Uint8Array([version.valueOf()]))),
      hashbytes: bufferCV(data),
    };
    poxAddressCV = someCV(tupleCV(poxAddress));
  } else {
    poxAddressCV = noneCV();
  }

  const untilBurnHeightCV = untilBurnHeight
    ? someCV(uintCV(untilBurnHeight))
    : noneCV();

  const txOptions = {
    contractAddress: Contracts.POX_1.address,
    contractName: poxVersion == 1 ? Contracts.POX_1.name : Contracts.POX_2.name,
    functionName: "delegate-stx",
    functionArgs: [
      uintCV(amount),
      principalCV(poolAddress),
      untilBurnHeightCV,
      poxAddressCV,
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

export const broadcastRevokeDelegateStx = async (
  poxVersion: number,
  network: StacksNetwork,
  account: Account,
  fee: number,
  nonce: number
): Promise<TxBroadcastResult> => {
  const txOptions = {
    contractAddress: Contracts.POX_1.address,
    contractName: poxVersion == 1 ? Contracts.POX_1.name : Contracts.POX_2.name,
    functionName: "revoke-delegate-stx",
    functionArgs: [],
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

export const broadcastDelegateStackSTX = async (
  poxVersion: number,
  network: StacksNetwork,
  account: Account,
  fee: number,
  nonce: number,
  stacker: Account,
  amount: number,
  poolRewardAccount: Account,
  startBurnHeight: number,
  lockingPeriodCycles: number
): Promise<TxBroadcastResult> => {
  const { version, data } = decodeBtcAddress(poolRewardAccount.btcAddress);
  const poxAddress = {
    version: bufferCV(toBytes(new Uint8Array([version.valueOf()]))),
    hashbytes: bufferCV(data),
  };
  const poxAddressCV = someCV(tupleCV(poxAddress));

  const txOptions = {
    contractAddress: Contracts.POX_1.address,
    contractName: poxVersion == 1 ? Contracts.POX_1.name : Contracts.POX_2.name,
    functionName: "delegate-stacks-stx",
    functionArgs: [
      principalCV(stacker),
      uintCV(amount),
      poxAddressCV,
      uintCV(startBurnHeight),
      uintCV(lockingPeriodCycles)
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
