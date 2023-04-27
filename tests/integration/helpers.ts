import {
  DevnetNetworkOrchestrator,
  StacksBlockMetadata,
  StacksChainUpdate,
  StacksTransactionMetadata,
  getIsolatedNetworkConfigUsingNetworkId,
} from "@hirosystems/stacks-devnet-js";
import { StacksNetwork } from "@stacks/network";
import { Constants } from "./constants";
import {
  AnchorMode,
  TxBroadcastResult,
  broadcastTransaction,
  makeContractCall,
  makeSTXTokenTransfer,
} from "@stacks/transactions";
const fetch = require("node-fetch");

interface EpochTimeline {
  epoch_2_0: number;
  epoch_2_05: number;
  epoch_2_1: number;
  pox_2_activation: number;
  epoch_2_2: number;
  pox_2_unlock_height: number;
}

export const DEFAULT_EPOCH_TIMELINE = {
  epoch_2_0: Constants.DEVNET_DEFAULT_EPOCH_2_0,
  epoch_2_05: Constants.DEVNET_DEFAULT_EPOCH_2_05,
  epoch_2_1: Constants.DEVNET_DEFAULT_EPOCH_2_1,
  pox_2_activation: Constants.DEVNET_DEFAULT_POX_2_ACTIVATION,
  epoch_2_2: Constants.DEVNET_DEFAULT_EPOCH_2_2,
  pox_2_unlock_height: Constants.DEVNET_DEFAULT_POX_2_UNLOCK_HEIGHT,
};

export function buildDevnetNetworkOrchestrator(
  networkId: number,
  stacksVersion: string,
  timeline: EpochTimeline = DEFAULT_EPOCH_TIMELINE,
  logs = false,
  stacks_node_image_url?: string
) {
  let uuid = Date.now();
  let working_dir = `/tmp/stacks-test-${uuid}-${networkId}`;
  // Set the stacks-node image URL to the default image for the version if it's
  // not explicitly set
  if (stacks_node_image_url === undefined) {
    if (stacksVersion === "2.2") {
      stacks_node_image_url = Constants.PROPOSED_2_2_STACKS_NODE_IMAGE_URL;
    }
  }
  let config = {
    logs,
    devnet: {
      name: `ephemeral-devnet-${uuid}`,
      bitcoin_controller_block_time: Constants.BITCOIN_BLOCK_TIME,
      epoch_2_0: timeline.epoch_2_0,
      epoch_2_05: timeline.epoch_2_05,
      epoch_2_1: timeline.epoch_2_1,
      pox_2_activation: timeline.pox_2_activation,
      epoch_2_2: timeline.epoch_2_2,
      pox_2_unlock_height: timeline.pox_2_unlock_height,
      bitcoin_controller_automining_disabled: false,
      working_dir,
      use_docker_gateway_routing: process.env.GITHUB_ACTIONS ? true : false,
      ...(stacks_node_image_url !== undefined && {
        stacks_node_image_url,
      }),
    },
  };
  let consolidatedConfig = getIsolatedNetworkConfigUsingNetworkId(
    networkId,
    config
  );
  let orchestrator = new DevnetNetworkOrchestrator(consolidatedConfig, 2500);
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
  let { chainUpdate, transaction } =
    await orchestrator.waitForStacksBlockIncludingTransaction(txid);
  return [
    <StacksBlockMetadata>chainUpdate.new_blocks[0].block.metadata,
    <StacksTransactionMetadata>transaction.metadata,
  ];
};

export const getNetworkIdFromEnv = (): number => {
  let networkId = process.env.JEST_WORKER_ID
    ? parseInt(process.env.JEST_WORKER_ID!)
    : process.env.VITEST_WORKER_ID
    ? parseInt(process.env.VITEST_WORKER_ID!)
    : 1;
  return networkId;
};

const delay = () => new Promise((resolve) => setTimeout(resolve, 2000));

export const getChainInfo = async (
  network: StacksNetwork,
  retry?: number
): Promise<any> => {
  let retryCountdown = retry ? retry : 20;
  if (retryCountdown == 0) return Promise.reject();
  try {
    let response = await fetch(network.getInfoUrl(), {});
    let info = await response.json();
    return info;
  } catch (e) {
    await delay();
    return await getChainInfo(network, retryCountdown - 1);
  }
};

export interface AccountInfo {
  balance: number;
  locked: number;
  unlock_height: number;
  nonce: number;
}

export async function asyncExpectStacksTransactionSuccess(
  orchestrator: DevnetNetworkOrchestrator,
  txid: string
) {
  let [block, tx] = await waitForStacksTransaction(orchestrator, txid);
  expect(tx.success, tx.result).toBeTruthy();
  return [block, tx];
}

export interface Account {
  stxAddress: string;
  btcAddress: string;
  secretKey: string;
}

export interface BroadcastOptions {
  network: StacksNetwork;
  account: Account;
  fee: number;
  nonce: number;
}

export const broadcastSTXTransfer = async (
  { network, account, fee, nonce }: BroadcastOptions,
  { recipient, amount }: { recipient: string; amount: number }
): Promise<TxBroadcastResult> => {
  const txOptions = {
    recipient,
    amount,
    senderKey: account.secretKey,
    network,
    nonce,
    fee,
    anchorMode: AnchorMode.Any,
  };
  const tx = await makeSTXTokenTransfer(txOptions);

  // Broadcast transaction to our Devnet stacks node
  const result = await broadcastTransaction(tx, network);
  return result;
};
