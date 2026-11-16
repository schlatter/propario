import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useI18n } from '../../i18n'
import { useMe } from '../../session'
import { Modal } from '../../ui/Dialog'

type Access = 'none' | 'viewer' | 'editor'

/** The owner chooses who sees a comparison and who may change it. */
export function ShareDialog({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const { m } = useI18n()
  const me = useMe()
  const [people, setPeople] = useState<{ id: string; name: string }[]>([])
  const [access, setAccess] = useState<Record<string, Access>>({})

  useEffect(() => {
    if (!open) return
    void Promise.all([
      api<{ id: string; name: string }[]>('/api/users'),
      api<{ userId: string; role: 'owner' | 'viewer' | 'editor' }[]>(`/api/projects/${projectId}/members`),
    ]).then(([users, members]) => {
      setPeople(users.filter((u) => u.id !== me.id))
      setAccess(Object.fromEntries(members.filter((x) => x.role !== 'owner').map((x) => [x.userId, x.role as Access])))
    })
  }, [open, projectId, me.id])

  const change = async (userId: string, value: Access) => {
    await api(`/api/projects/${projectId}/members`, { method: 'PUT', body: { userId, role: value === 'none' ? null : value } })
    setAccess((a) => ({ ...a, [userId]: value }))
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="share-title">
      <div className="dialog">
        <h2 id="share-title">{m.share.title}</h2>
        <p className="muted small">{m.share.hint}</p>
        {people.length === 0 ? (
          <p>{m.share.nobody}</p>
        ) : (
          <ul className="plain-list">
            {people.map((p) => (
              <li key={p.id} className="row">
                <label htmlFor={`share-${p.id}`} style={{ flex: 1 }}>
                  {p.name}
                </label>
                <select id={`share-${p.id}`} className="select" value={access[p.id] ?? 'none'} onChange={(e) => void change(p.id, e.target.value as Access)}>
                  <option value="none">{m.share.none}</option>
                  <option value="viewer">{m.share.viewer}</option>
                  <option value="editor">{m.share.editor}</option>
                </select>
              </li>
            ))}
          </ul>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn primary" onClick={onClose}>
            {m.common.close}
          </button>
        </div>
      </div>
    </Modal>
  )
}
