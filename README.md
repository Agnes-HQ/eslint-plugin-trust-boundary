# eslint-plugin-trust-boundary

ESLint rules for the places where trust changes hands in full-stack TypeScript:

- **server functions** that take input from the browser without validating it,
- **secrets** that end up in the browser bundle,
- **infrastructure code** (AWS CDK, Pulumi, SST) that opens resources to the internet.

Frontend frameworks now put server code next to components (Server Actions, Astro Actions, TanStack Start server functions, Nuxt server routes), and infrastructure is increasingly a TypeScript file in the same repository. These rules look at that code where it's written, without running it: no build, no `cdk synth`, no `pulumi preview`.

Every rule only reports what the source states plainly. When the code doesn't say (a value from a variable, a port from config), the rule stays quiet. So a clean run doesn't mean the code is secure; a finding means there's something to look at.

## Install

```sh
npm install --save-dev eslint eslint-plugin-trust-boundary
```

```js
// eslint.config.js
import trustBoundary from "eslint-plugin-trust-boundary";

export default [
  trustBoundary.configs.recommended, // or .server, or .infra
];
```

TypeScript files need a TypeScript parser, as usual (for example `typescript-eslint`). The rules work without type information.

## Rules

### `server`

| Rule | Reports |
|---|---|
| [`astro-action-input`](#astro-action-input) | Astro Actions whose handler reads input, without an `input` schema |
| [`tanstack-server-fn-validator`](#tanstack-server-fn-validator) | TanStack Start server functions that read `data` without `.inputValidator()` |
| [`h3-validated-input`](#h3-validated-input) | `readBody` and `getQuery` in h3, Nuxt and Nitro routes whose result is never validated |
| [`no-secret-public-env`](#no-secret-public-env) | Environment variables with a public prefix (`NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`, ...) and a secret name |
| [`no-server-import-in-client`](#no-server-import-in-client) | `"use client"` modules using Node built-ins, database drivers, `stripe` or `server-only` |

### `infra`

| Rule | Reports |
|---|---|
| [`no-public-bucket`](#no-public-bucket) | Buckets made public: CDK `publicReadAccess`, public access blocks turned off, `public-read` ACLs, SST `access: "public"` |
| [`no-wildcard-iam`](#no-wildcard-iam) | Policy statements that allow every action on every resource |
| [`no-open-ingress`](#no-open-ingress) | Inbound traffic from any address to ports other than 80 and 443 |
| [`no-public-database`](#no-public-database) | `publiclyAccessible: true` |
| [`no-unencrypted-storage`](#no-unencrypted-storage) | Encryption at rest turned off |

The `infra` rules only run in files that import AWS CDK, Pulumi, SST, Alchemy or CDKTF, in `sst.config.ts`, and in files that use SST's global `sst`.

## Rule details

### `astro-action-input`

An Astro Action is an HTTP endpoint. Without `input`, its handler gets whatever the client sends.

```ts
defineAction({ handler: async (input) => db.like(input.id) });                          // ❌
defineAction({ input: z.object({ id: z.string() }), handler: async (input) => db.like(input.id) }); // ✅
```

Handlers that take no input, or name it `_input`, are fine.

### `tanstack-server-fn-validator`

```ts
createServerFn({ method: "POST" }).handler(async ({ data }) => db.save(data));                 // ❌
createServerFn({ method: "POST" }).inputValidator(schema).handler(async ({ data }) => db.save(data)); // ✅
```

### `h3-validated-input`

```ts
export default defineEventHandler(async (event) => db.save(await readBody(event)));          // ❌
export default defineEventHandler((event) => readValidatedBody(event, schema.parse));        // ✅
export default defineEventHandler(async (event) => schema.parse(await readBody(event)));     // ✅
```

A result that goes through a call named like `parse`, `validate`, `assert` or `decode` (directly or through the variable it's stored in) counts as validated. Nuxt's and Nitro's auto-imports are recognised in `server/`, `routes/` and `api/` folders. Route params (`getRouterParams`) aren't reported: they're strings the router already matched.

### `no-secret-public-env`

Frameworks copy variables with a public prefix into the browser bundle. A name with `SECRET`, `PRIVATE_KEY`, `PASSWORD`, `SERVICE_ROLE`, `DATABASE_URL` and the like, or an AI or email provider's key (`OPENAI`, `ANTHROPIC`, `RESEND`, ...), is a secret nobody should see:

```ts
process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY;   // ❌
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY; // ✅
```

Keys that are public by design (publishable keys, Supabase's anon key, Firebase's API key, Mapbox's access token) are not reported. Reads `process.env`, `import.meta.env`, destructuring from either, and `$env/static/public` / `astro:env/client` imports.

### `no-server-import-in-client`

A `"use client"` module runs in the browser too. Using Node built-ins (`fs`, `child_process`, ...), a database driver (`pg`, `mysql2`, `mongodb`, the Drizzle drivers, ...), `stripe` or `server-only` there either breaks or brings server credentials close to the browser.

Only imports used as values are reported: types disappear from the bundle, and Prisma's enums are made for the browser.

### `no-public-bucket`, `no-wildcard-iam`, `no-open-ingress`, `no-public-database`, `no-unencrypted-storage`

These report explicit settings only:

```ts
new s3.Bucket(this, "Assets", { publicReadAccess: true });                    // ❌ no-public-bucket
new sst.aws.Bucket("Uploads", { access: "public" });                         // ❌ no-public-bucket
new iam.PolicyStatement({ actions: ["*"], resources: ["*"] });                // ❌ no-wildcard-iam
sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22));                     // ❌ no-open-ingress
new aws.ec2.SecurityGroup("db", { ingress: [{ protocol: "tcp", fromPort: 5432, toPort: 5432, cidrBlocks: ["0.0.0.0/0"] }] }); // ❌
new aws.rds.Instance("db", { publiclyAccessible: true });                     // ❌ no-public-database
new aws.ebs.Volume("v", { size: 10, encrypted: false });                      // ❌ no-unencrypted-storage
```

A public bucket for a website, or SSH open for a demo, can be what you want. Then turn the rule off for that line with a comment that says why.

For full coverage of what your infrastructure creates, also run a tool on the synthesised output, such as [cdk-nag](https://github.com/cdklabs/cdk-nag) or Pulumi's policy packs.

## Licence

MIT. Made by [Agnes](https://agnes.dev), which runs these rules as part of its frontend health reports.
