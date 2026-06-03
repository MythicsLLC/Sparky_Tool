import { useState, useEffect, useRef, useCallback } from 'react'
import { Box, Typography, Button } from '@mui/material'
import SparkyDog from '../assets/SparkyDog'
import MythicsLogo from '../assets/MythicsLogo'
import WifiOffIcon from '@mui/icons-material/WifiOff'
import { checkHealth } from '../api'
import { useThemeContext } from '../ThemeContext'

const MAX_ATTEMPTS = 5
const RETRY_MS = 2000
const PARTICLE_COUNT = 120
const REPEL_RADIUS = 100
const MAX_SPEED = 3

function randomBetween(a, b) { return a + Math.random() * (b - a) }

function makeParticle(w, h) {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: randomBetween(-0.4, 0.4),
    vy: randomBetween(-0.4, 0.4),
    r: randomBetween(1, 2.5),
    opacity: randomBetween(0.2, 0.6),
  }
}

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// authLoading=true means the backend health check already passed; we're now
// waiting for Clerk auth to resolve. Skip health checks, show a different status.
export default function StartupScreen({ onReady, authLoading = false }) {
  const { accent } = useThemeContext()
  const [status, setStatus] = useState('checking')
  const timer = useRef(null)
  const canvasRef = useRef(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const accentRef = useRef(accent)
  const rafRef = useRef(null)

  // Keep accentRef in sync so the canvas loop always draws with the live accent
  accentRef.current = accent

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

  // ── Particle canvas ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()

    const particles = Array.from({ length: PARTICLE_COUNT }, () =>
      makeParticle(canvas.width, canvas.height)
    )

    const onMouseMove = (e) => { mouseRef.current = { x: e.clientX, y: e.clientY } }
    const onMouseLeave = () => { mouseRef.current = { x: -9999, y: -9999 } }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseleave', onMouseLeave)
    window.addEventListener('resize', resize)

    const draw = () => {
      const { width, height } = canvas
      const mouse = mouseRef.current
      const [r, g, b] = hexToRgb(accentRef.current)

      ctx.clearRect(0, 0, width, height)

      for (const p of particles) {
        // Mouse repulsion
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < REPEL_RADIUS && dist > 0) {
          const force = (REPEL_RADIUS - dist) * 0.04
          p.vx += (dx / dist) * force
          p.vy += (dy / dist) * force
        }

        // Cap speed
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        if (speed > MAX_SPEED) {
          p.vx = (p.vx / speed) * MAX_SPEED
          p.vy = (p.vy / speed) * MAX_SPEED
        }

        // Move + wrap edges
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) p.x += width
        if (p.x > width) p.x -= width
        if (p.y < 0) p.y += height
        if (p.y > height) p.y -= height

        // Draw
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.opacity})`
        ctx.fill()
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('resize', resize)
    }
  }, [])

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
      {/* Particle canvas — behind everything */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

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
            <Typography sx={{
              fontFamily: '"Cormorant Garamond", serif',
              fontSize: '1.9rem',
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: 'text.primary',
              textTransform: 'uppercase',
              lineHeight: 1.1,
            }}>
              Sparky <Box component="span" sx={{ color: accent }}>Tool</Box>
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

        {/* Center icon */}
        <Box sx={{ position: 'relative', mb: 5 }}>
          {/* Outer square frame */}
          <Box sx={{
            width: 130, height: 130,
            border: `1px solid ${accent}26`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
            '&::before': {
              content: '""', position: 'absolute', inset: -8,
              border: `1px solid ${accent}0f`,
            },
          }}>
            {/* Inner rotating square */}
            <Box sx={{
              position: 'absolute', inset: 20,
              border: `1px solid ${accent}33`,
              '@keyframes rotateSq': { to: { transform: 'rotate(45deg)' } },
              animation: isError ? 'none' : 'rotateSq 8s linear infinite',
            }} />

            {isError
              ? <WifiOffIcon sx={{ fontSize: 40, color: 'rgba(143,74,74,0.7)', zIndex: 1 }} />
              : (
                <Box sx={{
                  zIndex: 1,
                  borderRadius: '50%',
                  '@keyframes goldBreathe': {
                    '0%,100%': { filter: `drop-shadow(0 0 4px ${accent}4d)` },
                    '50%': { filter: `drop-shadow(0 0 18px ${accent}e6)` },
                  },
                  animation: 'goldBreathe 3s ease-in-out infinite',
                }}>
                  <SparkyDog size={56} circular />
                </Box>
              )}
          </Box>
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
