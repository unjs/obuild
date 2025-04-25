#!/usr/bin/env node

import type { BuildEntry } from "./types.ts";

import { parseArgs } from "node:util";
import { consola } from "consola";
import { build } from "./build.ts";
import { loadConfig } from "c12";

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

const { config } = await loadConfig({ name: 'build' })
const dir = args.values.dir;
const rawEntries = args.positionals as string[];

const entries: BuildEntry[] = (rawEntries && rawEntries.length > 0
  ? rawEntries.map((entry) => {
    const [input, outDir] = entry.split(":") as [string, string | undefined];
    return input.endsWith("/")
      ? { type: "transform", input, outDir }
      : { type: "bundle", input, outDir };
  })
  : config.entries)

await build(dir, entries);
