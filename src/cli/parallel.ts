import os from "node:os";
import consola from "consola";
import { Worker } from "node:worker_threads";

import type { BuildWorkerMessage, BuildWorkerOptions } from "../worker.ts";
import type { BuildConfig, BuildEntry } from "../types.ts";

import {
  prepareOutDirs,
  printAnalytics,
  resolveContext,
  runBuild,
} from "../build.ts";

export async function parallelBuild(
  workerUrl: URL,
  entries: BuildEntry[],
  config: BuildConfig,
  mainThread?: boolean,
  positionalEntries?: string[],
): Promise<void> {
  const start = Date.now();
  const cores = os.cpus().length;
  const threads = Math.min(os.cpus().length, entries.length);

  const context = await resolveContext(config);
  const outDirs = await prepareOutDirs(entries, false);

  consola.log(`🧮 ${cores} CPU cores detected`);
  consola.log(
    `📦 Building \`${context.pkg.name || "<no name>"}\` (\`${context.pkgDir}\`) using ${threads} threads`,
  );

  const threadPromises: Promise<void>[] = [];
  const assignedEntryIndexes: number[] = [];

  for (
    let threadIndex = mainThread ? 1 : 0;
    threadIndex < threads;
    threadIndex++
  ) {
    // Assign entries to workers based on their index
    const entryIndexes = entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ index }) => index % threads === threadIndex)
      .map(({ index }) => index);

    assignedEntryIndexes.push(...entryIndexes);

    threadPromises.push(
      spawnBuildWorker(
        workerUrl,
        {
          cwd: context.pkgDir,
          entryIndexes,
          rawEntries: positionalEntries,
        },
        `#${mainThread ? threadIndex : threadIndex + 1}`,
      ),
    );
  }

  if (assignedEntryIndexes.length < entries.length) {
    const mainThreadEntries = entries.filter(
      (_, index) => !assignedEntryIndexes.includes(index),
    );

    const mainThreadConfig = {
      ...config,
      entries: mainThreadEntries,
      preserveOutDirs: true,
    };

    threadPromises.push(
      new Promise<void>((resolve, reject) => {
        const mainThreadStart = Date.now();

        runBuild(mainThreadConfig, context)
          .then(() => {
            consola.log(
              `\n👷 Main thread finished in ${Date.now() - mainThreadStart}ms`,
            );
            resolve();
          })
          .catch((error: unknown) => {
            consola.error("Main thread encountered an error:", error);
            reject(error);
          });
      }),
    );
  }

  await Promise.all(threadPromises);

  printAnalytics(outDirs);

  consola.log(`\n✅ obuild finished in ${Date.now() - start}ms`);
}

function spawnBuildWorker(
  workerUrl: URL,
  workerData: BuildWorkerOptions,
  workerName: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const start = Date.now();
    const worker = new Worker(workerUrl, {
      env: {
        ...process.env,
        FORCE_COLOR: "1",
      },
      workerData,
      stdout: true,
      stderr: true,
    });

    let stdout = "";
    let stderr = "";
    let buildStart = start;

    worker.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    worker.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    function writeWorkerOutput() {
      process.stdout.write(stdout);
      process.stderr.write(stderr);
    }

    function errorHandler(error: unknown): void {
      writeWorkerOutput();
      consola.error(`Worker ${workerName} encountered an error:`, error);
      reject(error);
    }

    worker.once("online", () => {
      consola.debug(
        `\n👷 Worker ${workerName} spawned in ${Date.now() - start}ms`,
      );
    });
    worker.on("message", (message: BuildWorkerMessage) => {
      switch (message.type) {
        case "start": {
          consola.debug(
            `\n👷 Worker ${workerName} started in ${Date.now() - start}ms`,
          );
          buildStart = Date.now();
          return;
        }

        case "error": {
          errorHandler(message.error);
          return;
        }
      }
    });
    worker.on("error", errorHandler);
    worker.on("exit", (code) => {
      if (code !== 0) {
        return errorHandler(new Error(`Exited with code ${code}`));
      }

      writeWorkerOutput();

      consola.log(
        `\n👷 Worker ${workerName} finished in ${Date.now() - buildStart}ms`,
      );

      resolve();
    });
  });
}
