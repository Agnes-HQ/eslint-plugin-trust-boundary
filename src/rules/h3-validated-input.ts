import type { Rule } from "eslint";
import type * as ESTree from "estree";
import { docsUrl, isValidatedLater, namedImports, type WithParent } from "../utils";

/**
 * h3 (Nuxt, Nitro) has a validating twin for each of these. Not getRouterParams: route params are strings the router
 * already matched, and checking them rarely matters.
 */
const VALIDATED: Record<string, string> = {
  readBody: "readValidatedBody",
  getQuery: "getValidatedQuery",
};
// Nitro 3 (the `nitro` package) imports every h3 helper from `nitro/h3`; Nitro 2 (`nitropack`) and Nuxt from the others
const H3 = /^(?:h3|nitro\/h3|nitropack\/runtime|nitro\/runtime|#imports)$/;
/** Nuxt and Nitro auto-import h3's helpers in their server folder. */
const SERVER_DIR = /(?:^|[/\\])(?:server|routes|api)[/\\]/;

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Prefer h3's validating helpers for request input in server routes", url: docsUrl("h3-validated-input") },
    schema: [],
    messages: {
      unvalidated: "`{{name}}` returns the client's input unchecked. Use `{{validated}}(event, schema.parse)`, or pass the result through a schema.",
    },
  },
  create(context) {
    let imports = new Map<string, string>();
    const inServerDir = SERVER_DIR.test(context.filename);
    return {
      Program(program) {
        imports = namedImports(program, (s) => H3.test(s));
      },
      CallExpression(node) {
        if (node.callee.type !== "Identifier") return;
        const local = node.callee.name;
        let name = imports.get(local);
        if (!name) {
          // an auto-import: only in a server folder, and only when nothing in the file declares or imports that name
          if (!inServerDir || !(local in VALIDATED)) return;
          const reference = context.sourceCode.getScope(node).references.find((r) => r.identifier === node.callee);
          if (reference?.resolved && reference.resolved.defs.length > 0) return;
          name = local;
        }
        const validated = VALIDATED[name];
        if (!validated || isValidatedLater(context, node as WithParent<ESTree.CallExpression>)) return;
        context.report({ node: node.callee, messageId: "unvalidated", data: { name, validated } });
      },
    };
  },
};

export default rule;
