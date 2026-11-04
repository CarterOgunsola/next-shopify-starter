// The end-to-end tests' server: `next build` then `next start` against the
// synthetic store (preload.mjs), with the test proxy on, in the environment
// server-env.mjs builds. With --dev (`pnpm dev:synthetic`) it runs `next
// dev` instead, on port 4748, for working on the site without a Shopify
// store, and serves the dataset's images on the port after it.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { imagesFolder, readDataset } from "./dataset.mjs";
import { imageResponse } from "./images.mjs";
import { e2eServerEnv } from "./server-env.mjs";

const root = join(import.meta.dirname, "../..");
const dev = process.argv.includes("--dev");
const port = process.env.E2E_PORT ?? (dev ? "4748" : "3100");
const env = e2eServerEnv({
  env: process.env,
  envExample: readFileSync(join(root, ".env.example"), "utf8"),
  port,
  preload: join(import.meta.dirname, "preload.mjs"),
  dev,
});

const next = join(root, "node_modules/.bin/next");
if (!dev && process.env.E2E_SKIP_BUILD !== "1") {
  const build = spawnSync(next, ["build"], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
if (dev && env.SYNTHETIC_DATASET) {
  // A mistake in the dataset stops here, not in every server process.
  try {
    readDataset(env.SYNTHETIC_DATASET);
  } catch (error) {
    console.error(`[dev:synthetic] ${error.message}`);
    process.exit(1);
  }
  await serveImages(
    imagesFolder(env.SYNTHETIC_DATASET),
    new URL(env.SYNTHETIC_IMAGES_URL),
  ).catch((error) => {
    console.error(
      `[dev:synthetic] can't serve images at ${env.SYNTHETIC_IMAGES_URL}: ${error.message}`,
    );
    process.exit(1);
  });
}
const server = spawn(next, [dev ? "dev" : "start", "-p", port], {
  cwd: root,
  env,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 0));

// The dataset's images (images.mjs): placeholders, which never change, and
// files from its images folder, which might.
function serveImages(folder, url) {
  const images = createServer(async (request, response) => {
    const { pathname } = new URL(request.url ?? "/", url);
    const answer = await imageResponse(pathname, folder);
    if (answer.status !== 200) {
      response.writeHead(answer.status).end();
      return;
    }
    response
      .writeHead(200, {
        "content-type": answer.type,
        "cache-control": pathname.startsWith("/placeholder/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      })
      .end(answer.body);
  });
  return new Promise((resolve, reject) => {
    images.once("error", reject);
    images.listen(Number(url.port), url.hostname, () => resolve(images));
  });
}
