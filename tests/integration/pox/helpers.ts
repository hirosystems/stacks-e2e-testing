import { Contracts } from '../constants';
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
import { decodeBtcAddress } from '@stacks/stacking';
import { toBytes } from '@stacks/common';
import { waitForStacksChainUpdate } from '../helpers';

interface Account {
    stxAddress: string,
    btcAddress: string,
    secretKey: string,
}

const delay = () => new Promise(resolve => setTimeout(resolve, 3000));

export const getPoxInfo = async (network: StacksNetwork, retry?: number): Promise<any> => {
    let retryCountdown = retry ? retry: 20;
    if (retryCountdown == 0) return Promise.reject();
    try {
        let response = await fetch(network.getPoxInfoUrl())
        let poxInfo = await response.json();
        return poxInfo;
    } catch (e) {
      await delay();
      return getPoxInfo(network, retryCountdown - 1);
    }
}

export const getAccount = async (network: StacksNetwork, address: string, retry?: number): Promise<any> => {
    let retryCountdown = retry ? retry: 20;
    if (retryCountdown == 0) return Promise.reject();
    try {
        let response = await fetch(network.getAccountApiUrl(address))
        let payload = await response.json();
        return {
            balance: BigInt(payload.balance),
            locked: BigInt(payload.locked),
            unlock_height: payload.unlock_height,
            nonce: payload.nonce,
        };
    } catch (e) {
      await delay();
      return getAccount(network, address, retryCountdown - 1);
    }
}

export const getBitcoinHeightOfNextRewardPhase = async (network: StacksNetwork, retry?: number): Promise<number> => {
    let response = await getPoxInfo(network, retry);
    return response.next_cycle.reward_phase_start_block_height;
}

export const getBitcoinHeightOfNextPreparePhase = async (network: StacksNetwork, retry?: number): Promise<number> => {
    let response = await getPoxInfo(network, retry);
    return response.next_cycle.prepare_phase_start_block_height;
}

export const waitForNextPreparePhase = async (network: StacksNetwork, orchestrator: DevnetNetworkOrchestrator, offset?: number): Promise<StacksChainUpdate> => {
    var height = await getBitcoinHeightOfNextPreparePhase(network);
    if (offset) {
        height = height + offset;
    }
    return waitForStacksChainUpdate(orchestrator, height)
}

export const waitForNextRewardPhase = async (network: StacksNetwork, orchestrator: DevnetNetworkOrchestrator, offset?: number): Promise<StacksChainUpdate> => {
    var height = await getBitcoinHeightOfNextRewardPhase(network);
    if (offset) {
        height = height + offset;
    }
    return waitForStacksChainUpdate(orchestrator, height)
}

export const expectAccountToBe = async (network: StacksNetwork, address: string, account: number, locked: number) => {
    let wallet = await getAccount(network, address);
    expect(wallet.balance).toBe(BigInt(account));
    expect(wallet.locked).toBe(BigInt(locked));
}

export const broadcastStackSTX = async (poxVersion: number, network: StacksNetwork, amount: number, account: Account, blockHeight: number, cycles: number, fee: number) : Promise<TxBroadcastResult> => {
    const nonce = await getNonce(account.stxAddress, network);
    const { version, data } = decodeBtcAddress(account.btcAddress);
    const versionCV = bufferCV(toBytes(new Uint8Array([version.valueOf()])));
    const hashbytes = bufferCV(data);

    const txOptions = {
      contractAddress: Contracts.POX_1.address,
      contractName: poxVersion == 1 ? Contracts.POX_1.name : Contracts.POX_2.name,
      functionName: "stack-stx",
      functionArgs: [
        uintCV(amount),
        tupleCV({
            versionCV,
            hashbytes,
        }),
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
