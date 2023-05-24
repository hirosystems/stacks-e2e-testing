import {
  DevnetNetworkOrchestrator,
  StacksChainUpdate,
} from "@hirosystems/stacks-devnet-js";
import { StacksNetwork } from "@stacks/network";
import { CoreInfo, PoxInfo } from "@stacks/stacking";
import {
  AnchorMode,
  BufferCV,
  ClarityType,
  ClarityValue,
  OptionalCV,
  PostConditionMode,
  PrincipalCV,
  SomeCV,
  TupleCV,
  TxBroadcastResult,
  UIntCV,
  broadcastTransaction,
  callReadOnlyFunction,
  cvToHex,
  cvToString,
  hexToCV,
  makeContractCall,
  principalCV,
  responseErrorCV,
  stringAsciiCV,
  tupleCV,
  uintCV,
} from "@stacks/transactions";
import {
  asciiToBytes,
  bigIntToBytes,
  intToBytes,
  concatBytes,
  intToBigInt,
} from "@stacks/common";
const Script = require("bitcore-lib/lib/script");
const Opcode = require("bitcore-lib/lib/opcode");
const Networks = require("bitcore-lib/lib/networks");
const Transaction = require("bitcore-lib/lib/transaction");
const PrivateKey = require("bitcore-lib/lib/privatekey");
const Signature = require("bitcore-lib/lib/crypto/signature");
const { Output, Input } = require("bitcore-lib/lib/transaction");

import { expect } from "vitest";
import { Contracts } from "../constants";
import { BroadcastOptions } from "../helpers";
const fetch = require("node-fetch");

export interface Account {
  stxAddress: string;
  btcAddress: string;
  secretKey: string;
}

export interface BroadcastOptionsPox extends BroadcastOptions {
  poxVersion: number;
}

const delay = () => new Promise((resolve) => setTimeout(resolve, 3000));

export const getCoreInfo = async (
  network: StacksNetwork,
  retry?: number
): Promise<
  CoreInfo & {
    stacks_tip_height: number;
  }
> => {
  let retryCountdown = retry ? retry : 20;
  if (retryCountdown == 0) return Promise.reject();
  try {
    let response = await fetch(network.getInfoUrl(), {});
    let coreInfo = (await response.json()) as CoreInfo & {
      stacks_tip_height: number;
    };
    return coreInfo;
  } catch (e) {
    await delay();
    return await getCoreInfo(network, retryCountdown - 1);
  }
};

export const getPoxInfo = async (
  network: StacksNetwork,
  retry?: number
): Promise<
  PoxInfo & {
    total_liquid_supply_ustx: number;
    pox_activation_threshold_ustx: number;
  }
> => {
  let retryCountdown = retry ? retry : 20;
  if (retryCountdown == 0) return Promise.reject();
  try {
    let response = await fetch(network.getPoxInfoUrl(), {});
    let poxInfo = await response.json();
    return poxInfo;
  } catch (e) {
    await delay();
    return await getPoxInfo(network, retryCountdown - 1);
  }
};

export const getAccount = async (
  network: StacksNetwork,
  address: string,
  retry?: number
): Promise<any> => {
  let retryCountdown = retry ? retry : 20;
  if (retryCountdown == 0) return Promise.reject();
  try {
    let response = await fetch(network.getAccountApiUrl(address), {});
    let payload: any = await response.json();
    return {
      balance: BigInt(payload.balance),
      locked: BigInt(payload.locked),
      unlock_height: payload.unlock_height,
      nonce: payload.nonce,
    };
  } catch (e) {
    await delay();
    return await getAccount(network, address, retryCountdown - 1);
  }
};

export const getBitcoinHeightOfNextRewardPhase = async (
  network: StacksNetwork,
  retry?: number
): Promise<number> => {
  let response = await getPoxInfo(network, retry);
  return response.next_cycle.reward_phase_start_block_height;
};

export const getBitcoinHeightOfNextPreparePhase = async (
  network: StacksNetwork,
  retry?: number
): Promise<number> => {
  let response = await getPoxInfo(network, retry);
  return response.next_cycle.prepare_phase_start_block_height;
};

export const waitForNextPreparePhase = async (
  network: StacksNetwork,
  orchestrator: DevnetNetworkOrchestrator,
  offset?: number
): Promise<StacksChainUpdate> => {
  var height = await getBitcoinHeightOfNextPreparePhase(network);
  if (offset) {
    height = height + offset;
  }
  return await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
    height
  );
};

export const waitForRewardCycleId = async (
  network: StacksNetwork,
  orchestrator: DevnetNetworkOrchestrator,
  id: number,
  offset?: number
): Promise<StacksChainUpdate> => {
  let response = await getPoxInfo(network);
  let height =
    response.first_burnchain_block_height + id * response.reward_cycle_length;
  if (offset) {
    height = height + offset;
  }
  return await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
    height
  );
};

export const waitForNextRewardPhase = async (
  network: StacksNetwork,
  orchestrator: DevnetNetworkOrchestrator,
  offset?: number
): Promise<StacksChainUpdate> => {
  var height = await getBitcoinHeightOfNextRewardPhase(network);
  if (offset) {
    height = height + offset;
  }
  return await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
    height
  );
};

export async function mineBtcBlock(orchestrator: DevnetNetworkOrchestrator) {
  const update = await orchestrator.mineBitcoinBlockAndHopeForStacksBlock();
  const firstNewBlock = update?.new_blocks?.[0];
  return {
    stxIndex: firstNewBlock?.block?.block_identifier.index,
    btcIndex: (firstNewBlock?.block?.metadata as any)
      ?.bitcoin_anchor_block_identifier?.index,
  };
}

export const expectAccountToBe = async (
  network: StacksNetwork,
  address: string,
  account: number,
  locked: number
) => {
  const wallet = await getAccount(network, address);
  expect(wallet.balance).toBe(BigInt(account));
  expect(wallet.locked).toBe(BigInt(locked));
};

export const callReadOnlystackerInfo = (
  network: StacksNetwork,
  poxVersion: number,
  user: Account
) => {
  let poxContract = Contracts.POX[poxVersion] || Contracts.DEFAULT;
  return callReadOnlyFunction({
    contractName: poxContract.name,
    contractAddress: poxContract.address,
    functionName: "get-stacker-info",
    functionArgs: [principalCV(user.stxAddress)],
    network,
    senderAddress: poxContract.address,
  });
};

export const expectNoError = (response: TxBroadcastResult) => {
  expect(
    response.error,
    response.error +
      " " +
      response.reason +
      " " +
      JSON.stringify(response.reason_data)
  ).toBeUndefined();
};

// represents a JS error as Clarity value
export const errorToCV = (e: Error) => {
  return responseErrorCV(stringAsciiCV(e.message));
};

export const readRewardCyclePoxAddressList = async (
  network: StacksNetwork,
  poxVersion: number,
  cycleId: number
) => {
  let poxContract = Contracts.POX[poxVersion] || Contracts.DEFAULT;
  const url = network.getMapEntryUrl(
    poxContract.address,
    poxContract.name,
    "reward-cycle-pox-address-list-len"
  );
  const cycleIdValue = uintCV(cycleId);
  const keyValue = tupleCV({
    "reward-cycle": cycleIdValue,
  });
  const response = await network.fetchFn(url, {
    method: "POST",
    body: JSON.stringify(cvToHex(keyValue)),
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const msg = await response.text().catch(() => "");
    throw new Error(
      `Error calling read-only function. Response ${response.status}: ${response.statusText}. Attempted to fetch ${url} and failed with the message: "${msg}"`
    );
  }
  let lengthJson = await response.json();
  let lengthSome = hexToCV(lengthJson.data) as OptionalCV<TupleCV>;
  if (lengthSome.type === ClarityType.OptionalNone) {
    return null;
  }
  let lengthUint = lengthSome.value.data["len"] as UIntCV;
  let length = Number(lengthUint.value);

  let poxAddrInfoList = [];
  for (let i = 0; i < length; i++) {
    let poxAddressInfo = (await readRewardCyclePoxAddressListAtIndex(
      network,
      poxVersion,
      cycleId,
      i
    )) as Record<string, ClarityValue>;
    poxAddrInfoList.push(poxAddressInfo);
  }

  return poxAddrInfoList;
};

export const readStackingStateForAddress = async (
  network: StacksNetwork,
  poxVersion: number,
  address: string
) => {
  let poxContract = Contracts.POX[poxVersion] || Contracts.DEFAULT;
  const url = network.getMapEntryUrl(
    poxContract.address,
    poxContract.name,
    "stacking-state"
  );
  const keyValue = tupleCV({
    stacker: principalCV(address),
  });
  const response = await network.fetchFn(url, {
    method: "POST",
    body: JSON.stringify(cvToHex(keyValue)),
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const msg = await response.text().catch(() => "");
    throw new Error(
      `Error calling read-only function. Response ${response.status}: ${response.statusText}. Attempted to fetch ${url} and failed with the message: "${msg}"`
    );
  }
  let json = await response.json();
  return hexToCV(json.data);
};

export const readDelegationStateForAddress = async (
  network: StacksNetwork,
  poxVersion: number,
  address: string
) => {
  let poxContract = Contracts.POX[poxVersion] || Contracts.DEFAULT;
  const url = network.getMapEntryUrl(
    poxContract.address,
    poxContract.name,
    "delegation-state"
  );
  const keyValue = tupleCV({
    stacker: principalCV(address),
  });
  const response = await network.fetchFn(url, {
    method: "POST",
    body: JSON.stringify(cvToHex(keyValue)),
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const msg = await response.text().catch(() => "");
    throw new Error(
      `Error calling read-only function. Response ${response.status}: ${response.statusText}. Attempted to fetch ${url} and failed with the message: "${msg}"`
    );
  }
  let json = await response.json();
  return hexToCV(json.data);
};

export const readRewardCyclePoxAddressForAddress = async (
  network: StacksNetwork,
  poxVersion: number,
  cycleId: number,
  address: string
) => {
  // TODO: There might be a better way to do this using the `stacking-state`
  //       map to get the index
  let poxContract = Contracts.POX[poxVersion] || Contracts.DEFAULT;
  const url = network.getMapEntryUrl(
    poxContract.address,
    poxContract.name,
    "reward-cycle-pox-address-list-len"
  );
  const cycleIdValue = uintCV(cycleId);
  const keyValue = tupleCV({
    "reward-cycle": cycleIdValue,
  });
  const response = await network.fetchFn(url, {
    method: "POST",
    body: JSON.stringify(cvToHex(keyValue)),
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const msg = await response.text().catch(() => "");
    throw new Error(
      `Error calling read-only function. Response ${response.status}: ${response.statusText}. Attempted to fetch ${url} and failed with the message: "${msg}"`
    );
  }
  let lengthJson = await response.json();
  let lengthSome = hexToCV(lengthJson.data) as OptionalCV<TupleCV>;
  if (lengthSome.type === ClarityType.OptionalNone) {
    return null;
  }
  let lengthUint = lengthSome.value.data["len"] as UIntCV;
  let length = Number(lengthUint.value);

  for (let i = 0; i < length; i++) {
    let poxAddressInfo = await readRewardCyclePoxAddressListAtIndex(
      network,
      poxVersion,
      cycleId,
      i
    );
    if (poxAddressInfo?.["stacker"]?.type === ClarityType.OptionalNone) {
      continue;
    } else if (poxAddressInfo?.["stacker"]?.type === ClarityType.OptionalSome) {
      let stackerSome = poxAddressInfo["stacker"] as SomeCV<PrincipalCV>;
      if (cvToString(stackerSome.value) === address) {
        return poxAddressInfo;
      }
    }
  }

  return null;
};

export type RewardCyclePoxAddressMapEntry = {
  "total-ustx": UIntCV;
  "pox-addr": TupleCV<{ version: BufferCV; hashbytes: BufferCV }>;
  stacker: OptionalCV<PrincipalCV>;
};

export const readRewardCyclePoxAddressListAtIndex = async (
  network: StacksNetwork,
  poxVersion: number,
  cycleId: number,
  index: number
): Promise<RewardCyclePoxAddressMapEntry | null | undefined> => {
  let poxContract = Contracts.POX[poxVersion] || Contracts.DEFAULT;
  const url = network.getMapEntryUrl(
    poxContract.address,
    poxContract.name,
    "reward-cycle-pox-address-list"
  );
  const cycleIdValue = uintCV(cycleId);
  const indexValue = uintCV(index);
  const keyValue = tupleCV({
    "reward-cycle": cycleIdValue,
    index: indexValue,
  });
  const response = await network.fetchFn(url, {
    method: "POST",
    body: JSON.stringify(cvToHex(keyValue)),
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const msg = await response.text().catch(() => "");
    throw new Error(
      `Error calling read-only function. Response ${response.status}: ${response.statusText}. Attempted to fetch ${url} and failed with the message: "${msg}"`
    );
  }
  let poxAddrInfoJson = await response.json();
  let cv = hexToCV(poxAddrInfoJson.data);
  if (cv.type === ClarityType.OptionalSome) {
    let someCV = cv as SomeCV<TupleCV>;
    const tupleData = someCV.value.data as RewardCyclePoxAddressMapEntry;
    return tupleData;
  } else if (cv.type === ClarityType.OptionalNone) {
    return null;
  }
};

export const broadcastRejectPox = async ({
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
    functionName: "reject-pox",
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

export const callReadOnlyIsPoxActive = (
  poxVersion: number,
  network: StacksNetwork,
  account: Account,
  rewardCycle: number
) => {
  let poxContract = Contracts.POX[poxVersion] || Contracts.DEFAULT;
  return callReadOnlyFunction({
    contractName: poxContract.name,
    contractAddress: poxContract.address,
    functionName: "is-pox-active",
    functionArgs: [uintCV(rewardCycle)],
    network,
    senderAddress: account.stxAddress,
  });
};

export const getTotalPoxRejection = (
  poxVersion: number,
  network: StacksNetwork,
  account: Account,
  rewardCycle: number
) => {
  let poxContract = Contracts.POX[poxVersion] || Contracts.DEFAULT;
  return callReadOnlyFunction({
    contractName: poxContract.name,
    contractAddress: poxContract.address,
    functionName: "get-total-pox-rejection",
    functionArgs: [uintCV(rewardCycle)],
    network,
    senderAddress: account.stxAddress,
  });
};

export const broadcastStackSTXThroughBitcoin = async (
  // orchestrator: DevnetNetworkOrchestrator,
  bitcoinRpcUrl: string,
  bitcoinRpcUsername: string,
  bitcoinRpcPassword: string,
  indexedBitcoinWallet: Account,
  amountToStacks: number,
  cycles: number
) => {
  // Steps:
  // - Retrieve a UTXO
  // - Craft and broadcast a `PreOp` transaction where:
  //    - Output 1 is a PreOp signal
  //    - Output 2 is a legacy address that will be converted to the Stacks Address
  // - Craft and broadcast the actual Stacks Op transaction where
  //    - Input 1 is the Output 2 of the `PreOp` transaction
  //    - Output 1 the actual Op OP_RETURN
  let secretKey = new PrivateKey(
    indexedBitcoinWallet.secretKey.slice(0, 64),
    Networks.testnet
  );
  console.log(indexedBitcoinWallet.btcAddress);
  let basicAuthorization =
    "Basic " + btoa(`${bitcoinRpcUsername}:${bitcoinRpcPassword}`);
  console.log(`---> ${bitcoinRpcUrl}`);
  let response = await fetch(bitcoinRpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuthorization,
    },
    body: JSON.stringify({
      id: 0,
      method: `listunspent`,
      params: [1, 9999999, [indexedBitcoinWallet.btcAddress]],
    }),
  });
  let json = await response.json();
  let unspentOutputs = json.result;

  let typicalSize = 600;
  let txFee = 10 * typicalSize;
  let totalRequired = txFee;
  let selectedUtxosIndices: number[] = [];
  let cumulatedAmount = 0;
  let i = 0;

  for (let utxo of unspentOutputs) {
    cumulatedAmount += utxo.amount * 100_000_000;
    selectedUtxosIndices.push(i);
    if (cumulatedAmount >= totalRequired) {
      break;
    }
    i++;
  }
  if (cumulatedAmount < totalRequired) {
    return {
      message: "Funding unsufficient",
      unspentOutputs: unspentOutputs,
      statusCode: 404,
    };
  }

  selectedUtxosIndices.reverse();
  let preTransaction = new Transaction();
  preTransaction.setVersion(1);
  let selectedUnspentOutput: any[] = [];
  for (let index of selectedUtxosIndices) {
    let unspentOutput = unspentOutputs[index];

    unspentOutputs.splice(index, 1);
    let input = Input.fromObject({
      prevTxId: unspentOutput.txid,
      script: Script.empty(),
      outputIndex: unspentOutput.vout,
      output: new Output({
        satoshis: parseInt(unspentOutput.amount),
        script: Buffer.from(unspentOutput.scriptPubKey, "hex"),
      }),
    });
    preTransaction.addInput(new Input.PublicKeyHash(input));
    selectedUnspentOutput.push(unspentOutput);
  }

  /*
    Wire format:
    0      2  3
    |------|--|
      magic  op 
  */
  let magicBytes = asciiToBytes("id");
  let opCodeByte = asciiToBytes("p");
  let messageBytes = concatBytes(magicBytes, opCodeByte);
  console.log(`${messageBytes}`);
  let unwrapOutput = new Output({
    satoshis: 0,
    script: new Script()
      .add(Opcode.map.OP_RETURN)
      .add(Opcode.map.OP_PUSHDATA1)
      .add(Buffer.from(messageBytes)),
  });
  preTransaction.outputs.push(unwrapOutput);

  let principal = principalCV(indexedBitcoinWallet.stxAddress);
  console.log(principal.address.hash160);
  let changeOutput = new Output({
    satoshis: cumulatedAmount - txFee,
    script: new Script()
      .add(Opcode.map.OP_DUP)
      .add(Opcode.map.OP_HASH160)
      .add(Buffer.from(principal.address.hash160, "hex"))
      .add(Opcode.map.OP_EQUALVERIFY)
      .add(Opcode.map.OP_CHECKSIG),
  });
  preTransaction.outputs.push(changeOutput);

  preTransaction.sign(secretKey, Signature.SIGHASH_ALL, "ecdsa");
  let preTx = preTransaction.serialize(true);

  console.log(`${preTx}`);

  response = await fetch(bitcoinRpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuthorization,
    },
    body: JSON.stringify({
      id: 0,
      method: `sendrawtransaction`,
      params: [preTx],
    }),
  });
  json = await response.json();
  let preTxid = json.result;

  console.log(`PreOp: ${preTxid}`);

  // let chainUpdate = await orchestrator.waitForNextBitcoinBlock();
  // chainUpdate.new_blocks[0].transactions;

  let transaction = new Transaction();
  transaction.setVersion(1);

  let input = Input.fromObject({
    prevTxId: preTxid,
    script: Script.empty(),
    outputIndex: 1,
    output: changeOutput,
  });
  transaction.addInput(new Input.PublicKeyHash(input));
  /*
    Wire format:
    0      2  3                             19        20
    |------|--|-----------------------------|---------|
      magic op       uSTX to lock (u128)     cycles (u8)
  */
  opCodeByte = asciiToBytes("x");
  let amountBytes = bigIntToBytes(intToBigInt(amountToStacks, false));
  let cyclesBytes = intToBytes(cycles, false, 1);
  messageBytes = concatBytes(magicBytes, opCodeByte, amountBytes, cyclesBytes);
  unwrapOutput = new Output({
    satoshis: 0,
    script: new Script()
      .add(Opcode.map.OP_RETURN)
      .add(Opcode.map.OP_PUSHDATA1)
      .add(Buffer.from(messageBytes)),
  });
  transaction.outputs.push(unwrapOutput);
  changeOutput = new Output({
    satoshis: cumulatedAmount - txFee - txFee,
    script: new Script()
      .add(Opcode.map.OP_DUP)
      .add(Opcode.map.OP_HASH160)
      .add(Buffer.from(principal.address.hash160, "hex"))
      .add(Opcode.map.OP_EQUALVERIFY)
      .add(Opcode.map.OP_CHECKSIG),
  });
  transaction.outputs.push(changeOutput);

  transaction.sign(secretKey, Signature.SIGHASH_ALL, "ecdsa");
  let tx = transaction.serialize(true);
  response = await fetch(bitcoinRpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuthorization,
    },
    body: JSON.stringify({
      id: 0,
      method: `sendrawtransaction`,
      params: [tx],
    }),
  });
  json = await response.json();
  console.log(json);
  let txid = json.result;
  console.log(txid);
};

export const broadcastDelegatedStackSTXThroughBitcoin = async (
  orchestrator: DevnetNetworkOrchestrator,
  bitcoinRpcUrl: string,
  bitcoinRpcUsername: string,
  bitcoinRpcPassword: string,
  indexedBitcoinWallet: Account,
  amountToStacks: number,
  burnBlockHeight: number,
  delegateWallet: Account
) => {
  // Steps:
  // - Retrieve a UTXO
  // - Craft and broadcast a `PreOp` transaction where:
  //    - Output 1 is a PreOp signal
  //    - Output 2 is a legacy address that will be converted to the Stacks Address
  // - Craft and broadcast the actual Stacks Op transaction where
  //    - Input 1 is the Output 2 of the `PreOp` transaction
  //    - Output 1 the actual Op OP_RETURN
  let secretKey = new PrivateKey(
    indexedBitcoinWallet.secretKey.slice(0, 64),
    Networks.testnet
  );
  console.log(indexedBitcoinWallet.btcAddress);
  let basicAuthorization =
    "Basic " + btoa(`${bitcoinRpcUsername}:${bitcoinRpcPassword}`);
  console.log(`---> ${bitcoinRpcUrl}`);
  let response = await fetch(bitcoinRpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuthorization,
    },
    body: JSON.stringify({
      id: 0,
      method: `listunspent`,
      params: [1, 9999999, [indexedBitcoinWallet.btcAddress]],
    }),
  });
  let json = await response.json();
  let unspentOutputs = json.result;

  let typicalSize = 600;
  let txFee = 10 * typicalSize;
  let totalRequired = txFee;
  let selectedUtxosIndices: number[] = [];
  let cumulatedAmount = 0;
  let i = 0;

  for (let utxo of unspentOutputs) {
    cumulatedAmount += utxo.amount * 100_000_000;
    selectedUtxosIndices.push(i);
    if (cumulatedAmount >= totalRequired) {
      break;
    }
    i++;
  }
  if (cumulatedAmount < totalRequired) {
    return {
      message: "Funding unsufficient",
      unspentOutputs: unspentOutputs,
      statusCode: 404,
    };
  }

  selectedUtxosIndices.reverse();
  let preTransaction = new Transaction();
  preTransaction.setVersion(1);
  let selectedUnspentOutput: any[] = [];
  for (let index of selectedUtxosIndices) {
    let unspentOutput = unspentOutputs[index];

    unspentOutputs.splice(index, 1);
    let input = Input.fromObject({
      prevTxId: unspentOutput.txid,
      script: Script.empty(),
      outputIndex: unspentOutput.vout,
      output: new Output({
        satoshis: parseInt(unspentOutput.amount),
        script: Buffer.from(unspentOutput.scriptPubKey, "hex"),
      }),
    });
    preTransaction.addInput(new Input.PublicKeyHash(input));
    selectedUnspentOutput.push(unspentOutput);
  }

  /*
    Wire format:
    0      2  3
    |------|--|
      magic  op 
  */
  let magicBytes = asciiToBytes("id");
  let opCodeByte = asciiToBytes("p");
  let messageBytes = concatBytes(magicBytes, opCodeByte);
  console.log(`${messageBytes}`);
  let unwrapOutput = new Output({
    satoshis: 0,
    script: new Script()
      .add(Opcode.map.OP_RETURN)
      .add(Opcode.map.OP_PUSHDATA1)
      .add(Buffer.from(messageBytes)),
  });
  preTransaction.outputs.push(unwrapOutput);

  let rewardPrincipal = principalCV(delegateWallet.stxAddress);
  let principal = principalCV(indexedBitcoinWallet.stxAddress);
  console.log(principal.address.hash160);
  let changeOutput = new Output({
    satoshis: cumulatedAmount - txFee,
    script: new Script()
      .add(Opcode.map.OP_DUP)
      .add(Opcode.map.OP_HASH160)
      .add(Buffer.from(principal.address.hash160, "hex"))
      .add(Opcode.map.OP_EQUALVERIFY)
      .add(Opcode.map.OP_CHECKSIG),
  });
  preTransaction.outputs.push(changeOutput);

  preTransaction.sign(secretKey, Signature.SIGHASH_ALL, "ecdsa");
  let preTx = preTransaction.serialize(true);

  console.log(`${preTx}`);

  response = await fetch(bitcoinRpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuthorization,
    },
    body: JSON.stringify({
      id: 0,
      method: `sendrawtransaction`,
      params: [preTx],
    }),
  });
  json = await response.json();
  let preTxid = json.result;

  console.log(`PreOp: ${preTxid}`);

  // let chainUpdate = await orchestrator.waitForNextBitcoinBlock();
  // chainUpdate.new_blocks[0].transactions;

  let transaction = new Transaction();
  transaction.setVersion(1);

  let input = Input.fromObject({
    prevTxId: preTxid,
    script: Script.empty(),
    outputIndex: 1,
    output: changeOutput,
  });
  transaction.addInput(new Input.PublicKeyHash(input));
  /*
    Wire format:
    0      2  3                  19       24             33
    |------|--|------------------|--------|--------------|
      magic op   delegated ustx       ^   until burn height
                          reward addr output index
  */
  opCodeByte = asciiToBytes("#");
  let amountBytes = bigIntToBytes(intToBigInt(amountToStacks, false));
  let rewardAddressOutputIndex = intToBytes(0, false, 4);
  let burnHeight = intToBytes(burnBlockHeight, false, 8);
  messageBytes = concatBytes(
    magicBytes,
    opCodeByte,
    amountBytes,
    intToBytes(1, false, 1),
    rewardAddressOutputIndex,
    intToBytes(1, false, 1),
    burnHeight
  );
  unwrapOutput = new Output({
    satoshis: 0,
    script: new Script()
      .add(Opcode.map.OP_RETURN)
      .add(Opcode.map.OP_PUSHDATA1)
      .add(Buffer.from(messageBytes)),
  });
  transaction.outputs.push(unwrapOutput);
  let dust = 10000;
  let rewardOutput = new Output({
    satoshis: dust,
    script: new Script()
      .add(Opcode.map.OP_DUP)
      .add(Opcode.map.OP_HASH160)
      .add(Buffer.from(rewardPrincipal.address.hash160, "hex"))
      .add(Opcode.map.OP_EQUALVERIFY)
      .add(Opcode.map.OP_CHECKSIG),
  });
  transaction.outputs.push(rewardOutput);

  changeOutput = new Output({
    satoshis: cumulatedAmount - dust - txFee - txFee,
    script: new Script()
      .add(Opcode.map.OP_DUP)
      .add(Opcode.map.OP_HASH160)
      .add(Buffer.from(principal.address.hash160, "hex"))
      .add(Opcode.map.OP_EQUALVERIFY)
      .add(Opcode.map.OP_CHECKSIG),
  });
  transaction.outputs.push(changeOutput);

  transaction.sign(secretKey, Signature.SIGHASH_ALL, "ecdsa");
  let tx = transaction.serialize(true);
  response = await fetch(bitcoinRpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuthorization,
    },
    body: JSON.stringify({
      id: 0,
      method: `sendrawtransaction`,
      params: [tx],
    }),
  });
  json = await response.json();
  console.log(json);
  let txid = json.result;
  console.log(txid);
};
