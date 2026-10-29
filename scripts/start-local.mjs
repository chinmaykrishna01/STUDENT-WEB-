import { spawn, spawnSync } from "node:child_process";
import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatorRoot = path.resolve(workspaceRoot, "..", "..", "specforge-starter");
const port = process.env.PORT ?? "5174";
const submissionApiPort = process.env.SUBMISSION_API_PORT ?? "3003";
const env = {
  ...process.env,
  BASE_PATH: "/",
  HOST: "127.0.0.1",
  PORT: port,
  SUBMISSION_API_PORT: submissionApiPort,
};

function run(command, args, cwd, runEnv) {
  const result = spawnSync(command, args, {
    cwd,
    env: runEnv,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

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

const viteCli = path.join(generatorRoot, "node_modules", "vite", "bin", "vite.js");
const generatorFrontend = path.join(generatorRoot, "dist");
try {
  await access(viteCli);
  await access(path.join(generatorRoot, "node_modules", "tsx", "dist", "cli.mjs"));
} catch {
  console.error(`Submission generator dependencies are missing from ${generatorRoot}.`);
  process.exit(1);
}

run(
  process.execPath,
  [viteCli, "build"],
  generatorRoot,
  {
    ...process.env,
    VITE_BASE_PATH: "/generator/",
    VITE_API_BASE_URL: "/api/v1",
  },
);

const integratedGeneratorPath = path.join(
  workspaceRoot,
  "artifacts",
  "api-server",
  "dist",
  "public",
  "generator",
);
await mkdir(path.dirname(integratedGeneratorPath), { recursive: true });
await cp(generatorFrontend, integratedGeneratorPath, { recursive: true });

const generatorApi = spawn(
  process.execPath,
  [
    path.join(generatorRoot, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(generatorRoot, "server", "index.ts"),
  ],
  {
    cwd: generatorRoot,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: submissionApiPort,
    },
    stdio: ["inherit", "pipe", "inherit"],
  },
);
let generatorApiReady = false;
let shuttingDown = false;

const startupTimeout = setTimeout(() => {
  if (!generatorApiReady) {
    console.error("Submission generator API did not start in time.");
    shuttingDown = true;
    generatorApi.kill();
    process.exitCode = 1;
    server.kill();
  }
}, 15_000);
startupTimeout.unref();
generatorApi.stdout?.on("data", (chunk) => {
  process.stdout.write(chunk);
  if (String(chunk).includes("API on http://")) {
    generatorApiReady = true;
    clearTimeout(startupTimeout);
  }
});

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
  process.on(signal, () => {
    shuttingDown = true;
    server.kill(signal);
    generatorApi.kill(signal);
  });
}

server.on("error", (error) => {
  console.error("Could not start the local SpecForge server:", error);
  generatorApi.kill();
  process.exitCode = 1;
});

server.on("exit", (code) => {
  shuttingDown = true;
  clearTimeout(startupTimeout);
  if (generatorApi.exitCode === null) generatorApi.kill();
  process.exitCode = code ?? 1;
});

generatorApi.on("error", (error) => {
  console.error("Could not start the submission generator API:", error);
  server.kill();
  process.exitCode = 1;
});

generatorApi.on("exit", (code) => {
  clearTimeout(startupTimeout);
  if (!shuttingDown && code !== null && code !== 0) {
    console.error(`Submission generator API exited with code ${code}.`);
    server.kill();
    process.exitCode = code;
  }
});
