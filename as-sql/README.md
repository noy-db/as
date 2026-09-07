# @noy-db/as-sql

[![npm](https://img.shields.io/npm/v/%40noy-db/as-sql.svg)](https://www.npmjs.com/package/@noy-db/as-sql)

> SQL dump export for noy-db

Part of [**`@noy-db/hub`**](https://www.npmjs.com/package/@noy-db/hub) — the zero-knowledge, offline-first, encrypted document store.

## Install

```bash
pnpm add @noy-db/hub @noy-db/as-sql
```

## What it is

SQL dump export for noy-db — decrypts records and emits dialect-aware CREATE TABLE + INSERT statements for postgres / mysql / sqlite. One-way migration helper. Gated by `vault.assertCanExport('plaintext', …)`.

## Status

**Pre-release** (`0.1.0-pre.1`). API may change before `1.0`.

## Documentation

See the [main repository](https://github.com/noy-db/core#readme) for setup, examples, and the full subsystem catalog.

- Source — [`packages/as-sql`](https://github.com/noy-db/core/tree/main/packages/as-sql)
- Issues — [github.com/noy-db/core/issues](https://github.com/noy-db/core/issues)
- Spec — [`SPEC.md`](https://github.com/noy-db/docs/blob/main/SPEC.md)

## License

[MIT](./LICENSE) © vLannaAi
