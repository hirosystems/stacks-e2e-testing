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

import { decodeBtcAddress } from "@stacks/stacking";
import { BroadcastOptionsPox } from "./helpers";

export const broadcastStackSTX = async (
  { poxVersion, network, account, fee, nonce }: BroadcastOptionsPox,
  {
    amount,
    blockHeight,
    cycles,
  }: { amount: number; blockHeight: number; cycles: number },
): Promise<TxBroadcastResult> => {
  const { version, data } = decodeBtcAddress(account.btcAddress);
  const address = {
    version: bufferCV(new Uint8Array([version.valueOf()])),
    hashbytes: bufferCV(data),
  };

  let poxContract = Contracts.POX[poxVersion] || Contracts.DEFAULT;
  const txOptions = {
    contractAddress: poxContract.address,
    contractName: poxContract.name,
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
  { poxVersion, network, account, fee, nonce }: BroadcastOptionsPox,
  { amount }: { amount: number },
): Promise<TxBroadcastResult> => {
  let poxContract = Contracts.POX[poxVersion] || Contracts.DEFAULT;
  const txOptions = {
    contractAddress: poxContract.address,
    contractName: poxContract.name,
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
  { poxVersion, network, account, fee, nonce }: BroadcastOptionsPox,
  { cycles }: { cycles: number },
): Promise<TxBroadcastResult> => {
  const { version, data } = decodeBtcAddress(account.btcAddress);
  const address = {
    version: bufferCV(new Uint8Array([version.valueOf()])),
    hashbytes: bufferCV(data),
  };

  let poxContract = Contracts.POX[poxVersion] || Contracts.DEFAULT;
  const txOptions = {
    contractAddress: poxContract.address,
    contractName: poxContract.name,
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
