# eslint-plugin-trust-boundary

**Lint the lines between browser, server and cloud.**

A *trust boundary* is where data or control passes between parts that trust each other differently. Full-stack TypeScript now has three of them in one repository, often in one pull request:

| Crossing | What goes wrong | Rules |
|---|---|---|
| **Browser → server** | Input from the browser reaches server code without being validated | [`astro-action-input`](#astro-action-input), [`tanstack-server-fn-validator`](#tanstack-server-fn-validator), [`h3-validated-input`](#h3-validated-input) |
| **Server → browser** | Secrets and server-only code end up in the browser bundle | [`no-secret-public-env`](#no-secret-public-env), [`no-server-import-in-client`](#no-server-import-in-client) |
| **Internet → your cloud** | Infrastructure code (AWS CDK, Pulumi, SST) removes the perimeter, or lets one service reach everything | [`no-public-bucket`](#no-public-bucket), [`no-open-ingress`](#no-open-ingress), [`no-public-database`](#no-public-database), [`no-wildcard-iam`](#no-wildcard-iam) |

The rules read the code where it's written, without running it: no build, no `cdk synth`, no `pulumi preview`. Each one only reports what the source states plainly. When the code doesn't say (a value from a variable, a port from config), the rule stays quiet. So a clean run doesn't mean the code is secure; a finding means there's a crossing to look at.

## Install

```sh
npm install --save-dev eslint eslint-plugin-trust-boundary
```

```js
// eslint.config.js
import trustBoundary from "eslint-plugin-trust-boundary";

export default [
  trustBoundary.configs.recommended,
];
```

Or pick one half: `configs.server` has the browser ↔ server rules, for a Next.js, Astro, TanStack Start or Nuxt app; `configs.infra` has the perimeter rules, for CDK, Pulumi or SST code.

TypeScript files need a TypeScript parser, as usual (for example `typescript-eslint`). The rules work without type information.

## Browser → server

Server functions look like local calls, but each one is an HTTP endpoint anyone can call with anything. Validation is the guard at this crossing.

### `astro-action-input`

Without `input`, an Astro Action's handler gets whatever the client sends.

```ts
defineAction({ handler: async (input) => db.like(input.id) });                                       // ❌
defineAction({ input: z.object({ id: z.string() }), handler: async (input) => db.like(input.id) });   // ✅
```

Handlers that take no input, or name it `_input`, are fine.

### `tanstack-server-fn-validator`

```ts
createServerFn({ method: "POST" }).handler(async ({ data }) => db.save(data));                        // ❌
createServerFn({ method: "POST" }).inputValidator(schema).handler(async ({ data }) => db.save(data));  // ✅
```

Without a validator, TanStack Start passes the client's `data` to the handler as it is. A validator in a middleware (`.middleware([...])`, or global function middleware) isn't seen by this rule; add `.inputValidator()` on the function itself, or turn the rule off for that line.

### `h3-validated-input`

For h3, Nuxt and Nitro server routes.

```ts
export default defineEventHandler(async (event) => db.save(await readBody(event)));        // ❌
export default defineEventHandler((event) => readValidatedBody(event, schema.parse));      // ✅
export default defineEventHandler(async (event) => schema.parse(await readBody(event)));   // ✅
```

A result that goes through a call named like `parse`, `validate`, `assert` or `decode` (directly, or through the variable it's stored in) counts as validated. Nuxt's and Nitro's auto-imports are recognised in `server/`, `routes/` and `api/` folders. Route params (`getRouterParams`) aren't reported: they're strings the router already matched.

## Server → browser

Everything in the browser bundle is public. These rules catch server things crossing into it.

### `no-secret-public-env`

Frameworks copy variables with a public prefix (`NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`, `NUXT_PUBLIC_`, `EXPO_PUBLIC_`, ...) into the bundle. A name with `SECRET`, `PRIVATE_KEY`, `PASSWORD`, `SERVICE_ROLE`, `DATABASE_URL` and the like, or an AI or email provider's key (`OPENAI`, `ANTHROPIC`, `RESEND`, ...), is a secret everyone can read:

```ts
process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY;       // ❌
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;  // ✅
```

Even in a file that only runs on the server, the prefix means one stray use in a component ships the value, and the name tells everyone reading the code that it's safe to do so. Keys that are public by design (publishable keys, Supabase's anon key, Firebase's API key, Mapbox's access token) are not reported. Reads `process.env`, `import.meta.env`, destructuring from either, and `$env/static/public` / `astro:env/client` imports.

### `no-server-import-in-client`

A `"use client"` module runs in the browser too. Using Node built-ins (`fs`, `child_process`, ...), a database driver (`pg`, `mysql2`, `mongodb`, the Drizzle drivers, ...), `stripe` or `server-only` there either breaks, or brings server credentials close to the browser.

Only imports used as values are reported: types disappear from the bundle, and Prisma's enums are made for the browser. Next.js already refuses to build a client module that imports `fs`, a database driver or `server-only`, so this rule mostly tells you sooner, in the editor; a server SDK that does bundle for the browser, such as `stripe`, is the case a build won't catch.

## Internet → your cloud

With infrastructure as code, the perimeter is a few properties in a TypeScript file. These rules report where it's removed. They run in files that import AWS CDK, Pulumi, SST, Alchemy or CDKTF, in `sst.config.ts`, and in files that use SST's global `sst`.

### `no-public-bucket`

```ts
new s3.Bucket(this, "Assets", { publicReadAccess: true });                         // ❌
new s3.Bucket(this, "Assets", { blockPublicAccess: new s3.BlockPublicAccess({ blockPublicPolicy: false }) }); // ❌
new aws.s3.BucketAclV2("acl", { bucket: b.id, acl: "public-read" });               // ❌
new sst.aws.Bucket("Uploads", { access: "public" });                               // ❌
```

### `no-open-ingress`

Inbound traffic from any address (`0.0.0.0/0`, `::/0`) to a port other than 80 and 443:

```ts
sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22));                           // ❌
new aws.ec2.SecurityGroup("db", { ingress: [{ protocol: "tcp", fromPort: 5432, toPort: 5432, cidrBlocks: ["0.0.0.0/0"] }] }); // ❌
sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));                          // ✅
```

### `no-public-database`

```ts
new aws.rds.Instance("db", { publiclyAccessible: true });                          // ❌
```

### `no-wildcard-iam`

The boundary between one service and the rest of your account: with every action on every resource, one compromised function reaches everything.

```ts
new iam.PolicyStatement({ actions: ["*"], resources: ["*"] });                     // ❌
new iam.PolicyStatement({ actions: ["s3:GetObject"], resources: [bucket.arnForObjects("*")] }); // ✅
```

A `Deny` statement is fine.

---

A public bucket for a website, or SSH open for a demo, can be exactly what you want. Then turn the rule off for that line, with a comment that says why.

For full coverage of what your infrastructure creates, also run a tool on the synthesised output, such as [cdk-nag](https://github.com/cdklabs/cdk-nag) or Pulumi's policy packs.

## Licence

MIT. Made by [Agnes](https://agnes.dev), which runs these rules as part of its frontend health reports.
