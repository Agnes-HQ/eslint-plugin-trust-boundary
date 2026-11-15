import type { Rule } from "eslint";
import { docsUrl, findProperty, isFunction, namedImports, usesInput } from "../utils";

/** Astro Actions are HTTP endpoints; `input` is where their schema goes, and without it the handler gets raw input. */
const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Require an input schema on Astro Actions whose handler reads input", url: docsUrl("astro-action-input") },
    schema: [],
    messages: {
      missing: "This action is an HTTP endpoint, and its handler reads input that isn't validated. Add an `input` schema (astro:schema / Zod).",
    },
  },
  create(context) {
    let imports = new Map<string, string>();
    return {
      Program(program) {
        imports = namedImports(program, (s) => s === "astro:actions");
      },
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || imports.get(node.callee.name) !== "defineAction") return;
        const options = node.arguments[0];
        if (options?.type !== "ObjectExpression" || findProperty(options, "input")) return;
        const handler = findProperty(options, "handler");
        if (!handler || !isFunction(handler.value) || !usesInput(handler.value)) return;
        context.report({ node: handler.key, messageId: "missing" });
      },
    };
  },
};

export default rule;
