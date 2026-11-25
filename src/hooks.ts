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

export type ExportFormat = 'xlsx' | 'ods' | 'csv' | 'json'
export const EXPORT_FORMATS: ExportFormat[] = ['xlsx', 'ods', 'csv', 'json']

/**
 * Downloads a comparison as a file. Spreadsheets (xlsx, ods) hold the products, the requirements
 * and the notes; csv only the products' table; json all of it, to import into Propario again.
 * `only`: just these products (exporting a selection).
 */
export async function exportComparison(projectId: string, format: ExportFormat, m: Messages, only?: ReadonlySet<string>) {
  if (format === 'json') {
    const data = await exportProject(projectId, undefined, only)
    if (data) downloadJson(data, `propario-${safeFileName(data.projects[0].name)}-${fileStamp()}.json`)
    return
  }
  const all = await loadBundle(projectId)
  if (!all) return
  const b = only ? onlyProducts(all, only) : all
  const { bundleToWorkbook, workbookToBlob } = await import('./export/xlsx')
  downloadBlob(workbookToBlob(bundleToWorkbook(b, m), format), `${safeFileName(b.project.name)}-${fileStamp()}.${format}`)
}

export { db }
