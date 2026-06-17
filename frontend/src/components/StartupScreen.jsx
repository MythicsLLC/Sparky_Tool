import { useState, useEffect, useRef, useCallback } from 'react'
import { Box, Typography, Button } from '@mui/material'
import SparkyDog from '../assets/SparkyDog'
import SparkyWordmark from './SparkyWordmark'
import MythicsLogo from '../assets/MythicsLogo'
import LogoReveal from './LogoReveal'
import WifiOffIcon from '@mui/icons-material/WifiOff'
import { checkHealth } from '../api'
import { useThemeContext } from '../ThemeContext'

const MAX_ATTEMPTS = 5
const RETRY_MS = 2000

// authLoading=true means the backend health check already passed; we're now
// waiting for Clerk auth to resolve. Skip health checks, show a different status.
export default function StartupScreen({ onReady, authLoading = false }) {
  const { accent } = useThemeContext()
  const [status, setStatus] = useState('checking')
  const timer = useRef(null)

  // ── Health check (skipped when authLoading — backend already confirmed OK) ──
  const runCheck = useCallback(() => {
    if (authLoading) return
    clearTimeout(timer.current)
    setStatus('checking')
    let attempts = 0
    const attempt = async () => {
      try {
        const res = await checkHealth()
        if (res.data?.status === 'ok') { onReady(); return }
        throw new Error('bad')
      } catch {
        attempts += 1
        if (attempts >= MAX_ATTEMPTS) setStatus('error')
        else timer.current = setTimeout(attempt, RETRY_MS)
      }
    }
    attempt()
  }, [onReady, authLoading])

  useEffect(() => {
    if (!authLoading) runCheck()
    return () => clearTimeout(timer.current)
  }, [runCheck, authLoading])

  const isError = !authLoading && status === 'error'

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      bgcolor: 'background.default',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle diagonal pattern */}
      <Box sx={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: `repeating-linear-gradient(135deg, ${accent}08 0px, ${accent}08 1px, transparent 1px, transparent 60px)`,
      }} />

      {/* Corner marks */}
      {[
        { top: 32, left: 32, borderTop: '1px solid', borderLeft: '1px solid' },
        { top: 32, right: 32, borderTop: '1px solid', borderRight: '1px solid' },
        { bottom: 32, left: 32, borderBottom: '1px solid', borderLeft: '1px solid' },
        { bottom: 32, right: 32, borderBottom: '1px solid', borderRight: '1px solid' },
      ].map((s, i) => (
        <Box key={i} sx={{ position: 'absolute', zIndex: 1, width: 24, height: 24, borderColor: `${accent}33`, ...s }} />
      ))}

      {/* All central content sits above the canvas */}
      <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Brand header — Mythics logo + Sparky Tool side by side */}
        <Box sx={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
          mb: 4,
          '@keyframes fadeIn': { from: { opacity: 0 }, to: { opacity: 1 } },
          animation: 'fadeIn 0.8s ease 0s both',
        }}>
          <MythicsLogo width={38} />

          {/* Vertical divider */}
          <Box sx={{
            width: '1px',
            height: 48,
            background: `linear-gradient(180deg, transparent, ${accent}55, transparent)`,
            flexShrink: 0,
          }} />

          {/* Sparky Tool wordmark */}
          <Box sx={{ textAlign: 'left' }}>
            <Typography component="div" sx={{
              fontFamily: '"Cormorant Garamond", serif',
              fontSize: '1.9rem',
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              lineHeight: 1.1,
              userSelect: 'none',
            }}>
              <Box component="span" sx={{ color: 'text.primary' }}>
                <SparkyWordmark text="Sparky" accent={accent} />
              </Box>
              <span style={{ display: 'inline-block', width: '0.3em' }} />
              <Box component="span" sx={{ color: accent }}>
                <SparkyWordmark text="Tool" accent={accent} />
              </Box>
            </Typography>
            <Typography sx={{
              fontFamily: '"Raleway", sans-serif',
              fontSize: '0.52rem',
              fontWeight: 400,
              letterSpacing: '0.38em',
              color: 'text.disabled',
              textTransform: 'uppercase',
              mt: 0.5,
            }}>
              Analytics Platform
            </Typography>
          </Box>
        </Box>

        {/* Logo reveal — hover to paint colour into the ghost outline */}
        <Box sx={{ mb: 4, mt: 1 }}>
          {isError
            ? <WifiOffIcon sx={{ fontSize: 56, color: 'rgba(143,74,74,0.6)' }} />
            : <LogoReveal width={320} height={180} revealRadius={160} />
          }
        </Box>

        {/* Rule */}
        <Box sx={{
          width: 180, height: '1px',
          background: `linear-gradient(90deg, transparent, ${accent}4d, transparent)`,
          mb: 4,
          animation: 'fadeIn 0.8s ease 0.2s both',
        }} />

        {/* Status */}
        {isError ? (
          <Box sx={{ textAlign: 'center', animation: 'fadeIn 0.5s ease both' }}>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.65rem', letterSpacing: '0.2em', color: '#8f4a4a', textTransform: 'uppercase', mb: 1 }}>
              System Offline
            </Typography>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.75rem', color: 'text.disabled', mb: 3, maxWidth: 320 }}>
              Cannot reach the backend. Make sure the server is running and try again.
            </Typography>
            <Button
              onClick={runCheck}
              variant="outlined"
              sx={{
                color: accent,
                borderColor: `${accent}4d`,
                borderRadius: '1px',
                fontFamily: '"Raleway", sans-serif',
                fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.16em',
                '&:hover': { borderColor: accent, bgcolor: `${accent}0a` },
              }}
            >
              Retry Connection
            </Button>
          </Box>
        ) : (
          <Box sx={{ textAlign: 'center', animation: 'fadeIn 0.8s ease 0.7s both' }}>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.62rem', letterSpacing: '0.22em', color: 'text.disabled', textTransform: 'uppercase', mb: 2 }}>
              {authLoading ? 'Authenticating your session…' : 'Connecting to backend…'}
            </Typography>
            {/* Dot row loader */}
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Box key={i} sx={{
                  width: 3, height: 3,
                  bgcolor: authLoading ? `${accent}99` : accent,
                  '@keyframes dotPulse': {
                    '0%,100%': { opacity: 0.1, transform: 'scaleY(1)' },
                    '50%': { opacity: 1, transform: 'scaleY(2)' },
                  },
                  animation: `dotPulse 1.4s ease-in-out ${i * 0.15}s infinite`,
                }} />
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  )
}
