import { describe, expect, it } from 'vitest'
import { AppDB, useCache } from '../src/db/db'
import { makeProduct, makeProject } from '../src/db/factories'
import { applyLocal, commit, onSaving, pull, useTransport, type SyncResult } from '../src/sync'

/** A server that answers when the test says so – like a phone whose connection is waking up. */
function slowServer() {
  let settle: (ok: boolean) => void = () => {}
  useTransport({
    push: () => new Promise<void>((resolve, reject) => (settle = (ok) => (ok ? resolve() : reject(new Error('offline'))))),
    pull: async () => ({ seq: 1, full: false, projects: [], records: [], deleted: [] }) as unknown as SyncResult,
  })
  return { answer: (ok: boolean) => settle(ok) }
}

async function cacheWithProduct() {
  const cache = new AppDB(`test-sync-${Math.random()}`)
  useCache(cache)
  const project = makeProject({ name: 'Regal' })
  const product = makeProduct(project.id, { model: 'Arvika', price: 499 })
  await applyLocal([
    { op: 'create', kind: 'projects', record: project },
    { op: 'create', kind: 'products', record: product },
  ])
  return { cache, project, product }
}

describe('saving changes', () => {
  it('shows a change at once, while the server has not answered yet, and says it is on its way', async () => {
    const server = slowServer()
    const { cache, product } = await cacheWithProduct()
    const counts: number[] = []
    const stop = onSaving((n) => counts.push(n))
    const saved = commit([{ op: 'patch', kind: 'products', id: product.id, projectId: product.projectId, patch: { price: 459 } }])
    await expect.poll(async () => (await cache.products.get(product.id))?.price).toBe(459)
    expect(counts.at(-1)).toBe(1)
    server.answer(true)
    await saved
    expect((await cache.products.get(product.id))?.price).toBe(459)
    expect(counts.at(-1)).toBe(0)
    stop()
  })

  it('takes a change back when it could not be saved – nothing stays that is not saved', async () => {
    const server = slowServer()
    const { cache, project, product } = await cacheWithProduct()
    const added = makeProduct(project.id, { model: 'Bo' })
    const changedAt = (await cache.projects.get(project.id))?.updatedAt
    const saved = commit([
      { op: 'patch', kind: 'products', id: product.id, projectId: project.id, patch: { price: 1 } },
      { op: 'create', kind: 'products', record: added },
    ])
    await expect.poll(async () => cache.products.count()).toBe(2)
    server.answer(false)
    await expect(saved).rejects.toThrow('offline')
    expect((await cache.products.get(product.id))?.price).toBe(499)
    expect(await cache.products.get(added.id)).toBeUndefined()
    expect((await cache.projects.get(project.id))?.updatedAt).toBe(changedAt)
  })
})

describe('a pull that crosses a change', () => {
  it('keeps a new comparison the server did not know yet when the pull started', async () => {
    const cache = new AppDB(`test-sync-${Math.random()}`)
    useCache(cache)
    let answerPull: ((r: SyncResult) => void) | undefined
    let answerPush: (() => void) | undefined
    useTransport({
      push: () => new Promise<void>((resolve) => (answerPush = resolve)),
      pull: () => new Promise<SyncResult>((resolve) => (answerPull = resolve)),
    })
    // The pull is on its way with the server's state from before …
    const pulling = pull()
    await expect.poll(() => !!answerPull).toBe(true)
    // … when a new comparison is made here and sent.
    const project = makeProject({ name: 'New comparison' })
    const saved = commit([{ op: 'create', kind: 'projects', record: project }])
    await expect.poll(async () => !!(await cache.projects.get(project.id))).toBe(true)
    answerPull!({ seq: 1, full: false, projects: [], records: [], deleted: [] } as unknown as SyncResult)
    await pulling
    expect(await cache.projects.get(project.id)).toBeDefined()
    answerPush!()
    await saved
  })
})

describe('pictures from a backup', () => {
  it('are decoded without fetch(), which the app’s own CSP refuses for data: URLs', async () => {
    const { dataUrlToBlob } = await import('../src/images')
    const blob = await dataUrlToBlob('data:image/webp;base64,UklGRg==')
    expect(blob.type).toBe('image/webp')
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([0x52, 0x49, 0x46, 0x46])
  })
})
