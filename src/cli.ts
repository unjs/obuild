#!/usr/bin/env node
import { parseArgs } from "node:util";
import { consola } from "consola";
import { build, resolveEntries } from "./build.ts";
import { loadConfig } from "c12";
import { normalizePath } from "./utils.ts";
import { parallelBuild } from "./cli/parallel.ts";
import { extname } from "pathe";

import type { BuildConfig, BuildEntry } from "./types.ts";

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
    main: {
      type: "boolean",
      default: undefined,
      short: "m",
    },
    parallel: {
      type: "boolean",
      default: undefined,
      short: "p",
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

if (args.values.stub) {
  for (const entry of entries) {
    entry.stub = true;
  }
}

if (rawEntries.length === 0) {
  consola.error("No build entries specified.");
  process.exit(1);
}

if (args.values.parallel) {
  await parallelBuild(
    new URL(`worker${extname(import.meta.url)}`, import.meta.url),
    entries,
    config,
    args.values.main,
    args.positionals,
  );

  process.exit(0);
}

await build({
  cwd: args.values.dir,
  ...config,
  entries,
});
