import { createRequire } from "node:module";
import consola from "consola";
import { normalize } from "pathe";
import { satisfies } from "semver";
import { readPackageJSON } from "pkg-types";
import {
  augmentWithDiagnostics,
  extractDeclarations,
  type DeclarationOutput,
  type DeclarationOptions,
} from "./dts.ts";
import type { CreateProgramOptions } from "typescript";

const require = createRequire(import.meta.url);

export async function getVueDeclarations(
  vfs: Map<string, string>,
  opts: DeclarationOptions,
): Promise<DeclarationOutput | undefined> {
  const fileMapping = getFileMapping(vfs);
  const sourceFiles = Object.keys(fileMapping);
  const originFiles = Object.values(fileMapping);

  if (originFiles.length === 0) {
    return;
  }

  const pkgInfo = await readPackageJSON("vue-tsc").catch(() => {});

  if (!pkgInfo?.version) {
    consola.warn("Please install `vue-tsc` to generate Vue SFC declarations.");
    return;
  }

  let output: DeclarationOutput;

  switch (true) {
    case satisfies(pkgInfo.version, "^1.8.27"): {
      output = await emitVueTscV1(vfs, sourceFiles, originFiles, opts);
      break;
    }
    case satisfies(pkgInfo.version, "~v2.0.0"): {
      output = await emitVueTscV2(vfs, sourceFiles, originFiles, opts);
      break;
    }
    default: {
      output = await emitVueTscLatest(vfs, sourceFiles, originFiles, opts);
    }
  }

  return output;
}

const SFC_EXT_RE = /\.vue\.[cm]?[jt]s$/;

function getFileMapping(vfs: Map<string, string>): Record<string, string> {
  const files: Record<string, string> = Object.create(null);
  for (const [srcPath] of vfs) {
    if (SFC_EXT_RE.test(srcPath)) {
      files[srcPath.replace(SFC_EXT_RE, ".vue")] = srcPath;
    }
  }
  return files;
}

async function emitVueTscV1(
  vfs: Map<string, string>,
  inputFiles: string[],
  originFiles: string[],
  opts?: DeclarationOptions,
): Promise<DeclarationOutput> {
  const vueTsc = await import("vue-tsc")
    .then((r) => (r.default || r) as unknown as typeof import("vue-tsc1"))
    .catch(() => undefined);

  if (!vueTsc) {
    consola.warn("Please install `vue-tsc` to generate Vue SFC declarations.");
    return {};
  }

  // Inside vue-tsc, `require` is used instead of `import`. In order to override `ts.sys`, it is necessary to import it in the same way as vue-tsc for them to refer to the same file.
  const ts = require("typescript") as typeof import("typescript");

  const compilerOptions = opts?.typescript?.compilerOptions || {};
  const tsHost = ts.createCompilerHost(compilerOptions);

  const tsSysWriteFile = ts.sys.writeFile;
  const tsSysReadFile = ts.sys.readFile;
  ts.sys.writeFile = (filename, content) => {
    vfs.set(filename, content);
  };
  ts.sys.readFile = (filename, encoding) => {
    if (vfs.has(filename)) {
      return vfs.get(filename);
    }
    return tsSysReadFile(filename, encoding);
  };

  try {
    const program = vueTsc.createProgram({
      rootNames: inputFiles,
      options: compilerOptions,
      host: tsHost,
    });

    const result = program.emit();
    const output = await extractDeclarations(vfs, originFiles, opts);

    augmentWithDiagnostics(result, output, tsHost, ts);

    return output;
  } finally {
    ts.sys.writeFile = tsSysWriteFile;
    ts.sys.readFile = tsSysReadFile;
  }
}

async function emitVueTscV2(
  vfs: Map<string, string>,
  inputFiles: string[],
  originFiles: string[],
  opts?: DeclarationOptions,
): Promise<DeclarationOutput> {
  const { resolve: resolveModule } = await import("mlly");
  const ts: typeof import("typescript") = await import("typescript").then(
    (r) => r.default || r,
  );
  const vueTsc = (await import(
    "vue-tsc"
  )) as unknown as typeof import("vue-tsc2.0");
  const requireFromVueTsc = createRequire(await resolveModule("vue-tsc"));
  const vueLanguageCore: typeof import("@vue/language-core2.0") =
    requireFromVueTsc("@vue/language-core");
  const volarTs: typeof import("@volar/typescript") =
    requireFromVueTsc("@volar/typescript");

  const compilerOptions = opts?.typescript?.compilerOptions || {};
  const tsHost = ts.createCompilerHost(compilerOptions);
  tsHost.writeFile = (filename, content) => {
    vfs.set(filename, vueTsc.removeEmitGlobalTypes(content));
  };
  const _tsReadFile = tsHost.readFile.bind(tsHost);
  tsHost.readFile = (filename) => {
    if (vfs.has(filename)) {
      return vfs.get(filename);
    }
    return _tsReadFile(filename);
  };
  const _tsFileExist = tsHost.fileExists.bind(tsHost);
  tsHost.fileExists = (filename) => {
    return vfs.has(filename) || _tsFileExist(filename);
  };
  const programOptions: CreateProgramOptions = {
    rootNames: inputFiles,
    options: compilerOptions,
    host: tsHost,
  };
  const createProgram = volarTs.proxyCreateProgram(
    ts,
    ts.createProgram,
    (ts, options) => {
      const vueLanguagePlugin = vueLanguageCore.createVueLanguagePlugin<string>(
        ts,
        (id) => id,
        () => "",
        (fileName) => {
          const fileMap = new Set();
          for (const vueFileName of options.rootNames.map((rootName) =>
            normalize(rootName),
          )) {
            fileMap.add(vueFileName);
          }
          return fileMap.has(fileName);
        },
        options.options,
        vueLanguageCore.resolveVueCompilerOptions({}),
      );
      return [vueLanguagePlugin];
    },
  );

  const program = createProgram(programOptions);

  const result = program.emit();
  const output = await extractDeclarations(vfs, originFiles, opts);

  augmentWithDiagnostics(result, output, tsHost, ts);

  return output;
}

async function emitVueTscLatest(
  vfs: Map<string, string>,
  inputFiles: string[],
  originFiles: string[],
  opts: DeclarationOptions,
): Promise<DeclarationOutput> {
  const { resolve: resolveModule } = await import("mlly");
  const ts: typeof import("typescript") = await import("typescript").then(
    (r) => r.default || r,
  );
  const requireFromVueTsc = createRequire(await resolveModule("vue-tsc"));
  const vueLanguageCore: typeof import("@vue/language-core") =
    requireFromVueTsc("@vue/language-core");
  const volarTs: typeof import("@volar/typescript") =
    requireFromVueTsc("@volar/typescript");

  const compilerOptions = opts?.typescript?.compilerOptions || {};
  const tsHost = ts.createCompilerHost(compilerOptions);
  tsHost.writeFile = (filename, content) => {
    vfs.set(filename, content);
  };
  const _tsReadFile = tsHost.readFile.bind(tsHost);
  tsHost.readFile = (filename) => {
    if (vfs.has(filename)) {
      return vfs.get(filename);
    }
    return _tsReadFile(filename);
  };
  const _tsFileExist = tsHost.fileExists.bind(tsHost);
  tsHost.fileExists = (filename) => {
    return vfs.has(filename) || _tsFileExist(filename);
  };

  const programOptions: CreateProgramOptions = {
    rootNames: inputFiles,
    options: compilerOptions,
    host: tsHost,
  };

  const createProgram = volarTs.proxyCreateProgram(
    ts,
    ts.createProgram,
    (ts, options) => {
      const vueLanguagePlugin = vueLanguageCore.createVueLanguagePlugin<string>(
        ts,
        options.options,
        vueLanguageCore.createParsedCommandLineByJson(
          ts,
          ts.sys,
          opts?.rootDir,
          {},
          undefined,
          true,
        ).vueOptions,
        (id) => id,
      );
      return [vueLanguagePlugin];
    },
  );

  const program = createProgram(programOptions);
  const result = program.emit();
  const output = await extractDeclarations(vfs, originFiles, opts);

  augmentWithDiagnostics(result, output, tsHost, ts);

  return output;
}
