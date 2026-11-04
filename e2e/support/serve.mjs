// The end-to-end tests' server: `next build` then `next start` against the
// synthetic store (preload.mjs), with the test proxy on, in the environment
// server-env.mjs builds.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { e2eServerEnv } from "./server-env.mjs";

const root = join(import.meta.dirname, "../..");
const port = process.env.E2E_PORT ?? "3100";
const env = e2eServerEnv({
  env: process.env,
  envExample: readFileSync(join(root, ".env.example"), "utf8"),
  port,
  preload: join(import.meta.dirname, "preload.mjs"),
});

const next = join(root, "node_modules/.bin/next");
if (process.env.E2E_SKIP_BUILD !== "1") {
  const build = spawnSync(next, ["build"], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const server = spawn(next, ["start", "-p", port], {
  cwd: root,
  env,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 0));
