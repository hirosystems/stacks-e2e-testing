import { buildDevnetNetworkOrchestrator, getBitcoinBlockHeight, waitForStacksChainUpdate } from '../../helpers';
import { broadcastStackSTX, waitForNextPreparePhase, waitForNextRewardPhase, getPoxInfo, getAccount } from '../helpers'
import { Accounts } from '../../constants';
import { StacksTestnet } from "@stacks/network";

describe('testing stacking under epoch 2.0', () => {

    test('submitting stacks-stx through pox-1 contract during epoch 2.0 should succeed', async () => {
        const orchestrator = buildDevnetNetworkOrchestrator({ epoch_2_0: 100, epoch_2_05: 105, epoch_2_1: 110, pox_2_activation: 115 }, true);
        orchestrator.start()
        const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
        
        // Wait for Stacks genesis block
        orchestrator.waitForStacksBlock();
    
        // WALLET_1 should have their full balance
        let genesisBalance = 100000000000000;
        let wallet1 = await getAccount(network, Accounts.WALLET_1.stxAddress);
        expect(wallet1.balance).toBe(BigInt(genesisBalance));

        // WALLET_2 should have their full balance
        let wallet2 = await getAccount(network, Accounts.WALLET_2.stxAddress);
        expect(wallet2.balance).toBe(BigInt(genesisBalance));

        // WALLET_3 should have their full balance
        let wallet3 = await getAccount(network, Accounts.WALLET_3.stxAddress);
        expect(wallet3.balance).toBe(BigInt(genesisBalance));

        // Wait for block N-2 where N is the height of the next prepare phase
        let chainUpdate = await waitForNextPreparePhase(network, orchestrator, -2);
        let blockHeight = getBitcoinBlockHeight(chainUpdate);
    
        // Broadcast some STX stacking orders
        let fee = 1000;

        // WALLET_1 locking for 1 cycle
        let stackedByWallet1 = 25_000_000_000_000;
        let response = await broadcastStackSTX(1, network, stackedByWallet1, Accounts.WALLET_1, blockHeight, 1, fee);
        expect(response.error).toBeUndefined();

        // WALLET_2 locking for 6 cycle 
        let stackedByWallet2 = 50_000_000_000_000;
        response = await broadcastStackSTX(1, network, stackedByWallet2, Accounts.WALLET_2, blockHeight, 6, fee);
        expect(response.error).toBeUndefined();
    
        // WALLET_3 locking for 12 cycle 
        let stackedByWallet3 = 75_000_000_000_000;
        response = await broadcastStackSTX(1, network, stackedByWallet3, Accounts.WALLET_3, blockHeight, 12, fee);
        expect(response.error).toBeUndefined();
    
        // Wait for block N+1 where N is the height of the next reward phase
        chainUpdate = await waitForNextRewardPhase(network, orchestrator, 1);
        let poxInfo = await getPoxInfo(network);

        // PoX is handled via pox 1.0, and the cycle should be active
        expect(poxInfo.contract_id).toBe('ST000000000000000000002AMW42H.pox');
        expect(poxInfo.current_cycle.is_pox_active).toBe(true);

        // WALLET_1 should have some tokens locked
        wallet1 = await getAccount(network, Accounts.WALLET_1.stxAddress);
        expect(wallet1.balance).toBe(BigInt(genesisBalance - stackedByWallet1 - fee));
        expect(wallet1.locked).toBe(BigInt(stackedByWallet1));

        // WALLET_2 should have some tokens locked
        wallet2 = await getAccount(network, Accounts.WALLET_2.stxAddress);
        expect(wallet2.balance).toBe(BigInt(genesisBalance - stackedByWallet2 - fee));
        expect(wallet2.locked).toBe(BigInt(stackedByWallet2));

        // WALLET_3 should have some tokens locked
        wallet3 = await getAccount(network, Accounts.WALLET_3.stxAddress);
        expect(wallet3.balance).toBe(BigInt(genesisBalance - stackedByWallet3 - fee));
        expect(wallet3.locked).toBe(BigInt(stackedByWallet3));

        // Wait for next PoX cycle (Bitcoin block #121)
        await waitForStacksChainUpdate(orchestrator, 121);
        poxInfo = await getPoxInfo(network);

        // Proof of transfer should now be handled via pox-2 contract, and the cycle should be inactive
        expect(poxInfo.contract_id).toBe('ST000000000000000000002AMW42H.pox-2');
        expect(poxInfo.current_cycle.is_pox_active).toBe(false);

        // WALLET_1 should see their tokens unlocked
        wallet1 = await getAccount(network, Accounts.WALLET_1.stxAddress);
        expect(wallet1.balance).toBe(BigInt(genesisBalance - fee));
        expect(wallet1.locked).toBe(BigInt(0));

        // WALLET_2 should see their tokens unlocked
        wallet2 = await getAccount(network, Accounts.WALLET_2.stxAddress);
        expect(wallet2.balance).toBe(BigInt(genesisBalance - fee));
        expect(wallet2.locked).toBe(BigInt(0));

        // WALLET_3 should see their tokens unlocked
        wallet3 = await getAccount(network, Accounts.WALLET_3.stxAddress);
        expect(wallet3.balance).toBe(BigInt(genesisBalance - fee));
        expect(wallet3.locked).toBe(BigInt(0));

        orchestrator.stop()
    })   
})
