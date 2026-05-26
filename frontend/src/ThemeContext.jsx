import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import sparkyPng from './assets/sparky-dog.png'

// ── Accent presets ─────────────────────────────────────────────────────────
// Sparky amber is first and is the dark-mode default.
export const ACCENT_OPTIONS = [
  { label: 'Sparky',   value: '#E89918' },
  { label: 'Gold',     value: '#c9a84c' },
  { label: 'Sapphire', value: '#4c7fc9' },
  { label: 'Emerald',  value: '#4cc97f' },
  { label: 'Rose',     value: '#c94c7f' },
  { label: 'Slate',    value: '#8c9ab0' },
]

// Dark and light modes each store their own accent so switching modes
// keeps both preferences independently.
const LS_MODE         = 'sparky_theme_mode'
const LS_ACCENT_DARK  = 'sparky_theme_accent_dark'
const LS_ACCENT_LIGHT = 'sparky_theme_accent_light'

// ── Dynamic favicon ────────────────────────────────────────────────────────
// Draws the Sparky dog on a 64×64 canvas with an accent-coloured outer ring
// and injects / updates <link rel="icon"> so the tab icon tracks the theme.
function updateFavicon(accentColor) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    const N = 64
    const canvas = document.createElement('canvas')
    canvas.width  = N
    canvas.height = N
    const ctx = canvas.getContext('2d')
    ctx.beginPath()
    ctx.arc(N / 2, N / 2, N / 2, 0, Math.PI * 2)
    ctx.fillStyle = accentColor
    ctx.fill()
    ctx.save()
    ctx.beginPath()
    ctx.arc(N / 2, N / 2, N / 2 - 4, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(img, 4, 4, N - 8, N - 8)
    ctx.restore()
    let link = document.querySelector("link[rel~='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel  = 'icon'
      link.type = 'image/png'
      document.head.appendChild(link)
    }
    link.href = canvas.toDataURL('image/png')
  }
  img.src = sparkyPng
}

// ── Theme builder ──────────────────────────────────────────────────────────
function buildTheme(mode, accent) {
  const dark = mode === 'dark'
  return createTheme({
    palette: {
      mode,
      primary:    { main: accent, dark: accent, light: accent },
      secondary:  { main: dark ? '#7a7060' : '#6b6050' },
      background: {
        default: dark ? '#0b0c0e' : '#f5f3ef',
        paper:   dark ? '#111316' : '#ffffff',
      },
      text: {
        primary:   dark ? '#ede8d0' : '#1a1814',
        secondary: dark ? '#7a7060' : '#6b6050',
        disabled:  dark ? '#3a3428' : '#b0a898',
      },
      // Dividers derive from the accent so they subtly match the active colour.
      divider:    dark ? `${accent}1a` : `${accent}22`,
      success:    { main: '#6b8f71' },
      error:      { main: '#8f4a4a' },
      warning:    { main: accent },
    },
    typography: {
      fontFamily: '"Raleway", "Cormorant Garamond", serif',
      h3: { fontFamily: '"Cormorant Garamond", serif', fontWeight: 700 },
      h4: { fontFamily: '"Cormorant Garamond", serif', fontWeight: 600 },
      h5: { fontFamily: '"Cormorant Garamond", serif', fontWeight: 600 },
      h6: { fontFamily: '"Cormorant Garamond", serif', fontWeight: 600 },
      button: { fontFamily: '"Raleway", sans-serif', fontWeight: 700, letterSpacing: '0.1em' },
    },
    shape: { borderRadius: 1 },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 2,
            backgroundImage: 'none',
            border: `1px solid ${dark ? `${accent}14` : `${accent}1c`}`,
          },
        },
      },
      MuiPaper: {
        styleOverrides: { root: { borderRadius: 2, backgroundImage: 'none' } },
      },
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 1, textTransform: 'none', fontWeight: 700, letterSpacing: '0.1em' },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 2,
            border: `1px solid ${dark ? `${accent}2e` : `${accent}24`}`,
            backgroundImage: 'none',
            background: dark ? '#111316' : '#ffffff',
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: dark ? `${accent}12` : `${accent}1c`,
            fontFamily: '"Raleway", sans-serif',
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              '& fieldset': { borderColor: `${accent}33` },
              '&:hover fieldset': { borderColor: `${accent}66` },
              '&.Mui-focused fieldset': { borderColor: accent },
            },
            '& .MuiInputLabel-root': { color: dark ? '#7a7060' : '#6b6050' },
            '& .MuiInputLabel-root.Mui-focused': { color: accent },
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-notchedOutline': { borderColor: `${accent}33` },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: `${accent}66` },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: accent },
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: 2, fontFamily: '"Raleway", sans-serif' },
        },
      },
      MuiAppBar: {
        styleOverrides: { root: { backgroundImage: 'none' } },
      },
    },
  })
}

// ── Context ────────────────────────────────────────────────────────────────
const ThemeCtx = createContext(null)

export function ThemeContextProvider({ children }) {
  const [mode,         setMode]         = useState(() => localStorage.getItem(LS_MODE)         || 'dark')
  const [accentDark,   setAccentDarkS]  = useState(() => localStorage.getItem(LS_ACCENT_DARK)  || '#E89918')
  const [accentLight,  setAccentLightS] = useState(() => localStorage.getItem(LS_ACCENT_LIGHT) || '#C9A84C')

  // The active accent is always the one that matches the current mode.
  const accent = mode === 'dark' ? accentDark : accentLight

  const theme = useMemo(() => buildTheme(mode, accent), [mode, accent])

  // Update the browser-tab favicon whenever the effective accent changes.
  useEffect(() => { updateFavicon(accent) }, [accent])

  const toggleMode = () => {
    const next = mode === 'dark' ? 'light' : 'dark'
    setMode(next)
    localStorage.setItem(LS_MODE, next)
  }

  // Changes the accent only for the currently active mode.
  const setAccentColor = (color) => {
    if (mode === 'dark') {
      setAccentDarkS(color)
      localStorage.setItem(LS_ACCENT_DARK, color)
    } else {
      setAccentLightS(color)
      localStorage.setItem(LS_ACCENT_LIGHT, color)
    }
  }

  return (
    <ThemeCtx.Provider value={{ mode, accent, accentDark, accentLight, toggleMode, setAccentColor }}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeCtx.Provider>
  )
}

export function useThemeContext() {
  const ctx = useContext(ThemeCtx)
  if (!ctx) throw new Error('useThemeContext must be used inside ThemeContextProvider')
  return ctx
}
