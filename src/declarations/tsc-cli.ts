import { spawn } from "node:child_process";
import { promises as fsp } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "pathe";
import { defu } from "defu";
import consola from "consola";

import {
  extractDeclarations,
  type DeclarationOptions,
  type DeclarationOutput,
  type VFS,
} from "./common.ts";

const SRC_DIR_NAME = "src";
const DIST_DIR_NAME = "dist";
const CACHE_PREFIX = "obuild-";
const KNOWN_EXT_RE = /(?<!\.d)\.(m)?[tj]sx?$/;
const DECLARATION_RE = /\.d\.m?ts$/;

type Compiler = "tsc" | "tsgo";
type Distribution = { packageName: string; bin: string };

const distributions: Record<Compiler, Distribution> = {
  tsc: {
    packageName: "typescript",
    bin: "tsc",
  },
  tsgo: {
    packageName: "@typescript/native-preview",
    bin: "tsgo.js",
  },
};

/**
 * Generates TypeScript declarations using the executable CLI tools `tsc` or `tsgo`.
 *
 * This function creates a temporary project on disk, runs the CLI to generate
 * declaration files, reads the output back into the virtual file system,
 * and then cleans up the temporary directory.
 *
 * @param vfs A Map representing a virtual file system (filePath -> content).
 * @param options Options for declaration generation.
 * @returns The declaration output, or undefined if there are no files.
 */
export async function getTscCliDeclarations(
  vfs: VFS,
  options: DeclarationOptions,
): Promise<DeclarationOutput | undefined> {
  if (
    vfs.size === 0 ||
    vfs.keys().some((filePath) => KNOWN_EXT_RE.test(filePath)) === false
  ) {
    return undefined;
  }

  const { tempDir, distDir } = await setupTemporaryProject(vfs, options);

  try {
    await runTscCli("tsgo", tempDir);
    // await runTs("tsc", tempDir);

    const inputFiles = [...vfs.keys()];
    await updateVFSWithDeclarations(vfs, inputFiles, distDir, options.inputDir);

    return await extractDeclarations(vfs, inputFiles, options);
  } finally {
    await cleanTemporaryProject(tempDir);
  }
}

/**
 * Finds the nearest `node_modules` directory starting from the given directory.
 *
 * @param startDir - The directory to start searching from.
 * @returns The path to the nearest `node_modules` directory, or null if not found.
 */
async function findNearestNodeModules(
  startDir: string,
): Promise<string | null> {
  let currentDir = path.resolve(startDir);

  while (true) {
    const candidate = path.join(currentDir, "node_modules");

    try {
      await fsp.access(candidate);

      return candidate;
    } catch {
      const parentDir = path.dirname(currentDir);

      if (parentDir === currentDir) {
        return null;
      }

      currentDir = parentDir;
    }
  }
}

/**
 * Links the nearest `node_modules` directory to the temporary project directory.
 *
 * @param tempDir - The temporary directory where the project is set up.
 * @param inputDir - The input directory where the source files are located.
 */
async function linkNodeModules(
  tempDir: string,
  inputDir: string,
): Promise<void> {
  const nodeModulesPath = await findNearestNodeModules(inputDir);

  if (!nodeModulesPath) {
    consola.warn(
      `No node_modules found in "${inputDir}" or its parent directories.`,
    );
    return;
  }

  const tempNodeModulesPath = path.join(tempDir, "node_modules");

  try {
    await fsp.symlink(nodeModulesPath, tempNodeModulesPath, "dir");
  } catch (error: any) {
    consola.error(`Failed to link node_modules: ${error.message}`);
  }
}

/**
 * Sets up a temporary directory with the project source files and configuration.
 *
 * @param vfs - The virtual file system containing source files.
 * @param options - The declaration options.
 * @return An object containing the temporary directory, source directory, and distribution directory.
 */
async function setupTemporaryProject(vfs: VFS, options: DeclarationOptions) {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), CACHE_PREFIX));

  try {
    const srcDir = path.join(tempDir, SRC_DIR_NAME);
    const distDir = path.join(tempDir, DIST_DIR_NAME);

    // Create source and distribution directories and link node_modules
    await Promise.all([
      fsp.mkdir(srcDir),
      fsp.mkdir(distDir),
      linkNodeModules(tempDir, options.inputDir),
    ]);

    // Write the virtual file system contents to the source directory
    await Promise.all(
      [...vfs.entries()].map(async ([filePath, content]) => {
        const outFilePath = path.join(
          srcDir,
          path.relative(options.inputDir, filePath),
        );

        await fsp.mkdir(path.dirname(outFilePath), { recursive: true });
        await fsp.writeFile(outFilePath, content);
      }),
    );

    // Create tsconfig.json and package.json in the temporary directory
    await Promise.all([
      fsp.writeFile(
        path.join(tempDir, "tsconfig.json"),
        JSON.stringify(createTsConfig(options, distDir, srcDir), null, 2),
      ),
      fsp.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify(options.pkg, null, 2),
      ),
    ]);

    return { tempDir, srcDir, distDir };
  } catch (error: unknown) {
    await cleanTemporaryProject(tempDir);
    throw error;
  }
}

/**
 * Cleans up the temporary project directory.
 *
 * @param tempDir - The temporary directory to clean up.
 */
async function cleanTemporaryProject(tempDir: string): Promise<void> {
  return fsp.rm(tempDir, { recursive: true, force: true });
}

/**
 * Reads the generated declaration files from the dist directory and updates the VFS.
 *
 * @param vfs - The virtual file system to update.
 * @param inputFiles - The list of input files to process.
 * @param distDir - The directory where declaration files are generated.
 * @param inputDir - The root directory of the source files.
 * @returns A promise that resolves when all declaration files have been read and added to the VFS.
 */
async function updateVFSWithDeclarations(
  vfs: VFS,
  inputFiles: string[],
  distDir: string,
  inputDir: string,
): Promise<void> {
  await Promise.all(
    inputFiles
      .filter((inputFilePath) => !DECLARATION_RE.test(inputFilePath))
      .map(async (inputFilePath) => {
        const dtsFileName = inputFilePath.replace(KNOWN_EXT_RE, ".d.$1ts");
        const dtsPath = path.join(
          distDir,
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
 * Creates the tsconfig.json object.
 *
 * @param options - The declaration options.
 * @param distDir - The temporary output directory for compiled declaration files.
 * @param srcDir - The temporary source directory containing TypeScript files.
 * @return The tsconfig.json object.
 */
function createTsConfig(
  options: DeclarationOptions,
  distDir: string,
  srcDir: string,
) {
  return {
    compilerOptions: defu(
      {
        verbatimModuleSyntax: false,
        emitDeclarationOnly: true,
        declaration: true,
        outDir: `./${DIST_DIR_NAME}`,
        rootDir: `./${SRC_DIR_NAME}`,
        noEmit: false,
        noCheck: true,
      },
      options.typescript?.compilerOptions,
    ),
    include: [SRC_DIR_NAME],
  };
}

async function runTscCli(compiler: Compiler, cwd: string): Promise<void> {
  const { packageName, bin } = distributions[compiler];
  const require = createRequire(import.meta.url);
  const packagePath = path.dirname(
    require.resolve(path.join(packageName, "package.json")),
  );

  return await new Promise<void>((resolve, reject) => {
    const process = spawn(path.join(packagePath, "bin", bin), [], {
      cwd,
      stdio: "inherit",
    });

    process.on("close", () => {
      resolve();
    });

    process.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    process.on("error", (error) => {
      reject(new Error(`Failed to start process: ${error.message}`));
    });
  }).catch((error) => {
    return fsp
      .readFile(path.join(cwd, "tsconfig.json"), "utf8")
      .then((tsconfigContent) => {
        // Show `tsconfig.json` for debugging
        consola.info("tsconfig.json:\n");
        console.dir(JSON.parse(tsconfigContent), {
          depth: 5,
        });
      })
      .finally(() => {
        consola.warn(
          `Error while generating declarations with ${compiler}: ${error.message}`,
        );
      });
  });
}
