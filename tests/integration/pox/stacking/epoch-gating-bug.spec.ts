import {
  DevnetNetworkOrchestrator,
  stacksNodeVersion,
} from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import {
  AnchorMode,
  PostConditionMode,
  broadcastTransaction,
  callReadOnlyFunction,
  cvToString,
  makeContractDeploy,
  standardPrincipalCV,
  uintCV,
} from "@stacks/transactions";
import { Accounts, Constants } from "../../constants";
import {
  DEFAULT_EPOCH_TIMELINE,
  asyncExpectStacksTransactionSuccess,
  buildDevnetNetworkOrchestrator,
  getNetworkIdFromEnv,
  waitForStacksTransaction,
} from "../../helpers";
import {
  getCoreInfo,
  getPoxInfo,
  mineBtcBlock as mineBitcoinBlockAndHopeForStacksBlock,
  readRewardCyclePoxAddressForAddress,
  waitForNextRewardPhase,
} from "../helpers";
import {
  broadcastStackIncrease,
  broadcastStackSTX,
} from "../helpers-direct-stacking";
import { time } from "console";

describe("testing solo stacker increase with bug", () => {
  let orchestrator: DevnetNetworkOrchestrator;
  let version: string;
  if (typeof stacksNodeVersion === "function") {
    version = stacksNodeVersion();
  } else {
    version = "2.1";
  }
  const timeline = {
    ...DEFAULT_EPOCH_TIMELINE,
    epoch_2_2: 118,
    pox_2_unlock_height: 119,
  };

  beforeAll(() => {
    orchestrator = buildDevnetNetworkOrchestrator(
      getNetworkIdFromEnv(),
      version,
      timeline
    );
    orchestrator.start();
  });

  afterAll(() => {
    orchestrator.terminate();
  });

  it("epoch gating in clarity should work", async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.pox_2_activation + 1
    );

    const codeBody = `(define-read-only (check-unlock-height (address principal))
    (get unlock-height (stx-account address))
)`;

    // Build the transaction to deploy the contract
    let deployTxOptions = {
      senderKey: Accounts.DEPLOYER.secretKey,
      contractName: "test-2-2",
      codeBody,
      fee: 2000,
      network,
      anchorMode: AnchorMode.OnChainOnly,
      postConditionMode: PostConditionMode.Allow,
      nonce: 0,
    };

    let transaction = await makeContractDeploy(deployTxOptions);
    let response = await broadcastTransaction(transaction, network);
    expect(response.error).toBeUndefined();
    await asyncExpectStacksTransactionSuccess(orchestrator, transaction.txid());

    const blockHeight = Constants.DEVNET_DEFAULT_POX_2_ACTIVATION + 1;
    const fee = 1000;
    const cycles = 4;

    // Faucet stacks 900m (1/4 of liquid suply)
    response = await broadcastStackSTX(
      { poxVersion: 2, network, account: Accounts.FAUCET, fee, nonce: 0 },
      { amount: 900_000_000_000_001, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();

    // let Faucet's stacking confirm to enforce reward index 0
    await waitForStacksTransaction(orchestrator, response.txid);

    // Bob stacks 80m
    response = await broadcastStackSTX(
      { poxVersion: 2, network, account: Accounts.WALLET_2, fee, nonce: 0 },
      { amount: 80_000_000_000_010, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();

    // Bob increases by 10m
    response = await broadcastStackIncrease(
      { network, account: Accounts.WALLET_2, fee, nonce: 1 },
      { amount: 10000000000100 }
    );
    expect(response.error).toBeUndefined();
    // let Bobx's stacking confirm to enforce reward index 1
    await waitForStacksTransaction(orchestrator, response.txid);

    // Cloe stacks 80m
    response = await broadcastStackSTX(
      { poxVersion: 2, network, account: Accounts.WALLET_3, fee, nonce: 0 },
      { amount: 80_000_000_001_000, blockHeight, cycles }
    );
    expect(response.error).toBeUndefined();

    // Cloe increases by 10m
    response = await broadcastStackIncrease(
      {
        network,
        account: Accounts.WALLET_3,
        fee,
        nonce: 1,
      },
      { amount: 10_000_000_010_000 }
    );
    expect(response.error).toBeUndefined();
    await orchestrator.waitForStacksBlockIncludingTransaction(response.txid);

    let poxInfo = await getPoxInfo(network);

    expect(poxInfo.current_cycle.id).toBe(1);
    console.log(poxInfo);

    // Assert that the next cycle has 1_080m STX locked
    // that is more than the liquidity of 1_405m STX
    expect(poxInfo.next_cycle.stacked_ustx).toBe(1_080_000_000_011_111);

    // Check Faucets's table entry
    const poxAddrInfo0 = await readRewardCyclePoxAddressForAddress(
      network,
      2,
      Accounts.FAUCET.stxAddress
    );
    expect(poxAddrInfo0?.["total-ustx"]).toEqual(uintCV(900_000_000_000_001));

    // Check Bob's table entry
    const poxAddrInfo1 = await readRewardCyclePoxAddressForAddress(
      network,
      2,
      Accounts.WALLET_2.stxAddress
    );
    // HERE'S THE BUG: THIS SHOULD BE `u90000000000110`
    // expect(poxAddrInfo1["total-ustx"]).toEqual(
    //   uintCV(90_000_000_000_110)
    // );
    expect(poxAddrInfo1?.["total-ustx"]).toEqual(uintCV(990_000_000_000_111));

    // Check Cloe's table entry
    const poxAddrInfo2 = await readRewardCyclePoxAddressForAddress(
      network,
      2,
      Accounts.WALLET_3.stxAddress
    );
    // HERE'S THE BUG: THIS SHOULD BE `u90000000011000`
    // expect(poxAddrInfo2["total-ustx"]).toEqual(uintCV(90_000_000_011_000));
    expect(poxAddrInfo2?.["total-ustx"]).toEqual(uintCV(1080_000_000_011_111));

    // Verify that calling the clarity contract gives the same incorrect result
    // before the 2.2 actiavtion.
    let output = await callReadOnlyFunction({
      contractName: "test-2-2",
      contractAddress: Accounts.DEPLOYER.stxAddress,
      functionName: "check-unlock-height",
      functionArgs: [standardPrincipalCV(Accounts.WALLET_2.stxAddress)],
      network,
      senderAddress: Accounts.WALLET_1.stxAddress,
    });
    expect(output).toEqual(uintCV(160));

    output = await callReadOnlyFunction({
      contractName: "test-2-2",
      contractAddress: Accounts.DEPLOYER.stxAddress,
      functionName: "check-unlock-height",
      functionArgs: [standardPrincipalCV(Accounts.WALLET_3.stxAddress)],
      network,
      senderAddress: Accounts.WALLET_1.stxAddress,
    });
    expect(output).toEqual(uintCV(160));

    // Wait for the 2.2 activation, then check again
    await orchestrator.waitForStacksBlockAnchoredOnBitcoinBlockOfHeight(
      timeline.epoch_2_2,
    );

    // Verify that calling the clarity contract gives the same incorrect result
    // before the 2.2 actiavtion.
    output = await callReadOnlyFunction({
      contractName: "test-2-2",
      contractAddress: Accounts.DEPLOYER.stxAddress,
      functionName: "check-unlock-height",
      functionArgs: [standardPrincipalCV(Accounts.WALLET_2.stxAddress)],
      network,
      senderAddress: Accounts.WALLET_1.stxAddress,
    });
    expect(output).toEqual(uintCV(timeline.pox_2_unlock_height));

    output = await callReadOnlyFunction({
      contractName: "test-2-2",
      contractAddress: Accounts.DEPLOYER.stxAddress,
      functionName: "check-unlock-height",
      functionArgs: [standardPrincipalCV(Accounts.WALLET_3.stxAddress)],
      network,
      senderAddress: Accounts.WALLET_1.stxAddress,
    });
    expect(output).toEqual(uintCV(timeline.pox_2_unlock_height));
  });
});
