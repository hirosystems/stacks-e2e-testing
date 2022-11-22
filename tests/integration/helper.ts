import { StacksDevnetOrchestrator } from '@hirosystems/stacks-devnet-js';

export function buildStacksDevnetOrchestrator() {
    const orchestrator = new StacksDevnetOrchestrator({
        path: "./Clarinet.toml",
        logs: true,
    });
    return orchestrator;
}
