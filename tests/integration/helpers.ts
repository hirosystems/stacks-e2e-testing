import { StacksDevnetOrchestrator } from '@hirosystems/stacks-devnet-js';
import { Constants, Contracts } from './constants';
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
import { principalCV } from '@stacks/transactions/dist/clarity/types/principalCV';
import { decodeBtcAddress } from '@stacks/stacking';
import { toBytes } from '@stacks/common';

export function buildStacksDevnetOrchestrator() {
    const orchestrator = new StacksDevnetOrchestrator({
        path: "./Clarinet.toml",
        logs: true,
        devnet: {
            bitcoin_controller_block_time: Constants.BITCOIN_BLOCK_TIME,
            epoch_2_0: Constants.DEVNET_DEFAULT_EPOCH_2_0,
            epoch_2_05: Constants.DEVNET_DEFAULT_EPOCH_2_05,
            epoch_2_1: Constants.DEVNET_DEFAULT_EPOCH_2_1,
        }
    });
    return orchestrator;
}

interface Account {
    stxAddress: string,
    btcAddress: string,
    secretKey: string,
}

export const broadcastStackSTX = async (poxVersion: number, network: StacksNetwork, amount: number, account: Account, blockHeight: number) : Promise<TxBroadcastResult> => {
    const nonce = await getNonce(account.stxAddress, network);
    let wallet1 = principalCV(account.stxAddress);

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
