import { StacksTestnet } from "@stacks/network";
import { Accounts } from "../integration/constants";
import { getChainInfo } from "../integration/helpers";
import {
  broadcastStackExtend,
  broadcastStackIncrease,
} from "../integration/pox/helpers-direct-stacking";
import {
  broadcastDelegateSTX,
  broadcastDelegateStackExtend,
  broadcastDelegateStackIncrease,
  broadcastDelegateStackSTX,
  broadcastRevokeDelegateStx,
} from "../integration/pox/helpers-pooled-stacking";

describe("stack-increase", async () => {
  const fee = 1000;

  const network = new StacksTestnet({
    url: "https://api24.testnet.dev.hiro.so",
  });

  let aliceNonce = 2;
  let bobNonce = 2;
  let chloeNonce = 2;
  let deployerNonce = 1;
  let faucetNonce = 4;

  it("do it", async () => {
    let chainInfo = await getChainInfo(network);
    const blockHeight = chainInfo.burn_block_height;
    console.log("blockHeight: ", blockHeight);
    const cycles = 1;

    // Bob etends by 5 cycles
    let response = await broadcastStackExtend(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_2,
        fee,
        nonce: bobNonce++,
      },
      { cycles: 5 },
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
      { amount: 81_000_000_000_000 },
    );
    console.log("Chloe increases 81M response: ", response);
    expect(response.error).toBeUndefined();

    // Alice revokes delegation to Faucet
    response = await broadcastRevokeDelegateStx({
      poxVersion: 3,
      network,
      account: Accounts.WALLET_1,
      fee,
      nonce: aliceNonce++,
    });
    console.log("Alice revokes delegation to Faucet response: ", response);
    expect(response.error).toBeUndefined();

    // Faucet tries to stack Alice's 50m STX
    response = await broadcastDelegateStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.FAUCET,
        fee: fee,
        nonce: faucetNonce++,
      },
      {
        stacker: Accounts.WALLET_1,
        amount: 50_000_000_000_000,
        poolRewardAccount: Accounts.FAUCET,
        startBurnHeight: blockHeight,
        lockPeriodCycles: 1,
      },
    );
    console.log("Faucet tries to stack Alice's 50m STX response: ", response);
    expect(response.error).toBeUndefined();

    // Deployer revokes
    response = await broadcastRevokeDelegateStx({
      poxVersion: 3,
      network,
      account: Accounts.DEPLOYER,
      fee,
      nonce: deployerNonce++,
    });
    console.log("Deployer revokes delegation to Faucet response: ", response);
    expect(response.error).toBeUndefined();

    // Deployer re-delegates 300M to Faucet
    response = await broadcastDelegateSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.DEPLOYER,
        fee,
        nonce: deployerNonce++,
      },
      { amount: 300_000_000_000_000, poolAddress: Accounts.FAUCET },
    );
    console.log("Deployer re-delegates 300m to faucet pool: ", response);
    expect(response.error).toBeUndefined();

    // Faucet increases deployer's stack
    response = await broadcastDelegateStackIncrease(
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
      },
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
      },
    );
    console.log("Faucet extends deployer's stack: ", response);
    expect(response.error).toBeUndefined();
  });
});
