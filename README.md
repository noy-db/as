# `@noy-db/as-*` — export formats for noy-db

The **`as-` family**: portable artefacts. Each package supplies one format's `encode`/`decode` and
its own `id`; **`@noy-db/hub` owns `export`/`import`** and calls into the format through the
published `@noy-db/hub/as` port (ADR 0004).

Extracted from the `noy-db` monorepo so that hub can iterate on its internals without republishing
this family, and so that this family can release on its own line.

| package | format |
|---|---|
| `@noy-db/as-csv` · `as-json` · `as-ndjson` · `as-xml` · `as-sql` | text/tabular formats |
| `@noy-db/as-xlsx` | spreadsheets (writes through `as-zip`) |
| `@noy-db/as-zip` | zip container, interop-tested against 7-Zip and `unar` |
| `@noy-db/as-blob` · `as-noydb` | binary payloads and the native noydb bundle |
| `@noy-db/as-aws-s3` | S3-addressed artefacts |

## The one thing to know about this layer

⚠️ **`as-*` packages see PLAINTEXT, by design.** Everything else in the noy-db satellite grammar
(`to-`, `in-`, `on-`, `by-`) handles ciphertext only; an exporter runs *after* decryption because a
CSV of ciphertext is useless. The prefix is the layer, and this is the layer where plaintext is
expected — which is exactly why `assertCanExport` gates egress, and why the conformance kit checks
that a denied export **refuses before reading any record**.

## Binding

Each package declares `@noy-db/hub` as a **peer dependency at a caret range**, with an exact dev pin
for development. Install hub yourself:

```bash
npm i @noy-db/hub @noy-db/as-csv
```

`@noy-db/as-xlsx` depends on `@noy-db/as-zip` as an ordinary **dependency** (not a peer) — a format
encodes bytes, and nothing requires a consumer to deduplicate the zip writer.

## Develop

```bash
pnpm install
pnpm build            # tsup per package
pnpm test             # vitest, incl. the published conformance kit
pnpm lint
pnpm typecheck
pnpm check:architecture   # the layer invariants (see scripts/check-architecture.mjs)
pnpm check:peer-floor     # every package must COMPILE at the oldest hub its range admits
```

`check:architecture` deliberately does **not** carry noy-db-to's `to-only` rule — that rule is false
for this family in both directions. What it enforces instead is that a format never value-imports
the store contract `@noy-db/hub/to`: a format encodes bytes and does not perform storage I/O.
`import type` from `/to` is permitted and used (`as-aws-s3` takes `StoreCredentials` from it).

## Releasing

Publishing happens from a **GitHub Release** triggering `release.yml`, never a raw `npm publish`.
A pre-release routes to `@next`; omitting that routes to `@latest`.

Pre-1.0: public APIs may still change.
