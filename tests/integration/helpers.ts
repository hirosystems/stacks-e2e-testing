import {
  DevnetNetworkOrchestrator,
  StacksBlockMetadata,
  StacksChainUpdate,
  StacksTransactionMetadata,
  getIsolatedNetworkConfigUsingNetworkId,
} from "@hirosystems/stacks-devnet-js";
import { StacksNetwork } from "@stacks/network";
import { Constants, DEFAULT_FEE } from "./constants";
import {
  AnchorMode,
  PostConditionMode,
  TxBroadcastResult,
  broadcastTransaction,
  makeContractDeploy,
  makeSTXTokenTransfer,
} from "@stacks/transactions";
import fetch from "node-fetch";

interface EpochTimeline {
  epoch_2_0?: number;
  epoch_2_05?: number;
  epoch_2_1?: number;
  pox_2_activation?: number;
  epoch_2_2?: number;
  epoch_2_3?: number;
  pox_3_activation?: number;
  epoch_2_4?: number;
  epoch_2_5?: number;
  pox_4_activation?: number;
  epoch_3_0?: number;
}

export const DEFAULT_EPOCH_TIMELINE = {
  epoch_2_0: Constants.DEVNET_DEFAULT_EPOCH_2_0,
  epoch_2_05: Constants.DEVNET_DEFAULT_EPOCH_2_05,
  epoch_2_1: Constants.DEVNET_DEFAULT_EPOCH_2_1,
  pox_2_activation: Constants.DEVNET_DEFAULT_POX_2_ACTIVATION,
  epoch_2_2: Constants.DEVNET_DEFAULT_EPOCH_2_2,
  epoch_2_3: Constants.DEVNET_DEFAULT_EPOCH_2_3,
  epoch_2_4: Constants.DEVNET_DEFAULT_EPOCH_2_4,
};

export const FAST_FORWARD_TO_EPOCH_2_4 = {
  epoch_2_0: 100,
  epoch_2_05: 102,
  epoch_2_1: 104,
  pox_2_activation: 105,
  epoch_2_2: 106,
  epoch_2_3: 108,
  epoch_2_4: 112,
};

export const POX_CYCLE_LENGTH = 10;

/// This function will fill in any missing epoch values in the timeline
/// with reasonable block heights.
function fillTimeline(timeline: EpochTimeline) {
  if (timeline.epoch_2_0 === undefined) {
    timeline.epoch_2_0 = DEFAULT_EPOCH_TIMELINE.epoch_2_0;
  }
  if (timeline.epoch_2_05 === undefined) {
    timeline.epoch_2_05 = DEFAULT_EPOCH_TIMELINE.epoch_2_05;
    while (timeline.epoch_2_05 <= timeline.epoch_2_0) {
      timeline.epoch_2_05 += POX_CYCLE_LENGTH;
    }
  }
  if (timeline.epoch_2_1 === undefined) {
    timeline.epoch_2_1 = DEFAULT_EPOCH_TIMELINE.epoch_2_1;
    while (timeline.epoch_2_1 <= timeline.epoch_2_05) {
      timeline.epoch_2_1 += POX_CYCLE_LENGTH;
    }
  }
  if (timeline.pox_2_activation === undefined) {
    timeline.pox_2_activation = timeline.epoch_2_1 + 1;
  }
  if (timeline.epoch_2_2 === undefined) {
    timeline.epoch_2_2 = DEFAULT_EPOCH_TIMELINE.epoch_2_2;
    while (timeline.epoch_2_2 <= timeline.pox_2_activation) {
      timeline.epoch_2_2 += POX_CYCLE_LENGTH;
    }
  }
  if (timeline.epoch_2_3 === undefined) {
    timeline.epoch_2_3 = DEFAULT_EPOCH_TIMELINE.epoch_2_3;
    while (timeline.epoch_2_3 <= timeline.epoch_2_2) {
      timeline.epoch_2_3 += POX_CYCLE_LENGTH;
    }
  }
  if (timeline.epoch_2_4 === undefined) {
    timeline.epoch_2_4 = DEFAULT_EPOCH_TIMELINE.epoch_2_4;
    while (timeline.epoch_2_4 <= timeline.epoch_2_3) {
      timeline.epoch_2_4 += POX_CYCLE_LENGTH;
    }
  }
  return timeline;
}

export function buildDevnetNetworkOrchestrator(
  networkId: number,
  timeline: EpochTimeline = DEFAULT_EPOCH_TIMELINE,
  logs = false,
  stacks_node_image_url?: string
) {
  let uuid = Date.now();
  let working_dir = `/tmp/stacks-test-${uuid}-${networkId}`;
  // Fill in default values for any unspecified epochs
  let full_timeline = fillTimeline(timeline);
  // Set the stacks-node image URL to the default image for the version if it's
  // not explicitly set
  if (stacks_node_image_url === undefined) {
    stacks_node_image_url = process.env.CUSTOM_STACKS_NODE;
  }
  let config = {
    logs,
    devnet: {
      name: `ephemeral-devnet-${uuid}`,
      bitcoin_controller_block_time: Constants.BITCOIN_BLOCK_TIME,
      epoch_2_0: full_timeline.epoch_2_0,
      epoch_2_05: full_timeline.epoch_2_05,
      epoch_2_1: full_timeline.epoch_2_1,
      pox_2_activation: full_timeline.pox_2_activation,
      epoch_2_2: full_timeline.epoch_2_2,
      epoch_2_3: full_timeline.epoch_2_3,
      epoch_2_4: full_timeline.epoch_2_4,
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

export const getStacksNodeVersion = () => {
  let nodeVersion: string | undefined;
  // Try to import the stacksNodeVersion export
  try {
    const { stacksNodeVersion } = require("@hirosystems/stacks-devnet-js");
    nodeVersion = stacksNodeVersion();
  } catch (e) {
    nodeVersion = "2.1";
  }
  return nodeVersion;
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

export async function deployContract(
  network: StacksNetwork,
  sender: Account,
  nonce: number,
  contractName: string,
  codeBody: string
) {
  // Build the transaction to deploy the contract
  let deployTxOptions = {
    senderKey: sender.secretKey,
    contractName,
    codeBody,
    fee: DEFAULT_FEE,
    network,
    anchorMode: AnchorMode.OnChainOnly,
    postConditionMode: PostConditionMode.Allow,
    nonce,
    clarityVersion: undefined,
  };

  let transaction = await makeContractDeploy(deployTxOptions);
  let response = await broadcastTransaction(transaction, network);
  expect(response.error).toBeUndefined();
  return { transaction, response };
}
