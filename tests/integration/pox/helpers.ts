import {
  DevnetNetworkOrchestrator,
  StacksChainUpdate,
} from "@hirosystems/stacks-devnet-js";
import { StacksNetwork } from "@stacks/network";
import { CoreInfo } from "@stacks/stacking";
import {
  tupleCV,
  uintCV,
  cvToHex,
  TxBroadcastResult,
  hexToCV,
  cvToString,
  SomeCV,
  TupleCV,
  UIntCV,
  NoneCV,
  ClarityType,
  ClarityValue,
  PrincipalCV,
  someCV,
  principalCV,
  noneCV,
  OptionalCV,
} from "@stacks/transactions";

import { expect } from "vitest";
const fetch = require("node-fetch");

export interface Account {
  stxAddress: string;
  btcAddress: string;
  secretKey: string;
}

export interface BroadcastOptionsPox2 {
  network: StacksNetwork;
  account: Account;
  fee: number;
  nonce: number;
}
export interface BroadcastOptions extends BroadcastOptionsPox2 {
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
  cycleId: number
) => {
  const url = network.getMapEntryUrl(
    "ST000000000000000000002AMW42H",
    "pox-2",
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
      cycleId,
      i
    )) as Record<string, ClarityValue>;
    poxAddrInfoList.push(poxAddressInfo);
  }

  return poxAddrInfoList;
};

export const readRewardCyclePoxAddressForAddress = async (
  network: StacksNetwork,
  cycleId: number,
  address: string
) => {
  // TODO: There might be a better way to do this using the `stacking-state`
  //       map to get the index
  const url = network.getMapEntryUrl(
    "ST000000000000000000002AMW42H",
    "pox-2",
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
  stacker: OptionalCV<PrincipalCV>;
};

export const readRewardCyclePoxAddressListAtIndex = async (
  network: StacksNetwork,
  cycleId: number,
  index: number
): Promise<RewardCyclePoxAddressMapEntry | null | undefined> => {
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
