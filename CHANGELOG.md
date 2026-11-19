# Changelog

## 0.1.2 (2026-11-19)

- `h3-validated-input` now recognises helpers imported from `nitro/h3`, where Nitro 3 (the `nitro` package, used by TanStack Start through `nitro/vite`) imports all of h3's utilities from. Before, `readBody` and `getQuery` imported from there went unreported.

## 0.1.1 (2026-11-16)

Documentation only: the README shows how to mark a finding that is on purpose (an `eslint-disable-next-line` comment naming the rule, with a reason), and which form Agnes honours.

## 0.1.0 (2026-11-15)

First release. Nine rules in two configs:

- `server`: `astro-action-input`, `tanstack-server-fn-validator`, `h3-validated-input`, `no-secret-public-env`, `no-server-import-in-client`
- `infra`: `no-public-bucket`, `no-wildcard-iam`, `no-open-ingress`, `no-public-database`
