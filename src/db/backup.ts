import Dexie from 'dexie'
import { AppDB, db, getSettings, LEGACY_DB_NAME, nowIso, saveSettings } from './db'
import { normalizeProduct, normalizeProject } from './factories'
import { deleteProject, insertBundle, loadBundle, remapBundle, uniqueProjectName, type ProjectBundle } from './repo'
import { SCHEMA_VERSION, type BackupFile } from './types'
import { inlineImages } from '../images'
import { rolesOf } from '../sync'

/**
 * Backups are complete JSON files: everything the person may see, images included (as data
 * URLs), so a backup restores on any Propario instance.
 */

export async function exportAll(database: AppDB = db): Promise<BackupFile> {
  const [projects, properties, products, requirements, settings] = await Promise.all([
    database.projects.toArray(),
    database.properties.toArray(),
    database.products.toArray(),
    database.requirements.toArray(),
    getSettings(database),
  ])
  return {
    app: 'propario',
    kind: 'full',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    projects,
    properties,
    products: await inlineImages(products),
    requirements,
    settings,
  }
}

export async function exportProject(projectId: string, database: AppDB = db): Promise<BackupFile | null> {
  const b = await loadBundle(projectId, database)
  if (!b) return null
  return {
    app: 'propario',
    kind: 'project',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    projects: [b.project],
    properties: b.properties,
    products: await inlineImages(b.products),
    requirements: b.requirements,
  }
}

export type ParseResult = { ok: true; file: BackupFile } | { ok: false; error: 'invalid' | 'newer' }

export function parseBackup(text: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'invalid' }
  }
  const f = data as Partial<BackupFile>
  if (!f || (f.app !== 'propario' && f.app !== 'produktvergleich') || !Array.isArray(f.projects) || !Array.isArray(f.products))
    return { ok: false, error: 'invalid' }
  if (typeof f.schemaVersion !== 'number' || f.schemaVersion > SCHEMA_VERSION) return { ok: false, error: 'newer' }
  for (const p of [...f.projects, ...f.products]) if (!p || typeof p.id !== 'string') return { ok: false, error: 'invalid' }
  return {
    ok: true,
    file: {
      app: 'propario',
      kind: f.kind === 'project' ? 'project' : 'full',
      schemaVersion: f.schemaVersion,
      exportedAt: String(f.exportedAt ?? ''),
      projects: f.projects.map(normalizeProject),
      products: f.products.map(normalizeProduct),
      properties: Array.isArray(f.properties) ? f.properties : [],
      requirements: Array.isArray(f.requirements) ? f.requirements : [],
      settings: f.settings,
    },
  }
}

function bundlesOf(file: BackupFile): ProjectBundle[] {
  return file.projects.map((project) => ({
    project,
    properties: file.properties.filter((p) => p.projectId === project.id),
    products: file.products.filter((p) => p.projectId === project.id),
    requirements: file.requirements.filter((r) => r.projectId === project.id),
  }))
}

/** Removes the comparisons this person owns, then adds the backup's comparisons as new ones. */
export async function restoreReplace(file: BackupFile) {
  const roles = await rolesOf()
  for (const [id, role] of Object.entries(roles)) if (role === 'owner') await deleteProject(id)
  for (const b of bundlesOf(file)) await insertBundle(remapBundle(b, { name: b.project.name }))
}

/** Adds the backup's comparisons as new copies next to existing data. */
export async function restoreMerge(file: BackupFile): Promise<number> {
  let n = 0
  for (const b of bundlesOf(file)) {
    const name = await uniqueProjectName(b.project.name)
    await insertBundle(remapBundle(b, { name }))
    n++
  }
  return n
}

/** Comparisons kept only in this browser by version 0.1 (before accounts). */
export async function legacyData(): Promise<BackupFile | null> {
  if (!(await Dexie.exists(LEGACY_DB_NAME))) return null
  const legacy = new AppDB(LEGACY_DB_NAME)
  try {
    const [projects, properties, products, requirements] = await Promise.all([
      legacy.projects.toArray(),
      legacy.properties.toArray(),
      legacy.products.toArray(),
      legacy.requirements.toArray(),
    ])
    if (!projects.length) return null
    return {
      app: 'propario',
      kind: 'full',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: nowIso(),
      projects: projects.map(normalizeProject),
      properties,
      products: products.map(normalizeProduct),
      requirements,
    }
  } finally {
    legacy.close()
  }
}

export async function forgetLegacyData() {
  await Dexie.delete(LEGACY_DB_NAME)
}

export async function markBackupDone() {
  await saveSettings({ lastBackupAt: nowIso() })
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadJson(data: unknown, fileName: string) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), fileName)
}

export function fileStamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

export function safeFileName(s: string) {
  return (
    s
      .replace(/[^\p{L}\p{N}._ -]+/gu, '')
      .trim()
      .replace(/\s+/g, '_') || 'export'
  )
}
