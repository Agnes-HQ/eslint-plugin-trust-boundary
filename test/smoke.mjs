// The built package, used the way people will: ESM and CommonJS, in an ESLint flat config.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { ESLint } from "eslint";
import tsParser from "@typescript-eslint/parser";
import plugin from "../dist/index.js";

const required = createRequire(import.meta.url)("../dist/index.cjs");
assert.equal(typeof required.rules, "object", "require() returns the plugin itself");
assert.deepEqual(Object.keys(required.rules), Object.keys(plugin.rules));

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [{ files: ["**/*.ts"], languageOptions: { parser: tsParser } }, plugin.configs.recommended],
});
const [client] = await eslint.lintText('"use client";\nimport { Pool } from "pg";\nexport const pool = new Pool();\nexport const k = process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY;\n', { filePath: "app/page.ts" });
assert.deepEqual(client.messages.map((m) => m.ruleId), ["trust-boundary/no-server-import-in-client", "trust-boundary/no-secret-public-env"]);
const [infra] = await eslint.lintText('new sst.aws.Bucket("U", { access: "public" });\n', { filePath: "infra/storage.ts" });
assert.deepEqual(infra.messages.map((m) => m.ruleId), ["trust-boundary/no-public-bucket"]);
console.log("smoke test passed");
