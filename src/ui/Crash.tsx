/**
 * Catches whatever breaks while showing the app, so there is never a blank page. After an
 * update the cause is almost always the old version still running: then the app reloads once
 * by itself (src/freshness.ts). Otherwise it says so in both languages – it cannot rely on the
 * app's own texts, which may be what broke – and offers a reload.
 */
import { Component, type ReactNode } from 'react'
import { outdated, reloadOnce } from '../freshness'

export class Crash extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
    void outdated().then((old) => old && reloadOnce())
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="crash" role="alert">
        <img src="/favicon.svg" alt="" width={56} height={56} />
        <h1>Propario muss neu geladen werden</h1>
        <p lang="en">Propario needs to be reloaded.</p>
        <p className="muted">Deine Daten sind gespeichert. · Your data is saved.</p>
        <button type="button" className="btn primary" onClick={() => location.reload()}>
          Neu laden · Reload
        </button>
      </main>
    )
  }
}
