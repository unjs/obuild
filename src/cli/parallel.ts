import os from "node:os";
import consola from "consola";
import {
  prepareOutDirs,
  printAnalytics,
  resolveContext,
  runBuild,
} from "../build.ts";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type { WorkerMessage, WorkerOptions } from "../worker.ts";
import type { BuildConfig, BuildEntry } from "../types.ts";

export async function parallelBuild(
  workerUrl: URL,
  entries: BuildEntry[],
  config: BuildConfig,
  main?: boolean,
  positionals?: string[],
): Promise<void> {
  const cores = os.cpus().length;
  const workerCount = Math.min(os.cpus().length, entries.length);
  const start = Date.now();
  const ctx = await resolveContext(config);
  const outDirs = await prepareOutDirs(entries, false);

  consola.log(`🧮 ${cores} CPU cores detected`);
  consola.log(
    `📦 Building \`${ctx.pkg.name || "<no name>"}\` (\`${ctx.pkgDir}\`) with ${workerCount} workers`,
  );

  const threadPromises: Promise<void>[] = [];
  const workerEntryIndexes: number[] = [];

  for (
    let workerIndex = main ? 1 : 0;
    workerIndex < workerCount;
    workerIndex++
  ) {
    // Assign entries to workers based on their index
    const entryIndexes = entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ index }) => index % workerCount === workerIndex)
      .map(({ index }) => index);

    workerEntryIndexes.push(...entryIndexes);

    threadPromises.push(
      new Promise<void>((resolve, reject) => {
        const worker = new Worker(fileURLToPath(workerUrl), {
          env: {
            ...process.env,
            FORCE_COLOR: "1",
          },
          workerData: {
            cwd: ctx.pkgDir,
            entryIndexes,
            rawEntries: positionals,
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

  const mainThreadEntries = entries.filter(
    (_, index) => !workerEntryIndexes.includes(index),
  );

  if (mainThreadEntries.length > 0) {
    threadPromises.push(
      new Promise<void>((resolve, reject) => {
        runBuild(
          { ...config, entries: mainThreadEntries, preserveOutDirs: true },
          ctx,
        )
          .then(() => {
            consola.log(`\n👷 Main thread finished in ${Date.now() - start}ms`);

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
