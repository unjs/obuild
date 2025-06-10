import { promises as fsp } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "pathe";

export async function readFileNames(distDir: string | URL): Promise<string[]> {
  return fsp
    .readdir(distDir, {
      recursive: true,
      withFileTypes: true,
    })
    .then((entries) =>
      entries
        .filter((entry) => entry.isFile())
        .map((entry) =>
          relative(fileURLToPath(distDir), join(entry.parentPath, entry.name)),
        )
        .sort(),
    );
}

export async function readDistFiles(
  distDir: string | URL,
): Promise<[string, string][]> {
  const filePaths = await readFileNames(distDir);

  return await Promise.all(
    filePaths.map(async (path) => {
      return [path, await fsp.readFile(new URL(path, distDir), "utf8")];
    }),
  );
}
