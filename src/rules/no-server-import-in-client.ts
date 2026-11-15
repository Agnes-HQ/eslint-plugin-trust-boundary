import type { Rule } from "eslint";
import type * as ESTree from "estree";
import { directives, docsUrl } from "../utils";

const NODE_ONLY = new Set(["fs", "fs/promises", "child_process", "net", "tls", "dgram", "cluster", "worker_threads", "v8", "vm", "repl", "inspector"]);
/** Database drivers and server SDKs that need a secret: in a client module they mean credentials near the browser. */
const SERVER_PACKAGES = [
  /^server-only$/,
  // not @prisma/client: it ships its enums for the browser on purpose
  /^(?:pg|postgres|mysql|mysql2(?:\/promise)?|mongodb|mongoose|better-sqlite3|sqlite3|ioredis|redis|stripe)$/,
  /^drizzle-orm\/(?:node-postgres|postgres-js|mysql2|better-sqlite3|bun-sqlite)$/,
];

export function isServerModule(source: string): boolean {
  const bare = source.startsWith("node:") ? source.slice(5) : source;
  return NODE_ONLY.has(bare) || SERVER_PACKAGES.some((p) => p.test(source));
}

/** A `"use client"` module runs in the browser too; server-only code imported there leaks or breaks. */
const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow server-only modules in \"use client\" modules", url: docsUrl("no-server-import-in-client") },
    schema: [],
    messages: {
      server: "`{{source}}` is server-only, but this is a \"use client\" module that ships to the browser. Move this code to a server module or a server function.",
    },
  },
  create(context) {
    let client = false;
    const report = (node: ESTree.Node, source: string) => context.report({ node, messageId: "server", data: { source } });
    /** Whether an import is used as a value: types and unused imports disappear from the bundle. */
    const usedAsValue = (spec: ESTree.ImportDeclaration["specifiers"][number]) => {
      if ((spec as { importKind?: string }).importKind === "type") return false;
      return context.sourceCode.getDeclaredVariables(spec).some((v) =>
        // typescript-eslint's scope manager tells type and value references apart; without it every reference is a value
        v.references.some((r) => (r as { isValueReference?: boolean }).isValueReference !== false),
      );
    };
    return {
      Program(program) {
        client = directives(program).includes("use client");
      },
      ImportDeclaration(node) {
        const source = node.source.value;
        if (!client || typeof source !== "string" || !isServerModule(source) || (node as { importKind?: string }).importKind === "type") return;
        // `import "server-only"` has no bindings and is the point
        if (node.specifiers.length === 0 || node.specifiers.some(usedAsValue)) report(node.source, source);
      },
      ExportNamedDeclaration(node) {
        const source = node.source?.value;
        if (client && typeof source === "string" && isServerModule(source) && (node as { exportKind?: string }).exportKind !== "type") report(node.source!, source);
      },
      ExportAllDeclaration(node) {
        const source = node.source.value;
        if (client && typeof source === "string" && isServerModule(source) && (node as { exportKind?: string }).exportKind !== "type") report(node.source, source);
      },
      ImportExpression(node) {
        if (client && node.source.type === "Literal" && typeof node.source.value === "string" && isServerModule(node.source.value)) report(node.source, node.source.value);
      },
    };
  },
};

export default rule;
