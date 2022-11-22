import { buildStacksDevnetOrchestrator } from '../../helper';
import { StacksBlockMetadata, StacksChainUpdate } from '@hirosystems/stacks-devnet-js';
import { assert } from 'console';
import { Constants, Accounts, Contracts } from '../../constants';
import {
    addressFromHashMode,
    AddressHashMode,
    addressToString,
    AnchorMode,
    broadcastTransaction,
    bufferCV,
    bufferCVFromString,
    getNonce,
    makeContractCall,
    PostConditionMode,
    standardPrincipalCVFromAddress,
    TransactionVersion,
    tupleCV,
    uintCV,
} from "@stacks/transactions";
import { StacksTestnet } from "@stacks/network";
import { principalCV } from '@stacks/transactions/dist/clarity/types/principalCV';

const orchestrator = buildStacksDevnetOrchestrator();

beforeAll(() => orchestrator.start());
afterAll(() => orchestrator.stop());

test('submitting stacks-stx through pox-2 contract after epoch 2.1 transition should suceed', async () => {
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
    const network = new StacksTestnet({ url: orchestrator.getStacksNodeUrl() });
    const nonce = await getNonce(Accounts.DEPLOYER.stxAddress, network);
    let wallet1 = principalCV(Accounts.WALLET_1.stxAddress);
    const txOptions = {
      contractAddress: Contracts.POX_1.address,
      contractName: Contracts.POX_1.name,
      functionName: "stacks-stx",
      functionArgs: [
        uintCV(50_000_000_000_000),
        tupleCV({
            // version: bufferCV(wallet1.address.version.valueOf()),
            version: bufferCVFromString("0x26"),
            hashbytes: bufferCVFromString(wallet1.address.hash160),
        }),
        uintCV(blockHeight),
        uintCV(12),
      ],
      fee: 1000,
      nonce,
      network,
      anchorMode: AnchorMode.OnChainOnly,
      postConditionMode: PostConditionMode.Allow,
      senderKey: Accounts.WALLET_1.secretKey,
    };
    const tx = await makeContractCall(txOptions);
  
    // Broadcast transaction to our Devnet stacks node
    const result = await broadcastTransaction(tx, network);

    chainEvent = orchestrator.waitForStacksBlock();
    console.log(chainEvent.new_blocks[0].block.transactions);

    chainEvent = orchestrator.waitForStacksBlock();
    console.log(chainEvent.new_blocks[0].block.transactions);
})
