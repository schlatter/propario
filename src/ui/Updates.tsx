import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db, saveSettings } from '../db/db'
import { useSettings } from '../hooks'
import { useI18n } from '../i18n'
import { notesFor, releaseOf } from '../releases'
import { Modal } from './Dialog'

const RUNNING = __APP_VERSION__

/** The server runs a newer build than this page: offer a reload. */
export function UpdateNotice() {
  const { m } = useI18n()
  const server = useLiveQuery(async () => (await db.meta.get('serverVersion'))?.value as string | undefined, [])
  if (!server || server === RUNNING) return null
  return (
    <div className="update-notice" role="status">
      <span>{m.updates.available}</span>
      <button type="button" className="btn sm primary" onClick={() => location.reload()}>
        {m.updates.reload}
      </button>
    </div>
  )
}

/** "What's new", once per person after a release, unless turned off in Settings. */
export function WhatsNew() {
  const { m, locale } = useI18n()
  const settings = useSettings()
  const [open, setOpen] = useState(false)
  const release = releaseOf(RUNNING)
  const notes = notesFor(RUNNING)

  useEffect(() => {
    if (settings.seenRelease === release) return
    // A new account starts at the current release; notes are for updates only.
    if (!settings.seenRelease || settings.whatsNew === false || !notes) {
      void saveSettings({ seenRelease: release }).catch(() => {})
      return
    }
    setOpen(true)
  }, [settings.seenRelease, settings.whatsNew, release, notes])

  const close = () => {
    setOpen(false)
    void saveSettings({ seenRelease: release }).catch(() => {})
  }

  return (
    <Modal open={open && !!notes} onClose={close} labelledBy="whats-new-title">
      <div className="dialog">
        <h2 id="whats-new-title">{m.updates.whatsNew(release)}</h2>
        <ul>
          {notes?.notes[locale].map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button type="button" className="btn primary" onClick={close} autoFocus>
            {m.common.close}
          </button>
        </div>
      </div>
    </Modal>
  )
}
