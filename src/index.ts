import type { ESLint, Linter, Rule } from "eslint";
import astroActionInput from "./rules/astro-action-input";
import h3ValidatedInput from "./rules/h3-validated-input";
import noOpenIngress from "./rules/no-open-ingress";
import noPublicBucket from "./rules/no-public-bucket";
import noPublicDatabase from "./rules/no-public-database";
import noSecretPublicEnv from "./rules/no-secret-public-env";
import noServerImportInClient from "./rules/no-server-import-in-client";
import noWildcardIam from "./rules/no-wildcard-iam";
import tanstackServerFnValidator from "./rules/tanstack-server-fn-validator";

const PREFIX = "trust-boundary";

/** Browser → server (input coming in) and server → browser (secrets going out). */
const serverRules = {
  "astro-action-input": astroActionInput,
  "tanstack-server-fn-validator": tanstackServerFnValidator,
  "h3-validated-input": h3ValidatedInput,
  "no-secret-public-env": noSecretPublicEnv,
  "no-server-import-in-client": noServerImportInClient,
} satisfies Record<string, Rule.RuleModule>;

/** The perimeter infrastructure code draws: internet → your cloud, and one service → the rest of the account. */
const infraRules = {
  "no-public-bucket": noPublicBucket,
  "no-wildcard-iam": noWildcardIam,
  "no-open-ingress": noOpenIngress,
  "no-public-database": noPublicDatabase,
} satisfies Record<string, Rule.RuleModule>;

const errors = (rules: Record<string, Rule.RuleModule>): Linter.RulesRecord =>
  Object.fromEntries(Object.keys(rules).map((name) => [`${PREFIX}/${name}`, "error"]));

const plugin = {
  meta: { name: "eslint-plugin-trust-boundary", version: "0.1.0" },
  rules: { ...serverRules, ...infraRules },
  configs: {} as Record<"server" | "infra" | "recommended", Linter.Config>,
} satisfies ESLint.Plugin;

plugin.configs.server = { name: `${PREFIX}/server`, plugins: { [PREFIX]: plugin }, rules: errors(serverRules) };
plugin.configs.infra = { name: `${PREFIX}/infra`, plugins: { [PREFIX]: plugin }, rules: errors(infraRules) };
plugin.configs.recommended = { name: `${PREFIX}/recommended`, plugins: { [PREFIX]: plugin }, rules: { ...errors(serverRules), ...errors(infraRules) } };

export default plugin;
