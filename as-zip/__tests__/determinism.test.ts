/**
 * Byte-reproducibility of the archive writer (#4).
 *
 * Two values reach the bytes on every export and both must be pinned
 * before an archive is reproducible: the ZIP entry mod-times, and the
 * manifest's `exportedAt`. `AsZipOptions.mtime` sets both — one value,
 * one concept, so the archive cannot be half-configured.
 *
 * This defect is the same class as the xlsx one in #2 but at a
 * different resolution: mod-times are 2-second granular and so were
 * only ACCIDENTALLY reproducible, while `exportedAt` is an ISO string
 * at millisecond precision and could never accidentally match.
 *
 * Every loop below runs under a MOVING clock. That is not decoration:
 * 40 builds in a tight loop all land in the same 2-second DOS bucket,
 * so a writer that ignored `mtime` for the entry headers would still
 * emit one digest and pass. Each has a paired assertion that the clock
 * really moved.
 */
import { describe, expect, it } from 'vitest'
import { createNoydb } from '@noy-db/hub'
import { withTeam } from '@noy-db/hub/team'
import { withBlobs } from '@noy-db/hub/blobs'
import { toMemory } from '@noy-db/to-memory'
import { createHash } from 'node:crypto'
import { readZip, toBytes, type ArchiveManifest } from '../src/index.js'

const BUILDS = 40
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

async function seeded() {
  const adapter = toMemory()
  const opts = { teamStrategy: withTeam(), store: adapter, user: 'owner-01', secret: 'owner-pass', blobsStrategy: withBlobs() } as const
  const seed = await createNoydb(opts)
  const vault = await seed.openVault('acme')
  await vault.collection('invoices').put('inv-1', { id: 'inv-1', client: 'Globex', amount: 1500 })
  await vault.collection('invoices').put('inv-2', { id: 'inv-2', client: 'สตาร์ค', amount: 999 })
  await seed.grant('acme', {
    userId: 'owner-01', displayName: 'Owner', role: 'owner', secret: 'owner-pass',
    exportCapability: { plaintext: ['zip'] },
  })
  await seed.close()
  const db = await createNoydb(opts)
  return { db, vault: await db.openVault('acme') }
}

/**
 * Run `fn` with `new Date()` advancing by `stepMs` per construction.
 * Explicit-argument construction is untouched, so date values inside
 * record data behave normally.
 */
async function withAdvancingClock<T>(stepMs: number, fn: () => Promise<T>): Promise<T> {
  const Real = Date
  let now = Real.parse('2026-09-16T10:00:00Z')
  class Advancing extends Real {
    // `ConstructorParameters<typeof Date>` resolves to ONE overload, so TS
    // reads the zero-arg branch below as unreachable (TS2367). The union
    // states what is actually passed.
    constructor(...args: ConstructorParameters<typeof Date> | []) {
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

const SPEC = { records: { collection: 'invoices' } } as const

describe('archive byte reproducibility', () => {
  it('differs across repeated builds when mtime is left to the clock', async () => {
    const { db, vault } = await seeded()
    const digests = await withAdvancingClock(4000, async () => {
      const seen = new Set<string>()
      for (let i = 0; i < BUILDS; i++) seen.add(sha(await toBytes(vault, SPEC)))
      return seen
    })
    await db.close()
    expect(digests.size).toBeGreaterThan(1)
  })

  it('emits one digest across the same builds when mtime is fixed', async () => {
    const { db, vault } = await seeded()
    const mtime = new Date(0)
    const digests = await withAdvancingClock(4000, async () => {
      const seen = new Set<string>()
      for (let i = 0; i < BUILDS; i++) seen.add(sha(await toBytes(vault, { ...SPEC, mtime })))
      return seen
    })
    await db.close()
    expect(digests.size).toBe(1)
  })

  it('writes mtime into the manifest exportedAt, not only the zip headers', async () => {
    // Asserted on the FIELD, not just on the digest. A change that
    // dropped `exportedAt` from the manifest entirely would keep every
    // digest above stable and pass all of them.
    const { db, vault } = await seeded()
    const bytes = await toBytes(vault, { ...SPEC, mtime: new Date('1998-06-15T08:30:00Z') })
    await db.close()

    const entries = await readZip(bytes)
    const manifestEntry = entries.find((e) => e.path === 'manifest.json')
    expect(manifestEntry).toBeDefined()
    const manifest = JSON.parse(new TextDecoder().decode(manifestEntry!.bytes)) as ArchiveManifest
    expect(manifest.exportedAt).toBe('1998-06-15T08:30:00.000Z')
  })
})
