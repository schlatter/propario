import { useLiveQuery } from 'dexie-react-hooks'
import { db, DEFAULT_SETTINGS, getSettings } from './db/db'
import type { Settings } from './db/types'
import { exportProject, downloadJson, fileStamp, safeFileName } from './db/backup'
import { loadBundle, onlyProducts } from './db/repo'
import { downloadBlob } from './db/backup'
import type { Messages } from './i18n/en'

export function useSettings(): Settings {
  return useLiveQuery(() => getSettings(), [], DEFAULT_SETTINGS)
}

/** `only`: just these products (exporting a selection). */
export async function exportProjectJson(projectId: string, only?: ReadonlySet<string>) {
  const data = await exportProject(projectId, undefined, only)
  if (!data) return
  downloadJson(data, `propario-${safeFileName(data.projects[0].name)}-${fileStamp()}.json`)
}

export async function exportProjectExcel(projectId: string, m: Messages, only?: ReadonlySet<string>) {
  const all = await loadBundle(projectId)
  if (!all) return
  const b = only ? onlyProducts(all, only) : all
  const { bundleToWorkbook, workbookToBlob } = await import('./export/xlsx')
  downloadBlob(workbookToBlob(bundleToWorkbook(b, m)), `${safeFileName(b.project.name)}-${fileStamp()}.xlsx`)
}

export { db }
