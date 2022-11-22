import { buildStacksDevnetOrchestrator } from '../../helper';

const orchestrator = buildStacksDevnetOrchestrator();

beforeAll(() => orchestrator.start());
afterAll(() => orchestrator.stop());

test('Block height changes when blocks are mined', () => {

    const block = orchestrator.waitForStacksBlock();
    console.log(block);
})
