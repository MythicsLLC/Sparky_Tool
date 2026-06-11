import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { Box, CircularProgress } from '@mui/material'
import StartupScreen from './components/StartupScreen'
import Topbar from './components/Topbar'
import Dashboard from './pages/Dashboard'
import SignInPage from './pages/SignIn'
import ErrorBoundary from './components/ErrorBoundary'
import ShortcutsFab from './components/ShortcutsFab'
import { useAuth } from './AuthContext'

const Settings     = lazy(() => import('./pages/Settings'))
const Admin        = lazy(() => import('./pages/Admin'))
const Preferences  = lazy(() => import('./pages/Preferences'))
const SchedulesPage = lazy(() => import('./pages/SchedulesPage'))

function PageFallback() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 10 }}>
      <CircularProgress size={28} />
    </Box>
  )
}

const VALID_ROUTES = ['dashboard', 'settings', 'admin', 'preferences', 'schedules']
const KEEP_ALIVE_MS = 10 * 60 * 1000  // ping every 10 min; Render sleeps after 15

function getRoute() {
  const h = window.location.hash.slice(1)
  return VALID_ROUTES.includes(h) ? h : 'dashboard'
}

export default function App() {
  const [ready,          setReady]          = useState(false)
  const [route,          setRoute]          = useState(getRoute)
  const [shortcutsOpen,  setShortcutsOpen]  = useState(false)
  const { user, loading, signOut } = useAuth()

  useEffect(() => {
    const handler = () => setRoute(getRoute())
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  // Keep the Render backend awake while the tab is open
  useEffect(() => {
    const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
    const ping = () => fetch(`${base}/api/ping`).catch((e) => console.debug('[keep-alive] ping failed:', e.message))
    const id = setInterval(ping, KEEP_ALIVE_MS)
    return () => clearInterval(id)
  }, [])

  const navigate = useCallback((to) => {
    window.location.hash = to
    setRoute(to)
  }, [])

  // Global keyboard shortcuts — G+key navigation chord and ? cheatsheet
  useEffect(() => {
    if (!user) return
    let pendingG = false
    let gTimer   = null
    const NAV = { d: 'dashboard', c: 'settings', h: 'schedules', a: 'admin', p: 'preferences' }

    const onKey = (e) => {
      const tag = document.activeElement?.tagName ?? ''
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return
      if (e.key === '?') { setShortcutsOpen((v) => !v); return }

      if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey) {
        pendingG = true
        clearTimeout(gTimer)
        gTimer = setTimeout(() => { pendingG = false }, 1200)
        return
      }
      if (pendingG) {
        pendingG = false
        clearTimeout(gTimer)
        const dest = NAV[e.key.toLowerCase()]
        if (dest) { e.preventDefault(); navigate(dest) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(gTimer) }
  }, [user, navigate])

  // Keep the startup screen visible until BOTH the backend health check passes
  // (ready) AND Clerk auth has finished resolving (loading). This prevents a
  // plain spinner flash between the branded screen and the real UI.
  if (!ready || loading) {
    return (
      <StartupScreen
        onReady={() => setReady(true)}
        authLoading={ready && loading}
      />
    )
  }

  if (!user) return <SignInPage />

  return (
    <ErrorBoundary>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
        <Topbar route={route} navigate={navigate} user={user} onSignOut={signOut} />
        <Box component="main" sx={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          <ErrorBoundary>
            <Suspense fallback={<PageFallback />}>
              {route === 'dashboard'   && <Dashboard />}
              {route === 'settings'    && <Settings />}
              {route === 'admin'       && <Admin />}
              {route === 'preferences' && <Preferences />}
              {route === 'schedules'   && <SchedulesPage />}
            </Suspense>
          </ErrorBoundary>
        </Box>
      </Box>
      <ShortcutsFab
        open={shortcutsOpen}
        onOpen={() => setShortcutsOpen(true)}
        onClose={() => setShortcutsOpen(false)}
      />
    </ErrorBoundary>
  )
}
