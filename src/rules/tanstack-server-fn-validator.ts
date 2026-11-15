import type { Rule } from "eslint";
import type * as ESTree from "estree";
import { docsUrl, isFunction, namedImports, type WithParent } from "../utils";

const START = /^@tanstack\/(?:[a-z]+-)?start(?:\/.*)?$/;

/**
 * TanStack Start server functions are HTTP endpoints: `createServerFn().handler(({ data }) => ...)` gets whatever the
 * client sends unless the chain has `.inputValidator(...)` (or the older `.validator(...)`).
 */
const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Require an input validator on TanStack Start server functions that read data", url: docsUrl("tanstack-server-fn-validator") },
    schema: [],
    messages: {
      missing: "This server function is an HTTP endpoint, and `data` isn't validated. Add `.inputValidator(schema)` before `.handler(...)`.",
    },
  },
  create(context) {
    let imports = new Map<string, string>();

    /** The method names in `createServerFn(...).a(...).b(...)`, or undefined when the chain doesn't start there. */
    const chain = (node: ESTree.Node): string[] | undefined => {
      const names: string[] = [];
      let current = node;
      while (current.type === "CallExpression") {
        const callee = current.callee;
        if (callee.type === "Identifier") return imports.get(callee.name) === "createServerFn" ? names : undefined;
        if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") return undefined;
        names.push(callee.property.name);
        current = callee.object;
      }
      return undefined;
    };

    const readsData = (fn: ESTree.Node): boolean => {
      if (!isFunction(fn)) return false;
      const param = fn.params[0];
      if (!param) return false;
      if (param.type === "ObjectPattern") return param.properties.some((p) => p.type === "Property" && p.key.type === "Identifier" && p.key.name === "data");
      if (param.type !== "Identifier") return false;
      const variable = context.sourceCode.getDeclaredVariables(fn).find((v) => v.name === param.name);
      return !!variable?.references.some((ref) => {
        const parent = (ref.identifier as WithParent).parent;
        return parent?.type === "MemberExpression" && parent.property.type === "Identifier" && parent.property.name === "data";
      });
    };

    return {
      Program(program) {
        imports = namedImports(program, (s) => START.test(s));
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier" || callee.property.name !== "handler") return;
        const names = chain(callee.object);
        if (!names || names.includes("inputValidator") || names.includes("validator")) return;
        const fn = node.arguments[0];
        if (fn && readsData(fn)) context.report({ node: callee.property, messageId: "missing" });
      },
    };
  },
};

export default rule;
