import React, { useMemo } from 'react'
import ReactDOM from 'react-dom/client'
import { Box, Typography } from '@mui/material'
import { ClerkProvider } from '@clerk/clerk-react'
import App from './App'
import { AuthProvider } from './AuthContext'
import { ThemeContextProvider, useThemeContext } from './ThemeContext'
import ErrorBoundary from './components/ErrorBoundary'
import './App.css'

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || ''

// ThemedClerkProvider lives inside ThemeContextProvider so it can read the
// active mode and accent, then pass a dynamic appearance object to ClerkProvider.
function ThemedClerkProvider({ children }) {
  const { mode, accent } = useThemeContext()
  const isDark = mode === 'dark'

  const appearance = useMemo(() => ({
    theme: isDark ? 'dark' : 'light',
    variables: {
      colorPrimary: accent,
      colorPrimaryForeground: isDark ? '#111316' : '#ffffff',
      colorBackground: isDark ? '#111316' : '#ffffff',
      colorForeground: isDark ? '#ede8d0' : '#1a1814',
      colorNeutral: isDark ? '#2b2f37' : '#e8e2d8',
      colorMuted: isDark ? '#7a7060' : '#6b6050',
      colorInput: isDark ? '#16181d' : '#f5f0e8',
      colorInputForeground: isDark ? '#ede8d0' : '#1a1814',
      colorBorder: `${accent}2e`,
      colorRing: accent,
      colorModalBackdrop: 'rgba(0, 0, 0, 0.75)',
      fontFamily: 'Raleway, Cormorant Garamond, serif',
      borderRadius: '0.75rem',
      spacing: '1rem',
    },
    layout: { logoPlacement: 'inside' },
    elements: {
      card: {
        borderRadius: '1rem',
        backgroundColor: isDark ? '#111316' : '#ffffff',
        boxShadow: '0 24px 80px rgba(0,0,0,0.48)',
      },
      formButtonPrimary: {
        borderRadius: '0.75rem',
        backgroundColor: accent,
        color: isDark ? '#111316' : '#ffffff',
      },
      formButtonPrimary__hover: { backgroundColor: accent, filter: 'brightness(1.12)' },
      formButtonReset: { color: accent },
      formFieldInput: {
        backgroundColor: isDark ? '#141619' : '#f5f0e8',
        borderColor: `${accent}29`,
      },
    },
  }), [mode, accent, isDark])

  return (
    <ClerkProvider publishableKey={clerkPublishableKey} appearance={appearance}>
      {children}
    </ClerkProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeContextProvider>
      {clerkPublishableKey ? (
        <ErrorBoundary>
          <ThemedClerkProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ThemedClerkProvider>
        </ErrorBoundary>
      ) : (
        <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', px: 4 }}>
          <Box sx={{ maxWidth: 680, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '1.8rem', fontWeight: 700, color: 'text.primary', mb: 2 }}>
              Clerk configuration required
            </Typography>
            <Typography sx={{ color: 'text.secondary', lineHeight: 1.8 }}>
              No Clerk publishable key was found. Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> in{' '}
              <code>frontend/.env</code> and restart the dev server.
            </Typography>
          </Box>
        </Box>
      )}
    </ThemeContextProvider>
  </React.StrictMode>,
)
