import { ensureEphemeralDevnetDown } from "./tests/helpers";

beforeAll(async () => {
  console.log("Starting tests");
  ensureEphemeralDevnetDown();
});
