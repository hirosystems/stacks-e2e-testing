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

#### Using 2.4 `stacks-node`

To run tests using the 2.2 node (the tests in the _pox-disabled/_ directory), you'll need to use a currently unpublished version of the `stacks-devnet-js` package which has support for the new settings. To build this locally:

```
git clone https://github.com/hirosystems/clarinet.git
cd clarinet
git checkout feat/devnet-epoch-2.2
cd components/stacks-devnet-js
npm install
```

Then you'll want to run one of the following commands, depending on your platform:

```
npm run build-linux-x64-glibc
npm run build-linux-x64-musl
npm run build-windows-x64
npm run build-darwin-x64   # Mac with Intel
npm run build-darwin-arm64 # Mac with Apple Silicon
```

Finally, you'll use `npm link` to utilize this version in this testing repo. First, in the `stacks-devnet-js` directory, run:

```
npm link
```

This will create a symbolic link from the local package directory to the global node_modules directory.

Then back in this testing directory, run:

```
npm link @hirosystems/stacks-devnet-js
```

Now, you can run the tests expecting this 2.2 node, i.e. those in the _pox-disabled/_ directory.

To switch back to the default version, run:

```
npm unlink @hirosystems/stacks-devnet-js --no-save
yarn install
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
