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
