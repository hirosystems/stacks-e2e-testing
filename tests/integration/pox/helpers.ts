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
import {
  toBytes,
  asciiToBytes,
  bigIntToBytes,
  intToBytes,
  concatBytes,
  intToBigInt,
} from "@stacks/common";
import { principalCV } from "@stacks/transactions/dist/clarity/types/principalCV";
const fetch = require("node-fetch");
const Script = require("bitcore-lib/lib/script");
const Opcode = require("bitcore-lib/lib/opcode");
const Networks = require("bitcore-lib/lib/networks");
const Transaction = require("bitcore-lib/lib/transaction");
const PrivateKey = require("bitcore-lib/lib/privatekey");
const Signature = require("bitcore-lib/lib/crypto/signature");
const { Output, Input } = require("bitcore-lib/lib/transaction");

interface Account {
  stxAddress: string;
  btcAddress: string;
  secretKey: string;
}

const delay = () => new Promise((resolve) => setTimeout(resolve, 3000));

export const getPoxInfo = async (
  network: StacksNetwork,
  retry?: number
): Promise<any> => {
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

export const expectAccountToBe = async (
  network: StacksNetwork,
  address: string,
  account: number,
  locked: number
) => {
  let wallet = await getAccount(network, address);
  expect(wallet.balance).toBe(BigInt(account));
  expect(wallet.locked).toBe(BigInt(locked));
};

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

export const broadcastStackSTXThroughBitcoin = async (
  orchestrator: DevnetNetworkOrchestrator,
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
    .add(Buffer.from(messageBytes))
  });
  preTransaction.outputs.push(unwrapOutput);

  let principal = principalCV(indexedBitcoinWallet.stxAddress);
  console.log(principal.address.hash160)
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

  console.log(`${preTx}`)

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
    .add(Buffer.from(messageBytes))
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
  delegateWallet: Account,
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
    .add(Buffer.from(messageBytes))
  });
  preTransaction.outputs.push(unwrapOutput);

  let rewardPrincipal = principalCV(delegateWallet.stxAddress);
  let principal = principalCV(indexedBitcoinWallet.stxAddress);
  console.log(principal.address.hash160)
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

  console.log(`${preTx}`)

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
  messageBytes = concatBytes(magicBytes, opCodeByte, amountBytes, rewardAddressOutputIndex, burnHeight);
  unwrapOutput = new Output({
    satoshis: 0,
    script: new Script()
    .add(Opcode.map.OP_RETURN)
    .add(Opcode.map.OP_PUSHDATA1)
    .add(Buffer.from(messageBytes))
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


// export const broadcastStackSTXThroughBitcoin = async (bitcoinRpcUrl: string, bitcoinRpcUsername: string, bitcoinRpcPassword: string, indexedBitcoinWallet: Account, amountToStacks: number, cycles: number) => {

//   let response = await fetch(bitcoinRpcUrl, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       "Authorization": "Basic " + btoa(`${bitcoinRpcUsername}:${bitcoinRpcPassword}`),
//     },
//     body: JSON.stringify({
//       id: 0,
//       method: `listunspent`,
//       params: [1, 9999999, [indexedBitcoinWallet.btcAddress]],
//     }),
//   });
//   let json = await response.json();
//   let unspentOutputs = json.result;

//   // let recipientAddress = principalCV(transfer.recipient);

//   let typicalSize = 600;
//   let txFee = 10 * typicalSize;
//   let totalRequired = parseInt(transfer.amount) + txFee;
//   let selectedUtxosIndices: number[] = [];
//   let cumulatedAmount = 0;
//   let i = 0;
//   for (let utxo of unspentOutputs) {
//     cumulatedAmount += utxo.amount * 100_000_000;
//     selectedUtxosIndices.push(i);
//     if (cumulatedAmount >= totalRequired) {
//       break;
//     }
//     i++;
//   }
//   if (cumulatedAmount < totalRequired) {
//     return {
//       message: "Funding unsufficient",
//       unspentOutputs: unspentOutputs,
//       statusCode: 404,
//     };
//   }

//   selectedUtxosIndices.reverse();
//   let transaction = new Transaction();
//   transaction.setVersion(1);
//   let selectedUnspentOutput: any[] = [];
//   for (let index of selectedUtxosIndices) {
//     let unspentOutput = unspentOutputs[index];

//     unspentOutputs.splice(index, 1);
//     let input = Input.fromObject({
//       prevTxId: unspentOutput.txid,
//       script: Script.empty(),
//       outputIndex: unspentOutput.vout,
//       output: new Output({
//         satoshis: parseInt(transfer.amount),
//         script: Buffer.from(unspentOutput.scriptPubKey, "hex"),
//       }),
//     });
//     transaction.addInput(new Input.PublicKeyHash(input));
//     selectedUnspentOutput.push(unspentOutput);
//   }

//   let unwrapOutput = new Output({
//     satoshis: parseInt(transfer.amount),
//     script: new Script()
//       .add(Opcode.map.OP_DUP)
//       .add(Opcode.map.OP_HASH160)
//       .add(Buffer.from(recipientAddress.address.hash160, "hex"))
//       .add(Opcode.map.OP_EQUALVERIFY)
//       .add(Opcode.map.OP_CHECKSIG),
//   });

//   transaction.outputs.push(unwrapOutput);

//   let changeOutput = new Output({
//     satoshis: cumulatedAmount - parseInt(transfer.amount) - txFee,
//     script: new Script()
//       .add(Opcode.map.OP_DUP)
//       .add(Opcode.map.OP_HASH160)
//       .add(Buffer.from(authorityAddress.address.hash160, "hex"))
//       .add(Opcode.map.OP_EQUALVERIFY)
//       .add(Opcode.map.OP_CHECKSIG),
//   });

//   transaction.outputs.push(changeOutput);

//   let secretKey = new PrivateKey(
//     process.env.AUTHORITY_SECRET_KEY!.slice(0, 64),
//     Networks.testnet,
//   );

//   transaction.sign(secretKey, Signature.SIGHASH_ALL, "ecdsa");
//   let tx = transaction.serialize(true);

//   response = await fetch(BITCOIN_NODE_URL, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       "Authorization": "Basic " + btoa("devnet:devnet"),
//     },
//     body: JSON.stringify({
//       id: 0,
//       method: `sendrawtransaction`,
//       params: [tx],
//     }),
//   });
//   json = await response.json();
//   let txid = json.result;

// }
