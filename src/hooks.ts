import { useLiveQuery } from 'dexie-react-hooks'
import { db, DEFAULT_SETTINGS, getSettings } from './db/db'
import type { Settings } from './db/types'
import { exportProject, downloadJson, fileStamp, safeFileName } from './db/backup'
import { loadBundle } from './db/repo'
import { downloadBlob } from './db/backup'
import type { Messages } from './i18n/en'

export function useSettings(): Settings {
  return useLiveQuery(() => getSettings(), [], DEFAULT_SETTINGS)
}

export async function exportProjectJson(projectId: string) {
  const data = await exportProject(projectId)
  if (!data) return
  downloadJson(data, `propario-${safeFileName(data.projects[0].name)}-${fileStamp()}.json`)
}

export async function exportProjectExcel(projectId: string, m: Messages) {
  const b = await loadBundle(projectId)
  if (!b) return
  const { bundleToWorkbook, workbookToBlob } = await import('./export/xlsx')
  downloadBlob(workbookToBlob(bundleToWorkbook(b, m)), `${safeFileName(b.project.name)}-${fileStamp()}.xlsx`)
}

export { db }
