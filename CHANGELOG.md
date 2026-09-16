# Changelog — `@noy-db/as-*`

One file for the whole line: these ten packages are versioned and released
together, so ten per-package changelogs would be ten copies of this one.

Hand-written, deliberately. There is no changeset tooling here and none is
wanted — see `scripts/set-version.mjs` for why. Note that **no package ships a
changelog**: every `files` array is `["dist", "README.md", "LICENSE"]`, so a
mistake in this file is amendable rather than frozen into a published tarball,
which is the opposite of hub's situation.

## Unreleased

### Reproducible output (#2)

- `writeXlsx(sheets, { mtime })` and `writeZip(entries, { mtime })` fix the
  mod-time stamped on every entry, making the output **byte-reproducible**. The
  default is unchanged — the call-time clock — so this is opt-in.

  A ZIP stores mod-time at MS-DOS **2-second** granularity, so identical input
  previously produced identical bytes only while two builds landed in the same
  2-second bucket. ⚠️ **A back-to-back check passes**, which is why this
  surfaces as a flaky digest much later rather than as an obvious defect.
  `new Date(0)` clamps to the DOS epoch (1980-01-01), in both the local headers
  and the central directory.

- ⛔ **Rolling `as-xlsx` back below this version leaves `{ mtime }` COMPILING
  and SILENTLY IGNORED.** An options bag cannot refuse an unknown key, so an
  older reader takes the call, returns to the wall clock for every ZIP header,
  and every attested digest stops reproducing — with no error, no type error,
  and a workbook that still opens. A consumer pinning back for an unrelated
  reason would not connect the two. Nothing here can fix it; the only thing
  that catches it is a determinism test whose clock actually moves.

- `writeZip` now reads the clock **once per archive** instead of once per
  entry. Read per entry, a write straddling a 2-second bucket stamped its own
  entries inconsistently — the archive disagreed with itself about when it was
  made, and nothing reported it. Unconditional, no opt-in.

- ⭐ Verified byte-identical to a hand-written central-directory post-processor
  on a real 8-sheet, 122 KB attested workbook with cached formulas, Thai text
  and styled numerics, against the version actually shipped rather than against
  the new build. A control run without `mtime` differs, so the comparison could
  have failed.

- `toBytes(vault, { mtime })` on **`as-zip`** makes a whole archive
  byte-reproducible (#4). One option sets **both** the manifest's `exportedAt`
  and every entry's mod-time — they are one fact, and pinning one without the
  other leaves the archive non-reproducible with nothing to warn you.
  `download()` and `write()` inherit it. Default unchanged: the call-time clock.

  The two halves failed differently, which is why neither was noticed: entry
  mod-times are 2-second granular and so were *accidentally* reproducible,
  while `exportedAt` is millisecond-precision ISO and never matched twice.
  ⚠️ They also do not read alike — `new Date(0)` gives `exportedAt`
  `1970-01-01T00:00:00.000Z` against file dates of `1980-01-01`, because DOS
  has no years before 1980 and clamps. `ArchiveManifest.exportedAt` stays a
  required field; nothing changes for readers.


## 0.8.0-pre.0

Relicensed from MIT to Apache-2.0 from this version on. Earlier versions remain MIT.

Binds `@noy-db/hub@0.8.0-pre.0`.

### Licence

- Every package is now **Apache-2.0**, and each ships `LICENSE` and `NOTICE` in
  its tarball. ⚠️ The `0.7.0` tarballs listed `LICENSE` in `files` but no such
  file existed in any package directory, so they shipped with **no licence text
  at all** — a manifest field is not a file. Both are present and verified by
  the `check-license` gate from this version on.

### Versions

- The hub peer range is **widened by appending**: `^0.7.0 || ^0.7.1-pre.0 ||
  ^0.8.0-pre.0`. The exact dev pins on `@noy-db/hub`, `@noy-db/to-memory` and
  `@noy-db/test-format-conformance` move to `0.8.0-pre.0` as one unit.
- `as-xlsx`'s peer on `as-zip` narrows to `^0.8.0-pre.0` — the line is lockstep
  and a 0.7 `as-zip` does not bind the 0.8 hub seam. Its **devDependency** is
  `^0.7.0 || ^0.8.0-pre.0`: the caret-from-the-registry property this repo
  relies on cannot bootstrap a version that is not published yet, so the
  published floor stays admissible until `0.8.0-pre.0` is on npm.
- `0.7.1-pre.0` never reached public npm — it exists in this repo's line and on
  the org `@dev` registry only. Everything under it below ships here.

### Published surface

- ⚠️ **`numberFormats` now applies in every mode, not only smart mode**
  (noy-db-as#8). It was declared on the sheet options and silently ignored on
  the default `toBytes` path — a documented option that did nothing where most
  callers are. The consequence was user-visible and quiet: hub stores money as a
  decimal **string** to avoid float error, so an unformatted amount reached a
  TEXT cell and Excel's `SUM()` counted it as **zero**. Both paths now go
  through one helper, so they cannot drift apart again. A value that does not
  parse as finite is passed through untouched rather than becoming `NaN`.

- **`columns` and `numberFormats` keys are checked against `T`**
  (noy-db-as#9). With a type argument, a mistyped column is a compile error
  instead of a silently empty column:

  ```ts
  await toBytes<Invoice>(vault, { sheets: [{ …, columns: ['id', 'amonut'] }] })
  //                                                            ^ Type '"amonut"' is not
  //                                                              assignable. Did you mean '"amount"'?
  ```

  Non-breaking: `keyof unknown` is `never`, so typing these as `keyof T`
  directly would have made `columns` `never[]` for every call without a type
  argument — a tightening that broke every existing caller. The declared type
  keeps `string` in that case and narrows only when the caller said what the
  record is.

  Inline-arrow inference on `filter` is unchanged and still needs the explicit
  type argument. That is the cost of `T` defaulting to `unknown`, which is what
  keeps existing calls compiling.

- **`repository.url` points at this repo.** The published `0.7.0` still carried
  the pre-extraction `vLannaAi/noy-db`, and a consumer binding through public
  npm has no other pointer — which is how both issues above were first filed
  against the wrong repository. Corrected in git since the extraction; this is
  the first release to carry it.

## 0.7.1-pre.0

First release cut from this repository. `0.7.0` was published by **noy-db**,
before the `as-*` families were removed from it on 2026-09-01 — so this line's
history starts in another repo, and this is the handover.

### Published surface

- **`filter` is now generic** on `as-zip` and `as-xlsx`. It was
  `(record: unknown) => boolean` with no type parameter to supply, so
  `filter: (r) => r.status === 'paid'` compiled for nobody — and because a
  callback in property position is contravariant in its parameter, a consumer
  could not annotate their way out either. `T` defaults to `unknown`, so every
  existing call is unchanged:

  ```ts
  await toBytes<Invoice>(vault, { records: { collection: 'invoices', filter: (r) => r.status === 'paid' } })
  ```

  The type argument is an assertion, not a proof — records arrive as plain
  objects and nothing verifies the shape at runtime. That is the contract
  `vault.collection<T>()` already makes.

- ⚠️ **`@noy-db/as-zip` is now a PEER dependency of `@noy-db/as-xlsx`**, not a
  plain dependency (lanna-db#16). It is still installed automatically — peers
  are auto-installed by default in both npm and pnpm — so `as-xlsx` keeps
  working with no change. **But it is no longer YOUR dependency:** under an
  isolated `node_modules` layout (pnpm's default) you can no longer
  `import '@noy-db/as-zip'` unless you depend on it directly. If you use
  `as-zip`'s API yourself, add it to your own dependencies. Measured under both
  managers rather than inferred; under npm's hoisted layout it still resolves.

- **The `@noy-db/hub` peer range is widened to `^0.7.0 || ^0.7.1-pre.0`** in all
  ten packages, so they resolve against core's current prerelease line. Widened
  by appending; nothing that resolved before stops resolving.

### Documentation corrections, all found by compiling the prose

- `as-zip`'s README taught `asZip.toBytes(vault, …)` in two examples. **There is
  no such export** — the package exports `toBytes`, `fromBytes`, `download`,
  `write`. Shipped in the published `0.7.0` tarball; a consumer copying either
  block got an undefined reference.
- `as-xlsx` and `as-zip` `db.grant()` examples omitted the required
  `displayName`.
- Undefined placeholder identifiers in `as-aws-s3`, `as-csv` and `as-zip`
  examples.
- A `manifest.json` illustration was fenced as ```` ```ts ````. `tsc` skips
  semantic checking for the whole program on any syntactic diagnostic, so that
  one fence was silencing eleven diagnostics in as-zip's other blocks.
- ⚠️ **`as-zip`'s AES interop claim is narrowed to what is now proven.** 7-Zip
  prompts for the password on Linux, macOS and Windows. **Some distro-packaged
  `unar` builds cannot read these archives** — measured on `ubuntu-latest`,
  2026-09-05, CI run 33944815086, every vector failing with "Missing or wrong
  password". macOS's `unar` reads the identical bytes, as does 7-Zip everywhere,
  so the limit is in that build rather than in the archive; but a recipient
  reaching for their distro's `unar` may not get in. The run id is in the
  sentence deliberately, so the claim stays checkable as runner images move. The
  `password` JSDoc said the opposite — that nothing had been validated — and now
  agrees with the README.

### Repository (not published)

- **`pnpm check:prose-examples`** compiles every fenced `ts` block in every
  shipped README against that package's built `dist`. noy-db's equivalent scans
  `packages/*/README.md` in noy-db; these READMEs left that scope at the
  extraction and nothing replaced it, while `files` ships all ten. It refuses to
  run against an unbuilt package rather than resolving every import to `any`,
  and reports a syntactic diagnostic as poisoning the package rather than as
  ordinary findings.
- **A blocking three-OS interop job** for `as-zip`, replacing noy-db's dropped
  copy (noy-db #1331). `NOYDB_INTEROP_REQUIRE` names the tools that must be
  present, so a missing one fails instead of skipping quietly; `publish` depends
  on the job.
- CI's `pull_request` trigger no longer filters on the base branch, which had
  been skipping every stacked PR while `peer-floor` still ran — showing some
  green checks and no CI.
- Version tooling the extraction never carried across: `pnpm version:set`,
  `check:versions-uniform`, `check:not-already-published`.
- **The doc-sync payload.** Every release now uploads a `docs-bridge.json`
  asset that noy-db-docs' range walk reads, replacing the hand-read issue
  (lanna-db#17). The package set is derived from the top-level `as-*/`
  directories rather than a table — two noy-db-to releases shipped a broken
  payload because a new store was missing from a hard-coded one, and both runs
  reported success. Lockstep is asserted rather than assumed, and the upload job
  is deliberately not `continue-on-error`: from the moment docs makes this repo
  a partition source, a release with no asset stops the entire sync run for
  every partition, not just ours.
- Ported scripts and workflows corrected against this tree rather than
  noy-db-to's, including a `release.yml` version gate that compared the string
  `"undefined"` to the tag and would have failed every release.

## 0.7.0

**Inherited, not cut from this repo.** Core published `@noy-db/as-*@0.7.0` from
its own tree — tag `v0.7.0` in `vLannaAi/noy-db` still contains
`packages/as-*`, and the `as-*` families were removed from core in `22fecc8c`
immediately afterwards. So `0.7.0` is the last core-published version of this
line, and this repo is its successor. A clean handover, not a lost release.

The manifests here were baselined onto `0.7.0` in `47d389e` to match. Source
parity was measured rather than assumed, by comparing each published tarball's
embedded sourcemap `sourcesContent` against local `src/`: 17 source files across
all ten packages, 16 byte-identical. The one divergence is `as-xlsx`'s
`src/index.ts`, where extraction dropped a type assertion that was required
against core's workspace source and is redundant against hub's published
`.d.ts`. It is erased at compile time, and the published `dist/index.js` and
`dist/index.d.ts` are byte-identical to a local build.

Also in that baseline:

- The `@noy-db/hub` peer range narrowed from `^0.7.0-pre.17` to `^0.7.0`,
  matching what `0.7.0` publishes. This is a **narrowing**: a prerelease caret
  reaches forward into its stable, so `^0.7.0-pre.17` was the wider range and
  additionally admitted the whole 0.7 pre line.
- `as-xlsx -> as-zip` restored to a **peer** at `^0.7.0`, matching published
  `as-xlsx@0.7.0`, with a devDependency at the same caret so tests still resolve
  `as-zip` from the registry. Extraction had made it a dependency to get
  registry resolution; a peer is what keeps version skew visible to a consumer
  instead of silently resolving to a second copy.

## Earlier

Released from `vLannaAi/noy-db` as part of the core monorepo. See that repo's
`packages/hub/CHANGELOG.md` for the history through `0.7.0`.
