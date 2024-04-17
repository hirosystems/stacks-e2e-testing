import { execSync as x } from "child_process";

export function ensureEphemeralDevnetDown() {
  try {
    x("docker ps -q --filter 'name=ephemeral-devnet' | xargs -r docker stop");
    x("docker ps -aq --filter 'name=ephemeral-devnet' | xargs -r docker rm -v");
    x(
      "docker network ls --format '{{.Name}}' | grep 'ephemeral-devnet' | xargs docker network rm",
    );
  } catch (error) {
    console.error("Failed to clean up previous devnet instances.", error);
  }
}
