import type { Rule } from "eslint";
import { docsUrl, isInfraFile, memberPath, propertyName, staticValue } from "../utils";

const ENCRYPTION_FLAGS = new Set(["encrypted", "storageEncrypted"]);

/** Storage with encryption at rest turned off on purpose: volumes, databases, buckets (CDK, Pulumi). */
const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow turning off encryption at rest", url: docsUrl("no-unencrypted-storage") },
    schema: [],
    messages: {
      unencrypted: "This turns off encryption at rest. Leave it on; it costs nothing on most services.",
    },
  },
  create(context) {
    if (!isInfraFile(context)) return {};
    return {
      Property(node) {
        const name = propertyName(node);
        if (name && ENCRYPTION_FLAGS.has(name) && staticValue(node.value) === false) return context.report({ node, messageId: "unencrypted" });
        if (name === "encryption" && /\.UNENCRYPTED$/.test(memberPath(node.value) ?? "")) context.report({ node, messageId: "unencrypted" });
      },
    };
  },
};

export default rule;
