import { buildStacksDevnetOrchestrator, broadcastStackSTX } from '../../helpers';
import { StacksChainUpdate } from '@hirosystems/stacks-devnet-js';
import { assert } from 'console';
import { Accounts } from '../../constants';
import { StacksTestnet } from "@stacks/network";

const orchestrator = buildStacksDevnetOrchestrator();

beforeAll(() => orchestrator.start());
afterAll(() => orchestrator.stop());

test('submitting stacks-stx through pox-2 contract after epoch 2.1 transition should succeed', async () => {
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });

    // Wait for Stacks genesis block to be mined
    let chainEvent: StacksChainUpdate = orchestrator.waitForStacksBlock();
    let blockHeight = chainEvent.new_blocks[0].block.block_identifier.index;
    assert(blockHeight == 1);

    // // Wait for 2.1 epoch transition
    // do {
    //     chainEvent = orchestrator.waitForStacksBlock();
    //     let metadata = chainEvent.new_blocks[0].block.metadata! as StacksBlockMetadata;
    //     blockHeight = metadata.bitcoin_anchor_block_identifier.index;
    // } while (blockHeight < Constants.DEVNET_DEFAULT_EPOCH_2_1);

    // Broadcast some STX stacking orders

    // Build a `stack-stx` transaction
    let result = await broadcastStackSTX(1, network, 50_000_000_000_000, Accounts.WALLET_1, blockHeight);
    console.log(result);

    chainEvent = orchestrator.waitForStacksBlock();
    console.log(chainEvent.new_blocks[0].block.transactions);

    chainEvent = orchestrator.waitForStacksBlock();
    console.log(chainEvent.new_blocks[0].block.transactions);
})
