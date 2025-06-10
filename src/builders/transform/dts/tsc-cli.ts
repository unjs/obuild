import { spawn } from "node:child_process";
import { promises as fsp } from "node:fs";
import { createRequire } from "node:module";
import path from "pathe";
import consola from "consola";
import symlinkDir from "symlink-dir";
import { defu } from "defu";
import { extractDeclarations } from "./common.ts";
import { rewriteTSConfigPaths } from "../ts-config.ts";

import type { TSConfig } from "pkg-types";
import type { DeclarationOptions, DeclarationOutput, VFS } from "./common.ts";

type Compiler = "tsc" | "tsgo" | "vue-tsc";
type Distribution = { pkgName: string; exePath: string[] };

/**
 * Represents the project structure for generating TypeScript declarations.
 * Contains absolute paths to the directories used during the process.
 */
type Project = {
  /**
   * The directory where the package is located.
   */
  pkgDir: string;

  /**
   * The TypeScript `rootDir` for the project.
   *
   * Defaults to:
   *  - path of the `tsconfig.json` file if it exists,
   *  - or the package directory if no `tsconfig.json` is found.
   */
  rootDir: string;

  /**
   * The input directory containing the source files for the entry.
   */
  inputDir: string;

  /**
   * The temporary directory where the project files will be created.
   *
   * NOTE: Must be within `rootDir` to work with `paths` in `tsconfig.json`
   */
  tempDir: string;

  /**
   * The source directory within the temporary directory where source files are placed.
   */
  srcDir: string;

  /**
   * The directory where the compiled output will be placed within the temporary directory.
   */
  distDir: string;

  /**
   * Initializes the project by creating the necessary directories and writing files.
   *
   * @returns The project object
   */
  prepare: () => Promise<Project>;

  /**
   * Runs the TypeScript compiler CLI to generate declarations.
   *
   * @param compiler - The TypeScript compiler to use, either "tsc" or "tsgo".
   * @returns The declaration output or undefined if no files were processed.
   */
  generate: (compiler: Compiler) => Promise<DeclarationOutput | undefined>;

  /**
   * Clears the entire temporary directory.
   */
  clear: () => Promise<void>;
};

const DEFAULT_COMPILER: Compiler = "tsgo";

const DIST_DIR_NAME = "dist";
const TMP_DIR_NAME = ".obuild";
const TMP_PREFIX = "dts-";

const KNOWN_EXT_RE = /(?<!\.d)\.(m)?[tj]sx?$/;
const DECLARATION_RE = /\.d\.m?ts$/;

const distributions: Record<Compiler, Distribution> = {
  tsc: {
    pkgName: "typescript",
    exePath: ["bin", "tsc"],
  },
  tsgo: {
    pkgName: "@typescript/native-preview",
    exePath: ["bin", "tsgo.js"],
  },
  // @todo - This will require new `vue-sfc-compiler` integration
  "vue-tsc": {
    pkgName: "vue-tsc",
    exePath: ["bin", "vue-tsc.js"],
  },
};

/**
 * Generates TypeScript declarations using the executable CLI tools `tsc` or `tsgo`.
 *
 * This function creates a temporary project on disk, runs the CLI to generate
 * declaration files, reads the output back into the virtual file system,
 * and then cleans up the temporary directory.
 *
 * @param vfs - A Map representing a virtual file system (filePath -> content).
 * @param options - Options for declaration generation.
 * @param compiler - The TypeScript compiler to use, either "tsc" or "tsgo".
 * @returns The declaration output, or undefined if there are no files.
 */
export async function getTscCliDeclarations(
  vfs: VFS,
  options: DeclarationOptions,
  compiler: Compiler = DEFAULT_COMPILER,
): Promise<DeclarationOutput | undefined> {
  if (
    vfs.size === 0 ||
    vfs.keys().some((filePath) => KNOWN_EXT_RE.test(filePath)) === false
  ) {
    return undefined;
  }

  const project = await createProject(vfs, options);

  return project.generate(compiler).finally(() => {
    project.clear();
  });
}

/**
 * Sets up a temporary directory with the project source files and configuration.
 *
 * @param vfs - A Map representing a virtual file system (filePath -> content).
 * @param options - The declaration options.
 * @return A prepared project ready for generating declarations.
 */
async function createProject(
  vfs: VFS,
  options: DeclarationOptions,
): Promise<Project> {
  const { inputDir, pkg, pkgDir } = options;
  const inputName = path.relative(pkgDir, inputDir).replace(/[\\/]/g, "-");
  const rootDir = options.typescript?.compilerOptions?.rootDir || pkgDir;

  // @todo - Store within node_modules whenever `tsgo` supports it: https://github.com/microsoft/typescript-go/blob/f7d02dd5cc61be86f4f61018171c370cefebe3fd/internal/compiler/emitter.go#L312
  const tempDir = path.join(
    pkgDir,
    // "node_modules",
    // ".cache",
    TMP_DIR_NAME,
    `${TMP_PREFIX}${inputName}`,
  );

  if (!tempDir.startsWith(rootDir)) {
    throw new Error(
      `Temporary directory "${tempDir}" must be within the package directory "${pkgDir}".`,
    );
  }

  const srcDir = path.join(tempDir, path.relative(pkgDir, inputDir));
  const distDir = path.join(tempDir, DIST_DIR_NAME);

  const project: Project = {
    inputDir,
    tempDir,
    srcDir,
    distDir,
    pkgDir,
    rootDir,
    prepare: async () => {
      await project.clear();

      await Promise.all([
        fsp.mkdir(srcDir, { recursive: true }),
        fsp.mkdir(distDir, { recursive: true }),
      ]);

      await Promise.all([
        linkNodeModules(project),
        fsp.writeFile(
          path.join(tempDir, "package.json"),
          JSON.stringify(pkg, null, 2),
        ),
        fsp.writeFile(
          path.join(tempDir, "tsconfig.json"),
          JSON.stringify(createProjectTSConfig(project, options), null, 2),
        ),
        // Write the virtual file system contents to the source directory
        ...[...vfs.entries()].map(async ([filePath, content]) => {
          const outFilePath = path.join(
            srcDir,
            path.relative(inputDir, filePath),
          );

          await fsp.mkdir(path.dirname(outFilePath), { recursive: true });
          await fsp.writeFile(outFilePath, content);
        }),
      ]);

      return project;
    },
    generate: async (compiler: Compiler) => {
      const inputFiles = [...vfs.keys()];

      await runTscCli(compiler, tempDir);
      await updateVFSWithDeclarations(vfs, inputFiles, project);

      return extractDeclarations(vfs, inputFiles, options);
    },
    clear: () => {
      return fsp.rm(tempDir, { recursive: true, force: true });
    },
  };

  return project.prepare();
}

/**
 * Runs the TypeScript compiler CLI (`tsc` or `tsgo`) to generate declarations.
 *
 * @param compiler - The TypeScript compiler to use, either "tsc" or "tsgo".
 * @param cwd - The current working directory where the command should be executed.
 */
async function runTscCli(compiler: Compiler, cwd: string): Promise<void> {
  const { pkgName, exePath } = distributions[compiler];

  const tsc = path.join(
    path.dirname(
      createRequire(import.meta.url).resolve(
        path.join(pkgName, "package.json"),
      ),
    ),
    ...exePath,
  );

  return await new Promise<void>((resolve, reject) => {
    const process = spawn(tsc, [], {
      cwd,
      stdio: "inherit",
    });

    process.on("close", () => {
      resolve();
    });

    process.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Process exited with code ${code}`));
      }

      resolve();
    });

    process.on("error", (error) => {
      reject(new Error(`Failed to start process: ${error.message}`));
    });
  }).catch((error) => {
    fsp
      .readFile(path.join(cwd, "tsconfig.json"), "utf8")
      .then((tsconfigContent) => {
        // Show `tsconfig.json` for debugging
        consola.info("tsconfig.json:\n");
        console.dir(JSON.parse(tsconfigContent), {
          depth: 5,
        });
      })
      .finally(() => {
        consola.error(
          `Error while generating declarations with ${compiler}: ${error.message}`,
        );
      });
  });
}

/**
 * Reads the generated declaration files from the dist directory and updates the VFS.
 *
 * @param vfs - The virtual file system to update.
 * @param inputFiles - The list of input files to process.
 * @param project - The project object containing paths.
 */
async function updateVFSWithDeclarations(
  vfs: VFS,
  inputFiles: string[],
  project: Project,
): Promise<void> {
  const { distDir, inputDir, srcDir, rootDir } = project;

  await Promise.all(
    inputFiles
      .filter((inputFilePath) => !DECLARATION_RE.test(inputFilePath))
      .map(async (inputFilePath) => {
        const dtsFileName = inputFilePath.replace(KNOWN_EXT_RE, ".d.$1ts");
        const dtsPath = path.join(
          distDir,
          path.relative(rootDir, srcDir),
          path.relative(inputDir, dtsFileName),
        );

        try {
          vfs.set(dtsFileName, await fsp.readFile(dtsPath, "utf8"));
        } catch (error: any) {
          consola.warn(
            `Could not read declaration file for "${inputFilePath}" at "${dtsPath}": ${error.message}`,
          );
        }
      }),
  );
}

/**
 * Creates a tsconfig.json object for the project based on the provided options.
 *
 * @param project - The project object containing paths.
 * @param options - The declaration options.
 * @return The tsconfig.json object.
 */
function createProjectTSConfig(
  project: Project,
  options: DeclarationOptions,
): TSConfig {
  const { tempDir, srcDir, rootDir } = project;
  const tsConfig: TSConfig = {
    compilerOptions: defu(
      {
        declaration: true,
        emitDeclarationOnly: true,
        verbatimModuleSyntax: false,
        noEmit: false,
        noCheck: true,
        outDir: `./${DIST_DIR_NAME}`,
        rootDir: `./${path.relative(tempDir, rootDir)}`,
      },
      options.typescript?.compilerOptions,
    ),
    include: [`./${path.relative(tempDir, srcDir)}/**/*`],
  };

  // Current version of `tsgo` has issues with absolute paths in `tsconfig.json`
  return rewriteTSConfigPaths(
    tsConfig,
    (p) => `./${path.relative(rootDir, p)}`,
  );
}

/**
 * Links the nearest `node_modules` directory to the temporary project directory.
 *
 * @param project - The project object containing paths.
 */
async function linkNodeModules(project: Project): Promise<void> {
  const { inputDir, tempDir } = project;
  const nodeModulesPath = await findNearestNodeModules(inputDir);

  if (nodeModulesPath === undefined) {
    consola.warn(
      `No node_modules found in "${inputDir}" or its parent directories.`,
    );
    return;
  }

  const tempNodeModulesPath = path.join(tempDir, "node_modules");

  try {
    await symlinkDir(nodeModulesPath, tempNodeModulesPath);
  } catch (error: any) {
    consola.error(`Failed to link node_modules: ${error.message}`);
  }
}

/**
 * Finds the nearest `node_modules` directory starting from the given directory.
 *
 * @param startDir - The directory to start searching from.
 * @returns The path to the nearest `node_modules` directory, or undefined if not found.
 */
async function findNearestNodeModules(
  startDir: string,
): Promise<string | undefined> {
  let currentDir = path.resolve(startDir);

  while (true) {
    const candidate = path.join(currentDir, "node_modules");

    try {
      await fsp.access(candidate);

      return candidate;
    } catch {
      const parentDir = path.dirname(currentDir);

      if (parentDir === currentDir) {
        return;
      }

      currentDir = parentDir;
    }
  }
}
