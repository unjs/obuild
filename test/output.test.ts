import { describe, test, expect } from "vitest";
import { sortOutputFiles } from "../src/builders/transform/output.ts";

import type {
  AssetFile,
  CodeFile,
  DeclarationFile,
  SourceMapFile,
  MinifiedFile,
  RawFile,
  OutputFile,
} from "../src/builders/transform/plugins/index.ts";

describe("output", () => {
  describe("sortOutputFiles", () => {
    test("should sort files according to defined type order", () => {
      const files: OutputFile[] = [
        {
          type: "code",
          path: "file.js",
          extension: ".js",
          contents: "",
        } as CodeFile,
        {
          type: "source-map",
          path: "file.js.map",
          extension: ".map",
          map: {
            sources: ["file.js"],
            file: "file.js",
            version: 3,
            names: [],
            mappings: "",
          },
          outputFile: {
            type: "code",
            contents: "",
            extension: ".map",
            path: "file.js",
          },
        } as SourceMapFile,
        {
          type: "asset",
          path: "file.css",
          extension: ".css",
          contents: "",
        } as AssetFile,
        {
          type: "declaration",
          path: "file.d.ts",
          extension: ".d.ts",
          contents: "",
        } as DeclarationFile,
        {
          type: "raw",
          path: "file.txt",
          extension: ".txt",
          content: "",
        } as RawFile,
        {
          type: "minified",
          path: "file.min.js",
          extension: ".js",
          contents: "",
        } as MinifiedFile,
      ];

      const sorted = sortOutputFiles(files);

      expect(sorted.map((f) => f.type)).toEqual([
        "source-map",
        "declaration",
        "asset",
        "minified",
        "code",
        "raw",
      ]);
    });

    test("should handle files with undefined type as unknown", () => {
      const files: OutputFile[] = [
        {
          type: "code",
          path: "file.js",
          extension: ".js",
          contents: "",
        } as CodeFile,
        { path: "unknown.txt", extension: ".txt", contents: "" } as OutputFile,
        {
          type: "source-map",
          path: "file.js.map",
          extension: ".map",
          map: {
            sources: ["file.js"],
            file: "file.js",
            version: 3,
            names: [],
            mappings: "",
          },
          outputFile: {
            type: "code",
            contents: "",
            extension: ".map",
            path: "file.js",
          },
        } as SourceMapFile,
      ];

      const sorted = sortOutputFiles(files);

      expect(sorted.map((f) => f.type || "unknown")).toEqual([
        "source-map",
        "code",
        "unknown",
      ]);
    });

    test("should preserve order for files of the same type", () => {
      const files: OutputFile[] = [
        {
          type: "code",
          path: "file2.js",
          extension: ".js",
          contents: "second",
        } as CodeFile,
        {
          type: "code",
          path: "file1.js",
          extension: ".js",
          contents: "first",
        } as CodeFile,
        {
          type: "code",
          path: "file3.js",
          extension: ".js",
          contents: "third",
        } as CodeFile,
      ];

      const sorted = sortOutputFiles(files);

      expect(sorted.map((f) => f.contents)).toEqual([
        "second",
        "first",
        "third",
      ]);
    });

    test("should handle empty array", () => {
      const files: OutputFile[] = [];
      const sorted = sortOutputFiles(files);

      expect(sorted).toEqual([]);
    });

    test("should handle single file", () => {
      const files: OutputFile[] = [
        {
          type: "code",
          path: "file.js",
          extension: ".js",
          contents: "",
        } as CodeFile,
      ];

      const sorted = sortOutputFiles(files);

      expect(sorted).toEqual(files);
    });

    test("should test all defined output types", () => {
      const files: OutputFile[] = [
        {
          type: "raw",
          path: "file.txt",
          extension: ".txt",
          content: "",
        } as RawFile,
        {
          type: "code",
          path: "file.js",
          extension: ".js",
          contents: "",
        } as CodeFile,
        {
          type: "minified",
          path: "file.min.js",
          extension: ".js",
          contents: "",
        } as MinifiedFile,
        {
          type: "asset",
          path: "file.css",
          extension: ".css",
          contents: "",
        } as AssetFile,
        {
          type: "declaration",
          path: "file.d.ts",
          extension: ".d.ts",
          contents: "",
        } as DeclarationFile,
        {
          type: "source-map",
          path: "file.js.map",
          extension: ".map",
          map: {
            sources: ["file.js"],
            file: "file.js",
            version: 3,
            names: [],
            mappings: "",
          },
          outputFile: {
            type: "code",
            contents: "",
            extension: ".map",
            path: "file.js",
          },
        } as SourceMapFile,
        { path: "unknown.txt", extension: ".txt", contents: "" } as OutputFile,
      ];

      const sorted = sortOutputFiles(files);

      expect(sorted.map((f) => f.type || "unknown")).toEqual([
        "source-map",
        "declaration",
        "asset",
        "minified",
        "code",
        "raw",
        "unknown",
      ]);
    });
  });
});
