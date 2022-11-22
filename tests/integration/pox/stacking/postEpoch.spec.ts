import { buildStacksDevnetOrchestrator } from '../../helper';
import { StacksBlockMetadata, StacksChainUpdate } from '@hirosystems/stacks-devnet-js'; 
import { assert } from 'console';
import { Constants } from '../../constants';

const orchestrator = buildStacksDevnetOrchestrator();

beforeAll(() => orchestrator.start());
afterAll(() => orchestrator.stop());

test('submitting stacks-stx through pox-2 contract after epoch 2.1 transition should suceed', () => {
    // Wait for Stacks genesis block to be mined
    let chainEvent: StacksChainUpdate = orchestrator.waitForStacksBlock();
    let blockHeight = chainEvent.new_blocks[0].block.block_identifier.index;
    assert(blockHeight == 1);

    do {
        chainEvent = orchestrator.waitForStacksBlock();
        let metadata = chainEvent.new_blocks[0].block.metadata! as StacksBlockMetadata;
        blockHeight = metadata.bitcoin_anchor_block_identifier.index;
    } while (blockHeight <= Constants.DEVNET_DEFAULT_EPOCH_2_1);

    console.log(blockHeight);

    // chainEvent = orchestrator.waitForStacksBlock();
    // console.log(chainEvent.new_blocks[0].block);
})
