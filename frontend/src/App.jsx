import { useState, useEffect, useCallback } from 'react'
import { Box } from '@mui/material'
import StartupScreen from './components/StartupScreen'
import Topbar from './components/Topbar'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Admin from './pages/Admin'
import Preferences from './pages/Preferences'
import SignInPage from './pages/SignIn'
import { useAuth } from './AuthContext'

const VALID_ROUTES = ['dashboard', 'settings', 'admin', 'preferences']

function getRoute() {
  const h = window.location.hash.slice(1)
  return VALID_ROUTES.includes(h) ? h : 'dashboard'
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [route, setRoute] = useState(getRoute)
  const { user, loading, signOut } = useAuth()

  useEffect(() => {
    const handler = () => setRoute(getRoute())
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  const navigate = useCallback((to) => {
    window.location.hash = to
    setRoute(to)
  }, [])

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
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      <Topbar route={route} navigate={navigate} user={user} onSignOut={signOut} />
      <Box component="main" sx={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {route === 'dashboard'   && <Dashboard />}
        {route === 'settings'    && <Settings />}
        {route === 'admin'       && <Admin />}
        {route === 'preferences' && <Preferences />}
      </Box>
    </Box>
  )
}
