#!/usr/bin/env node

import type { BuildEntry, BuildOptions } from "./types.ts";

import { parseArgs } from "node:util";
import { consola } from "consola";
import { build } from "./build.ts";

// https://nodejs.org/api/util.html#utilparseargsconfig
const args = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    dir: {
      type: "string",
      default: ".",
    },
    tsconfig: {
      type: "string",
    },
  },
});

const dir = args.values.dir;
const rawEntries = args.positionals as string[];

if (!dir || rawEntries.length === 0) {
  consola.error("Usage: obuild [--dir=<dir>] <entry1>...");
  process.exit(1);
}

const opts: BuildOptions = {
  tsconfigPath: args.values.tsconfig,
};

const entries: BuildEntry[] = rawEntries.map((entry) => {
  const [input, outDir] = entry.split(":") as [string, string | undefined];
  return input.endsWith("/")
    ? { type: "transform", input, outDir }
    : { type: "bundle", input, outDir };
});

await build(dir, entries, opts);
