import type { Rule } from "eslint";
import type * as ESTree from "estree";
import { docsUrl, memberPath, propertyName } from "../utils";

/** Prefixes that frameworks inline into the browser bundle. */
const PUBLIC = /^(?:NEXT_PUBLIC_|NUXT_PUBLIC_|VITE_|PUBLIC_|EXPO_PUBLIC_|REACT_APP_|GATSBY_|VUE_APP_|STORYBOOK_)/;
/**
 * Names that hold secrets. Deliberately not `_KEY` or `_TOKEN` alone: publishable keys, Supabase's anon key, Firebase's
 * API key and Mapbox's access token are public by design.
 */
const SECRET =
  /SECRET|PRIVATE_KEY|PRIVATE_TOKEN|PASSWORD|PASSWD|SERVICE_ROLE|SERVICE_KEY|DATABASE_URL|DB_URL|CONNECTION_STRING|SIGNING_KEY|ENCRYPTION_KEY|MASTER_KEY|(?:OPENAI|ANTHROPIC|MISTRAL|GROQ|COHERE|REPLICATE|DEEPSEEK|PERPLEXITY|ELEVENLABS|RESEND|SENDGRID|MAILGUN|POSTMARK|TWILIO)\w*(?:KEY|TOKEN)/;
/** Modules whose exports are public variables. */
const PUBLIC_ENV_MODULE = /^(?:\$env\/(?:static|dynamic)\/public|astro:env\/client)$/;

export const looksSecretAndPublic = (name: string) => PUBLIC.test(name) && SECRET.test(name);

const isEnvObject = (node: ESTree.Node) => {
  const path = memberPath(node);
  return !!path && /(?:^|\.)env$/.test(path);
};

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow secret-looking names on environment variables that frameworks expose to the browser", url: docsUrl("no-secret-public-env") },
    schema: [],
    messages: {
      secret: "`{{name}}` has a prefix that puts it in the browser bundle, but its name says it's a secret. Keep secrets without a public prefix and read them on the server.",
    },
  },
  create(context) {
    const report = (node: ESTree.Node, name: string | undefined) => {
      if (name && looksSecretAndPublic(name)) context.report({ node, messageId: "secret", data: { name } });
    };
    return {
      // process.env.X, import.meta.env.X, env.X from $env/dynamic/public
      MemberExpression(node) {
        if (isEnvObject(node.object)) report(node.property, propertyName(node));
      },
      // const { X } = process.env
      VariableDeclarator(node) {
        if (node.id.type !== "ObjectPattern" || !node.init || !isEnvObject(node.init)) return;
        for (const p of node.id.properties) if (p.type === "Property") report(p.key, propertyName(p));
      },
      // import { PUBLIC_X } from "$env/static/public"
      ImportDeclaration(node) {
        if (typeof node.source.value !== "string" || !PUBLIC_ENV_MODULE.test(node.source.value)) return;
        for (const spec of node.specifiers) {
          if (spec.type === "ImportSpecifier") report(spec, spec.imported.type === "Identifier" ? spec.imported.name : String(spec.imported.value));
        }
      },
    };
  },
};

export default rule;
