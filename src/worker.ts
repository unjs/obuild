import { parentPort, workerData } from "node:worker_threads";
import { consola } from "consola";
import { resolveContext, resolveEntries, runBuild } from "./build.ts";
import { loadConfig } from "c12";
import type { BuildConfig } from "./types.ts";
import {} from "consola/utils";

export interface WorkerOptions {
  cwd: string;
  entryIndexes: number[];
  rawEntries?: string[];
}

export type WorkerMessage =
  | {
      type: "success";
    }
  | {
      type: "error";
      error: string;
    };

async function runWorkerBuild(options: WorkerOptions) {
  if (!parentPort) {
    throw new Error("This script must be run as a worker thread.");
  }

  const { entryIndexes, cwd, rawEntries = [] } = options;

  try {
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
    const workerEntries = entryIndexes.map((index) => entries[index]);

    await runBuild(
      { ...config, entries: workerEntries, preserveOutDirs: true },
      context,
    );

    parentPort.postMessage({ type: "success" });
  } catch (error: unknown) {
    parentPort.postMessage({
      type: "error",
      error: errorToString(error),
    });

    consola.error(error);
  } finally {
    parentPort.close();
  }
}

function errorToString(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
    ? error.message
    : String(error);
}

await runWorkerBuild(workerData);
