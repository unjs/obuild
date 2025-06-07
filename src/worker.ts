import { parentPort, workerData } from "node:worker_threads";
import { loadConfig } from "c12";
import { resolveContext, resolveEntries, runBuild } from "./build.ts";

import type { BuildConfig } from "./types.ts";

export interface BuildWorkerOptions {
  cwd: string;
  entryIndexes: number[];
  rawEntries?: string[];
}

export type BuildWorkerMessage = {
  type: "start" | "complete" | "error";
  error?: unknown;
};

if (!parentPort) {
  throw new Error("This script must be run as a worker thread.");
}

try {
  sendMessage({ type: "start" });

  await startBuild(workerData);

  sendMessage({ type: "complete" });
} catch (error: unknown) {
  sendMessage({
    type: "error",
    error,
  });
} finally {
  parentPort.close();
}

async function startBuild(options: BuildWorkerOptions) {
  const { entryIndexes, cwd, rawEntries = [] } = options;
  const { config = {} } = await loadConfig<BuildConfig>({
    name: "obuild",
    configFile: "build.config",
    cwd,
  });
  const context = await resolveContext(config);
  const entries = resolveEntries(
    context.pkgDir,
    rawEntries.length > 0 ? rawEntries : config.entries,
  );

  await runBuild(
    {
      ...config,
      entries: entryIndexes.map((index) => entries[index]),
      preserveOutDirs: true,
    },
    context,
  );
}

function sendMessage(message: BuildWorkerMessage) {
  parentPort?.postMessage(message);
}
