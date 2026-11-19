import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes, Link, useLocation } from 'react-router-dom'
import { ApiError } from './api'
import { I18nProvider, useI18n } from './i18n'
import { SessionProvider, useSession } from './session'
import { ConfirmProvider, ToastProvider, useToast } from './ui/Dialog'
import { JoinPage, SignInPage } from './pages/Auth'
import { UpdateNotice, WhatsNew } from './ui/Updates'
import { Glyph } from './ui/Glyph'
import { Menu } from './ui/Menu'
import { TopbarSlot } from './ui/Topbar'
import { HomePage } from './pages/Home'
import { ProjectPage } from './pages/Project'
import { ComparePage } from './pages/Compare'
import { SwipePage } from './pages/Swipe'
import { BackupPage } from './pages/Backup'
import { SharePage } from './pages/Share'
import { SettingsPage } from './pages/Settings'

// The importer pulls in the spreadsheet library; load it only when needed.
const ImportPage = lazy(() => import('./pages/Import').then((x) => ({ default: x.ImportPage })))
const MergePage = lazy(() => import('./pages/Merge').then((x) => ({ default: x.MergePage })))

export function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <SessionProvider>
            <BrowserRouter>
              <Gate />
            </BrowserRouter>
          </SessionProvider>
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  )
}

/** Signed out: only the sign-in and join pages. Signed in: the app. */
function Gate() {
  const { state } = useSession()
  const location = useLocation()
  if (state.status === 'loading') return <main id="main" aria-busy="true" />
  if (state.status === 'signed-out') {
    if (location.pathname === '/join') return <JoinPage />
    return <SignInPage setupNeeded={state.setupNeeded} />
  }
  if (location.pathname === '/join') return <Navigate to="/" replace />
  return <Shell />
}

/** A change the server refused or could not receive must never pass silently. */
function SaveErrors() {
  const { m } = useI18n()
  const toast = useToast()
  useEffect(() => {
    const onError = (e: PromiseRejectionEvent) => {
      const err = e.reason
      if (!(err instanceof ApiError)) return
      e.preventDefault()
      if (err.status === 401) return // the session provider shows the sign-in page
      toast(err.code === 'offline' ? m.errors.offline : err.status === 403 ? m.errors.forbidden : err.status === 404 ? m.errors.notFound : m.errors.generic)
    }
    window.addEventListener('unhandledrejection', onError)
    return () => window.removeEventListener('unhandledrejection', onError)
  }, [m, toast])
  return null
}

/**
 * One slim bar: the menu (a vertical list of the sections), the Propario mark, and whatever the
 * page puts into the slot (on a comparison: its name, category and actions). The language is
 * chosen in Settings.
 */
function Shell() {
  const { m } = useI18n()
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  return (
    <div className="shell">
      <SaveErrors />
      <WhatsNew />
      <header className="topbar">
        <Menu label={m.nav.menu} className="icon-btn nav-toggle" listClassName="nav-menu" trigger={<Glyph name="menu" />}>
          {(close) => (
            <nav aria-label={m.nav.menu}>
              <NavLink to="/" end onClick={close}>
                {m.nav.comparisons}
              </NavLink>
              <NavLink to="/import" onClick={close}>
                {m.nav.import}
              </NavLink>
              <NavLink to="/backup" onClick={close}>
                {m.nav.backup}
              </NavLink>
              <NavLink to="/settings" onClick={close}>
                {m.nav.settings}
              </NavLink>
            </nav>
          )}
        </Menu>
        <Link to="/" className="brand" aria-label={m.app.name}>
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="brand-text">{m.app.name}</span>
        </Link>
        <div className="topbar-slot" ref={setSlot} />
      </header>
      <UpdateNotice />
      <TopbarSlot.Provider value={slot}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/p/:id" element={<ProjectPage />} />
          <Route path="/p/:id/compare" element={<ComparePage />} />
          <Route path="/p/:id/swipe" element={<SwipePage />} />
          <Route
            path="/p/:id/merge"
            element={
              <Suspense fallback={<main aria-busy="true" />}>
                <MergePage />
              </Suspense>
            }
          />
          <Route
            path="/import"
            element={
              <Suspense fallback={<main aria-busy="true" />}>
                <ImportPage />
              </Suspense>
            }
          />
          <Route path="/backup" element={<BackupPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/share" element={<SharePage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </TopbarSlot.Provider>
    </div>
  )
}
