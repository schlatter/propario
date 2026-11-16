// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from './db.ts'
import { useKey } from './crypto.ts'
import { accessibleProjects, applyChanges, collectGarbage, listMembers, projectRole, readImage, saveImage, setMember, sync } from './store.ts'
import { createUser, deleteUser } from './users.ts'
import { makeProduct, makeProject, makeProperty } from '../src/db/factories.ts'
import { newId } from '../src/shared/ids.ts'
import type { Change } from '../src/shared/records.ts'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

let db: DB
let ada: string
let grace: string
let mallory: string

function seedProject(owner: string, name = 'Küchenschrank') {
  const project = makeProject({ name })
  const product = makeProduct(project.id, { brand: 'Hemnes', model: 'Vitrine', notes: 'secret note' })
  applyChanges(db, owner, [
    { op: 'create', kind: 'projects', record: project },
    { op: 'create', kind: 'products', record: product },
  ])
  return { project, product }
}

beforeEach(() => {
  useKey(Buffer.alloc(32, 7).toString('base64'))
  db = openDatabase(':memory:')
  ada = newId()
  grace = newId()
  mallory = newId()
  createUser(db, { id: ada, name: 'Ada', isAdmin: true })
  createUser(db, { id: grace, name: 'Grace', isAdmin: false })
  createUser(db, { id: mallory, name: 'Mallory', isAdmin: false })
})

describe('private by default', () => {
  it('a new comparison belongs to its creator and nobody else sees it', () => {
    const { project } = seedProject(ada)
    expect(projectRole(db, project.id, ada)).toBe('owner')
    expect(projectRole(db, project.id, grace)).toBeNull()
    expect(sync(db, grace, 0).records).toEqual([])
    expect(sync(db, grace, 0).projects).toEqual([])
    expect(
      sync(db, ada, 0)
        .records.map((r) => r.kind)
        .sort(),
    ).toEqual(['products', 'projects'])
  })

  it('strangers can neither read, patch, add to, delete nor list members of it ("not found")', () => {
    const { project, product } = seedProject(ada)
    const attempts: Change[][] = [
      [{ op: 'patch', kind: 'products', id: product.id, projectId: project.id, patch: { price: 1 } }],
      [{ op: 'create', kind: 'products', record: makeProduct(project.id) }],
      [{ op: 'delete', kind: 'products', id: product.id, projectId: project.id }],
      [{ op: 'delete', kind: 'projects', id: project.id, projectId: project.id }],
      [{ op: 'patch', kind: 'projects', id: project.id, projectId: project.id, patch: { name: 'mine' } }],
    ]
    for (const changes of attempts) expect(() => applyChanges(db, mallory, changes)).toThrow('not found')
    expect(() => listMembers(db, mallory, project.id)).toThrow('not found')
    expect(() => setMember(db, mallory, project.id, mallory, 'editor')).toThrow('not found')
  })

  it('a record cannot be moved into a foreign project by naming another projectId', () => {
    const { product } = seedProject(ada)
    const own = seedProject(mallory, 'Mine')
    expect(() => applyChanges(db, mallory, [{ op: 'patch', kind: 'products', id: product.id, projectId: own.project.id, patch: { price: 1 } }])).toThrow(
      'not found',
    )
    expect(() => applyChanges(db, mallory, [{ op: 'create', kind: 'products', record: { ...product, projectId: own.project.id } }])).toThrow('record exists')
  })

  it('an existing project id cannot be claimed by creating it again', () => {
    const { project } = seedProject(ada)
    expect(() => applyChanges(db, mallory, [{ op: 'create', kind: 'projects', record: project }])).toThrow('project exists')
    expect(projectRole(db, project.id, mallory)).toBeNull()
  })
})

describe('shared on purpose', () => {
  it('a viewer reads but cannot change anything', () => {
    const { project, product } = seedProject(ada)
    setMember(db, ada, project.id, grace, 'viewer')
    expect(projectRole(db, project.id, grace)).toBe('viewer')
    expect(sync(db, grace, 0).records.find((r) => r.kind === 'products')?.data).toMatchObject({ notes: 'secret note' })
    expect(() => applyChanges(db, grace, [{ op: 'patch', kind: 'products', id: product.id, projectId: project.id, patch: { price: 1 } }])).toThrow('read only')
    expect(() => saveImage(db, grace, project.id, PNG)).toThrow('read only')
  })

  it('an editor changes contents but cannot delete the comparison or share it on', () => {
    const { project, product } = seedProject(ada)
    setMember(db, ada, project.id, grace, 'editor')
    applyChanges(db, grace, [{ op: 'patch', kind: 'products', id: product.id, projectId: project.id, patch: { price: 499 } }])
    expect(() => applyChanges(db, grace, [{ op: 'delete', kind: 'projects', id: project.id, projectId: project.id }])).toThrow('only the owner')
    expect(() => setMember(db, grace, project.id, mallory, 'viewer')).toThrow('only the owner')
  })

  it('a newly added member receives the whole comparison even with a recent sync number', () => {
    const { project } = seedProject(ada)
    seedProject(grace, 'Grace own')
    const since = sync(db, grace, 0).seq
    setMember(db, ada, project.id, grace, 'viewer')
    const delta = sync(db, grace, since)
    expect(delta.records.filter((r) => (r.data as { projectId?: string }).projectId === project.id || r.data.id === project.id)).toHaveLength(2)
  })

  it('stopping to share removes access; deleting the owner removes their comparisons', () => {
    const { project } = seedProject(ada)
    setMember(db, ada, project.id, grace, 'editor')
    setMember(db, ada, project.id, grace, null)
    expect(accessibleProjects(db, grace)).toEqual([])
    setMember(db, ada, project.id, grace, 'viewer')
    deleteUser(db, ada)
    expect(accessibleProjects(db, grace)).toEqual([])
    expect(db.prepare('SELECT count(*) AS n FROM records').get()).toEqual({ n: 0 })
  })
})

describe('images', () => {
  it('are stored only for editors, checked by their bytes and served only to members', () => {
    const { project } = seedProject(ada)
    expect(() => saveImage(db, ada, project.id, Buffer.from('<svg/>'))).toThrow('not a WebP')
    const path = saveImage(db, ada, project.id, PNG)
    const id = path.split('/').pop()!
    expect(readImage(db, ada, id)).toMatchObject({ type: 'image/png' })
    expect(readImage(db, ada, id)!.bytes.equals(PNG)).toBe(true)
    expect(readImage(db, mallory, id)).toBeNull()
    const raw = db.prepare('SELECT data FROM images WHERE id = ?').get(id) as { data: Uint8Array }
    expect(Buffer.from(raw.data).includes(PNG.subarray(8, 24))).toBe(false)
  })

  it('unreferenced images are collected after an hour', () => {
    const { project, product } = seedProject(ada)
    const kept = saveImage(db, ada, project.id, PNG)
    saveImage(db, ada, project.id, PNG)
    applyChanges(db, ada, [{ op: 'patch', kind: 'products', id: product.id, projectId: project.id, patch: { image: kept } }])
    expect(collectGarbage(db).images).toBe(0)
    expect(collectGarbage(db, Date.now() + 2 * 3600_000).images).toBe(1)
    expect(readImage(db, ada, kept.split('/').pop()!)).not.toBeNull()
  })
})

describe('changes and sync', () => {
  it('rejects unknown fields, wrong types, script links and foreign image paths', () => {
    const { project, product } = seedProject(ada)
    const patch = (p: Record<string, unknown>) => () =>
      applyChanges(db, ada, [{ op: 'patch', kind: 'products', id: product.id, projectId: project.id, patch: p }])
    expect(patch({ isAdmin: true })).toThrow('unknown field')
    expect(patch({ price: 'free' })).toThrow('must be')
    expect(patch({ url: 'javascript:alert(1)' })).toThrow('http(s)')
    expect(patch({ image: 'https://evil.example/x.png' })).toThrow('this server')
    expect(patch({ links: ['data:text/html,x'] })).toThrow('http(s)')
  })

  it('is all or nothing', () => {
    const { project, product } = seedProject(ada)
    expect(() =>
      applyChanges(db, ada, [
        { op: 'patch', kind: 'products', id: product.id, projectId: project.id, patch: { price: 5 } },
        { op: 'patch', kind: 'products', id: newId(), projectId: project.id, patch: { price: 6 } },
      ]),
    ).toThrow()
    expect(sync(db, ada, 0).records.find((r) => r.kind === 'products')?.data).toMatchObject({ price: null })
  })

  it('merges patches per field, and per custom value', () => {
    const { project, product } = seedProject(ada)
    const prop = makeProperty(project.id, { name: 'Tiefe' })
    const other = makeProperty(project.id, { name: 'Breite' })
    setMember(db, ada, project.id, grace, 'editor')
    applyChanges(db, ada, [
      { op: 'create', kind: 'properties', record: prop },
      { op: 'create', kind: 'properties', record: other },
    ])
    applyChanges(db, ada, [{ op: 'patch', kind: 'products', id: product.id, projectId: project.id, patch: { price: 400, values: { [prop.id]: 40 } } }])
    applyChanges(db, grace, [
      { op: 'patch', kind: 'products', id: product.id, projectId: project.id, patch: { model: 'Vitrine 2', values: { [other.id]: 90 } } },
    ])
    const p = sync(db, ada, 0).records.find((r) => r.kind === 'products')!.data
    expect(p).toMatchObject({ price: 400, model: 'Vitrine 2', values: { [prop.id]: 40, [other.id]: 90 } })
    applyChanges(db, ada, [{ op: 'patch', kind: 'products', id: product.id, projectId: project.id, patch: { values: { [prop.id]: null } } }])
    expect(sync(db, ada, 0).records.find((r) => r.kind === 'products')!.data).toMatchObject({ values: { [other.id]: 90 } })
  })

  it('sends only what changed since a number, deletions included, and touches the comparison', () => {
    const { project, product } = seedProject(ada)
    const since = sync(db, ada, 0).seq
    applyChanges(db, ada, [{ op: 'delete', kind: 'products', id: product.id, projectId: project.id }])
    const delta = sync(db, ada, since)
    expect(delta.full).toBe(false)
    expect(delta.deleted).toEqual([{ kind: 'products', id: product.id, projectId: project.id }])
    expect(delta.records.map((r) => r.kind)).toEqual(['projects'])
  })

  it('keeps record contents encrypted at rest', () => {
    seedProject(ada)
    const rows = db.prepare('SELECT data FROM records').all() as { data: string }[]
    for (const r of rows) {
      expect(r.data.startsWith('v1.')).toBe(true)
      expect(r.data).not.toContain('secret note')
      expect(r.data).not.toContain('Küchenschrank')
    }
  })
})
