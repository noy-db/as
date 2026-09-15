/**
 * Byte-reproducibility of the xlsx writer (as#2).
 *
 * A caller content-addressing a workbook — hashing the bytes as an
 * attestation, then rebuilding later to check the hash still holds —
 * needs identical input to give identical bytes. It did not: a ZIP
 * stores mod-time at MS-DOS 2-second granularity, so two builds matched
 * only while both landed in the same 2-second bucket. A back-to-back
 * check passes, which is why this read as a flaky test rather than a
 * missing property.
 *
 * Every test here proves the guard NON-VACUOUS in both directions: the
 * same clock movement that breaks reproducibility without `mtime` must
 * leave it intact with `mtime`. A test that only asserts the `mtime`
 * case would still pass if the clock stub silently stopped moving.
 */
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { formula, styled, writeXlsx, type XlsxSheet } from '../src/index.js'

/**
 * Build count for the stability tests.
 *
 * Not 2 — a consumer's reproducibility defect reproduced about one run
 * in FOUR, so their single-rebuild assertion caught it a quarter of the
 * time and read as suite flake for weeks. With a varying axis present,
 * 40 builds drop a one-in-four escape to (3/4)^39, about one in 77,000.
 *
 * ⛔ THE COUNT IS THE SECOND HALF, NEVER THE FIRST. Repetition is a
 * probe only if something CHANGES across the repeats, and which axis
 * varies has to be checked rather than assumed. Both measured, not
 * argued: 40 builds of this writer in a tight loop all land in one
 * 2-second DOS bucket, and so do 40 builds of a real workbook through a
 * full strategy stack with a seeded vault and live formulas — that
 * consumer's own guard ran at this count and slept through the exact
 * regression it was written for, because the stack varied plenty and
 * none of it reached the ZIP header. A busier fixture is not a varying
 * axis.
 *
 * So every loop below runs under `withAdvancingClock`, and every one
 * has a paired assertion that the clock really moved.
 */
const BUILDS = 40

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

const SHEETS: XlsxSheet[] = [{ name: 'S', header: ['a', 'b'], rows: [['1', '2'], ['3', '4']] }]

/**
 * Run `fn` with `new Date()` advancing by `stepMs` on every
 * construction. Explicit-argument construction is untouched — only the
 * zero-argument "now" form moves, so date VALUES in sheet data behave
 * normally.
 */
async function withAdvancingClock<T>(stepMs: number, fn: () => Promise<T>): Promise<T> {
  const Real = Date
  let now = Real.parse('2026-09-13T10:00:00Z')
  class Advancing extends Real {
    constructor(...args: ConstructorParameters<typeof Date>) {
      if (args.length === 0) {
        super(now)
        now += stepMs
      } else {
        super(...args)
      }
    }
    static now(): number {
      return now
    }
  }
  globalThis.Date = Advancing as DateConstructor
  try {
    return await fn()
  } finally {
    globalThis.Date = Real
  }
}

describe('writeXlsx byte reproducibility', () => {
  it('differs across a 2-second boundary when mtime is left to the clock', async () => {
    const [a, b] = await withAdvancingClock(4000, async () => [
      await writeXlsx(SHEETS),
      await writeXlsx(SHEETS),
    ])
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false)
  })

  it('is byte-identical across the same boundary when mtime is fixed', async () => {
    const mtime = new Date('1998-06-15T08:30:00Z')
    const [a, b] = await withAdvancingClock(4000, async () => [
      await writeXlsx(SHEETS, { mtime }),
      await writeXlsx(SHEETS, { mtime }),
    ])
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  })

  it('is byte-identical across separate calls with no shared clock state', async () => {
    const mtime = new Date(0)
    const a = await withAdvancingClock(4000, () => writeXlsx(SHEETS, { mtime }))
    const b = await withAdvancingClock(60_000, () => writeXlsx(SHEETS, { mtime }))
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  })
})

describe('writeXlsx stability across repeated builds', () => {
  /**
   * Formula-bearing, in both computed sheets, with and without cached
   * values — `formula()` emits `<f>` plus an optional `<v>`, XML the
   * flat fixture above never produces.
   */
  const RICH: XlsxSheet[] = [
    {
      name: 'Ledger',
      header: ['id', 'client', 'amount', 'vat'],
      rows: [
        ['inv-1', 'Globex', 1500, formula('C2*0.07', 105)],
        ['inv-2', 'Acme, Inc.', 2400, formula('C3*0.07', 168)],
        ['inv-3', 'สตาร์ค', 999, formula('C4*0.07')],
      ],
    },
    {
      name: 'Totals',
      header: ['metric', 'value'],
      rows: [
        ['net', formula('SUM(Ledger!C2:C4)', 4899)],
        ['vat', formula('SUM(Ledger!D2:D4)')],
        ['gross', styled(5241.93, '#,##0.00')],
        ['note', 'ünïcødé & <xml> "quotes"'],
      ],
      widths: [20, 14],
    },
  ]

  it('emits one digest across many builds when mtime is fixed', async () => {
    // Run under the moving clock deliberately. Forty builds in a tight
    // loop all land in the SAME 2-second bucket, so a writer that
    // ignored `mtime` entirely would still emit one digest and this
    // test would pass while proving nothing.
    const mtime = new Date(0)
    const digests = await withAdvancingClock(4000, async () => {
      const seen = new Set<string>()
      for (let i = 0; i < BUILDS; i++) seen.add(sha(await writeXlsx(RICH, { mtime })))
      return seen
    })
    expect(digests.size).toBe(1)
  })

  it('emits more than one digest across the same builds when it is not', async () => {
    // The paired negative: without it, a fixture that silently stopped
    // exercising the writer would satisfy the test above forever.
    const digests = await withAdvancingClock(4000, async () => {
      const seen = new Set<string>()
      for (let i = 0; i < BUILDS; i++) seen.add(sha(await writeXlsx(RICH)))
      return seen
    })
    expect(digests.size).toBeGreaterThan(1)
  })

  it('actually exercises formula cells', async () => {
    // Guards the two tests above: they are only meaningful while the
    // fixture still emits the `<f>` XML that motivated it.
    const bytes = await writeXlsx(RICH, { mtime: new Date(0) })
    expect(Buffer.from(bytes).toString('latin1')).toContain('<f>')
  })
})
