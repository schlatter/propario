import { useEffect, useState } from 'react'
import { api, ApiError } from '../api'
import { useI18n } from '../i18n'
import { addPasskey, useMe, useSession } from '../session'
import { useConfirm, useToast } from '../ui/Dialog'
import { Glyph } from '../ui/Glyph'
import { CommitInput, Field } from '../ui/inputs'
import { RecoveryKeyNotice } from './Auth'

const iso = (ms: number) => new Date(ms).toISOString()

interface Passkey {
  id: string
  createdAt: number
  lastUsedAt: number | null
}

export function AccountSection() {
  const { m, fmt } = useI18n()
  const me = useMe()
  const { refresh, signOut } = useSession()
  const confirm = useConfirm()
  const toast = useToast()
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [error, setError] = useState('')

  const loadPasskeys = () => api<Passkey[]>('/api/passkeys').then(setPasskeys)
  useEffect(() => {
    void loadPasskeys()
  }, [])

  return (
    <>
      <section className="panel stack" aria-labelledby="account-title">
        <h2 id="account-title">{m.account.title}</h2>
        <Field label={m.account.name}>
          <CommitInput
            className="input"
            style={{ maxWidth: 320 }}
            value={me.name}
            maxLength={60}
            onCommit={async (v) => {
              if (!v.trim() || v.trim() === me.name) return
              await api('/api/me', { method: 'PATCH', body: { name: v.trim() } })
              await refresh()
            }}
          />
        </Field>
        <p className="muted small">{m.account.nameHint}</p>

        <h3>{m.account.passkeys}</h3>
        <p className="muted small">{m.account.passkeysHint}</p>
        <ul className="plain-list">
          {passkeys.map((p, i) => (
            <li key={p.id} className="row">
              <span>
                <Glyph name="check" /> {m.account.passkeyLabel(i + 1)} · {m.account.passkeyAdded(fmt.date(iso(p.createdAt)))}
                {p.lastUsedAt && <span className="muted"> · {m.account.passkeyUsed(fmt.date(iso(p.lastUsedAt)))}</span>}
              </span>
              <span className="spacer" />
              {passkeys.length > 1 && (
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={async () => {
                    await api(`/api/passkeys/${encodeURIComponent(p.id)}`, { method: 'DELETE' })
                    await loadPasskeys()
                  }}
                >
                  {m.account.removePasskey}
                </button>
              )}
            </li>
          ))}
        </ul>
        <div>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              setError('')
              try {
                await addPasskey()
                toast(m.account.passkeyDone)
                await loadPasskeys()
              } catch (e) {
                const name = (e as Error)?.name
                setError(
                  name === 'NotAllowedError' || name === 'AbortError'
                    ? m.auth.errors.cancelled
                    : name === 'InvalidStateError'
                      ? m.account.passkeyDone
                      : m.auth.errors.generic,
                )
              }
            }}
          >
            <Glyph name="plus" /> {m.account.addPasskey}
          </button>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        <h3>{m.account.recovery}</h3>
        <p className="muted small">{m.account.recoveryHint}</p>
        {recoveryKey ? (
          <RecoveryKeyNotice recoveryKey={recoveryKey} text={m.auth.recoveryText} onDone={() => setRecoveryKey(null)} />
        ) : (
          <div>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                if (!(await confirm({ title: m.account.newRecovery, text: m.account.newRecoveryConfirm, confirmLabel: m.account.newRecovery }))) return
                setRecoveryKey((await api<{ recoveryKey: string }>('/api/me/recovery-key', { method: 'POST', body: {} })).recoveryKey)
              }}
            >
              {m.account.newRecovery}
            </button>
          </div>
        )}

        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" className="btn" onClick={() => void signOut()}>
            {m.account.signOut}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={async () => {
              await api('/api/me/sign-out-everywhere', { method: 'POST', body: {} })
              await signOut()
            }}
          >
            {m.account.signOutEverywhere}
          </button>
        </div>
      </section>

      <section className="panel stack" aria-labelledby="delete-title">
        <h2 id="delete-title">{m.account.deleteTitle}</h2>
        <p className="muted small">{m.account.deleteHint}</p>
        <form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault()
            await api('/api/me', { method: 'DELETE', body: { confirm: confirmName } })
            await signOut()
          }}
        >
          <Field label={m.account.deleteConfirmLabel(me.name)}>
            <input className="input" style={{ maxWidth: 260 }} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />
          </Field>
          <button type="submit" className="btn danger" disabled={confirmName !== me.name} style={{ alignSelf: 'flex-end' }}>
            {m.account.deleteButton}
          </button>
        </form>
      </section>
    </>
  )
}

interface Member {
  id: string
  name: string
  isAdmin: boolean
}
interface Invite {
  id: string
  label: string
  expiresAt: number
}

/** Administrators invite people and remove accounts. */
export function MembersSection() {
  const { m, fmt } = useI18n()
  const me = useMe()
  const confirm = useConfirm()
  const toast = useToast()
  const [people, setPeople] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [label, setLabel] = useState('')
  const [link, setLink] = useState<string | null>(null)

  const load = () =>
    Promise.all([api<Member[]>('/api/users'), api<Invite[]>('/api/invites')]).then(([u, i]) => {
      setPeople(u)
      setInvites(i)
    })
  useEffect(() => {
    void load()
  }, [])

  return (
    <section className="panel stack" aria-labelledby="members-title">
      <h2 id="members-title">{m.members.title}</h2>
      <p className="muted small">{m.members.hint}</p>
      <ul className="plain-list">
        {people.map((p) => (
          <li key={p.id} className="row">
            <span>
              {p.name}
              {p.isAdmin && <span className="muted"> · {m.members.admin}</span>}
              {p.id === me.id && <span className="muted"> · {m.members.you}</span>}
            </span>
            <span className="spacer" />
            {p.id !== me.id && (
              <button
                type="button"
                className="btn sm ghost"
                onClick={async () => {
                  if (!(await confirm({ title: m.members.remove, text: m.members.removeConfirm(p.name), confirmLabel: m.members.remove, danger: true }))) return
                  await api(`/api/users/${p.id}`, { method: 'DELETE' })
                  await load()
                }}
              >
                {m.members.remove}
              </button>
            )}
          </li>
        ))}
      </ul>

      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            const r = await api<{ link: string }>('/api/invites', { body: { label } })
            setLink(r.link)
            setLabel('')
            await load()
          } catch (err) {
            if (err instanceof ApiError) toast(m.auth.errors.generic)
          }
        }}
      >
        <Field label={m.members.inviteLabel}>
          <input className="input" style={{ maxWidth: 240 }} value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <button type="submit" className="btn primary" style={{ alignSelf: 'flex-end' }}>
          <Glyph name="plus" /> {m.members.invite}
        </button>
      </form>
      {link && (
        <div className="invite-box stack" role="status">
          <p>{m.members.inviteCreated}</p>
          <output className="recovery-key small-key">{link}</output>
          <div>
            <button
              type="button"
              className="btn sm"
              onClick={async () => {
                await navigator.clipboard?.writeText(link)
                toast(m.members.copied)
              }}
            >
              <Glyph name="copy" /> {m.members.copy}
            </button>
          </div>
        </div>
      )}
      {invites.length > 0 && (
        <>
          <h3>{m.members.openInvites}</h3>
          <ul className="plain-list">
            {invites.map((i) => (
              <li key={i.id} className="row">
                <span>
                  {i.label || '—'} <span className="muted">· {m.members.expires(fmt.date(iso(i.expiresAt)))}</span>
                </span>
                <span className="spacer" />
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={async () => {
                    await api(`/api/invites/${i.id}`, { method: 'DELETE' })
                    await load()
                  }}
                >
                  {m.members.revoke}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
