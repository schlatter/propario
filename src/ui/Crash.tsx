/**
 * Catches whatever breaks while showing the app, so there is never a blank page. After an
 * update the cause is almost always the old version still running: then the app reloads once
 * by itself (src/freshness.ts). Otherwise it says so in both languages – it cannot rely on the
 * app's own texts, which may be what broke – reports the error with a reference that is also
 * in the server log, and offers a reload or resetting this browser's copy (/reset.html).
 */
import { Component, type ReactNode } from 'react'
import { errorText, report } from '../diagnostics'
import { outdated, reloadOnce } from '../freshness'

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
    return (
      <main className="crash" role="alert">
        <img src="/favicon.svg" alt="" width={56} height={56} />
        <h1>Propario muss neu geladen werden</h1>
        <p lang="en">Propario needs to be reloaded.</p>
        <p className="muted">Deine Daten sind gespeichert. · Your data is saved.</p>
        <div className="row crash-actions">
          <button type="button" className="btn primary" onClick={() => location.reload()}>
            Neu laden · Reload
          </button>
          <a className="btn" href="/reset.html">
            Browser zurücksetzen · Reset
          </a>
        </div>
        <details className="crash-details">
          <summary>Details · Referenz {this.state.ref}</summary>
          <pre className="small">{errorText(this.state.error)}</pre>
          <p className="small">{__APP_VERSION__}</p>
        </details>
      </main>
    )
  }
}
