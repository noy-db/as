/**
 * Cross-tool interop validation for WinZip-AES-256.
 *
 * Shells out to 7z / unar (skips gracefully when absent).
 * Run manually with tools installed, or via the CI `interop` job.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeZip } from '../src/zip.js'
import { readZip } from '../src/read.js'

const PW = 'noydb-interop-2026'

// ── Helpers ────────────────────────────────────────────────────────────

function hasTool(name: string): boolean {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  return spawnSync(cmd, [name], { stdio: 'pipe' }).status === 0
}

/**
 * Skipping is right on a developer machine and WRONG in CI.
 *
 * These blocks skip when `7z`/`7zz`/`unar` are absent, which is what makes the
 * file runnable locally. But `pnpm test` runs it in CI too, where a missing tool
 * produced a silent skip inside an otherwise green suite — a skipped test and a
 * passing one are indistinguishable in a summary. noy-db's own interop job
 * installed `unar` on macOS ONLY, so its Linux and Windows legs skipped two of
 * three blocks, greenly, for as long as the job existed (noy-db #1331).
 *
 * NOYDB_INTEROP_REQUIRE names the tools that MUST be present: a comma-separated
 * list (`7z`, `unar`), or `1` for all of them. A named tool that is missing is a
 * FAILURE naming itself; anything unnamed still skips. Leave it unset locally.
 *
 * ⚠️ IT IS A LIST RATHER THAN A BOOLEAN BECAUSE TOOL AVAILABILITY IS NOT UNIFORM,
 * and that was measured, not assumed — CI run 33944815086, the first honest run
 * of this file on three OSes:
 *
 *   ubuntu   7z  installed, all 4 vectors PASS
 *            unar installed, all 4 vectors FAIL: "Archive parsing failed!
 *            (Missing or wrong password.)" — on the same archives macOS's unar
 *            reads without complaint. Same bytes, same code: the difference is
 *            the tool, not the writer. Ubuntu's `unar` cannot read WinZip-AES-256.
 *   macos    7z + unar, all 11 vectors PASS
 *   windows  `choco install unarchiver` does not exist; there is no unar there.
 *
 * ⭐ SO `unar` IS REQUIRED ON macOS ONLY — which is, on its face, the exact shape
 * that made noy-db's job vacuous. The difference is the whole point: theirs was
 * an accident nobody had measured, silently checking one block of three while
 * reporting green. This one is a recorded result with a run id, and `7z` — which
 * genuinely works everywhere — is required on all three. When Ubuntu ships a
 * `unar` that reads WinZip-AES, add it to that leg's list and delete this note.
 */
const REQUIRED = (process.env.NOYDB_INTEROP_REQUIRE ?? '')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean)

// A name this file does not check is almost certainly a typo, and an unnoticed
// typo puts the gate straight back where it started: `NOYDB_INTEROP_REQUIRE=7zz`
// would require nothing at all and pass, silently, forever. Measured: before
// this guard, `NOYDB_INTEROP_REQUIRE=7z,unar,nosuchtool` reported 11 passed.
const KNOWN_TOOLS = ['7z', 'unar']
const unknown = REQUIRED.filter((t) => t !== '1' && !KNOWN_TOOLS.includes(t))
if (unknown.length > 0) {
  throw new Error(
    `NOYDB_INTEROP_REQUIRE names unknown tool(s): ${unknown.join(', ')}. ` +
      `This file checks only: ${KNOWN_TOOLS.join(', ')}.`,
  )
}

function requireOrSkip(tool: string, found: boolean): boolean {
  if (found) return false
  if (REQUIRED.includes('1') || REQUIRED.includes(tool)) {
    throw new Error(
      `NOYDB_INTEROP_REQUIRE names \`${tool}\` but it is not on PATH. ` +
        `Install it, or drop it from the variable to skip these vectors.`,
    )
  }
  return true
}

// Homebrew sevenzip installs as `7zz` on macOS; Linux p7zip-full uses `7z`.
function find7z(): string | null {
  if (hasTool('7z')) return '7z'
  if (hasTool('7zz')) return '7zz'
  return null
}

function run(cmd: string, args: string[], opts: { cwd?: string } = {}): { ok: boolean; out: string } {
  const r = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', cwd: opts.cwd })
  const out = (r.stdout ?? '') + (r.stderr ?? '')
  return { ok: r.status === 0, out }
}

// Shared temp directory for the whole test run.
const TMP = mkdtempSync(join(tmpdir(), 'noydb-interop-'))

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

// ── Test vectors ───────────────────────────────────────────────────────

const enc = new TextEncoder()

const VECTORS = [
  { name: 'single-byte',   entryPath: 'single-byte.bin',    plaintext: new Uint8Array([0x42]) },
  { name: 'sixteen-bytes', entryPath: 'sixteen-bytes.bin',  plaintext: new Uint8Array(16) },
  { name: 'nonascii',      entryPath: 'données/résumé.txt', plaintext: enc.encode('hello') },
  { name: 'onemib',        entryPath: 'onemib.bin',         plaintext: new Uint8Array(1024 * 1024).fill(0xab) },
] as const

// ── Our writer → 7-Zip reader ──────────────────────────────────────────

describe('our writer → 7-Zip reader', () => {
  const sevenZip = find7z()
  const skip = requireOrSkip('7z', sevenZip !== null)

  for (const v of VECTORS) {
    it(
      `vector: ${v.name}`,
      { skip, timeout: 30_000 },
      async () => {
        // Write archive.
        const archive = await writeZip(
          [{ path: v.entryPath, bytes: v.plaintext }],
          { password: PW },
        )
        const archivePath = join(TMP, `7z-write-${v.name}.zip`)
        writeFileSync(archivePath, archive)

        // Extract with 7z / 7zz.
        const outDir = join(TMP, `7z-out-${v.name}`)
        mkdirSync(outDir, { recursive: true })
        const { ok, out } = run(sevenZip!, ['x', `-p${PW}`, `-o${outDir}`, '-y', archivePath], {})
        expect(ok, `${sevenZip} extraction failed:\n${out}`).toBe(true)

        // Read extracted file.
        const extractedPath = join(outDir, v.entryPath)
        const extracted = readFileSync(extractedPath)
        expect(new Uint8Array(extracted)).toEqual(v.plaintext)
      },
    )
  }
})

// ── Our writer → unar reader ───────────────────────────────────────────

describe('our writer → unar reader', () => {
  const skip = requireOrSkip('unar', hasTool('unar'))

  for (const v of VECTORS) {
    it(
      `vector: ${v.name}`,
      { skip, timeout: 30_000 },
      async () => {
        // Write archive.
        const archive = await writeZip(
          [{ path: v.entryPath, bytes: v.plaintext }],
          { password: PW },
        )
        const archivePath = join(TMP, `unar-write-${v.name}.zip`)
        writeFileSync(archivePath, archive)

        // Extract with unar.
        const outDir = join(TMP, `unar-out-${v.name}`)
        mkdirSync(outDir, { recursive: true })
        const { ok, out } = run('unar', ['-p', PW, '-o', outDir, '-f', archivePath])
        expect(ok, `unar extraction failed:\n${out}`).toBe(true)

        // Read extracted file.
        const extractedPath = join(outDir, v.entryPath)
        const extracted = readFileSync(extractedPath)
        expect(new Uint8Array(extracted)).toEqual(v.plaintext)
      },
    )
  }
})

// ── 7-Zip writer → our reader ──────────────────────────────────────────
// 7-Zip writes AE-1 (CRC stored). readZip must accept both AE-1 and AE-2.

describe('7-Zip writer → our reader', () => {
  const sevenZip = find7z()
  const skip = requireOrSkip('7z', sevenZip !== null)

  // Omit 'nonascii' — path contains a slash, making the entryPath inside
  // the archive OS-dependent when 7z is invoked with cwd.
  const readVectors = VECTORS.filter((v) => !v.entryPath.includes('/'))

  for (const v of readVectors) {
    it(
      `vector: ${v.name}`,
      { skip, timeout: 30_000 },
      async () => {
        // Write plaintext to disk in a dedicated input dir.
        const inDir = join(TMP, `7z-read-in-${v.name}`)
        mkdirSync(inDir, { recursive: true })
        writeFileSync(join(inDir, v.entryPath), v.plaintext)

        // Create zip with 7z / 7zz (AE-1, AES-256).
        // Run from inDir so 7z stores just the relative entryPath (no tmp prefix).
        const archivePath = join(TMP, `7z-read-${v.name}.zip`)
        // -mm=Copy forces STORE (no Deflate). Our reader is STORE-only by
        // design; this test validates AE-1 CRC handling, not compression.
        const { ok, out } = run(
          sevenZip!,
          ['a', '-tzip', '-mm=Copy', '-mem=AES256', `-p${PW}`, '-y', archivePath, v.entryPath],
          { cwd: inDir },
        )
        expect(ok, `${sevenZip} archive creation failed:\n${out}`).toBe(true)

        // Read with our reader.
        const bytes = new Uint8Array(readFileSync(archivePath))
        const entries = await readZip(bytes, { password: PW })

        // entryPath is stored verbatim since 7z was run from inDir.
        const entry = entries.find((e) => e.path === v.entryPath)
        expect(entry, `entry '${v.entryPath}' not found in archive`).toBeDefined()
        expect(entry!.bytes).toEqual(v.plaintext)
      },
    )
  }
})
