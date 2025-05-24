#!/usr/bin/env node

import { parseArgs } from "node:util";
import { consola } from "consola";
import { build } from "./build.ts";
import { loadConfig } from "c12";

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
  },
});

const { config = {} } = await loadConfig<BuildConfig>({
  name: "obuild",
  configFile: "build.config",
  cwd: args.values.dir,
});

const dir = args.values.dir;

const rawEntries =
  args.positionals.length > 0
    ? (args.positionals as string[])
    : config.entries || [];

const entries: BuildEntry[] = rawEntries.map((entry) => {
  if (typeof entry === "string") {
    const [input, outDir] = entry.split(":") as [string, string | undefined];
    return input.endsWith("/")
      ? { type: "transform", input, outDir }
      : { type: "bundle", input: input.split(","), outDir };
  }
  return entry;
});

if (args.values.stub) {
  for (const entry of entries) {
    entry.stub = true;
  }
}

if (rawEntries.length === 0) {
  consola.error("No build entries specified.");
  process.exit(1);
}

await build(dir, entries, config);
