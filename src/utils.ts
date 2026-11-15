import type { Rule } from "eslint";
import type * as ESTree from "estree";

export const docsUrl = (rule: string) => `https://github.com/Agnes-HQ/eslint-plugin-trust-boundary#${rule}`;

/** A node with the parent pointer ESLint adds. */
export type WithParent<T extends ESTree.Node = ESTree.Node> = T & { parent?: WithParent | null };

export type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.FunctionExpression | ESTree.FunctionDeclaration;

export function isFunction(node: ESTree.Node | null | undefined): node is FunctionNode {
  return !!node && (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression" || node.type === "FunctionDeclaration");
}

/** TypeScript wrappers that don't change a value: `"*" as const`, `x satisfies T`, `x!`. */
export function unwrap(node: ESTree.Node): ESTree.Node {
  let n = node as ESTree.Node & { expression?: ESTree.Node };
  while ((n.type as string) === "TSAsExpression" || (n.type as string) === "TSSatisfiesExpression" || (n.type as string) === "TSNonNullExpression") {
    n = n.expression as ESTree.Node & { expression?: ESTree.Node };
  }
  return n;
}

/** A property's name when it is written out: `foo:`, `"foo":`, `["foo"]:`. */
export function propertyName(prop: ESTree.Property | ESTree.PropertyDefinition | ESTree.MemberExpression): string | undefined {
  const key = prop.type === "MemberExpression" ? prop.property : prop.key;
  if (!prop.computed && key.type === "Identifier") return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  return undefined;
}

export function findProperty(obj: ESTree.ObjectExpression, name: string): ESTree.Property | undefined {
  return obj.properties.find((p): p is ESTree.Property => p.type === "Property" && propertyName(p) === name);
}

/** The value of a literal, a template without expressions, a negative number, or an array of those; undefined otherwise. */
export function staticValue(node: ESTree.Node | null | undefined): unknown {
  if (!node) return undefined;
  const n = unwrap(node);
  if (n.type === "Literal") return n.value;
  if (n.type === "TemplateLiteral" && n.expressions.length === 0) return n.quasis[0]?.value.cooked;
  if (n.type === "UnaryExpression" && n.operator === "-" && n.argument.type === "Literal" && typeof n.argument.value === "number") return -n.argument.value;
  if (n.type === "ArrayExpression") return n.elements.map((e) => (e && e.type !== "SpreadElement" ? staticValue(e) : undefined));
  return undefined;
}

/** `a.b.c` for an identifier or a chain of plain member accesses (calls in between are skipped: `a.b().c` gives `a.b.c`). */
export function memberPath(node: ESTree.Node): string | undefined {
  const n = unwrap(node);
  if (n.type === "Identifier") return n.name;
  if (n.type === "MetaProperty") return `${n.meta.name}.${n.property.name}`;
  if (n.type === "ThisExpression") return "this";
  if (n.type === "MemberExpression") {
    const object = memberPath(n.object.type === "CallExpression" ? n.object.callee : n.object);
    const name = n.property.type === "Identifier" && !n.computed ? n.property.name : n.property.type === "Literal" ? String(n.property.value) : undefined;
    return object && name ? `${object}.${name}` : undefined;
  }
  return undefined;
}

/** The last part of what is called or constructed: `tcp` for `ec2.Port.tcp(22)`, `Bucket` for `new sst.aws.Bucket()`. */
export function calleeName(node: ESTree.CallExpression | ESTree.NewExpression): string | undefined {
  return memberPath(node.callee)?.split(".").at(-1);
}

/** The module's directives: "use client", "use server", "use strict". */
export function directives(program: ESTree.Program): string[] {
  const out: string[] = [];
  for (const statement of program.body) {
    if (statement.type !== "ExpressionStatement" || !("directive" in statement) || typeof statement.directive !== "string") break;
    out.push(statement.directive);
  }
  return out;
}

/** Local names of the named imports from modules that `matches` accepts: local name → imported name. */
export function namedImports(program: ESTree.Program, matches: (source: string) => boolean): Map<string, string> {
  const out = new Map<string, string>();
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration" || typeof statement.source.value !== "string" || !matches(statement.source.value)) continue;
    for (const spec of statement.specifiers) {
      if (spec.type !== "ImportSpecifier") continue;
      const imported = spec.imported.type === "Identifier" ? spec.imported.name : String(spec.imported.value);
      out.set(spec.local.name, imported);
    }
  }
  return out;
}

export function importSources(program: ESTree.Program): string[] {
  return program.body.flatMap((s) => (s.type === "ImportDeclaration" && typeof s.source.value === "string" ? [s.source.value] : []));
}

/** Parameters named `_` or `_something` are unused on purpose. */
export function usesInput(fn: FunctionNode): boolean {
  const first = fn.params[0];
  if (!first) return false;
  return !(first.type === "Identifier" && first.name.startsWith("_"));
}

/** A call that validates or parses its argument: `schema.parse(x)`, `v.parse(schema, x)`, `safeParseAsync`, `validate`, `assert`, `decode`. */
export function isValidatingCall(node: ESTree.Node | undefined): boolean {
  if (!node || (node.type !== "CallExpression" && node.type !== "NewExpression")) return false;
  const name = calleeName(node);
  return !!name && /parse|validat|assert|decode|check/i.test(name);
}

/**
 * Whether the value of `expression` (a call, possibly awaited) goes through a validating call: directly as its argument,
 * or through the variable it is assigned to.
 */
export function isValidatedLater(context: Rule.RuleContext, expression: WithParent): boolean {
  let expr = expression;
  if (expr.parent?.type === "AwaitExpression") expr = expr.parent;
  const parent = expr.parent;
  if (!parent) return false;
  if ((parent.type === "CallExpression" || parent.type === "NewExpression") && parent.arguments.includes(expr as ESTree.Expression)) return isValidatingCall(parent);
  if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier") {
    const variable = context.sourceCode.getDeclaredVariables(parent).find((v) => v.name === (parent.id as ESTree.Identifier).name);
    return !!variable?.references.some((ref) => {
      const use = (ref.identifier as WithParent).parent;
      return !!use && (use.type === "CallExpression" || use.type === "NewExpression") && use.arguments.includes(ref.identifier as ESTree.Expression) && isValidatingCall(use);
    });
  }
  return false;
}

/** Packages and globals that mark a file as infrastructure code (AWS CDK, Pulumi, SST, Alchemy). */
const INFRA_SOURCE = /^(?:aws-cdk-lib(?:\/.*)?|@aws-cdk\/.+|constructs|@pulumi\/.+|sst(?:\/.*)?|alchemy(?:\/.*)?|cdktf(?:\/.*)?|@cdktf\/.+)$/;

export function isInfraFile(context: Rule.RuleContext): boolean {
  const program = context.sourceCode.ast;
  if (importSources(program).some((s) => INFRA_SOURCE.test(s))) return true;
  if (/(?:^|[/\\])sst\.config\.[cm]?[jt]s$/.test(context.filename)) return true;
  // SST v3's infra files use the global `sst` without importing it
  return /\bsst\.(?:aws|cloudflare|x|Linkable|Secret)\b/.test(context.sourceCode.text);
}
