import { StacksTestnet } from "@stacks/network";
import { getChainInfo } from "../integration/helpers";
import { Accounts } from "../integration/constants";
import {
  broadcastDelegateStackExtend,
  broadcastDelegateStackIncrease,
} from "../integration/pox/helpers-pooled-stacking";

describe("stack-increase", async () => {
  const fee = 1000;

  const network = new StacksTestnet({
    url: "https://api24.testnet.dev.hiro.so",
  });

  let faucetNonce = 7;

  it("do it", async () => {
    let chainInfo = await getChainInfo(network);
    const blockHeight = chainInfo.burn_block_height;
    console.log("blockHeight: ", blockHeight);
    const cycles = 1;

    // Faucet increases deployer's stack
    let response = await broadcastDelegateStackIncrease(
      {
        poxVersion: 3,
        network,
        account: Accounts.FAUCET,
        fee,
        nonce: faucetNonce++,
      },
      {
        stacker: Accounts.DEPLOYER,
        poolRewardAccount: Accounts.FAUCET,
        increaseByAmountUstx: 100_000_000_000_000,
      }
    );
    console.log("Faucet increases deployer's stack: ", response);
    expect(response.error).toBeUndefined();

    // Faucet extends deployer's stack
    response = await broadcastDelegateStackExtend(
      {
        poxVersion: 3,
        network,
        account: Accounts.FAUCET,
        fee,
        nonce: faucetNonce++,
      },
      {
        stacker: Accounts.DEPLOYER,
        poolRewardAccount: Accounts.FAUCET,
        extendByCount: 6,
      }
    );
    console.log("Faucet extends deployer's stack: ", response);
    expect(response.error).toBeUndefined();
  });
});
