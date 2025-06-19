import type { OutputFile } from "./plugins/index.ts";

const outputOrder = {
  "source-map": 0,
  declaration: 1,
  asset: 2,
  minified: 3,
  code: 4,
  raw: 5,
  unknown: 6,
} satisfies Record<NonNullable<OutputFile["type"]> | "unknown", number>;

/**
 * Sorts output files based on their types to ensure a predictable processing order.
 * This is used to ensure that source maps can be merged with their previous versions.
 *
 * @param files - The array of output files to sort.
 * @returns An array of output files ordered by type.
 */
export function sortOutputFiles(files: OutputFile[]): OutputFile[] {
  return files.sort((fileA, fileB) => {
    const orderA = outputOrder[fileA.type || "unknown"];
    const orderB = outputOrder[fileB.type || "unknown"];

    return orderA > orderB ? 1 : orderA < orderB ? -1 : 0;
  });
}
