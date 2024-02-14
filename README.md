# stacks-devnet-js

Public repository of tests focused on checking the new features coming with the Stacks 2.1 network upgrade.

### How to run

```bash
yarn install
yarn test:dev
```

To run tests from one file, use:

```
yarn vitest --run direct-stacking-with-bug
```

Or to run a specific test, use the `-t` flag to specify the complete name:

```
yarn test:dev run -t "using stacks-increase in the same cycle should result in increased rewards"
```

When running multiple tests, you'll want to limit it to one test at a time because multiple tests in parallel will sometimes cross contaminate. To avoid this, you can use the `--threads false` flag, for example, the following will run all of the tests in the _pox/stacking/_ directory, one at a time:

```sh
yarn vitest --run tests/integration/pox/stacking/ --threads false
```

#### 2.4 `stacks-node` Image

To run with the latest node, you'll need to specify the docker image URL to use via an environment variable:

```sh
export CUSTOM_STACKS_NODE="blockstack/stacks-blockchain:devnet-2.4.0.0.0"
```

On a Mac with Apple Silicon, the published stacks-node image, `blockstack/stacks-blockchain:devnet-2.4.0.0.0` does not seem to work correctly. You will know you have run into this problem if your tests fail with:

```
Unknown Error: waitForNextStacksBlock maxErrors reached
```

and in the stacks-node logs, you see this error repeated:

```
Apr 26 15:56:09.987721 INFO Anchor block selected for cycle 1: 58cae3b5f5ae5c0cd5b459795805118d16979da8/64563a5269476a9c5ade56b42af3eb3921dd18396692d12e3079e6888ba63a3e (txid 775781e42691dfa2c52d5e8175f48831ae49fd993beae35499d3f223b563577a)
Apr 26 15:56:09.991729 ERRO Relayer: Failure fetching recipient set: ChainstateError(ClarityError(Interpreter(Unchecked(NoSuchContract("ST000000000000000000002AMW42H.pox-2")))))
```

As an alternative, you can build this image locally, or update the image URL in the environment variable to use:

```sh
export CUSTOM_STACKS_NODE="stacksbrice/stacks-node:devnet-2.4.0.0.0"
```

If this environment variable is not defined, `stacks-devnet-js` will default to an older version of the `stacks-node`.

## Logging

The devnet orchestrator outputs logging details to folder `/tmp/stacks-node-...`
