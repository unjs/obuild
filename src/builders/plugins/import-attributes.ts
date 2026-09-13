// Based on https://github.com/nitrojs/nitro/pull/4431

import { readFile } from "node:fs/promises";
import MagicString from "magic-string";
import { parseSync, Visitor, type ESTree } from "rolldown/utils";
import type { Plugin } from "rolldown";

// Rolldown parses the `with { type: "bytes" | "text" }` syntax but drops the attributes
// before they reach plugins and does not implement the semantics. Imports carrying them
// are rewritten to `bytes:` / `text:` prefixed specifiers that this plugin resolves and
// loads as a `Uint8Array` / string. As in the proposals, the file type is ignored.
// https://github.com/tc39/proposal-import-bytes
// https://github.com/tc39/proposal-import-text

const TYPES = ["bytes", "text"] as const;
type ImportType = (typeof TYPES)[number];

const PREFIX_RE = /^(bytes|text):(.+)$/;

// Resolved ids carry the type as a suffix so that plugins matching the original
// extension (dts, json, ...) do not claim the inlined contents as source code.
const RESOLVED_RE = /^\0(.+)\?obuild-(bytes|text)$/;

// TypeScript does not type these imports: `.d.ts` modules of the dts plugin get a
// declaration of the value type instead of the file contents.
const DTS_RE = /\.d\.[cm]?ts$/;
const DECLARATION_ID_RE = /^\0obuild-(bytes|text)\.d\.ts$/;
const DECLARATIONS: Record<ImportType, string> = {
  bytes: "declare const _default: Uint8Array;\nexport default _default;\n",
  text: "declare const _default: string;\nexport default _default;\n",
};

const JS_ID_RE = /\.[cm]?[jt]sx?(\?.*)?$/;
const ATTR_RE = /["']?type["']?\s*:\s*["'](bytes|text)["']/;

// A module specifier with a `bytes` or `text` type attribute
type TypedImport = {
  source: ESTree.StringLiteral;
  type: ImportType;
  // End of the syntax trailing the specifier (options argument or attributes clause)
  end: number;
};

type Comment = { start: number; end: number };

export function importAttributesPlugin(): Plugin {
  return {
    name: "obuild-import-attributes",
    transform: {
      order: "pre",
      filter: {
        id: { include: JS_ID_RE, exclude: RESOLVED_RE },
        code: ATTR_RE,
      },
      handler(code, id) {
        const filename = id.split("?")[0]!;
        const { program, comments, errors } = parseSync(filename, code);
        if (errors.length > 0) {
          return; // Let rolldown report the syntax errors
        }

        const imports = findTypedImports(program, code, comments);
        if (imports.length === 0) {
          return;
        }

        const s = new MagicString(code);
        for (const { source, type, end } of imports) {
          s.update(source.start, source.end, JSON.stringify(`${type}:${source.value}`));
          s.remove(source.end, end);
        }

        return {
          code: s.toString(),
          map: s.generateMap({ hires: true }),
        };
      },
    },
    resolveId: {
      order: "pre",
      filter: { id: PREFIX_RE },
      async handler(id, importer, opts) {
        const [, type, specifier] = PREFIX_RE.exec(id)!;
        if (importer && DTS_RE.test(importer)) {
          return { id: `\0obuild-${type}.d.ts`, moduleSideEffects: false };
        }
        const resolved = await this.resolve(specifier, importer, opts);
        // Externals are not loadable, so there are no contents to inline
        if (!resolved?.id || resolved.external) {
          return this.error(
            `Could not resolve \`${specifier}\`${importer ? ` (imported by \`${importer}\`)` : ""} to contents to inline as \`${type}\`.`,
          );
        }
        return { id: `\0${resolved.id}?obuild-${type}`, moduleSideEffects: false };
      },
    },
    load: {
      filter: { id: [RESOLVED_RE, DECLARATION_ID_RE] },
      async handler(id) {
        const declarationType = DECLARATION_ID_RE.exec(id)?.[1] as ImportType | undefined;
        if (declarationType) {
          return { code: DECLARATIONS[declarationType], moduleType: "ts" };
        }
        const [, path, type] = RESOLVED_RE.exec(id)!;
        this.addWatchFile(path);
        if (type === "text") {
          return { code: await readFile(path, "utf8"), moduleType: "text" };
        }
        // Plugins can only return strings, which rolldown re-encodes as UTF-8, so
        // bytes cannot go through the built-in `binary` module type.
        const base64 = await readFile(path, "base64");
        return {
          code: `export default Uint8Array.from(atob(${JSON.stringify(base64)}), (c) => c.charCodeAt(0));`,
          moduleType: "js",
        };
      },
    },
  };
}

function findTypedImports(
  program: ESTree.Program,
  code: string,
  comments: Comment[],
): TypedImport[] {
  const imports: TypedImport[] = [];

  // import x from "./file" with { type: "bytes" } (also `export ... from`)
  const visitDeclaration = (
    node: ESTree.ImportDeclaration | ESTree.ExportNamedDeclaration | ESTree.ExportAllDeclaration,
  ) => {
    const lastAttr = node.attributes.at(-1);
    const type = attributesType(node.attributes);
    if (!node.source || !lastAttr || !type) {
      return;
    }
    const end = clauseEnd(code, lastAttr.end, comments);
    if (end !== undefined) {
      imports.push({ source: node.source, type, end });
    }
  };

  new Visitor({
    ImportDeclaration: visitDeclaration,
    ExportNamedDeclaration: visitDeclaration,
    ExportAllDeclaration: visitDeclaration,
    // import("./file", { with: { type: "bytes" } })
    ImportExpression(node) {
      const options = node.options;
      if (!isStringLiteral(node.source) || options?.type !== "ObjectExpression") {
        return;
      }
      const type = optionsType(options);
      if (type) {
        imports.push({ source: node.source, type, end: options.end });
      }
    },
  }).visit(program);

  return imports;
}

// The `with { ... }` clause has no node of its own: its closing brace is the first
// `}` following the last attribute that is not part of a comment.
function clauseEnd(code: string, from: number, comments: Comment[]): number | undefined {
  for (let i = code.indexOf("}", from); i !== -1; i = code.indexOf("}", i + 1)) {
    if (!comments.some((comment) => i >= comment.start && i < comment.end)) {
      return i + 1;
    }
  }
}

function attributesType(attributes: ESTree.ImportAttribute[]): ImportType | undefined {
  for (const attr of attributes) {
    const key = attr.key.type === "Identifier" ? attr.key.name : attr.key.value;
    if (key === "type" && isImportType(attr.value.value)) {
      return attr.value.value;
    }
  }
}

function optionsType(options: ESTree.ObjectExpression): ImportType | undefined {
  const withOption = findProperty(options, "with");
  if (withOption?.type !== "ObjectExpression") {
    return;
  }
  const type = findProperty(withOption, "type");
  if (type && isStringLiteral(type) && isImportType(type.value)) {
    return type.value;
  }
}

function findProperty(node: ESTree.ObjectExpression, name: string): ESTree.Expression | undefined {
  for (const prop of node.properties) {
    if (prop.type !== "Property" || prop.computed) {
      continue;
    }
    const key =
      prop.key.type === "Identifier"
        ? prop.key.name
        : isStringLiteral(prop.key)
          ? prop.key.value
          : undefined;
    if (key === name) {
      return prop.value;
    }
  }
}

function isStringLiteral(node: ESTree.Node): node is ESTree.StringLiteral {
  return node.type === "Literal" && typeof (node as ESTree.StringLiteral).value === "string";
}

function isImportType(value: string): value is ImportType {
  return TYPES.includes(value as ImportType);
}
