/**
 * Catches whatever breaks while showing the app, so there is never a blank page. After an
 * update the cause is almost always the old version still running: then the app reloads once
 * by itself (src/freshness.ts). Otherwise it says so in its own words – it cannot rely on the
 * app's texts, which may be what broke – reports the error with a reference that is also
 * in the server log, and offers a reload or resetting this browser's copy (/reset.html).
 */
import { Component, type ReactNode } from 'react'
import { errorText, report } from '../diagnostics'
import { downloadSupportPackage } from '../debug'
import { outdated, reloadOnce } from '../freshness'
import { initialLocale } from '../i18n/active'
import { asset } from '../site'

export class Crash extends Component<{ children: ReactNode }, { error: unknown; ref: string } | { error: null; ref: '' }> {
  state = { error: null, ref: '' } as { error: unknown; ref: string }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
    this.setState({ ref: report('crash', error) })
    void outdated().then((old) => old && reloadOnce())
  }

  render() {
    if (this.state.error === null) return this.props.children
    // Own words in the person's language: the app's texts may be what broke.
    const de = initialLocale() === 'de'
    return (
      <main className="crash" role="alert" lang={de ? 'de' : 'en'}>
        <img src={asset('favicon.svg')} alt="" width={56} height={56} />
        <h1>{de ? 'Propario muss neu geladen werden' : 'Propario needs to be reloaded'}</h1>
        <p className="muted">{de ? 'Deine Daten sind gespeichert.' : 'Your data is saved.'}</p>
        <div className="row crash-actions">
          <button type="button" className="btn primary" onClick={() => location.reload()}>
            {de ? 'Neu laden' : 'Reload'}
          </button>
          <a className="btn" href={asset('reset.html')}>
            {de ? 'Browser zurücksetzen' : 'Reset this browser'}
          </a>
        </div>
        <details className="crash-details">
          <summary>
            {de ? 'Details · Referenz' : 'Details · reference'} {this.state.ref}
          </summary>
          <pre className="small">{errorText(this.state.error)}</pre>
          <p className="small">{__APP_VERSION__}</p>
          <button type="button" className="btn sm" onClick={() => void downloadSupportPackage()}>
            {de ? 'Support-Paket herunterladen' : 'Download support package'}
          </button>
        </details>
      </main>
    )
  }
}
