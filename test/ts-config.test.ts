import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  resolveTSConfig,
  rewriteTSConfigPaths,
} from "../src/builders/transform/ts-config.ts";

import type { BuildContext, TransformEntry } from "../src/types.ts";
import type {
  TsConfigJsonResolved as TSConfig,
  TsConfigResult,
} from "get-tsconfig";

// Mock dependencies
vi.mock("get-tsconfig");
vi.mock("consola");
vi.mock("../src/utils.ts", () => ({
  normalizePath: vi.fn(),
}));

const getTsConfigModule = await import("get-tsconfig");
const consolaModule = await import("consola");
const utilsModule = await import("../src/utils.ts");

const mockGetTsconfig = vi.mocked(getTsConfigModule).getTsconfig;
const mockConsola = vi.mocked(consolaModule).default;
const mockNormalizePath = vi.mocked(utilsModule).normalizePath;

describe("ts-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNormalizePath.mockImplementation((p, base) => `${base}/${p}`);
  });

  describe("resolveTSConfig", () => {
    test("should resolve tsconfig when tsconfig.json exists", () => {
      const mockTsConfigResult: TsConfigResult = {
        path: "/project/tsconfig.json",
        config: {
          compilerOptions: {
            outDir: "./dist",
            target: "es2020",
          },
        },
      };

      mockGetTsconfig.mockReturnValue(mockTsConfigResult);

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
      };
      const context: BuildContext = {
        pkgDir: "/project",
      } as BuildContext;

      resolveTSConfig(entry, context);

      expect(entry.tsConfig).toBeDefined();
      expect(entry.tsConfig?.compilerOptions?.declaration).toBe(true);
      expect(entry.tsConfig?.compilerOptions?.emitDeclarationOnly).toBe(true);
      expect(entry.tsConfig?.compilerOptions?.noEmit).toBe(false);
    });

    test("should warn when tsconfig.json not found", () => {
      mockGetTsconfig.mockReturnValue(null);

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
      };
      const context: BuildContext = {
        pkgDir: "/project",
      } as BuildContext;

      resolveTSConfig(entry, context);

      expect(mockConsola.warn).toHaveBeenCalledWith(
        "tsconfig.json not found in /project",
      );
      expect(entry.tsConfig).toBeDefined();
    });

    test("should merge entry tsConfig with package tsConfig", () => {
      const mockTsConfigResult: TsConfigResult = {
        path: "/project/tsconfig.json",
        config: {
          compilerOptions: {
            target: "es2020",
          },
        },
      };

      mockGetTsconfig.mockReturnValue(mockTsConfigResult);

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        tsConfig: {
          compilerOptions: {
            strict: true,
          },
        },
      };
      const context: BuildContext = {
        pkgDir: "/project",
      } as BuildContext;

      resolveTSConfig(entry, context);

      expect(entry.tsConfig?.compilerOptions?.target).toBe("es2020");
      expect(entry.tsConfig?.compilerOptions?.strict).toBe(true);
    });

    test("should set rootDir to tsconfig directory when tsconfig exists", () => {
      const mockTsConfigResult = {
        path: "/project/src/tsconfig.json",
        config: {},
      };

      mockGetTsconfig.mockReturnValue(mockTsConfigResult);

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
      };
      const context: BuildContext = {
        pkgDir: "/project",
      } as BuildContext;

      resolveTSConfig(entry, context);

      expect(entry.tsConfig?.compilerOptions?.rootDir).toBe("/project/src");
    });

    test("should set rootDir to package directory when tsconfig not found", () => {
      mockGetTsconfig.mockReturnValue(null);

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
      };
      const context: BuildContext = {
        pkgDir: "/project",
      } as BuildContext;

      resolveTSConfig(entry, context);

      expect(entry.tsConfig?.compilerOptions?.rootDir).toBe("/project");
    });

    test("should resolve rootDir from TransformEntry", () => {
      mockGetTsconfig.mockReturnValue(null);

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        tsConfig: {
          compilerOptions: {
            rootDir: "src",
          },
        },
      };
      const context: BuildContext = {
        pkgDir: "/project",
      } as BuildContext;

      resolveTSConfig(entry, context);

      expect(entry.tsConfig?.compilerOptions?.rootDir).toBe("/project/src");
    });
  });

  describe("rewriteTSConfigPaths", () => {
    test("should rewrite paths in compilerOptions.paths", () => {
      const tsConfig: TSConfig = {
        compilerOptions: {
          paths: {
            "@/*": ["./src/*"],
            "@utils/*": ["./src/utils/*"],
          },
        },
      };

      const rewrite = (path: string) => `/absolute${path}`;

      const result = rewriteTSConfigPaths(tsConfig, rewrite);

      expect(result.compilerOptions?.paths?.["@/*"]).toEqual([
        "/absolute./src/*",
      ]);
      expect(result.compilerOptions?.paths?.["@utils/*"]).toEqual([
        "/absolute./src/utils/*",
      ]);
    });

    test("should handle single path values", () => {
      const tsConfig: any = {
        compilerOptions: {
          paths: {
            "@single": "./src/single.ts",
          },
        },
      };

      const rewrite = (path: string) => `/absolute${path}`;

      const result = rewriteTSConfigPaths(tsConfig, rewrite);

      expect(result.compilerOptions?.paths?.["@single"]).toEqual([
        "/absolute./src/single.ts",
      ]);
    });

    test("should rewrite declarationDir", () => {
      const tsConfig: TSConfig = {
        compilerOptions: {
          declarationDir: "./types",
        },
      };

      const rewrite = (path: string) => `/absolute${path}`;

      const result = rewriteTSConfigPaths(tsConfig, rewrite);

      expect(result.compilerOptions?.declarationDir).toBe("/absolute./types");
    });

    test("should not modify original tsConfig", () => {
      const tsConfig: TSConfig = {
        compilerOptions: {
          paths: {
            "@/*": ["./src/*"],
          },
          declarationDir: "./types",
        },
      };

      const originalPaths = tsConfig.compilerOptions?.paths?.["@/*"];
      const originalDeclarationDir = tsConfig.compilerOptions?.declarationDir;

      const rewrite = (path: string) => `/absolute${path}`;

      rewriteTSConfigPaths(tsConfig, rewrite);

      expect(tsConfig.compilerOptions?.paths?.["@/*"]).toEqual(originalPaths);
      expect(tsConfig.compilerOptions?.declarationDir).toBe(
        originalDeclarationDir,
      );
    });

    test("should handle empty tsConfig", () => {
      const tsConfig: TSConfig = {};

      const rewrite = (path: string) => `/absolute${path}`;

      const result = rewriteTSConfigPaths(tsConfig, rewrite);

      expect(result).toEqual({});
    });

    test("should handle tsConfig without compilerOptions", () => {
      const tsConfig: TSConfig = {
        include: ["src/**/*"],
      };

      const rewrite = (path: string) => `/absolute${path}`;

      const result = rewriteTSConfigPaths(tsConfig, rewrite);

      expect(result.include).toEqual(["src/**/*"]);
      expect(result.compilerOptions).toBeUndefined();
    });
  });
});
