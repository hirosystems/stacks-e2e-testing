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
import { Account, BroadcastOptions, BroadcastOptionsPox2 } from "./helpers";
const fetch = require("node-fetch");

export const broadcastDelegateSTX = async (
  { poxVersion, network, account, fee, nonce }: BroadcastOptions,
  {
    amount,
    poolAddress,
    poolRewardAccount,
    untilBurnHeight,
  }: {
    amount: number;
    poolAddress: Account;
    poolRewardAccount?: Account;
    untilBurnHeight?: number;
  }
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
      principalCV(poolAddress.stxAddress),
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

export const broadcastRevokeDelegateStx = async ({
  poxVersion,
  network,
  account,
  fee,
  nonce,
}: BroadcastOptions): Promise<TxBroadcastResult> => {
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
  { poxVersion, network, account, fee, nonce }: BroadcastOptions,
  {
    stacker,
    amount,
    poolRewardAccount,
    startBurnHeight,
    lockPeriodCycles,
  }: {
    stacker: Account;
    amount: number;
    poolRewardAccount: Account;
    startBurnHeight: number;
    lockPeriodCycles: number;
  }
): Promise<TxBroadcastResult> => {
  const { version, data } = decodeBtcAddress(poolRewardAccount.btcAddress);
  const poxAddress = {
    version: bufferCV(toBytes(new Uint8Array([version.valueOf()]))),
    hashbytes: bufferCV(data),
  };

  const txOptions = {
    contractAddress: Contracts.POX_1.address,
    contractName: poxVersion == 1 ? Contracts.POX_1.name : Contracts.POX_2.name,
    functionName: "delegate-stack-stx",
    functionArgs: [
      principalCV(stacker.stxAddress),
      uintCV(amount),
      tupleCV(poxAddress),
      uintCV(startBurnHeight),
      uintCV(lockPeriodCycles),
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

export const broadcastDelegateStackExtend = async (
  { poxVersion, network, account, fee, nonce }: BroadcastOptions,
  {
    stacker,
    poolRewardAccount,
    extendByCount,
  }: { stacker: Account; poolRewardAccount: Account; extendByCount: number }
): Promise<TxBroadcastResult> => {
  const { version, data } = decodeBtcAddress(poolRewardAccount.btcAddress);
  const poxAddress = {
    version: bufferCV(toBytes(new Uint8Array([version.valueOf()]))),
    hashbytes: bufferCV(data),
  };

  const txOptions = {
    contractAddress: Contracts.POX_1.address,
    contractName: poxVersion == 1 ? Contracts.POX_1.name : Contracts.POX_2.name,
    functionName: "delegate-stack-extend",
    functionArgs: [
      principalCV(stacker.stxAddress),
      tupleCV(poxAddress),
      uintCV(extendByCount),
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

export const broadcastDelegateStackIncrease = async (
  { poxVersion, network, account, fee, nonce }: BroadcastOptions,
  {
    stacker,
    poolRewardAccount,
    increaseByAmountUstx,
  }: {
    stacker: Account;
    poolRewardAccount: Account;
    increaseByAmountUstx: number;
  }
): Promise<TxBroadcastResult> => {
  const { version, data } = decodeBtcAddress(poolRewardAccount.btcAddress);
  const poxAddress = {
    version: bufferCV(toBytes(new Uint8Array([version.valueOf()]))),
    hashbytes: bufferCV(data),
  };

  const txOptions = {
    contractAddress: Contracts.POX_1.address,
    contractName: poxVersion == 1 ? Contracts.POX_1.name : Contracts.POX_2.name,
    functionName: "delegate-stack-increase",
    functionArgs: [
      principalCV(stacker.stxAddress),
      tupleCV(poxAddress),
      uintCV(increaseByAmountUstx),
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

/**
 * Broadcasts a transaction for stack-aggregation-commit-indexed (poxVersion 2) or
 * stack-aggregation-commit (poxVersion 1)
 * @param poxVersion
 * @param network
 * @param account
 * @param fee
 * @param nonce
 * @param poolRewardAccount
 * @param cycleId
 * @returns
 */
export const broadcastStackAggregationCommitIndexed = async (
  { poxVersion, network, account, fee, nonce }: BroadcastOptions,
  {
    poolRewardAccount,
    cycleId,
  }: { poolRewardAccount: Account; cycleId: number }
): Promise<TxBroadcastResult> => {
  const { version, data } = decodeBtcAddress(poolRewardAccount.btcAddress);
  const poxAddress = {
    version: bufferCV(toBytes(new Uint8Array([version.valueOf()]))),
    hashbytes: bufferCV(data),
  };

  const txOptions = {
    contractAddress: Contracts.POX_1.address,
    contractName: poxVersion == 1 ? Contracts.POX_1.name : Contracts.POX_2.name,
    functionName:
      poxVersion == 1
        ? "stack-aggregation-commit"
        : "stack-aggregation-commit-indexed",
    functionArgs: [tupleCV(poxAddress), uintCV(cycleId)],
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

export const broadcastStackAggregationIncrease = async (
  { network, account, fee, nonce }: BroadcastOptionsPox2,
  {
    poolRewardAccount,
    cycleId,
    rewardIndex,
  }: { poolRewardAccount: Account; cycleId: number; rewardIndex: number }
): Promise<TxBroadcastResult> => {
  const { version, data } = decodeBtcAddress(poolRewardAccount.btcAddress);
  const poxAddress = {
    version: bufferCV(toBytes(new Uint8Array([version.valueOf()]))),
    hashbytes: bufferCV(data),
  };

  const txOptions = {
    contractAddress: Contracts.POX_2.address,
    contractName: Contracts.POX_2.name,
    functionName: "stack-aggregation-increase",
    functionArgs: [tupleCV(poxAddress), uintCV(cycleId), uintCV(rewardIndex)],
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
