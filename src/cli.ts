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
  },
});

const { config = {} } = await loadConfig<BuildConfig>({
  name: "obuild",
  configFile: "build.config",
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
      : { type: "bundle", input, outDir };
  }
  return entry;
});

if (rawEntries.length === 0) {
  consola.error("No build entries specified.");
  process.exit(1);
}

await build(dir, entries);
