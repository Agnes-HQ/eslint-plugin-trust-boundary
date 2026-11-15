import type { Rule } from "eslint";
import type * as ESTree from "estree";
import { calleeName, docsUrl, isInfraFile, memberPath, propertyName, staticValue, type WithParent } from "../utils";

const BLOCK_SETTINGS = new Set(["blockPublicAcls", "blockPublicPolicy", "ignorePublicAcls", "restrictPublicBuckets"]);
const PUBLIC_ACL = new Set(["public-read", "public-read-write"]);

/** Explicit settings that make a storage bucket readable by anyone: AWS CDK, Pulumi, SST. */
const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow infrastructure code that makes a storage bucket public", url: docsUrl("no-public-bucket") },
    schema: [],
    messages: {
      public: "This makes the bucket readable by anyone on the internet. Serve public files through a CDN with origin access instead, or remove the setting if it isn't meant to be public.",
      unblocked: "`{{name}}: false` turns off S3's public access block for this bucket. Leave the blocks on unless this bucket must be public.",
    },
  },
  create(context) {
    if (!isInfraFile(context)) return {};
    return {
      Property(node: WithParent<ESTree.Property>) {
        const name = propertyName(node);
        if (!name) return;
        const value = staticValue(node.value);
        // CDK: new s3.Bucket(this, "B", { publicReadAccess: true })
        if (name === "publicReadAccess" && value === true) return context.report({ node, messageId: "public" });
        // CDK BlockPublicAccess / Pulumi BucketPublicAccessBlock with a block switched off: once per object
        if (BLOCK_SETTINGS.has(name) && value === false) {
          const first = node.parent?.type === "ObjectExpression" && node.parent.properties.find((p) => p.type === "Property" && BLOCK_SETTINGS.has(propertyName(p) ?? "") && staticValue(p.value) === false);
          if (first === node) context.report({ node, messageId: "unblocked", data: { name } });
          return;
        }
        // Pulumi: acl: "public-read"
        if (name === "acl" && typeof value === "string" && PUBLIC_ACL.has(value)) return context.report({ node, messageId: "public" });
        // CDK: accessControl: s3.BucketAccessControl.PUBLIC_READ
        if (name === "accessControl" && /\.PUBLIC_READ(?:_WRITE)?$/.test(memberPath(node.value) ?? "")) return context.report({ node, messageId: "public" });
        // SST: new sst.aws.Bucket("B", { access: "public" })
        if (name === "access" && value === "public") {
          const call = node.parent?.parent;
          if (call && (call.type === "NewExpression" || call.type === "CallExpression") && calleeName(call) === "Bucket") context.report({ node, messageId: "public" });
        }
      },
    };
  },
};

export default rule;
