import { debugEntries, debugOn, downloadSupportPackage, setDebug } from '../debug'
import { useState } from 'react'
import { saveSettings } from '../db/db'
import { useSettings } from '../hooks'
import { LOCALE_NAMES, LOCALES, useI18n, type Locale } from '../i18n'
import { applyTheme, readTheme, type Theme } from '../theme'
import { Glyph } from '../ui/Glyph'
import { AccountSection, MembersSection } from './Account'
import { useMe } from '../session'

export function SettingsPage() {
  const { m, locale, setLocale } = useI18n()
  const settings = useSettings()
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [person, setPerson] = useState('')
  const me = useMe()

  return (
    <main style={{ maxWidth: 760 }}>
      <div className="page-head">
        <h1>{m.settings.title}</h1>
      </div>

      <AccountSection />
      {me.isAdmin && <MembersSection />}

      <section className="panel stack">
        <h2>{m.settings.language}</h2>
        <div className="seg" role="group" aria-label={m.settings.language}>
          {(Object.keys(LOCALES) as Locale[]).map((l) => (
            <button key={l} aria-pressed={locale === l} onClick={() => setLocale(l)} lang={l}>
              {LOCALE_NAMES[l]}
            </button>
          ))}
        </div>
      </section>

      <section className="panel stack">
        <h2>{m.settings.theme}</h2>
        <div className="seg" role="group" aria-label={m.settings.theme}>
          {(['system', 'light', 'dark'] as Theme[]).map((t) => (
            <button
              key={t}
              aria-pressed={theme === t}
              onClick={() => {
                setTheme(t)
                applyTheme(t)
              }}
            >
              {m.settings.themes[t]}
            </button>
          ))}
        </div>
      </section>

      <section className="panel stack">
        <h2>{m.settings.people}</h2>
        <p className="muted small">{m.settings.peopleHint}</p>
        <div className="chips">
          {settings.people.map((p) => (
            <span className="chip person" key={p}>
              {p}
              <button
                className="icon-btn sm"
                aria-label={`${m.common.delete}: ${p}`}
                title={m.common.delete}
                onClick={() => saveSettings({ people: settings.people.filter((x) => x !== p) })}
              >
                <Glyph name="close" />
              </button>
            </span>
          ))}
        </div>
        <form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault()
            const name = person.trim()
            if (!name || settings.people.includes(name)) return
            await saveSettings({ people: [...settings.people, name] })
            setPerson('')
          }}
        >
          <input
            className="input"
            style={{ maxWidth: 240 }}
            value={person}
            placeholder={m.settings.personPlaceholder}
            aria-label={m.settings.personPlaceholder}
            onChange={(e) => setPerson(e.target.value)}
          />
          <button className="btn" type="submit">
            {m.settings.addPerson}
          </button>
        </form>
      </section>

      <Troubleshooting />

      <section className="panel stack">
        <h2>{m.settings.about}</h2>
        <p>{m.settings.aboutText}</p>
        <label className="check">
          <input type="checkbox" checked={settings.whatsNew !== false} onChange={(e) => void saveSettings({ whatsNew: e.target.checked })} />
          {m.updates.showWhatsNew}
        </label>
        <p className="muted small">{m.settings.version(__APP_VERSION__)}</p>
      </section>
    </main>
  )
}

/** For finding out what goes wrong on this device (src/debug.ts). */
function Troubleshooting() {
  const { m } = useI18n()
  const [on, setOn] = useState(debugOn)
  const [count, setCount] = useState(() => debugEntries().length)
  return (
    <section className="panel stack" aria-labelledby="troubleshooting">
      <h2 id="troubleshooting">{m.debug.title}</h2>
      <p className="muted">{m.debug.text}</p>
      <label className="check">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setDebug(e.target.checked)
            setOn(e.target.checked)
            setCount(debugEntries().length)
          }}
        />
        {m.debug.log}
      </label>
      {on && <p className="muted small">{m.debug.entries(count)}</p>}
      <div className="row">
        <button type="button" className="btn" onClick={() => void downloadSupportPackage()}>
          <Glyph name="download" /> {m.debug.download}
        </button>
      </div>
      <p className="muted small">{m.debug.privacy}</p>
    </section>
  )
}
