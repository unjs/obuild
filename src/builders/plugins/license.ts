/**
 *  Based on:
 *  - https://github.com/vitejs/vite/blob/main/packages/vite/rollupLicensePlugin.ts
 *      MIT Licensed: https://github.com/vitejs/vite/blob/main/LICENSE (Bjorn Lu <bjorn@bjornlu.com>)
 *  - https://github.com/rollup/rollup/blob/master/build-plugins/generate-license-file.ts
 *      MIT Licensed: https://github.com/rollup/rollup/blob/master/LICENSE-CORE.md
 */

import { mkdir, writeFile } from "node:fs/promises";
import license from "rollup-plugin-license";

import type { Dependency } from "rollup-plugin-license";
import type { Plugin, PluginContext } from "rolldown";
import { dirname, join } from "node:path";

export default function licensePlugin(opts: { output: string }): Plugin {
  const originalPlugin = (license as unknown as typeof license.default)({
    async thirdParty(dependencies: Dependency[]) {
      const deps = sortDependencies([...dependencies]);
      const licenses = sortLicenses(
        new Set(
          dependencies
            .map((dep: Dependency) => dep.license)
            .filter(Boolean) as string[],
        ),
      );

      let dependencyLicenseTexts = "";
      for (let i = 0; i < deps.length; i++) {
        // Find dependencies with the same license text so it can be shared
        const licenseText = deps[i].licenseText;
        const sameDeps = [deps[i]];
        if (licenseText) {
          for (let j = i + 1; j < deps.length; j++) {
            if (licenseText === deps[j].licenseText) {
              sameDeps.push(...deps.splice(j, 1));
              j--;
            }
          }
        }

        let text = `## ${sameDeps.map((d) => d.name || "unknown").join(", ")}\n\n`;
        const depInfos = sameDeps.map((d) => getDependencyInformation(d));

        // If all same dependencies have the same license and contributor names, show them only once
        if (
          depInfos.length > 1 &&
          depInfos.every(
            (info) =>
              info.license === depInfos[0].license &&
              info.names === depInfos[0].names,
          )
        ) {
          const { license, names } = depInfos[0];
          const repositoryText = depInfos
            .map((info) => info.repository)
            .filter(Boolean)
            .join(", ");

          if (license) text += `License: ${license}\n`;
          if (names) text += `By: ${names}\n`;
          if (repositoryText) text += `Repositories: ${repositoryText}\n`;
        }
        // Else show each dependency separately
        else {
          for (let j = 0; j < depInfos.length; j++) {
            const { license, names, repository } = depInfos[j];

            if (license) text += `License: ${license}\n`;
            if (names) text += `By: ${names}\n`;
            if (repository) text += `Repository: ${repository}\n`;
            if (j !== depInfos.length - 1) text += "\n";
          }
        }

        if (licenseText) {
          text +=
            "\n" +
            licenseText
              .trim()
              .replace(/\r\n|\r/g, "\n")
              .split("\n")
              .map((line: string) => `> ${line}`)
              .join("\n") +
            "\n";
        }

        if (i !== deps.length - 1) {
          text += "\n---------------------------------------\n\n";
        }

        dependencyLicenseTexts += text;
      }

      if (!dependencyLicenseTexts) {
        return;
      }

      const licenseText =
        `# Licenses of Bundled Dependencies\n\n` +
        `The published artifact additionally contains code with the following licenses:\n` +
        `${licenses.join(", ")}\n\n` +
        `# Bundled Dependencies\n\n` +
        dependencyLicenseTexts;

      console.log("Writing third-party licenses to", opts.output);

      await mkdir(dirname(opts.output!), { recursive: true });
      await writeFile(opts.output!, licenseText);
    },
  });
  // Skip for watch mode
  for (const hook of ["renderChunk", "generateBundle"] as const) {
    const originalHook = originalPlugin[hook];
    if (!originalHook) continue;
    // @ts-expect-error
    originalPlugin[hook] = function (this: PluginContext, ...args: unknown[]) {
      if (this.meta.watchMode) return;
      // @ts-expect-error
      return originalHook.apply(this, args);
    };
  }
  return originalPlugin as Plugin;
}

function sortDependencies(dependencies: Dependency[]) {
  return dependencies.sort(({ name: nameA }, { name: nameB }) => {
    return (nameA || "") > (nameB || "")
      ? 1
      : (nameB || "") > (nameA || "")
        ? -1
        : 0;
  });
}

function sortLicenses(licenses: Set<string>) {
  let withParenthesis: string[] = [];
  let noParenthesis: string[] = [];
  for (const license of licenses) {
    if (license[0] === "(") {
      withParenthesis.push(license);
    } else {
      noParenthesis.push(license);
    }
  }
  withParenthesis = withParenthesis.sort();
  noParenthesis = noParenthesis.sort();
  return [...noParenthesis, ...withParenthesis];
}

interface DependencyInfo {
  license?: string;
  names?: string;
  repository?: string;
}

function getDependencyInformation(dep: Dependency): DependencyInfo {
  const info: DependencyInfo = {};
  const { license, author, maintainers, contributors, repository } = dep;

  if (license) {
    info.license = license;
  }

  const names = new Set<string>();
  for (const person of [author, ...maintainers, ...contributors]) {
    const name = typeof person === "string" ? person : person?.name;
    if (name) {
      names.add(name);
    }
  }
  if (names.size > 0) {
    info.names = [...names].join(", ");
  }

  if (repository) {
    info.repository = normalizeGitUrl(
      typeof repository === "string" ? repository : repository.url,
    );
  }

  return info;
}

// https://github.com/publint/publint/blob/d02eb462f3804413713c8dce5ce647a2fa7c009f/site/src/app/utils/registry.js#L27-L49
function normalizeGitUrl(url: string): string {
  url = url
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/(^|\/)[^/]+?@/, "$1") // remove "user@" from "ssh://user@host.com:..."
    .replace(/(\.[^.]+?):(?!\d)/, "$1/") // change ".com:" to ".com/" from "ssh://user@host.com:..." (but not port numbers)
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\//, "https://");
  if (url.startsWith("github:")) {
    return `https://github.com/${url.slice(7)}`;
  } else if (url.startsWith("gitlab:")) {
    return `https://gitlab.com/${url.slice(7)}`;
  } else if (url.startsWith("bitbucket:")) {
    return `https://bitbucket.org/${url.slice(10)}`;
  } else if (!url.includes(":") && url.split("/").length === 2) {
    return `https://github.com/${url}`;
  } else {
    return url.includes("://") ? url : `https://${url}`;
  }
}
