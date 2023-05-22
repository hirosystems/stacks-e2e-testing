import { StacksTestnet } from "@stacks/network";
import { getChainInfo } from "../integration/helpers";
import {
  broadcastStackExtend,
  broadcastStackIncrease,
} from "../integration/pox/helpers-direct-stacking";
import { Accounts } from "../integration/constants";

describe("stack-increase", async () => {
  const fee = 1000;

  const network = new StacksTestnet({
    url: "https://api24.testnet.dev.hiro.so",
  });

  let bobNonce = 2;
  let chloeNonce = 2;

  it("do it", async () => {
    let chainInfo = await getChainInfo(network);
    const blockHeight = chainInfo.burn_block_height;
    console.log("blockHeight: ", blockHeight);
    const cycles = 1;

    console.log("Alice stacks 75m");

    // Bob etends by 5 cycles
    let response = await broadcastStackExtend(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_2,
        fee,
        nonce: bobNonce++,
      },
      { cycles: 5 }
    );
    console.log("Bob extends 5 cycles response: ", response);
    expect(response.error).toBeUndefined();

    // Chloe increases her stack by 81M
    response = await broadcastStackIncrease(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
      },
      { amount: 81_000_000_000_000 }
    );
    console.log("Chloe increases 81M response: ", response);
    expect(response.error).toBeUndefined();
  });
});
