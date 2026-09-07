#!/usr/bin/env node
/**
 * Compiles every fenced `ts` block in every shipped README against the built
 * `dist` of the package that ships it.
 *
 * WHY THIS EXISTS. noy-db's `check:prose-examples` is the only thing in this
 * family that compiles a README, and it scans `packages/*\/README.md` IN NOY-DB.
 * These ten READMEs left that scope when the family was extracted on
 * 2026-09-01, and nothing replaced it. `files` is
 * ["dist","README.md","LICENSE"], so every one of these blocks is shipped to
 * consumers, and a wrong one is copied rather than read.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE THINGS THAT MAKE THIS CHECK VACUOUS, all measured here on 2026-09-01,
 * all of which look like a pass:
 *
 * 1. RUN FROM INSIDE THE PACKAGE. A probe compiled from the repo root resolves
 *    no `@noy-db/*` and reports TS2307 for every import. TS2307 is ignored by
 *    design (see below), so every family object becomes `any` and the whole
 *    program typechecks while examining nothing.
 *
 * 2. ONE SYNTACTIC DIAGNOSTIC SILENCES THE WHOLE PROGRAM. `tsc` skips semantic
 *    checking entirely on any TS1xxx. `as-zip/README.md:132` fenced a
 *    `manifest.json` illustration (object literal, trailing `...`) as ```ts;
 *    it produced 6 syntax errors and hid ELEVEN semantic diagnostics in the
 *    other seven blocks. Fixing the six would have looked like finishing.
 *    Syntax errors are therefore reported as POISONING, not as ordinary
 *    findings — the rest of that package's result means nothing until cleared.
 *
 * 3. `types: []` REPO-WIDE IS A TRAP. It is needed so the gate does not become
 *    a test of the probe host's dependency list — but it also strips ambient
 *    globals, so a package correctly declaring `@types/node` cannot use
 *    `process` in a shipped example. noy-db shipped two TRUE examples failing
 *    TS2591 for that reason and its gate sat red across the whole 0.7.0 cut.
 *    Fix: TWO programs, split on whether the package declares `@types/node`,
 *    keeping each package's own declaration load-bearing. Here: 1 plain / 4 node.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PREAMBLE, and why it is deliberately small. 7 of this repo's 23 blocks
 * have no import — they are written against an ambient object. noy-db's gate
 * SKIPS such blocks, and that blind spot has already let a real defect ship in
 * this family (`in-nuxt/README.md:18` shipped `adapter: 'browser'`, a wrong key
 * and a value outside the union; fixed by hand at 0.7.0-pre.12, still skipped
 * by that gate today). Here the same filter would skip all three `db.grant()`
 * blocks — which is where BOTH defects measured on 2026-09-01 actually were.
 *
 * So we declare the ambient objects instead of skipping their blocks. The
 * preamble holds ONLY `vault` and `db`, at their real hub types.
 *
 * IT IS NOT A PLACE TO SILENCE ERRORS, and that is measured rather than
 * asserted: adding four convenience names (`records`, `ulid`, `options`,
 * `currentUserId`) took this repo from 12 findings to 9. A block referencing an
 * undeclared name is a README that does not say where the name comes from — a
 * finding, not preamble maintenance. Every addition here must be an object the
 * READMEs genuinely write against, at its real type.
 *
 * Typing them `any` rather than widening the list does NOT reduce the count
 * (measured: 12 -> 13); it adds a spurious TS2347 on a generic call. The real
 * hub types are kept because they make findings correct, not more numerous.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const PROBE = '.prose-probe'

/**
 * Ambient objects the READMEs write against, at their REAL types.
 * Adding a name here weakens the gate; prefer fixing the README.
 */
const PREAMBLE = `import type { Vault, Noydb } from '@noy-db/hub'
declare global {
  const vault: Vault
  const db: Noydb
}
export {}
`

const packages = readdirSync('.').filter((d) => d.startsWith('as-') && existsSync(join(d, 'README.md')))
if (packages.length === 0) {
  console.error('check:prose-examples: no as-* package with a README was found — refusing to pass vacuously')
  process.exit(1)
}

/** Fenced ```ts blocks, with the README line their fence sits on. */
function extract(md) {
  const lines = md.split('\n')
  const blocks = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '```ts') continue
    let j = i + 1
    while (j < lines.length && lines[j].trim() !== '```') j++
    blocks.push({ fence: i + 1, body: lines.slice(i + 1, j) })
    i = j
  }
  return blocks
}

let totalBlocks = 0
let totalErrors = 0
let poisoned = 0
const unbuilt = []
const summary = []

for (const pkg of packages) {
  const blocks = extract(readFileSync(join(pkg, 'README.md'), 'utf8'))
  if (blocks.length === 0) {
    summary.push(`  ${pkg.padEnd(11)} 0 blocks`)
    continue
  }
  totalBlocks += blocks.length

  const dir = join(pkg, PROBE)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'preamble.ts'), PREAMBLE)

  for (const b of blocks) {
    // Pad so a probe line number IS the README line number. Without this every
    // diagnostic points at a line the reader has to compute.
    const src = [...Array(b.fence).fill(''), ...b.body, 'export {}'].join('\n')
    writeFileSync(join(dir, `block-${b.fence}.ts`), src)
  }

  const manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'))

  // BUILD-ORDER VACUITY GUARD. `TS2307` is filtered below, so a package with no
  // `dist` yields `any` for its own exports and the blocks typecheck against
  // nothing. Measured: with `as-zip/dist` removed this run failed only
  // INCIDENTALLY, on one `noImplicitAny` in a callback — a README without a
  // callback would have passed, green, examining nothing. So assert the
  // artefact the blocks compile against actually exists, rather than relying on
  // a diagnostic that happens to fire. Run this AFTER `pnpm build`.
  const typesEntry = manifest.exports?.['.']?.types ?? manifest.types
  if (!typesEntry || !existsSync(join(pkg, typesEntry))) {
    console.error(`\n${pkg}: ${typesEntry ?? 'no types entry'} does not exist — run \`pnpm build\` first.`)
    console.error('  Refusing to compile examples against a package that has not been built:')
    console.error('  every import would resolve to `any` and this check would pass having examined nothing.')
    unbuilt.push(pkg)
    continue
  }

  const hasNode = '@types/node' in { ...manifest.dependencies, ...manifest.devDependencies }
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        extends: '../../tsconfig.base.json',
        compilerOptions: { noEmit: true, types: hasNode ? ['node'] : [] },
        include: ['*.ts'],
      },
      null,
      2,
    ),
  )

  let out = ''
  try {
    execFileSync('npx', ['tsc', '-p', join(dir, 'tsconfig.json')], { encoding: 'utf8', stdio: 'pipe' })
  } catch (e) {
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`
  }

  const diagnostics = out
    .split('\n')
    .filter((l) => /error TS\d+:/.test(l))
    // TS2307 is ignored ON PURPOSE: a missing framework module must not turn
    // this into a test of the probe host's dependency list. NOTE the recorded
    // hazard — an ignored diagnostic is scoped to what it NAMES, but its
    // CONSEQUENCE is not: suppressing "cannot find module 'vue'" also un-types
    // every family object flowing through vue's API. No `as-*` README imports a
    // framework today; if one starts to, symlink that package's own dependency
    // into the probe rather than widening this filter.
    .filter((l) => !/error TS2307:/.test(l))
    .map((l) => l.replace(new RegExp(`${pkg}/${PROBE}/block-(\\d+)\\.ts`), `${pkg}/README.md`))

  const syntactic = diagnostics.filter((l) => /error TS1\d{3}:/.test(l))
  totalErrors += diagnostics.length

  if (syntactic.length > 0) {
    poisoned++
    summary.push(
      `  ${pkg.padEnd(11)} ${String(blocks.length).padEnd(2)} blocks  POISONED — ${syntactic.length} syntax errors`,
    )
    console.error(`\n${pkg}: SYNTAX ERROR — semantic checking was SKIPPED for all ${blocks.length} blocks.`)
    console.error('  A block that is not TypeScript must not be fenced ```ts (use ```jsonc, ```json, ```text).')
    console.error('  Nothing else reported for this package means anything until these are cleared.')
    for (const l of syntactic) console.error(`    ${l}`)
    continue
  }

  summary.push(
    `  ${pkg.padEnd(11)} ${String(blocks.length).padEnd(2)} blocks  types=[${hasNode ? 'node' : ''}]  ${diagnostics.length} errors`,
  )
  if (diagnostics.length > 0) {
    console.error(`\n${pkg}:`)
    for (const l of diagnostics) console.error(`    ${l}`)
  }
}

for (const pkg of packages) rmSync(join(pkg, PROBE), { recursive: true, force: true })

console.log(`\ncheck:prose-examples — ${totalBlocks} fenced ts blocks across ${packages.length} packages`)
for (const l of summary) console.log(l)

// Vacuity guard. A run that compiled nothing must not report success — the
// extraction is exactly the event that silently empties a scope like this one.
if (totalBlocks === 0) {
  console.error('\nNo fenced ts block was found in any README. That is not a pass; the extractor is wrong.')
  process.exit(1)
}
if (unbuilt.length > 0) {
  console.error(`\nFAIL — ${unbuilt.length} package(s) not built: ${unbuilt.join(', ')}.`)
  process.exit(1)
}
if (totalErrors > 0 || poisoned > 0) {
  console.error(`\nFAIL — ${totalErrors} diagnostics${poisoned > 0 ? `, ${poisoned} package(s) poisoned by syntax errors` : ''}.`)
  process.exit(1)
}
console.log('\nOK — every shipped example compiles against its own package dist.')
