import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it } from "vitest";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

/** TypeScript, ES modules: what the rules meet in real repositories. */
export const tester = new RuleTester({ languageOptions: { parser: tsParser, ecmaVersion: "latest", sourceType: "module" } });
