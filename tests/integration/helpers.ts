import { StacksDevnetOrchestrator } from '@hirosystems/stacks-devnet-js';
import { Constants } from './constants';

export function buildStacksDevnetOrchestrator() {
    const orchestrator = new StacksDevnetOrchestrator({
        path: "./Clarinet.toml",
        logs: true,
        devnet: {
            bitcoin_controller_block_time: Constants.BITCOIN_BLOCK_TIME,
            epoch_2_0: Constants.DEVNET_DEFAULT_EPOCH_2_0,
            epoch_2_05: Constants.DEVNET_DEFAULT_EPOCH_2_05,
            epoch_2_1: Constants.DEVNET_DEFAULT_EPOCH_2_1,
        }
    });
    return orchestrator;
}
