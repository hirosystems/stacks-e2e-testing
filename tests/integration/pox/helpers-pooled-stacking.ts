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
import { Account, BroadcastOptionsPox } from "./helpers";
import { BroadcastOptions } from "../helpers";
const fetch = require("node-fetch");

export const broadcastDelegateSTX = async (
  { poxVersion, network, account, fee, nonce }: BroadcastOptionsPox,
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
  let poxContract = Contracts.POX[poxVersion] || Contracts.DEFAULT;

  const untilBurnHeightCV = untilBurnHeight
    ? someCV(uintCV(untilBurnHeight))
    : noneCV();

  const txOptions = {
    contractAddress: poxContract.address,
    contractName: poxContract.name,
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
}: BroadcastOptionsPox): Promise<TxBroadcastResult> => {
  let poxContract = Contracts.POX[poxVersion] || Contracts.DEFAULT;
  const txOptions = {
    contractAddress: poxContract.address,
    contractName: poxContract.name,
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
  { poxVersion, network, account, fee, nonce }: BroadcastOptionsPox,
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
  let poxContract = Contracts.POX[poxVersion] || Contracts.DEFAULT;

  const txOptions = {
    contractAddress: poxContract.address,
    contractName: poxContract.name,
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
  { poxVersion, network, account, fee, nonce }: BroadcastOptionsPox,
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
  let poxContract = Contracts.POX[poxVersion] || Contracts.DEFAULT;

  const txOptions = {
    contractAddress: poxContract.address,
    contractName: poxContract.name,
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
  { poxVersion, network, account, fee, nonce }: BroadcastOptionsPox,
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
  let poxContract = Contracts.POX[poxVersion] || Contracts.DEFAULT;

  const txOptions = {
    contractAddress: poxContract.address,
    contractName: poxContract.name,
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
  { poxVersion, network, account, fee, nonce }: BroadcastOptionsPox,
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
  let poxContract = Contracts.POX[poxVersion] || Contracts.DEFAULT;

  const txOptions = {
    contractAddress: poxContract.address,
    contractName: poxContract.name,
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
  { poxVersion, network, account, fee, nonce }: BroadcastOptionsPox,
  {
    poolRewardAccount,
    cycleId,
    rewardIndex,
  }: { poolRewardAccount: Account; cycleId: number; rewardIndex: number }
): Promise<TxBroadcastResult> => {
  let poxContract = Contracts.POX[poxVersion] || Contracts.DEFAULT;
  const { version, data } = decodeBtcAddress(poolRewardAccount.btcAddress);
  const poxAddress = {
    version: bufferCV(toBytes(new Uint8Array([version.valueOf()]))),
    hashbytes: bufferCV(data),
  };

  const txOptions = {
    contractAddress: poxContract.address,
    contractName: poxContract.name,
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
