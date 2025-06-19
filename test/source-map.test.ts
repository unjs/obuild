import { describe, test, expect } from "vitest";
import { vi } from "vitest";
import { resolveSourceMapDir } from "../src/builders/transform/source-map.ts";

const utilsModule = await import("../src/utils.ts");
const mockNormalizePath = vi.mocked(utilsModule).normalizePath;

describe("source-map", () => {
  describe("resolveSourceMapDir", () => {
    vi.mock("../src/utils.ts", () => ({
      normalizePath: vi.fn(),
    }));

    test("resolveSourceMapDir sets mapDir to outDir when mapDir is undefined", async () => {
      const entry = {
        outDir: "/path/to/output",
        mapDir: undefined,
      } as any;

      const context = {
        pkgDir: "/path/to/package",
      } as any;

      resolveSourceMapDir(entry, context);

      expect(entry.mapDir).toBe("/path/to/output");
      expect(mockNormalizePath).not.toHaveBeenCalled();
    });

    test("resolveSourceMapDir normalizes mapDir when mapDir is defined", async () => {
      mockNormalizePath.mockReturnValue("/normalized/path");

      const entry = {
        outDir: "/path/to/output",
        mapDir: "./relative/maps",
      } as any;

      const context = {
        pkgDir: "/path/to/package",
      } as any;

      resolveSourceMapDir(entry, context);

      expect(mockNormalizePath).toHaveBeenCalledWith(
        "./relative/maps",
        "/path/to/package",
      );
      expect(entry.mapDir).toBe("/normalized/path");
    });

    test("resolveSourceMapDir handles absolute mapDir path", async () => {
      mockNormalizePath.mockReturnValue("/absolute/normalized/path");

      const entry = {
        outDir: "/path/to/output",
        mapDir: "/absolute/maps",
      } as any;

      const context = {
        pkgDir: "/path/to/package",
      } as any;

      resolveSourceMapDir(entry, context);

      expect(mockNormalizePath).toHaveBeenCalledWith(
        "/absolute/maps",
        "/path/to/package",
      );
      expect(entry.mapDir).toBe("/absolute/normalized/path");
    });
  });
});
