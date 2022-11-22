import { StacksDevnetOrchestrator } from '@hirosystems/stacks-devnet-js';
import { Constants } from './constants';

export function buildStacksDevnetOrchestrator() {
    const orchestrator = new StacksDevnetOrchestrator({
        path: "./Clarinet.toml",
        logs: true,
        devnet: {
            bitcoin_controller_block_time: Constants.BITCOIN_BLOCK_TIME,
        }
    });
    return orchestrator;
}
