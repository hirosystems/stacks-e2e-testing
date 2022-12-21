import {
  StacksBlockMetadata,
  StacksChainUpdate,
  DevnetNetworkOrchestrator,
  StacksTransactionMetadata,
  getIsolatedNetworkConfigUsingNetworkId,
  Transaction,
} from "@hirosystems/stacks-devnet-js";
import { Constants } from "./constants";
import { StacksNetwork } from "@stacks/network";

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
    let uuid = Date.now();
    let working_dir = `/tmp/stacks-test-${uuid}-${networkId}`;
    let config = {
        logs,
        devnet: {
            name: `ephemeral-devnet-${uuid}`,
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

export const waitForStacksTransaction = async (
  orchestrator: DevnetNetworkOrchestrator,
  txid: string
): Promise<[StacksBlockMetadata, StacksTransactionMetadata]> => {
  let { chainUpdate, transaction } = await orchestrator.waitForStacksBlockIncludingTransaction(txid);
  return [ <StacksBlockMetadata>chainUpdate.new_blocks[0].block.metadata, <StacksTransactionMetadata>transaction.metadata ]
};

export const getNetworkIdFromCtx = (task_id: string): number => {
  let networkId = Math.abs(parseInt(task_id))%500;
  return networkId;
}

const delay = () => new Promise(resolve => setTimeout(resolve, 2000));

export const getChainInfo = async (network: StacksNetwork, retry?: number): Promise<any> => {
  let retryCountdown = retry ? retry: 20;
  if (retryCountdown == 0) return Promise.reject();
  try {
      let response = await fetch(network.getInfoUrl())
      let info = await response.json();
      return info;
  } catch (e) {
    await delay();
    return await getChainInfo(network, retryCountdown - 1);
  }
}

