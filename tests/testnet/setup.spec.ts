import { StacksTestnet } from "@stacks/network";
import { getChainInfo } from "../integration/helpers";
import {
  broadcastStackIncrease,
  broadcastStackSTX,
} from "../integration/pox/helpers-direct-stacking";
import { Accounts } from "../integration/constants";
import {
  broadcastDelegateSTX,
  broadcastDelegateStackSTX,
  broadcastStackAggregationCommitIndexed,
} from "../integration/pox/helpers-pooled-stacking";
import { getPoxInfo } from "../integration/pox/helpers";

describe("stack-increase", async () => {
  const fee = 1000;

  const network = new StacksTestnet({
    url: "https://api24.testnet.dev.hiro.so",
  });

  let aliceNonce = 0;
  let bobNonce = 0;
  let chloeNonce = 0;
  let deployerNonce = 0;
  let faucetNonce = 0;

  it("do it", async () => {
    let chainInfo = await getChainInfo(network);
    const blockHeight = chainInfo.burn_block_height;
    console.log("blockHeight: ", blockHeight);
    const cycles = 1;

    console.log("Alice stacks 75m");

    // Alice stacks 75m STX
    let response = await broadcastStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_1,
        fee,
        nonce: aliceNonce++,
      },
      { amount: 75_000_000_000_000, blockHeight, cycles: 3 }
    );
    console.log("Alice stacks 75m response: ", response);
    expect(response.error).toBeUndefined();

    // Alice delegates 50m to Faucet
    response = await broadcastDelegateSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_1,
        fee,
        nonce: aliceNonce++,
      },
      { amount: 50_000_000_000_000, poolAddress: Accounts.FAUCET }
    );
    console.log("Alice delegates 50m response: ", response);
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
      }
    );
    console.log("Faucet tries to stack Alice's 50m STX response: ", response);
    expect(response.error).toBeUndefined();

    let poxInfo = await getPoxInfo(network);

    // Faucet tries to commit 50m for the next cycle
    response = await broadcastStackAggregationCommitIndexed(
      {
        poxVersion: 3,
        network,
        account: Accounts.FAUCET,
        fee: fee,
        nonce: faucetNonce++,
      },
      { poolRewardAccount: Accounts.FAUCET, cycleId: poxInfo.next_cycle.id }
    );
    console.log(
      "Faucet tries to commit 50m for next cycle response: ",
      response
    );
    expect(response.error).toBeUndefined();

    // Bob stacks 800M for 1 cycle
    response = await broadcastStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_2,
        fee,
        nonce: bobNonce++,
      },
      { amount: 800_000_000_000_000, blockHeight, cycles: 1 }
    );
    console.log("Bob stacks 800M response: ", response);
    expect(response.error).toBeUndefined();

    // Chloe stacks 100M for 3 cycles (below threshold)
    response = await broadcastStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
      },
      { amount: 100_000_000_000_000, blockHeight, cycles: 1 }
    );
    console.log("Chloe stacks 100M response: ", response);
    expect(response.error).toBeUndefined();

    // Chloe increases her stack by 20M, putting it above the threshold
    response = await broadcastStackIncrease(
      {
        poxVersion: 3,
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: chloeNonce++,
      },
      { amount: 20_000_000_000_000 }
    );
    console.log("Chloe increases 20M response: ", response);
    expect(response.error).toBeUndefined();

    // Deployer delegates 200M to Faucet
    response = await broadcastDelegateSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.DEPLOYER,
        fee,
        nonce: deployerNonce++,
      },
      { amount: 200_000_000_000_000, poolAddress: Accounts.FAUCET }
    );
    console.log("Deployer delegates 200m to faucet pool: ", response);
    expect(response.error).toBeUndefined();

    // Faucet stacks deployers's 200m STX
    response = await broadcastDelegateStackSTX(
      {
        poxVersion: 3,
        network,
        account: Accounts.FAUCET,
        fee: fee,
        nonce: faucetNonce++,
      },
      {
        stacker: Accounts.DEPLOYER,
        amount: 200_000_000_000_000,
        poolRewardAccount: Accounts.FAUCET,
        startBurnHeight: blockHeight,
        lockPeriodCycles: 1,
      }
    );
    console.log("Faucet stacks deployers's 200m STX: ", response);
    expect(response.error).toBeUndefined();

    // Faucet commits for next cycle
    response = await broadcastStackAggregationCommitIndexed(
      {
        poxVersion: 3,
        network,
        account: Accounts.FAUCET,
        fee: fee,
        nonce: faucetNonce++,
      },
      { poolRewardAccount: Accounts.FAUCET, cycleId: poxInfo.next_cycle.id }
    );
    console.log("Faucet commits for next cycle: ", response);
    expect(response.error).toBeUndefined();
  });
});
