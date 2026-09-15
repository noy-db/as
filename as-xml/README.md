# @noy-db/as-xml

[![npm](https://img.shields.io/npm/v/%40noy-db/as-xml.svg)](https://www.npmjs.com/package/@noy-db/as-xml)

> XML plaintext export for noy-db

Part of [**`@noy-db/hub`**](https://www.npmjs.com/package/@noy-db/hub) — the zero-knowledge, offline-first, encrypted document store.

## Install

```bash
pnpm add @noy-db/hub @noy-db/as-xml
```

## What it is

XML plaintext export for noy-db — decrypts records and formats as XML with RFC-compliant entity escaping. For legacy systems, banking batch imports, SOAP endpoints, and accounting software that requires XML. Gated by `vault.assertCanExport('plaintext', …)`.

## Status

**Pre-release** (`0.1.0-pre.1`). API may change before `1.0`.

## Documentation

See the [main repository](https://github.com/noy-db/core#readme) for setup, examples, and the full subsystem catalog.

- Source — [`packages/as-xml`](https://github.com/noy-db/core/tree/main/packages/as-xml)
- Issues — [github.com/noy-db/core/issues](https://github.com/noy-db/core/issues)
- Spec — [`SPEC.md`](https://github.com/noy-db/docs/blob/main/SPEC.md)

## License

[Apache-2.0](./LICENSE) © vLannaAi
