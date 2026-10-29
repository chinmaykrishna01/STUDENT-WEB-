import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT ?? "5174";
const env = {
  ...process.env,
  BASE_PATH: "/",
  HOST: "127.0.0.1",
  PORT: port,
};

function runBuild(packageName) {
  const packageManager = process.env.npm_execpath;
  const result = spawnSync(
    packageManager ?? "corepack",
    packageManager
      ? ["--filter", packageName, "run", "build"]
      : ["pnpm", "--filter", packageName, "run", "build"],
    {
      cwd: workspaceRoot,
      env,
      shell: !packageManager && process.platform === "win32",
      stdio: "inherit",
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runBuild("@workspace/specforge");
runBuild("@workspace/api-server");

const server = spawn(
  process.execPath,
  ["--enable-source-maps", "artifacts/api-server/dist/index.mjs"],
  {
    cwd: workspaceRoot,
    env,
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("error", (error) => {
  console.error("Could not start the local SpecForge server:", error);
  process.exitCode = 1;
});

server.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
