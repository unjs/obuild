import { describe, test, expect, beforeAll } from "vitest";
import { build } from "../../../src/build.ts";
import { rm, stat } from "node:fs/promises";
import { readDistFiles, readFileNames } from "../../utils.ts";

const fixtureDir = new URL("fixture/", import.meta.url);
const distDir = new URL("dist/", fixtureDir);

describe("bundle", () => {
  beforeAll(async () => {
    await rm(distDir, { recursive: true, force: true });
  });

  test("build fixture", async () => {
    await build({
      cwd: fixtureDir,
      entries: [
        { type: "bundle", input: ["src/index", "src/cli"] },
        { type: "bundle", input: "src/utils.ts" },
      ],
    });
  }, 20_000);

  test("dist files match expected", async () => {
    const distFiles = await readFileNames(distDir);

    expect(distFiles).toMatchInlineSnapshot(`
      [
        "cli.d.mts",
        "cli.mjs",
        "index.d.mts",
        "index.mjs",
        "utils.d.mts",
        "utils.mjs",
      ]
    `);

    await expect(await readDistFiles(distDir)).toMatchFileSnapshot(
      "./fixture/dist.snap",
    );
  });

  test("validate dist entries", async () => {
    const distIndex = await import(new URL("index.mjs", distDir).href);
    expect(distIndex.test).instanceOf(Function);

    const distRuntimeIndex = await import(new URL("index.mjs", distDir).href);
    expect(distRuntimeIndex.test).instanceOf(Function);

    const distUtils = await import(new URL("utils.mjs", distDir).href);
    expect(distUtils.test).instanceOf(Function);
  });

  test("cli shebang is executable", async () => {
    const cliPath = new URL("cli.mjs", distDir);
    const stats = await stat(cliPath);
    expect(stats.mode & 0o111).toBe(0o111); // Check if executable
  });
});
