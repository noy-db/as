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
import { writeXlsx, type XlsxSheet } from '../src/index.js'

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
