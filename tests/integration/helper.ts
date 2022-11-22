import { StacksDevnetOrchestrator } from '@hirosystems/stacks-devnet-js';
import { Constants } from './constants';

export function buildStacksDevnetOrchestrator() {
    const orchestrator = new StacksDevnetOrchestrator({
        path: "./Clarinet.toml",
        logs: true,
        devnet: {
            bitcoin_controller_block_time: Constants.BITCOIN_BLOCK_TIME,
            epoch_2_0: 100,
            epoch_2_05: 120,
            epoch_2_1: 140,
        }
    });
    return orchestrator;
}
