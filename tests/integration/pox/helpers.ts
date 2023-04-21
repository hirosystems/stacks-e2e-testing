import {
  DevnetNetworkOrchestrator,
  StacksChainUpdate,
} from "@hirosystems/stacks-devnet-js";
import { StacksNetwork } from "@stacks/network";
import {
  tupleCV,
  uintCV,
  cvToHex,
  TxBroadcastResult,
} from "@stacks/transactions";

import { expect } from "vitest";
const fetch = require("node-fetch");

export interface Account {
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
  const wallet = await getAccount(network, address);
  expect(wallet.balance).toBe(BigInt(account));
  expect(wallet.locked).toBe(BigInt(locked));
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

export const readRewardCyclePoxAddressList = async (
  network: StacksNetwork,
  cycleId: number,
  index: number
) => {
  const url = network.getMapEntryUrl(
    "ST000000000000000000002AMW42H",
    "pox-2",
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
  return response.json();
};
