import { Contracts } from '../constants';
import { StacksBlockMetadata, StacksChainUpdate, StacksDevnetOrchestrator } from '@hirosystems/stacks-devnet-js';
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

interface Account {
    stxAddress: string,
    btcAddress: string,
    secretKey: string,
}

export const waitForStacksChainUpdate = (orchestrator: StacksDevnetOrchestrator, targetBitcoinBlockHeight: number): StacksChainUpdate => {
    while (true) {
        let chainEvent = orchestrator.waitForStacksBlock();
        let bitcoinBlockHeight = getBitcoinBlockHeight(chainEvent); 
        if (bitcoinBlockHeight >= targetBitcoinBlockHeight) {
            return chainEvent
        }
    }
}

export const getBitcoinBlockHeight = (chainUpdate: StacksChainUpdate): number => {
    let metadata = chainUpdate.new_blocks[0].block.metadata! as StacksBlockMetadata;
    return metadata.bitcoin_anchor_block_identifier.index;
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

export const getBitcoinHeightOfNextRewardPhase = async (network: StacksNetwork, retry?: number): Promise<number> => {
    let response = await getPoxInfo(network, retry);
    return response.next_cycle.reward_phase_start_block_height;
}

export const getBitcoinHeightOfNextPreparePhase = async (network: StacksNetwork, retry?: number): Promise<number> => {
    let response = await getPoxInfo(network, retry);
    return response.next_cycle.prepare_phase_start_block_height;
}

export const waitForNextPreparePhase = async (network: StacksNetwork, orchestrator: StacksDevnetOrchestrator, offset?: number): Promise<StacksChainUpdate> => {
    var height = await getBitcoinHeightOfNextPreparePhase(network);
    if (offset) {
        height = height + offset;
    }
    return waitForStacksChainUpdate(orchestrator, height)
}

export const waitForNextRewardPhase = async (network: StacksNetwork, orchestrator: StacksDevnetOrchestrator, offset?: number): Promise<StacksChainUpdate> => {
    var height = await getBitcoinHeightOfNextRewardPhase(network);
    if (offset) {
        height = height + offset;
    }
    return waitForStacksChainUpdate(orchestrator, height)
}

export const broadcastStackSTX = async (poxVersion: number, network: StacksNetwork, amount: number, account: Account, blockHeight: number) : Promise<TxBroadcastResult> => {
    const nonce = await getNonce(account.stxAddress, network);
    const { hashMode, data } = decodeBtcAddress(account.btcAddress);
    const version = bufferCV(toBytes(new Uint8Array([hashMode.valueOf()])));
    const hashbytes = bufferCV(data);

    const txOptions = {
      contractAddress: Contracts.POX_1.address,
      contractName: poxVersion == 1 ? Contracts.POX_1.name : Contracts.POX_2.name,
      functionName: "stack-stx",
      functionArgs: [
        uintCV(amount),
        tupleCV({
            version,
            hashbytes,
        }),
        uintCV(blockHeight),
        uintCV(12),
      ],
      fee: 1000,
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
