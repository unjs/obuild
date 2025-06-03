#!/usr/bin/env node
import { parseArgs } from "node:util";
import os from "node:os";
import { Worker } from "node:worker_threads";
import { consola } from "consola";
import {
  build,
  prepareOutDirs,
  printAnalytics,
  resolveContext,
  resolveEntries,
} from "./build.ts";
import { loadConfig } from "c12";

import type { BuildConfig, BuildEntry } from "./types.ts";
import { normalizePath } from "./utils.ts";
import { fileURLToPath } from "node:url";
import type { WorkerMessage, WorkerOptions } from "./worker.ts";
import { extname } from "pathe";

// https://nodejs.org/api/util.html#utilparseargsconfig
const args = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    dir: {
      type: "string",
      default: ".",
    },
    stub: {
      type: "boolean",
      default: false,
    },
    parallel: {
      type: "boolean",
      default: undefined,
    },
  },
});

const { config = {} } = await loadConfig<BuildConfig>({
  name: "obuild",
  configFile: "build.config",
  cwd: args.values.dir,
});

const rawEntries =
  args.positionals.length > 0
    ? (args.positionals as string[])
    : config.entries || [];

const entries: BuildEntry[] = resolveEntries(
  normalizePath(args.values.dir),
  rawEntries,
);

const cores = os.cpus().length;
const workerCount =
  args.values.parallel === undefined || args.values.stub
    ? 0
    : Math.min(cores, entries.length);

if (workerCount > 1) {
  const start = Date.now();
  const ctx = await resolveContext(config);
  const outDirs = await prepareOutDirs(entries, false);

  consola.log(`🧮 ${cores} CPU cores detected`);
  consola.log(
    `📦 Building \`${ctx.pkg.name || "<no name>"}\` (\`${ctx.pkgDir}\`) with ${workerCount} workers`,
  );

  const workerExt = extname(import.meta.url);
  const workerPath = fileURLToPath(
    new URL(`worker${workerExt}`, import.meta.url),
  );
  const workerPromises: Promise<void>[] = [];

  for (let workerIndex = 0; workerIndex < workerCount; workerIndex++) {
    workerPromises.push(
      new Promise<void>((resolve, reject) => {
        // Assign entries to workers based on their index
        const entryIndexes = entries
          .map((entry, index) => ({ entry, index }))
          .filter(({ index }) => index % workerCount === workerIndex)
          .map(({ index }) => index);

        const worker = new Worker(workerPath, {
          env: {
            ...process.env,
            FORCE_COLOR: "1",
          },
          workerData: {
            cwd: args.values.dir,
            entryIndexes,
            rawEntries: args.positionals,
          } satisfies WorkerOptions,
          stdout: true,
          stderr: true,
        });

        let stdout = "";
        let stderr = "";

        worker.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });

        worker.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        worker.on("message", (message: WorkerMessage) => {
          process.stdout.write(stdout);
          process.stderr.write(stderr);

          if (message.type === "error") {
            reject(message.error);
          }

          consola.log(
            `\n👷 Worker #${workerIndex + 1} finished in ${Date.now() - start}ms`,
          );

          resolve();
        });

        worker.on("error", (error) => {
          consola.error(
            `Worker #${workerIndex + 1} encountered an uncaught error:`,
            error,
          );

          reject(error);
        });

        worker.on("exit", (code) => {
          if (code !== 0) {
            const message = `Worker #${workerIndex + 1} exited with code ${code}`;
            consola.error(message);
            reject(new Error(message));
          }
        });
      }),
    );
  }

  await Promise.all(workerPromises);

  printAnalytics(outDirs);

  consola.log(`\n✅ obuild finished in ${Date.now() - start}ms`);
  process.exit(0);
}

if (args.values.stub) {
  for (const entry of entries) {
    entry.stub = true;
  }
}

if (rawEntries.length === 0) {
  consola.error("No build entries specified.");
  process.exit(1);
}

await build({
  cwd: args.values.dir,
  ...config,
  entries,
});
