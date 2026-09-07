#!/usr/bin/env node
//
// set-version — move the whole line to one version, in one edit.
//
// WHY THIS EXISTS, and why it is deliberately this small.
//
// These ten packages are one lockstep line, and the version lives in ten
// separate files plus one internal range (as-xlsx -> as-zip). Bumping them by
// hand is exactly the "locally correct edit that misses one" this repo has no
// other defence against.
//
// It does NOT touch the @noy-db/hub peer range or the exact dev pins on hub,
// to-memory or test-format-conformance. Those track CORE's version line, which
// is independent of ours now that this family has its own. Folding them in
// would silently couple two release lines that were deliberately separated.
//
// ⚠️ Ordering is delegated to the `semver` package, never hand-rolled. The
// family shipped a release guard whose own comparator inverted semver in both
// directions — it refused 0.7.0-pre.18 -> 0.7.0 as "did not advance" and
// ACCEPTED 0.7.0 -> 0.7.0-pre.18, a real regression. It was unreachable until
// the first time a line left pre mode, so eighteen green releases could not
// have caught it. There is no version of that bug worth re-deriving here.
//
// ⚠️ Edits are textual and field-targeted, not JSON.stringify round-trips.
// The manifests carry \u-escaped characters in their descriptions, and
// re-serialising would rewrite every one of them — burying a two-line version
// bump in unrelated churn, which is how a reviewer stops reading the diff.
//
//   pnpm version:set 0.7.1
//
// Verify afterwards by grepping for the OLD version string, not by re-reading
// this script: a script and its author share a blind spot, and the grep also
// catches a stale instruction, which re-reading the script cannot.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const pkgDirs = readdirSync(ROOT).filter(
  (d) => !d.startsWith('.') && d !== 'node_modules' && d !== 'scripts' && existsSync(join(ROOT, d, 'package.json')),
)

const next = process.argv[2]
if (!next) {
  console.error('usage: pnpm version:set <version>')
  process.exit(1)
}
if (!semver.valid(next)) {
  console.error(`✗ "${next}" is not a valid semver version`)
  process.exit(1)
}

const pkgs = pkgDirs.map((d) => ({ dir: d, file: join(ROOT, d, 'package.json'), json: readJson(join(ROOT, d, 'package.json')) }))
const own = new Set(pkgs.map((p) => p.json.name))
const current = pkgs[0].json.version

const behind = pkgs.filter((p) => !semver.gt(next, p.json.version))
if (behind.length) {
  console.error(`\n✗ ${next} does not advance past every package's current version:\n`)
  for (const p of behind) console.error(`   • ${p.json.name} is already ${p.json.version}`)
  console.error('')
  process.exit(1)
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
let rangesTouched = 0

for (const { dir, file, json } of pkgs) {
  let text = readFileSync(file, 'utf8')
  const before = text

  // The top-level "version" key: 2-space indent anchors it, so a nested
  // "version" inside any other object cannot be hit by accident.
  text = text.replace(/^ {2}"version": "[^"]*"/m, `  "version": "${next}"`)

  // Every reference to a package published FROM THIS REPO, in any field.
  for (const name of own) {
    const re = new RegExp(`("${escape(name)}":\\s*")[^"]*(")`, 'g')
    text = text.replace(re, (m, a, b) => {
      rangesTouched++
      return `${a}^${next}${b}`
    })
  }

  if (text !== before) writeFileSync(file, text)
  console.log(`   ${dir.padEnd(14)} ${current} -> ${next}`)
}

// Self-check. Not a substitute for the grep — a weaker instrument that shares
// this file's assumptions — but it catches a package the loop never reached.
const stale = pkgs
  .map((p) => ({ ...p, json: readJson(p.file) }))
  .filter((p) => p.json.version !== next)
if (stale.length) {
  console.error(`\n✗ ${stale.length} package(s) still not on ${next}: ${stale.map((s) => s.dir).join(', ')}`)
  process.exit(1)
}

console.log(`\n✓ ${pkgs.length} package(s) on ${next}; ${rangesTouched} internal range(s) updated to ^${next}`)
console.log(`\n  Now verify independently:  grep -rn '${current}' */package.json`)
console.log(`  Then:                      pnpm check:versions-uniform && pnpm check:not-already-published`)
