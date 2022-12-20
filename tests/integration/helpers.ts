import {
  StacksBlockMetadata,
  StacksChainUpdate,
  DevnetNetworkOrchestrator,
  StacksTransactionMetadata,
  getIsolatedNetworkConfigUsingNetworkId,
} from "@hirosystems/stacks-devnet-js";
import { Constants } from "./constants";

interface EpochTimeline {
    epoch_2_0: number,
    epoch_2_05: number,
    epoch_2_1: number,
    pox_2_activation: number,
}

const DEFAULT_EPOCH_TIMELINE = {
    epoch_2_0: Constants.DEVNET_DEFAULT_EPOCH_2_0,
    epoch_2_05: Constants.DEVNET_DEFAULT_EPOCH_2_05,
    epoch_2_1: Constants.DEVNET_DEFAULT_EPOCH_2_1,
    pox_2_activation: Constants.DEVNET_DEFAULT_POX_2_ACTIVATION,
}

export function buildDevnetNetworkOrchestrator(networkId: number, timeline: EpochTimeline = DEFAULT_EPOCH_TIMELINE, logs = true) {
    let working_dir = `/tmp/stacks-test-${Date.now()}`;
    let config = {
        logs,
        devnet: {
            bitcoin_controller_block_time: Constants.BITCOIN_BLOCK_TIME,
            epoch_2_0: timeline.epoch_2_0,
            epoch_2_05: timeline.epoch_2_05,
            epoch_2_1: timeline.epoch_2_1,
            pox_2_activation: timeline.pox_2_activation,
            bitcoin_controller_automining_disabled: false,
            working_dir,
        }
    };
    let consolidatedConfig = getIsolatedNetworkConfigUsingNetworkId(networkId, config);
    let orchestrator = new DevnetNetworkOrchestrator(consolidatedConfig);
    return orchestrator;
}

export const getBitcoinBlockHeight = (
  chainUpdate: StacksChainUpdate
): number => {
  let metadata = chainUpdate.new_blocks[0].block
    .metadata! as StacksBlockMetadata;
  return metadata.bitcoin_anchor_block_identifier.index;
};

export const waitForStacksChainUpdate = async (
  orchestrator: DevnetNetworkOrchestrator,
  targetBitcoinBlockHeight: number
): Promise<StacksChainUpdate> => {
  while (true) {
    let chainUpdate = await orchestrator.waitForNextStacksBlock();
    let bitcoinBlockHeight = getBitcoinBlockHeight(chainUpdate);
    if (bitcoinBlockHeight >= targetBitcoinBlockHeight) {
      return chainUpdate;
    }
  }
};

export const waitForStacksTransaction = async (
  orchestrator: DevnetNetworkOrchestrator,
  sender: string
): Promise<[StacksBlockMetadata, StacksTransactionMetadata]> => {
  while (true) {
    let chainUpdate = await orchestrator.waitForNextStacksBlock();
    for (const tx of chainUpdate.new_blocks[0].block.transactions) {
      let metadata = <StacksTransactionMetadata>tx.metadata;
      if (metadata.sender == sender) {
        return [
          <StacksBlockMetadata>chainUpdate.new_blocks[0].block.metadata,
          metadata,
        ];
      }
    }
  }
};

export const getNetworkIdFromCtx = (task_id: string): number => {
  let networkId = Math.abs(parseInt(task_id))%500;
  return networkId;
}