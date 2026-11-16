import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes, Link, useLocation } from 'react-router-dom'
import { ApiError } from './api'
import { I18nProvider, LOCALE_NAMES, LOCALES, useI18n, type Locale } from './i18n'
import { SessionProvider, useSession } from './session'
import { ConfirmProvider, ToastProvider, useToast } from './ui/Dialog'
import { JoinPage, SignInPage } from './pages/Auth'
import { UpdateNotice, WhatsNew } from './ui/Updates'
import { HomePage } from './pages/Home'
import { ProjectPage } from './pages/Project'
import { ComparePage } from './pages/Compare'
import { BackupPage } from './pages/Backup'
import { SettingsPage } from './pages/Settings'

// The importer pulls in the spreadsheet library; load it only when needed.
const ImportPage = lazy(() => import('./pages/Import').then((x) => ({ default: x.ImportPage })))

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

function Shell() {
  const { m, locale, setLocale } = useI18n()
  return (
    <div className="shell">
      <SaveErrors />
      <WhatsNew />
      <header className="topbar">
        <Link to="/" className="brand" aria-label={m.app.name}>
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="brand-text">{m.app.name}</span>
        </Link>
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end>
            {m.nav.comparisons}
          </NavLink>
          <NavLink to="/import">{m.nav.import}</NavLink>
          <NavLink to="/backup">{m.nav.backup}</NavLink>
          <NavLink to="/settings">{m.nav.settings}</NavLink>
        </nav>
        <div className="lang" role="group" aria-label={m.nav.language}>
          {(Object.keys(LOCALES) as Locale[]).map((l) => (
            <button key={l} type="button" aria-pressed={locale === l} onClick={() => setLocale(l)} title={LOCALE_NAMES[l]} lang={l}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
      <UpdateNotice />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/p/:id" element={<ProjectPage />} />
        <Route path="/p/:id/compare" element={<ComparePage />} />
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
        <Route path="*" element={<HomePage />} />
      </Routes>
    </div>
  )
}
