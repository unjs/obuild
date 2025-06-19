import { describe, test, expect, vi, beforeEach } from "vitest";
import { createTransformer } from "../src/builders/transform/transformer.ts";

import type { BuildContext, TransformEntry } from "../src/types.ts";
import type {
  InputFile,
  OutputFile,
  Plugin,
} from "../src/builders/transform/plugins/index.ts";

vi.mock("@obuild/plugin-oxc-dts");
vi.mock("@obuild/plugin-oxc-transform");
vi.mock("@obuild/plugin-oxc-minify");
vi.mock("../src/builders/transform/output.ts", () => ({
  sortOutputFiles: vi.fn(),
}));

const oxcDtsPlugin = await import("@obuild/plugin-oxc-dts");
const oxcTransformPlugin = await import("@obuild/plugin-oxc-transform");
const oxcMinifyPlugin = await import("@obuild/plugin-oxc-minify");
const outputModule = await import("../src/builders/transform/output.ts");

const mockOxcDts = vi.mocked(oxcDtsPlugin).oxcDts;
const mockOxcTransform = vi.mocked(oxcTransformPlugin).oxcTransform;
const mockOxcMinify = vi.mocked(oxcMinifyPlugin).oxcMinify;
const mockSortOutputFiles = vi.mocked(outputModule).sortOutputFiles;

describe("transformer", () => {
  const mockContext: BuildContext = {
    pkg: { name: "test-package" },
    pkgDir: "/project",
  } as BuildContext;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createTransformer", () => {
    test("should create transformer with default oxc plugins", async () => {
      const mockDtsPlugin = { name: "oxc-dts" } as Plugin;
      const mockTransformPlugin = { name: "oxc-transform" } as Plugin;

      mockOxcDts.mockReturnValue(mockDtsPlugin);
      mockOxcTransform.mockReturnValue(mockTransformPlugin);

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
      };

      const transformer = await createTransformer({
        ...mockContext,
        entry,
      });

      expect(transformer.callHook).toBeDefined();
      expect(transformer.transform).toBeDefined();
      expect(mockOxcDts).toHaveBeenCalledWith({ declarations: undefined });
      expect(mockOxcTransform).toHaveBeenCalledWith({ transform: undefined });
    });

    test("should create transformer with custom plugins", async () => {
      const customPlugin: Plugin = {
        name: "custom-plugin",
        transform: vi.fn(),
      };

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        plugins: [customPlugin],
      };

      const transformer = await createTransformer({
        ...mockContext,
        entry,
      });

      expect(transformer).toBeDefined();
      expect(mockOxcDts).not.toHaveBeenCalled();
      expect(mockOxcTransform).not.toHaveBeenCalled();
    });

    test("should throw error when both oxc and plugins are specified", async () => {
      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        plugins: [],
        oxc: { dts: {} },
      } as any;

      await expect(
        createTransformer({
          ...mockContext,
          entry,
        }),
      ).rejects.toThrow(
        "The `oxc` and `plugins` options can't be used together in an entry.",
      );
    });

    test("should initialize plugins with storage", async () => {
      const pluginWithInit: Plugin = {
        name: "plugin-with-init",
        initialize: vi.fn().mockResolvedValue({ data: "test" }),
        transform: vi.fn(),
      };

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        plugins: [pluginWithInit],
      };

      await createTransformer({
        ...mockContext,
        entry,
      });

      expect(pluginWithInit.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          pkg: mockContext.pkg,
          pkgDir: mockContext.pkgDir,
          inputDir: entry.input,
        }),
      );
    });

    test("should create transformer with oxc minify enabled", async () => {
      const mockMinifyPlugin = { name: "oxc-minify" } as Plugin;
      mockOxcMinify.mockReturnValue(mockMinifyPlugin as any);

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        oxc: { minify: {} },
      };

      await createTransformer({
        ...mockContext,
        entry,
      });

      expect(mockOxcMinify).toHaveBeenCalledWith({ minify: {} });
    });

    test("should disable dts plugin when oxc.dts is false", async () => {
      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        oxc: { dts: false },
      };

      await createTransformer({
        ...mockContext,
        entry,
      });

      expect(mockOxcDts).not.toHaveBeenCalled();
    });

    test("should disable transform plugin when oxc.transform is false", async () => {
      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        oxc: { transform: false },
      };

      await createTransformer({
        ...mockContext,
        entry,
      });

      expect(mockOxcTransform).not.toHaveBeenCalled();
    });

    test("should initialize plugins without initialize method", async () => {
      const pluginWithoutInit: Plugin = {
        name: "plugin-without-init",
        transform: vi.fn(),
      };

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        plugins: [pluginWithoutInit],
      };

      const transformer = await createTransformer({
        ...mockContext,
        entry,
      });

      expect(transformer).toBeDefined();
    });

    test("should handle plugin initialization returning null", async () => {
      const pluginWithNullInit: Plugin = {
        name: "plugin-with-null-init",
        initialize: vi.fn().mockResolvedValue(null),
        transform: vi.fn(),
      };

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        plugins: [pluginWithNullInit],
      };

      const transformer = await createTransformer({
        ...mockContext,
        entry,
      });

      expect(transformer).toBeDefined();
      expect(pluginWithNullInit.initialize).toHaveBeenCalled();
    });
  });

  describe("transformer methods", () => {
    test("should transform file and return raw output when no plugins are used", async () => {
      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        plugins: [],
      };

      const transformer = await createTransformer({
        ...mockContext,
        entry,
      });

      const inputFile: InputFile = {
        path: "test.js",
        srcPath: "src/test.js",
        extension: ".js",
        contents: "console.log('test');",
      };

      const result = await transformer.transform(inputFile);

      expect(result).toEqual([
        {
          type: "raw",
          path: "test.js",
          srcPath: "src/test.js",
          extension: ".js",
        },
      ]);
    });

    test("should transform file with plugin", async () => {
      const mockPlugin: Plugin = {
        name: "test-plugin",
        transform: vi.fn().mockResolvedValue([
          {
            type: "code",
            path: "test.transformed.js",
            srcPath: "src/test.js",
            extension: ".js",
            contents: "transformed content",
          },
        ]),
      };

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        plugins: [mockPlugin],
      };

      const transformer = await createTransformer({
        ...mockContext,
        entry,
      });

      const inputFile: InputFile = {
        path: "test.js",
        srcPath: "src/test.js",
        extension: ".js",
        contents: "console.log('test');",
      };

      const result = await transformer.transform(inputFile);

      expect(mockPlugin.transform).toHaveBeenCalledWith(
        inputFile,
        expect.objectContaining({
          pkg: mockContext.pkg,
          pkgDir: mockContext.pkgDir,
          storage: {},
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("code");
    });

    test("should call plugin hooks", async () => {
      const mockPlugin: Plugin = {
        name: "test-plugin",
        buildStart: vi.fn(),
        transform: vi.fn(),
      };

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        plugins: [mockPlugin],
      };

      const transformer = await createTransformer({
        ...mockContext,
        entry,
      });

      await transformer.callHook("buildStart");

      expect(mockPlugin.buildStart).toHaveBeenCalledWith(
        expect.objectContaining({
          pkg: mockContext.pkg,
          pkgDir: mockContext.pkgDir,
          storage: {},
        }),
      );
    });

    test("should skip plugins without the requested hook", async () => {
      const mockPlugin: Plugin = {
        name: "test-plugin",
        transform: vi.fn(),
      };

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        plugins: [mockPlugin],
      };

      const transformer = await createTransformer({
        ...mockContext,
        entry,
      });

      await transformer.callHook("buildStart");

      expect(mockPlugin.transform).not.toHaveBeenCalled();
    });

    test("should handle plugin pipeline with multiple plugins", async () => {
      const plugin1: Plugin = {
        name: "plugin1",
        transform: vi.fn().mockResolvedValue([
          {
            type: "code",
            path: "test.intermediate.js",
            srcPath: "src/test.js",
            extension: ".js",
            contents: "intermediate content",
          },
        ]),
      };

      const plugin2: Plugin = {
        name: "plugin2",
        transform: vi.fn().mockResolvedValue([
          {
            type: "minified",
            path: "test.final.js",
            srcPath: "src/test.js",
            extension: ".js",
            contents: "final content",
          },
        ]),
      };

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        plugins: [plugin1, plugin2],
      };

      const transformer = await createTransformer({
        ...mockContext,
        entry,
      });

      const inputFile: InputFile = {
        path: "test.js",
        srcPath: "src/test.js",
        extension: ".js",
        contents: "console.log('test');",
      };

      const result = await transformer.transform(inputFile);

      expect(plugin1.transform).toHaveBeenCalled();
      expect(plugin2.transform).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("minified");
    });

    test("should handle pipelines with more plugins", async () => {
      const plugin1: Plugin = {
        name: "plugin1",
        transform: vi.fn().mockImplementation((file) => {
          if (file.type === "code") {
            return;
          }

          return [
            {
              type: "code",
              path: "test.intermediate.js",
              srcPath: "src/test.js",
              extension: ".js",
              contents: "intermediate content",
            },
          ];
        }),
      };

      const plugin2: Plugin = {
        name: "plugin2",
        transform: vi.fn().mockImplementation((file) => {
          if (file.type !== "code") {
            return;
          }

          return [
            {
              type: "minified",
              path: "test.final.js",
              srcPath: "src/test.js",
              extension: ".js",
              contents: "final content",
            },
          ];
        }),
      };

      const plugin3: Plugin = {
        name: "plugin3",
        transform: vi.fn().mockImplementation((file) => {
          if (file.type !== "code") {
            return;
          }

          return [
            {
              type: "asset",
              path: "test.final.css",
              srcPath: "src/test.css",
              extension: ".css",
              contents: "css",
            },
          ];
        }),
      };

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        plugins: [plugin1, plugin2, plugin3],
      };

      const transformer = await createTransformer({
        ...mockContext,
        entry,
      });

      const inputFile: InputFile = {
        path: "test.js",
        srcPath: "src/test.js",
        extension: ".js",
        contents: "console.log('test');",
      };

      const result = await transformer.transform(inputFile);

      expect(plugin1.transform).toHaveBeenCalledTimes(1); // 1. input
      expect(plugin2.transform).toHaveBeenCalledTimes(1); // 1. plugin1 result
      expect(plugin3.transform).toHaveBeenCalledTimes(1); // 1. plugin2 result
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("minified");
    });

    test("should handle plugin context transform calls within transform", async () => {
      const plugin1: Plugin = {
        name: "plugin1",
        transform: vi.fn().mockImplementation((file, context) => {
          if (file.type === "code") {
            return;
          }

          return context.transform({
            type: "code",
            path: "test.intermediate.js",
            srcPath: "src/test.js",
            extension: ".js",
            contents: "intermediate content",
          });
        }),
      };

      const plugin2: Plugin = {
        name: "plugin2",
        transform: vi.fn().mockImplementation((file) => {
          if (file.type !== "code") {
            return;
          }

          return [
            {
              type: "minified",
              path: "test.final.js",
              srcPath: "src/test.js",
              extension: ".js",
              contents: "final content",
            },
          ];
        }),
      };

      const plugin3: Plugin = {
        name: "plugin3",
        transform: vi.fn().mockImplementation((file) => {
          if (file.type !== "code") {
            return;
          }

          return [
            {
              type: "asset",
              path: "test.final.css",
              srcPath: "src/test.css",
              extension: ".css",
              contents: "css",
            },
          ];
        }),
      };

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        plugins: [plugin1, plugin2, plugin3],
      };

      const transformer = await createTransformer({
        ...mockContext,
        entry,
      });

      const inputFile: InputFile = {
        path: "test.js",
        srcPath: "src/test.js",
        extension: ".js",
        contents: "console.log('test');",
      };

      const result = await transformer.transform(inputFile);

      expect(plugin1.transform).toHaveBeenCalledTimes(2); // 1. input, 2. plugin1 context call
      expect(plugin2.transform).toHaveBeenCalledTimes(2); // 1. plugin1 context call  2. plugin1 result
      expect(plugin3.transform).toHaveBeenCalledTimes(1); // 1. plugin2 result
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("minified");
    });

    test("should handle plugin context transform calls within hooks", async () => {
      const plugin1: Plugin = {
        name: "plugin1",
        transform: vi.fn().mockImplementation((file) => {
          if (file.type === "code") {
            return;
          }

          return [
            {
              type: "code",
              path: "test.intermediate.js",
              srcPath: "src/test.js",
              extension: ".js",
              contents: "intermediate content",
            },
          ];
        }),
      };

      const plugin2: Plugin = {
        name: "plugin2",
        buildStart: vi.fn().mockImplementation((context) => {
          context.transform({
            type: "code",
            path: "test.intermediate.js",
            srcPath: "src/test.js",
            extension: ".js",
            contents: "intermediate content",
          });
        }),
        transform: vi.fn().mockImplementation((file) => {
          if (file.type !== "code") {
            return;
          }

          return [
            {
              type: "minified",
              path: "test.final.js",
              srcPath: "src/test.js",
              extension: ".js",
              contents: "final content",
            },
          ];
        }),
      };

      const plugin3: Plugin = {
        name: "plugin3",
        transform: vi.fn().mockImplementation((file) => {
          if (file.type !== "code") {
            return;
          }

          return [
            {
              type: "asset",
              path: "test.final.css",
              srcPath: "src/test.css",
              extension: ".css",
              contents: "css",
            },
          ];
        }),
      };

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        plugins: [plugin1, plugin2, plugin3],
      };

      const transformer = await createTransformer({
        ...mockContext,
        entry,
      });

      await transformer.callHook("buildStart");

      expect(plugin1.transform).toHaveBeenCalledTimes(1); // 1. plugin2 hook context transform
      expect(plugin2.transform).toHaveBeenCalledTimes(1); // 1. plugin2 hook context transform (plugin1 did not handled it)
      expect(plugin3.transform).toHaveBeenCalledTimes(0);
    });

    test("should skip files marked with skip: true", async () => {
      const plugin1: Plugin = {
        name: "plugin1",
        transform: vi.fn().mockResolvedValue([
          {
            type: "code",
            path: "test.skipped.js",
            srcPath: "src/test.js",
            extension: ".js",
            contents: "skipped content",
            skip: true,
          },
        ]),
      };

      const plugin2: Plugin = {
        name: "plugin2",
        transform: vi.fn(),
      };

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        plugins: [plugin1, plugin2],
      };

      const transformer = await createTransformer({
        ...mockContext,
        entry,
      });

      const inputFile: InputFile = {
        path: "test.js",
        srcPath: "src/test.js",
        extension: ".js",
        contents: "console.log('test');",
      };

      const result = await transformer.transform(inputFile);

      expect(plugin1.transform).toHaveBeenCalled();
      expect(plugin2.transform).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].skip).toBe(true);
    });

    test("should sort output files when plugin returns output", async () => {
      const outputFiles: OutputFile[] = [
        {
          type: "code",
          path: "test2.js",
          srcPath: "src/test2.js",
          extension: ".js",
          contents: "content2",
        },
        {
          type: "code",
          path: "test1.js",
          srcPath: "src/test1.js",
          extension: ".js",
          contents: "content1",
        },
      ];

      const mockPlugin: Plugin = {
        name: "test-plugin",
        transform: vi.fn().mockResolvedValue(outputFiles),
      };

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        plugins: [mockPlugin],
      };

      const transformer = await createTransformer({
        ...mockContext,
        entry,
      });

      const inputFile: InputFile = {
        path: "test.js",
        srcPath: "src/test.js",
        extension: ".js",
        contents: "console.log('test');",
      };

      await transformer.transform(inputFile);

      expect(mockSortOutputFiles).toHaveBeenCalledWith(outputFiles);
    });

    test("should handle plugin returning undefined", async () => {
      const mockPlugin: Plugin = {
        name: "test-plugin",
        transform: vi.fn().mockResolvedValue(undefined),
      };

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        plugins: [mockPlugin],
      };

      const transformer = await createTransformer({
        ...mockContext,
        entry,
      });

      const inputFile: InputFile = {
        path: "test.js",
        srcPath: "src/test.js",
        extension: ".js",
        contents: "console.log('test');",
      };

      const result = await transformer.transform(inputFile);

      expect(result).toEqual([
        {
          type: "raw",
          path: "test.js",
          srcPath: "src/test.js",
          extension: ".js",
        },
      ]);
    });

    test("should handle plugin returning non-array", async () => {
      const mockPlugin: Plugin = {
        name: "test-plugin",
        transform: vi.fn().mockResolvedValue("not an array"),
      };

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        plugins: [mockPlugin],
      };

      const transformer = await createTransformer({
        ...mockContext,
        entry,
      });

      const inputFile: InputFile = {
        path: "test.js",
        srcPath: "src/test.js",
        extension: ".js",
        contents: "console.log('test');",
      };

      const result = await transformer.transform(inputFile);

      expect(result).toEqual([
        {
          type: "raw",
          path: "test.js",
          srcPath: "src/test.js",
          extension: ".js",
        },
      ]);
    });

    test("should handle multiple output files in pipeline", async () => {
      const plugin1: Plugin = {
        name: "plugin1",
        transform: vi.fn().mockResolvedValue([
          {
            type: "code",
            path: "test1.js",
            srcPath: "src/test.js",
            extension: ".js",
            contents: "content1",
          },
          {
            type: "code",
            path: "test2.js",
            srcPath: "src/test.js",
            extension: ".js",
            contents: "content2",
          },
        ]),
      };

      const plugin2: Plugin = {
        name: "plugin2",
        transform: vi.fn().mockResolvedValue([
          {
            type: "minified",
            path: "final.js",
            srcPath: "src/test.js",
            extension: ".js",
            contents: "final content",
          },
        ]),
      };

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        plugins: [plugin1, plugin2],
      };

      const transformer = await createTransformer({
        ...mockContext,
        entry,
      });

      const inputFile: InputFile = {
        path: "test.js",
        srcPath: "src/test.js",
        extension: ".js",
        contents: "console.log('test');",
      };

      const result = await transformer.transform(inputFile);

      expect(plugin2.transform).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    test("should handle failed inner transformation", async () => {
      const plugin1: Plugin = {
        name: "plugin1",
        transform: vi.fn().mockResolvedValue([
          {
            type: "intermediate",
            path: "test.js",
            srcPath: "src/test.js",
            extension: ".js",
            contents: "content",
          },
        ]),
      };

      const plugin2: Plugin = {
        name: "plugin2",
        transform: vi.fn().mockResolvedValue(undefined),
      };

      const entry: TransformEntry = {
        input: "src/",
        type: "transform",
        outDir: "dist/",
        plugins: [plugin1, plugin2],
      };

      const transformer = await createTransformer({
        ...mockContext,
        entry,
      });

      const inputFile: InputFile = {
        path: "test.js",
        srcPath: "src/test.js",
        extension: ".js",
        contents: "console.log('test');",
      };

      const result = await transformer.transform(inputFile);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("intermediate");
    });
  });
});
