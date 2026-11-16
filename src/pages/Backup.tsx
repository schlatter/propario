import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { downloadJson, exportAll, fileStamp, forgetLegacyData, legacyData, markBackupDone, parseBackup, restoreMerge, restoreReplace } from '../db/backup'
import { rolesOf } from '../sync'
import type { BackupFile } from '../db/types'
import { useSettings } from '../hooks'
import { useI18n } from '../i18n'
import { useConfirm, useToast } from '../ui/Dialog'
import { Glyph } from '../ui/Glyph'

export function BackupPage() {
  const { m, fmt } = useI18n()
  const settings = useSettings()
  const confirm = useConfirm()
  const toast = useToast()
  const ownedCount = useLiveQuery(async () => Object.values(await rolesOf(db)).filter((r) => r === 'owner').length, [], 0)
  const [file, setFile] = useState<BackupFile | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [legacy, setLegacy] = useState<BackupFile | null>(null)

  useEffect(() => {
    legacyData()
      .then(setLegacy)
      .catch(() => setLegacy(null))
  }, [])

  const run = async (job: () => Promise<void>) => {
    setBusy(true)
    try {
      await job()
    } finally {
      setBusy(false)
    }
  }

  const doExport = () =>
    run(async () => {
      const data = await exportAll()
      downloadJson(data, `propario-backup-${fileStamp()}.json`)
      await markBackupDone()
    })

  const pick = async (f: File) => {
    setError('')
    setFile(null)
    const res = parseBackup(await f.text())
    if (!res.ok) setError(res.error === 'newer' ? m.backup.newerVersion : m.backup.invalid)
    else setFile(res.file)
  }

  return (
    <main style={{ maxWidth: 860 }}>
      <div className="page-head">
        <h1>{m.backup.title}</h1>
      </div>

      <p className="muted">{m.backup.intro}</p>
      {busy && (
        <p role="status" className="muted small">
          {m.backup.working}
        </p>
      )}

      {legacy && (
        <section className="panel stack" aria-labelledby="legacy-title">
          <h2 id="legacy-title">{m.backup.legacyTitle}</h2>
          <p>{m.backup.legacyText(legacy.projects.length)}</p>
          <div className="row">
            <button
              className="btn primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const n = await restoreMerge(legacy)
                  toast(m.backup.legacyMoved(n))
                  await forgetLegacyData()
                  setLegacy(null)
                })
              }
            >
              <Glyph name="upload" /> {m.backup.legacyMove}
            </button>
            <button
              className="btn ghost"
              disabled={busy}
              onClick={async () => {
                if (!(await confirm({ title: m.backup.legacyForget, text: m.backup.legacyForgetConfirm, confirmLabel: m.common.delete, danger: true }))) return
                await forgetLegacyData()
                setLegacy(null)
              }}
            >
              {m.backup.legacyForget}
            </button>
          </div>
        </section>
      )}

      <section className="panel stack">
        <h2>{m.backup.exportTitle}</h2>
        <p>{m.backup.exportText}</p>
        <div className="row">
          <button className="btn primary" onClick={doExport} disabled={busy}>
            <Glyph name="download" /> {m.backup.exportButton}
          </button>
          <span className="muted small">{settings.lastBackupAt ? m.backup.lastBackup(fmt.dateTime(settings.lastBackupAt)) : m.backup.neverBackedUp}</span>
        </div>
      </section>

      <section className="panel stack">
        <h2>{m.backup.restoreTitle}</h2>
        <p>{m.backup.restoreText}</p>
        <div>
          <label className="btn">
            <Glyph name="upload" /> {m.backup.chooseFile}
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void pick(f)
                e.target.value = ''
              }}
            />
          </label>
        </div>
        {error && (
          <p role="alert" style={{ color: 'var(--fail)' }}>
            {error}
          </p>
        )}
        {file && (
          <div className="stack" style={{ gap: 10 }}>
            <p>
              <b>{m.backup.fileSummary(file.projects.length, file.products.length, file.exportedAt ? fmt.dateTime(file.exportedAt) : '?')}</b>
            </p>
            <div className="grid-2">
              <div className="panel stack" style={{ padding: 14 }}>
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const n = await restoreMerge(file)
                      setFile(null)
                      toast(m.backup.restored(n))
                    })
                  }
                >
                  {m.backup.merge}
                </button>
                <span className="muted small">{m.backup.mergeHint}</span>
              </div>
              {file.kind === 'full' && (
                <div className="panel stack" style={{ padding: 14, marginTop: 0 }}>
                  <button
                    className="btn danger"
                    disabled={busy}
                    onClick={async () => {
                      const ok = await confirm({
                        title: m.backup.replaceConfirmTitle,
                        text: m.backup.replaceConfirmText(ownedCount),
                        confirmLabel: m.backup.replace,
                        danger: true,
                      })
                      if (!ok) return
                      await run(async () => {
                        await restoreReplace(file)
                        setFile(null)
                        toast(m.backup.restored(file.projects.length))
                      })
                    }}
                  >
                    {m.backup.replace}
                  </button>
                  <span className="muted small">{m.backup.replaceHint}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
