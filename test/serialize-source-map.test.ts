import { describe, test, expect, beforeEach } from "vitest";
import { vi } from "vitest";
import { serializeSourceMapFiles } from "../src/builders/transform/source-map.ts";
import {
  CodeFile,
  OutputFile,
  SourceMap,
  SourceMapFile,
} from "../src/builders/transform/plugins/index.ts";

vi.mock("pathe", () => ({
  default: {
    relative: vi.fn(),
    dirname: vi.fn(),
    join: vi.fn(),
  },
}));

const outputFile: OutputFile = {
  type: "code",
  extension: ".js",
  path: "index.js",
  srcPath: "src/index.ts",
  contents: "",
};

const map: SourceMap = {
  sources: ["src/index.ts", "src/utils.ts"],
  file: "index.js",
  version: 3,
  names: [],
  mappings: "AAAA,SAASA,CACT,CAAC,CAAC,CAAC",
};

const patheModule = await import("pathe");

describe("source-map", () => {
  describe("serializeSourceMapFiles", () => {
    let mockPath: any;

    beforeEach(async () => {
      mockPath = vi.mocked(patheModule).default;
      vi.clearAllMocks();
    });

    test("processes source map files and rewrites sources to relative paths", () => {
      mockPath.join.mockImplementation((...args: string[]) => args.join("/"));
      mockPath.dirname.mockImplementation((p: string) =>
        p.split("/").slice(0, -1).join("/"),
      );
      mockPath.relative.mockImplementation(
        (from: string, to: string) => `relative-${to.split("/").pop()}`,
      );

      const sourceMapFile: SourceMapFile = {
        type: "source-map",
        path: "index.js.map",
        extension: ".js.map",
        outputFile,
        map,
        contents: "",
      };

      const files: SourceMapFile[] = [sourceMapFile];
      const entry = {
        outDir: "/output",
        mapDir: "/output",
        input: "/src",
      } as any;

      serializeSourceMapFiles(files, entry);

      expect(mockPath.relative).toHaveBeenCalledTimes(2);
      expect(sourceMapFile.map.sources).toEqual([
        "relative-index.ts",
        "relative-utils.ts",
      ]);
      expect(sourceMapFile.contents).toBe(
        JSON.stringify(sourceMapFile.map, null, 2),
      );
    });

    test("skips non-source-map files", () => {
      const jsFile: OutputFile = {
        type: "code",
        path: "index.js",
        extension: ".js",
        contents: "console.log('hello');",
      };

      const files = [jsFile];
      const entry = {
        outDir: "/output",
        mapDir: "/output",
        input: "/src",
      } as any;

      serializeSourceMapFiles(files, entry);

      expect(mockPath.relative).not.toHaveBeenCalled();
      expect(jsFile.contents).toBe("console.log('hello');");
    });

    test("handles declaration files with different mapDir and declarationDir", () => {
      mockPath.join.mockImplementation((...args: string[]) => args.join("/"));
      mockPath.dirname.mockImplementation((p: string) =>
        p.split("/").slice(0, -1).join("/"),
      );
      mockPath.relative.mockImplementation(() => `relative-path`);

      const declarationMapFile: SourceMapFile = {
        type: "source-map",
        path: "index.d.ts.map",
        map,
        extension: ".map",
        outputFile: {
          ...outputFile,
          type: "declaration",
          contents:
            "export declare const foo: string;\n//# sourceMappingURL=index.d.ts.map",
        },
        contents: "",
      };

      const files = [declarationMapFile];
      const entry = {
        outDir: "/output",
        mapDir: "/maps",
        input: "/src",
        tsConfig: {
          compilerOptions: {
            declarationDir: "/declarations",
          },
        },
      } as any;

      serializeSourceMapFiles(files, entry);

      expect(declarationMapFile.outputFile.contents).toContain(
        "//# sourceMappingURL=relative-path",
      );
      expect(declarationMapFile.map.file).toBe("relative-path");
    });

    test("uses outDir as declarationDir when tsConfig declarationDir is not set", () => {
      mockPath.join.mockImplementation((...args: string[]) => args.join("/"));
      mockPath.dirname.mockImplementation((p: string) =>
        p.split("/").slice(0, -1).join("/"),
      );
      mockPath.relative.mockImplementation(() => `relative-path`);

      const declarationMapFile: SourceMapFile = {
        type: "source-map",
        path: "index.d.ts.map",
        map,
        extension: ".map",
        outputFile: {
          ...outputFile,
          type: "declaration",
          contents:
            "export declare const foo: string;\n//# sourceMappingURL=index.d.ts.map",
        },
        contents: "",
      };

      const files = [declarationMapFile];
      const entry = {
        outDir: "/output",
        mapDir: "/maps",
        input: "/src",
        tsConfig: {
          compilerOptions: {},
        },
      } as any;

      serializeSourceMapFiles(files, entry);

      expect(mockPath.relative).toHaveBeenCalled();
    });

    test("handles source maps without file property", () => {
      mockPath.join.mockImplementation((...args: string[]) => args.join("/"));
      mockPath.dirname.mockImplementation((p: string) =>
        p.split("/").slice(0, -1).join("/"),
      );
      mockPath.relative.mockImplementation(
        (from: string, to: string) => `relative-${to.split("/").pop()}`,
      );

      const sourceMapFile: SourceMapFile = {
        type: "source-map",
        path: "index.d.ts.map",
        map: {
          ...map,
          sources: ["src/index.ts"],
          file: undefined,
        },
        extension: ".map",
        outputFile,
        contents: "",
      };

      const files = [sourceMapFile];
      const entry = {
        outDir: "/output",
        mapDir: "/maps",
        input: "/src",
      } as any;

      serializeSourceMapFiles(files, entry);

      expect(sourceMapFile.map.file).toBeUndefined();
      expect(sourceMapFile.contents).toBe(
        JSON.stringify(sourceMapFile.map, null, 2),
      );
    });

    test("processes multiple source map files", () => {
      mockPath.join.mockImplementation((...args: string[]) => args.join("/"));
      mockPath.dirname.mockImplementation((p: string) =>
        p.split("/").slice(0, -1).join("/"),
      );
      mockPath.relative.mockImplementation(
        (from: string, to: string) => `relative-${to.split("/").pop()}`,
      );

      const sourceMapFile1: SourceMapFile = {
        type: "source-map",
        path: "index.d.ts.map",
        map: {
          ...map,
          sources: ["src/index.ts"],
          file: undefined,
        },
        extension: ".map",
        outputFile,
        contents: "",
      };

      const sourceMapFile2: SourceMapFile = {
        type: "source-map",
        path: "utils.js.map",
        map: {
          ...map,
          sources: ["src/utils.ts"],
        },
        extension: ".map",
        outputFile,
        contents: "",
      };

      const jsFile: CodeFile = {
        type: "code",
        path: "index.js",
        extension: ".js",
        contents: "console.log('hello');",
      };

      const files = [sourceMapFile1, jsFile, sourceMapFile2];
      const entry = {
        outDir: "/output",
        mapDir: "/output",
        input: "/src",
      } as any;

      serializeSourceMapFiles(files, entry);

      expect(sourceMapFile1.map.sources).toEqual(["relative-index.ts"]);
      expect(sourceMapFile2.map.sources).toEqual(["relative-utils.ts"]);
      expect(sourceMapFile1.contents).toBe(
        JSON.stringify(sourceMapFile1.map, null, 2),
      );
      expect(sourceMapFile2.contents).toBe(
        JSON.stringify(sourceMapFile2.map, null, 2),
      );
      expect(jsFile.contents).toBe("console.log('hello');");
    });
  });
});
