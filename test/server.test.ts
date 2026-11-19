import plugin from "../src/index";
import { tester } from "./setup";

const rules = plugin.rules;

tester.run("astro-action-input", rules["astro-action-input"], {
  valid: [
    'import { defineAction } from "astro:actions"; import { z } from "astro:schema"; export const server = { like: defineAction({ input: z.object({ id: z.string() }), handler: async (input) => input.id }) };',
    'import { defineAction } from "astro:actions"; export const server = { ping: defineAction({ handler: async () => "pong" }) };',
    'import { defineAction } from "astro:actions"; export const server = { ping: defineAction({ handler: async (_input, ctx) => ctx.url }) };',
  ],
  invalid: [
    { code: 'import { defineAction } from "astro:actions"; export const server = { like: defineAction({ handler: async (input) => db.like(input.id) }) };', errors: [{ messageId: "missing" }] },
    { code: 'import { defineAction } from "astro:actions"; export const server = { send: defineAction({ accept: "form", handler(form) { return form.get("x"); } }) };', errors: 1 },
  ],
});

tester.run("tanstack-server-fn-validator", rules["tanstack-server-fn-validator"], {
  valid: [
    'import { createServerFn } from "@tanstack/react-start"; export const f = createServerFn({ method: "POST" }).inputValidator(schema).handler(async ({ data }) => data);',
    'import { createServerFn } from "@tanstack/react-start"; export const f = createServerFn().validator((d) => schema.parse(d)).handler(({ data }) => data);',
    'import { createServerFn } from "@tanstack/react-start"; export const f = createServerFn().handler(async () => getTime());',
    'import { createServerFn } from "@tanstack/react-start"; export const f = createServerFn().handler(async ({ context }) => context.user);',
  ],
  invalid: [
    { code: 'import { createServerFn } from "@tanstack/react-start"; export const f = createServerFn({ method: "POST" }).handler(async ({ data }) => db.save(data));', errors: [{ messageId: "missing" }] },
    { code: 'import { createServerFn } from "@tanstack/solid-start"; export const f = createServerFn().middleware([auth]).handler(async (ctx) => db.save(ctx.data));', errors: 1 },
  ],
});

tester.run("h3-validated-input", rules["h3-validated-input"], {
  valid: [
    'import { readValidatedBody, defineEventHandler } from "h3"; export default defineEventHandler((e) => readValidatedBody(e, schema.parse));',
    'import { readBody, defineEventHandler } from "h3"; export default defineEventHandler(async (e) => schema.parse(await readBody(e)));',
    'import { readBody, defineEventHandler } from "h3"; export default defineEventHandler(async (e) => { const body = await readBody(e); return v.parse(Body, body); });',
    // auto-import, but not in a server folder
    { code: "export default async (e) => readBody(e);", filename: "src/utils/read.ts" },
    // route params are strings the router already matched
    { code: "export default defineEventHandler((event) => getRouterParams(event));", filename: "server/routes/[id].ts" },
    // a readBody of the file's own
    { code: "function readBody(x) { return x; } export default defineEventHandler(async (e) => readBody(e));", filename: "server/api/x.ts" },
    { code: 'import { readValidatedBody } from "nitro/h3"; export default (event) => readValidatedBody(event, schema.parse);', filename: "src/routes/save.ts" },
    { code: 'import { readBody } from "nitro/h3"; export default async (event) => schema.parse(await readBody(event));', filename: "src/routes/save.ts" },
  ],
  invalid: [
    { code: 'import { readBody, defineEventHandler } from "h3"; export default defineEventHandler(async (e) => db.save(await readBody(e)));', errors: [{ messageId: "unvalidated", data: { name: "readBody", validated: "readValidatedBody" } }] },
    { code: "export default defineEventHandler(async (event) => { const { id } = getQuery(event); return db.get(id); });", filename: "server/api/item.get.ts", errors: [{ messageId: "unvalidated", data: { name: "getQuery", validated: "getValidatedQuery" } }] },
    { code: "export default defineEventHandler(async (event) => db.save(await readBody(event)));", filename: "/repo/server/routes/save.ts", errors: 1 },
    // Nitro 3: the helpers come from nitro/h3, the handler from nitro; an explicit import, anywhere in the project
    { code: 'import { defineHandler } from "nitro"; import { readBody } from "nitro/h3"; export default defineHandler(async (event) => db.save(await readBody(event)));', filename: "src/routes/save.ts", errors: [{ messageId: "unvalidated", data: { name: "readBody", validated: "readValidatedBody" } }] },
    { code: 'import { getQuery as q } from "nitro/h3"; export default (event) => db.get(q(event).id);', filename: "lib/handler.ts", errors: [{ messageId: "unvalidated", data: { name: "getQuery", validated: "getValidatedQuery" } }] },
  ],
});

tester.run("no-secret-public-env", rules["no-secret-public-env"], {
  valid: [
    "const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;",
    "const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;",
    "const firebase = import.meta.env.VITE_FIREBASE_API_KEY;",
    "const mapbox = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;",
    "const secret = process.env.STRIPE_SECRET_KEY;",
    'import { PUBLIC_SITE_URL } from "$env/static/public";',
    'import { STRIPE_SECRET_KEY } from "$env/static/private";',
  ],
  invalid: [
    { code: "const s = process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY;", errors: [{ messageId: "secret", data: { name: "NEXT_PUBLIC_STRIPE_SECRET_KEY" } }] },
    { code: "const k = import.meta.env.VITE_OPENAI_API_KEY;", errors: 1 },
    { code: 'const k = process.env["NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY"];', errors: 1 },
    { code: "const { NUXT_PUBLIC_DATABASE_URL } = process.env;", errors: 1 },
    { code: 'import { PUBLIC_JWT_SECRET } from "$env/static/public";', errors: 1 },
    { code: "const k = import.meta.env.PUBLIC_ANTHROPIC_API_KEY;", errors: 1 },
  ],
});

tester.run("no-server-import-in-client", rules["no-server-import-in-client"], {
  valid: [
    '"use client"; import { useState } from "react"; import { loadStripe } from "@stripe/stripe-js";',
    '"use client"; import type { Pool } from "pg";',
    'import fs from "node:fs"; import { db } from "./db";',
    '"use server"; import { PrismaClient } from "@prisma/client";',
    // types and enums: Prisma ships enums for the browser, and types disappear
    '"use client"; import { Post, Role } from "@prisma/client"; export function E({ post }: { post: Post }) { return post.role === Role.ADMIN; }',
    '"use client"; import Stripe from "stripe"; export function Card({ c }: { c: Stripe.Customer }) { return c.id; }',
    '"use client"; import { Pool } from "pg"; let p: Pool | undefined;',
    // imported, never used
    '"use client"; import fs from "node:fs";',
  ],
  invalid: [
    { code: '"use client"; import "server-only";', errors: [{ messageId: "server", data: { source: "server-only" } }] },
    { code: '"use client"; import { readFile } from "node:fs/promises"; readFile("x");', errors: 1 },
    { code: "'use client'\nimport Stripe from 'stripe'\nconst stripe = new Stripe(key)", errors: 1 },
    { code: '"use client"; import { drizzle } from "drizzle-orm/node-postgres"; export const db = drizzle(url);', errors: 1 },
    { code: '"use client"; export { pool } from "pg";', errors: 1 },
  ],
});
