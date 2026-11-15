import type { Rule } from "eslint";
import type * as ESTree from "estree";
import { docsUrl, findProperty, isInfraFile, memberPath, staticValue } from "../utils";

const everything = (value: unknown) => value === "*" || value === "*:*" || (Array.isArray(value) && value.some((v) => v === "*" || v === "*:*"));

/** A policy statement that allows every action on every resource: CDK PolicyStatement, Pulumi policy documents, SST permissions. */
const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow IAM statements that allow every action on every resource", url: docsUrl("no-wildcard-iam") },
    schema: [],
    messages: {
      wildcard: "This statement allows every action on every resource: administrator access. Name the actions and resources it needs.",
    },
  },
  create(context) {
    if (!isInfraFile(context)) return {};
    const value = (obj: ESTree.ObjectExpression, ...names: string[]) => {
      for (const name of names) {
        const p = findProperty(obj, name);
        if (p) return staticValue(p.value);
      }
      return undefined;
    };
    return {
      ObjectExpression(node) {
        if (!everything(value(node, "actions", "Action", "action"))) return;
        if (!everything(value(node, "resources", "Resource", "resource"))) return;
        const effect = findProperty(node, "effect") ?? findProperty(node, "Effect");
        if (effect) {
          const e = staticValue(effect.value) ?? memberPath(effect.value);
          if (typeof e === "string" && /deny$/i.test(e)) return;
        }
        context.report({ node, messageId: "wildcard" });
      },
    };
  },
};

export default rule;
