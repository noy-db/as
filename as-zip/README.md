# @noy-db/as-zip

Composite record + blob archive for noy-db. Bundles a collection's
records and every record's attached blobs into one `.zip` — the
"download this audit trail" / "migrate this case folder" primitive.

Zero dependencies: ships a store-only ZIP writer (~150 lines,
RFC-compliant, no deflate). Most consumed blobs are already
compressed (PDF, PNG, JPEG, encrypted `.noydb` bundles) — re-
deflating would cost CPU without saving bytes.

## Optional WinZip-AES-256 password (#304)

Pass `password` to encrypt every entry with WinZip-AES-256
(vendor version AE-2):

```ts
import { toBytes } from '@noy-db/as-zip'

const archive = await toBytes(vault, {
  records: { collection: 'invoices' },
  password: 'shared-with-recipient-2026',
})
```

The output is still a valid single-disk ZIP. 7-Zip prompts for the
password on extract, verified on Linux, macOS and Windows.

⚠️ **Known exception:** some distro-packaged `unar` builds cannot
read WinZip-AES-256 — measured on `ubuntu-latest`, 2026-09-05,
[run 33944815086][interop-run], where every vector failed with
*"Missing or wrong password"*. macOS's `unar` reads the identical
bytes, as does 7-Zip on every platform, so the limit is in that
build rather than in the archive. Read back via:

[interop-run]: https://github.com/noy-db/as/actions/runs/33944815086

```ts
import { fromBytes } from '@noy-db/as-zip'

declare const archive: Uint8Array // the bytes produced above

const decoded = await fromBytes(vault, archive, {
  collection: 'invoices',
  password: 'shared-with-recipient-2026',
})
await decoded.apply()
```

> AES-256 only. ZipCrypto and AES-128/192 are refused at both write
> and read time.
>
> Validated on every push that touches this package, against 7-Zip
> on ubuntu / macos / windows runners and `unar` on macOS — see
> [`.github/workflows/interop.yml`](../.github/workflows/interop.yml).
> The job is blocking and `publish` depends on it, so a release
> cannot ship past a failing vector.
>
> **This is the interop layer**, not the encryption layer. For
> multi-recipient + revocable + audited noy-db egress, use
> `@noy-db/as-noydb` (#301).

Part of the `@noy-db/as-*` portable-artefact family, plaintext
tier, document sub-family. See
[`docs/packages-exports.md#authorization-model`](https://github.com/noy-db/core/blob/main/docs/packages-exports.md#authorization-model).

## Install

```bash
pnpm add @noy-db/as-zip
```

Requires `@noy-db/hub` as a peer.

## Authorisation (RFC #249)

One capability check: `assertCanExport('plaintext', 'zip')`. A
composite archive is semantically the `'zip'` format from the auth
model's POV — requiring separate `'json'`, `'csv'`, `'blob'`
grants per call would fragment the grant surface without adding
isolation (the archive concatenates them anyway).

```ts
await db.grant('firm', {
  userId: 'auditor',
  displayName: 'Pranee',
  role: 'viewer',
  secret: '…',
  exportCapability: { plaintext: ['zip'] },
})
```

## API

### `toBytes(vault, options)` — raw archive bytes

```ts
import { toBytes } from '@noy-db/as-zip'

interface Invoice { id: string; status: string }

const bytes = await toBytes<Invoice>(vault, {
  records: {
    collection: 'invoices',
    filter: (r) => r.status === 'paid', // optional
  },
  attachments: {
    slots: ['raw', 'thumb'], // optional; default '*' = every slot
  },
})
// → Uint8Array ready for `fs.writeFile` or `new Blob([bytes])`
```

### `download(vault, options)` — browser

```ts
import { download } from '@noy-db/as-zip'

await download(vault, {
  records: { collection: 'invoices' },
  filename: 'invoices-2026-03.zip',
})
```

### `write(vault, path, options)` — Node file

```ts
import { write } from '@noy-db/as-zip'

await write(vault, '/tmp/invoices.zip', {
  records: { collection: 'invoices' },
  acknowledgeRisks: true,
})
```

## Archive layout

```
invoices.zip
├── manifest.json             # index + provenance
├── records.json              # decrypted records as JSON array
└── attachments/
    ├── <recordId>/<slot>     # raw blob bytes, MIME-native
    └── ...
```

The folder-per-record layout makes composite entities (invoice +
scan + receipt, email + body + attachments) browsable in
Finder/Explorer without tooling.

### `manifest.json` shape

```jsonc
{
  _noydb_archive: 1,
  collection: 'invoices',
  exportedAt: '2026-04-22T...',
  recordCount: 42,
  attachmentCount: 17,
  records: [
    { id: 'inv-1', attachments: [
      { slot: 'raw', path: 'attachments/inv-1/raw', size: 2341, mimeType: 'application/pdf' }
    ]},
    ...
  ]
}
```

## Low-level encoder

The same zip writer is exposed for consumers who want to build
archives from non-noy-db payloads:

```ts
import { writeZip, type ZipEntry } from '@noy-db/as-zip'

const bytes = writeZip([
  { path: 'hello.txt', bytes: new TextEncoder().encode('hi') },
  { path: 'blob.bin', bytes: new Uint8Array([0xde, 0xad]) },
])
```

STORE method (no compression). Single-disk, no Zip64. Files > 4 GiB
are not supported.

## Related

- `@noy-db/as-blob` — single attachment
- `@noy-db/as-csv` — structured records as CSV
- `@noy-db/as-noydb` — encrypted bundle (bundle tier)
