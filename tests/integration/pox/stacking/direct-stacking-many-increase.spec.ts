import { DevnetNetworkOrchestrator } from "@hirosystems/stacks-devnet-js";
import { StacksTestnet } from "@stacks/network";
import { Accounts } from "../../constants";
import {
    buildDevnetNetworkOrchestrator,
    getNetworkIdFromEnv,
    waitForStacksTransaction,
} from "../../helpers";
import {
    getPoxInfo,
    waitForNextRewardPhase,
    readRewardCyclePoxAddressForAddress,
} from "../helpers";
import {
    broadcastStackIncrease,
    broadcastStackSTX,
} from "../helpers-direct-stacking";
import { ClarityValue, cvToString, uintCV } from "@stacks/transactions";

describe("testing multiple stack-stx and stack-increase calls in the same block", () => {
    let orchestrator: DevnetNetworkOrchestrator;
    let timeline = {
        epoch_2_0: 100,
        epoch_2_05: 102,
        epoch_2_1: 106,
        pox_2_activation: 109,
    };

    beforeAll(() => {
        orchestrator = buildDevnetNetworkOrchestrator(getNetworkIdFromEnv());
        orchestrator.start();
    });

    afterAll(() => {
        orchestrator.terminate();
    });

    it("multiple stack-stx and stack-increase calls in the same block", async () => {
        const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

        // Wait for Stacks genesis block
        await orchestrator.waitForNextStacksBlock();

        const blockHeight = timeline.pox_2_activation + 1;
        const fee = 1000;
        const cycles = 1;

        // Alice stacks 100m STX
        let response = await broadcastStackSTX(
            2,
            network,
            100_000_000_000_000,
            Accounts.WALLET_1,
            blockHeight,
            1,
            fee,
            0
        );
        expect(response.error).toBeUndefined();

        // Wait for Alice's stacking transaction to confirm
        let [block, tx] = await waitForStacksTransaction(
            orchestrator,
            response.txid
        );
        expect(tx.success).toBeTruthy();

        // Bob stacks 100m STX
        response = await broadcastStackSTX(
            2,
            network,
            100_000_000_000_000,
            Accounts.WALLET_2,
            blockHeight,
            1,
            fee,
            0
        );
        expect(response.error).toBeUndefined();

        // Wait for Bob's stacking transaction to confirm
        [block, tx] = await waitForStacksTransaction(
            orchestrator,
            response.txid
        );
        expect(tx.success).toBeTruthy();

        // Alice and Bob both increase their stacks by 50m STX in the same block
        const increaseAmount = 50_000_000_000_000;
        const aliceIncrease = broadcastStackIncrease(
            network,
            increaseAmount,
            Accounts.WALLET_1,
            fee,
            1
        );

        const bobIncrease = broadcastStackIncrease(
            network,
            increaseAmount,
            Accounts.WALLET_2,
            fee,
            1
        );

        // Wait for both stack-increase transactions to confirm
        const [aliceResponse, bobResponse] = await Promise.all([
            aliceIncrease,
            bobIncrease,
        ]);

        expect(aliceResponse.error).toBeUndefined();
        expect(bobResponse.error).toBeUndefined();

        const [aliceBlock, aliceTx] = await waitForStacksTransaction(
            orchestrator,
            aliceResponse.txid
        );
        const [bobBlock, bobTx] = await waitForStacksTransaction(
            orchestrator,
            bobResponse.txid
        );

        expect(aliceTx.success).toBeTruthy();
        expect(bobTx.success).toBeTruthy();
        expect(aliceBlock).toEqual(bobBlock); // Both transactions in the same block

        // Read Alice and Bob's total-ustx values after the stack-increase transactions
        const alicePoxAddressInfo = await readRewardCyclePoxAddressForAddress(
            network,
            2, // the next cycle
            Accounts.WALLET_1.stxAddress
        );
        const bobPoxAddressInfo = await readRewardCyclePoxAddressForAddress(
            network,
            2, // the next cycle
            Accounts.WALLET_2.stxAddress
        );

        const aliceTotalUstx = alicePoxAddressInfo ? cvToString(alicePoxAddressInfo["total-ustx"]) : "";
        const bobTotalUstx = bobPoxAddressInfo ? cvToString(bobPoxAddressInfo["total-ustx"]) : "";

        // The total-ustx values should be different due to the unpredictable order
        // of stack-increase calls within the same block
        expect(aliceTotalUstx).not.toEqual(bobTotalUstx);

    });
});
