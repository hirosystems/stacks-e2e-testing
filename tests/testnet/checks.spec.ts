import { StacksTestnet } from "@stacks/network";
import { Accounts } from "../integration/constants";
import {
  callReadOnlystackerInfo,
  getAccount,
  getPoxInfo,
  readDelegationStateForAddress,
  readRewardCyclePoxAddressList,
  readStackingStateForAddress,
} from "../integration/pox/helpers";
import { ClarityValue, cvToString } from "@stacks/transactions";
import { poxAddressToBtcAddress } from "@stacks/stacking";

const printPoxAddrInfo = (infoList: Record<string, ClarityValue>[]) => {
  infoList.map((info) => {
    let btcAddr = poxAddressToBtcAddress(info["pox-addr"], "testnet");
    console.log(
      `Pox Address: ${btcAddr}, Stacker: ${cvToString(
        info["stacker"]
      )}, Amount: ${cvToString(info["total-ustx"])}`
    );
  });
};

describe("stack-increase", async () => {
  const network = new StacksTestnet({
    url: "https://api24.testnet.dev.hiro.so",
  });

  it("check it", async () => {
    let poxInfo = await getPoxInfo(network);
    console.log("poxInfo:");
    console.log(poxInfo);

    let alice = await getAccount(network, Accounts.WALLET_1.stxAddress);
    let aliceInfo = await callReadOnlystackerInfo(
      network,
      3,
      Accounts.WALLET_1
    );
    let aliceState = await readDelegationStateForAddress(
      network,
      3,
      Accounts.WALLET_1.stxAddress
    );
    console.log(
      "Alice",
      Accounts.WALLET_1.stxAddress,
      Accounts.WALLET_1.btcAddress
    );
    console.log(
      `https://mempool.space/testnet/address/${Accounts.WALLET_1.btcAddress}`
    );
    console.log(alice);
    console.log(cvToString(aliceInfo));
    console.log(cvToString(aliceState));

    let bob = await getAccount(network, Accounts.WALLET_2.stxAddress);
    let bobInfo = await callReadOnlystackerInfo(network, 3, Accounts.WALLET_2);
    let bobState = await readDelegationStateForAddress(
      network,
      3,
      Accounts.WALLET_2.stxAddress
    );
    console.log(
      "Bob",
      Accounts.WALLET_2.stxAddress,
      Accounts.WALLET_2.btcAddress
    );
    console.log(
      `https://mempool.space/testnet/address/${Accounts.WALLET_2.btcAddress}`
    );
    console.log(bob);
    console.log(cvToString(bobInfo));
    console.log(cvToString(bobState));

    let chloe = await getAccount(network, Accounts.WALLET_3.stxAddress);
    let chloeInfo = await callReadOnlystackerInfo(
      network,
      3,
      Accounts.WALLET_3
    );
    let chloeState = await readDelegationStateForAddress(
      network,
      3,
      Accounts.WALLET_3.stxAddress
    );
    console.log(
      "Chloe",
      Accounts.WALLET_3.stxAddress,
      Accounts.WALLET_3.btcAddress
    );
    console.log(
      `https://mempool.space/testnet/address/${Accounts.WALLET_3.btcAddress}`
    );
    console.log(chloe);
    console.log(cvToString(chloeInfo));
    console.log(cvToString(chloeState));

    let deployer = await getAccount(network, Accounts.DEPLOYER.stxAddress);
    let deployerInfo = await callReadOnlystackerInfo(
      network,
      3,
      Accounts.DEPLOYER
    );
    let deployerState = await readDelegationStateForAddress(
      network,
      3,
      Accounts.DEPLOYER.stxAddress
    );
    console.log(
      "Deployer",
      Accounts.DEPLOYER.stxAddress,
      Accounts.DEPLOYER.btcAddress
    );
    console.log(
      `https://mempool.space/testnet/address/${Accounts.DEPLOYER.btcAddress}`
    );
    console.log(deployer);
    console.log(cvToString(deployerInfo));
    console.log(cvToString(deployerState));

    let faucet = await getAccount(network, Accounts.FAUCET.stxAddress);
    let faucetInfo = await callReadOnlystackerInfo(network, 3, Accounts.FAUCET);
    let faucetState = await readDelegationStateForAddress(
      network,
      3,
      Accounts.FAUCET.stxAddress
    );
    console.log(
      "Faucet",
      Accounts.FAUCET.stxAddress,
      Accounts.FAUCET.btcAddress
    );
    console.log(
      `https://mempool.space/testnet/address/${Accounts.FAUCET.btcAddress}`
    );
    console.log(faucet);
    console.log(cvToString(faucetInfo));
    console.log(cvToString(faucetState));

    let poxAddrs = await readRewardCyclePoxAddressList(
      network,
      3,
      poxInfo.current_cycle.id
    );
    console.log("current cycle poxAddrs:");
    if (poxAddrs) {
      printPoxAddrInfo(poxAddrs);
    } else {
      console.log("None");
    }

    poxAddrs = await readRewardCyclePoxAddressList(
      network,
      3,
      poxInfo.next_cycle.id
    );
    console.log("next cycle poxAddrs:");
    if (poxAddrs) {
      printPoxAddrInfo(poxAddrs);
    } else {
      console.log("None");
    }
  });
});
