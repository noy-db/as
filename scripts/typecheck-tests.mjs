/**
 * Typecheck every package's `__tests__` against its own `tsconfig.test.json`.
 *
 * WHY THIS EXISTS. Each package tsconfig is `include: ["src"]`, because src is
 * what ships — so `pnpm typecheck` never saw a single test file, and vitest
 * transpiles without typechecking. 40 test files here were checked by nothing
 * (noy-db/as#12). Turning it on found 10 diagnostics, two of them real
 * defects: a conformance fixture calling with a renamed option so its runs
 * exercised a path no consumer would write (#13), and an `expect(promise, {})`
 * whose stray argument was meant to be `import()`'s third parameter.
 *
 * ⚠️ ONE PROGRAM PER PACKAGE, deliberately. `tsc` abandons semantic checking
 * for the WHOLE program on any syntactic diagnostic, so a single combined
 * program would let one malformed test silence every other package's checks —
 * green, and blind.
 *
 * ⚠️ Exit codes are read from the spawn result, never through a pipe. Piped,
 * `$?` is the tail's status and a red check reads as green (measured in `to`,
 * 2026-09-11).
 */
import { readdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const packages = readdirSync('.')
  .filter((d) => d.startsWith('as-') && existsSync(join(d, 'tsconfig.test.json')))
  .sort()

let failed = 0
for (const pkg of packages) {
  const run = spawnSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.test.json'], {
    cwd: pkg,
    encoding: 'utf8',
  })
  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim()
  if (run.status === 0) {
    console.log(`  ${pkg.padEnd(14)} ok`)
  } else {
    failed++
    console.log(`  ${pkg.padEnd(14)} FAILED`)
    for (const line of out.split('\n')) console.log(`      ${line}`)
  }
}

console.log(
  `\ncheck:typecheck-tests — ${packages.length} packages, ${failed} failing`,
)
if (packages.length === 0) {
  console.error('✗ no package carries a tsconfig.test.json — this check examined nothing')
  process.exit(1)
}
process.exit(failed === 0 ? 0 : 1)
