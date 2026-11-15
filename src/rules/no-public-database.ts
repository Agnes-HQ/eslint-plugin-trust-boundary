import type { Rule } from "eslint";
import { docsUrl, isInfraFile, propertyName, staticValue } from "../utils";

/** `publiclyAccessible: true` gives a database instance an address on the internet (CDK, Pulumi, SST). */
const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow databases that are reachable from the internet", url: docsUrl("no-public-database") },
    schema: [],
    messages: {
      public: "`publiclyAccessible: true` puts this database on the internet. Keep it in private subnets and connect through the VPC, a bastion or a proxy.",
    },
  },
  create(context) {
    if (!isInfraFile(context)) return {};
    return {
      Property(node) {
        if (propertyName(node) === "publiclyAccessible" && staticValue(node.value) === true) context.report({ node, messageId: "public" });
      },
    };
  },
};

export default rule;
