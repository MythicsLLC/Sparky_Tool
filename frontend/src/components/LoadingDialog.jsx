import { useState, useEffect } from 'react'
import { Backdrop, Box, Typography, Chip } from '@mui/material'
import MythicsLogo from '../assets/MythicsLogo'
import { useThemeContext } from '../ThemeContext'

function useElapsed(running) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!running) { setElapsed(0); return }
    const id = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [running])
  return elapsed
}

function fmt(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function statusMsg(s) {
  if (s < 10) return 'Triggering PeopleSoft engine…'
  if (s < 30) return 'Polling engine status, awaiting completion…'
  if (s < 90) return 'Retrieving report via SFTP…'
  return 'Computing analytics and finalising…'
}

const STEPS = ['Trigger Engine', 'Poll Status', 'Fetch via SFTP', 'Compute Analytics']

export default function LoadingDialog({ open }) {
  const { accent, mode } = useThemeContext()
  const dark = mode === 'dark'
  const elapsed = useElapsed(open)
  const step = elapsed < 10 ? 0 : elapsed < 30 ? 1 : elapsed < 90 ? 2 : 3

  const bgColor  = dark ? 'rgba(11,12,14,0.97)' : 'rgba(245,243,239,0.97)'
  const textColor = dark ? '#ede8d0' : '#1a1814'

  return (
    <Backdrop
      open={open}
      sx={{
        zIndex: t => t.zIndex.modal + 1,
        background: bgColor,
        backdropFilter: 'blur(20px)',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
      }}
    >
      {/* Animated scan line */}
      <Box sx={{
        position: 'fixed', left: 0, right: 0, height: 100,
        background: `linear-gradient(transparent, ${accent}07, transparent)`,
        pointerEvents: 'none',
        '@keyframes scanLine': { '0%': { top: '-15%' }, '100%': { top: '115%' } },
        animation: 'scanLine 5s ease-in-out infinite',
      }} />

      {/* Subtle diagonal grid */}
      <Box sx={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage: `repeating-linear-gradient(135deg, ${accent}05 0px, ${accent}05 1px, transparent 1px, transparent 80px)`,
      }} />

      {/* Corner marks */}
      {[
        { top: 24, left: 24, borderTop: '1px solid', borderLeft: '1px solid' },
        { top: 24, right: 24, borderTop: '1px solid', borderRight: '1px solid' },
        { bottom: 24, left: 24, borderBottom: '1px solid', borderLeft: '1px solid' },
        { bottom: 24, right: 24, borderBottom: '1px solid', borderRight: '1px solid' },
      ].map((s, i) => (
        <Box key={i} sx={{ position: 'fixed', zIndex: 0, width: 20, height: 20, borderColor: `${accent}28`, ...s }} />
      ))}

      {/* ── Central content ── */}
      <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Logo with concentric spinning rings */}
        <Box sx={{ position: 'relative', width: 180, height: 180, mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Outer dashed ring */}
          <Box sx={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: `1px dashed ${accent}22`,
            '@keyframes spinCW': { to: { transform: 'rotate(360deg)' } },
            animation: 'spinCW 14s linear infinite',
          }} />
          {/* Mid ring */}
          <Box sx={{
            position: 'absolute', inset: 18, borderRadius: '50%',
            border: `1px solid ${accent}18`,
            '@keyframes spinCCW': { to: { transform: 'rotate(-360deg)' } },
            animation: 'spinCCW 9s linear infinite',
          }} />
          {/* Inner solid ring */}
          <Box sx={{
            position: 'absolute', inset: 36, borderRadius: '50%',
            border: `1.5px solid ${accent}44`,
            animation: 'spinCW 5s linear infinite',
          }} />
          {/* Logo centre */}
          <Box sx={{
            position: 'relative', zIndex: 2,
            '@keyframes logoBreathe': {
              '0%,100%': { filter: `drop-shadow(0 0 6px ${accent}44)` },
              '50%':     { filter: `drop-shadow(0 0 22px ${accent}cc)` },
            },
            animation: 'logoBreathe 2.8s ease-in-out infinite',
          }}>
            <MythicsLogo width={72} />
          </Box>
        </Box>

        {/* Title */}
        <Typography sx={{
          fontFamily: '"Cormorant Garamond", serif',
          fontSize: '2rem', fontWeight: 700,
          letterSpacing: '0.08em',
          color: textColor, mb: 0.5,
        }}>
          Processing Request
        </Typography>

        {/* Dynamic status */}
        <Typography sx={{
          fontFamily: '"Raleway", sans-serif',
          fontSize: '0.72rem', letterSpacing: '0.14em',
          color: `${accent}aa`, mb: 4,
          minHeight: 20,
        }}>
          {statusMsg(elapsed)}
        </Typography>

        {/* Segmented progress bar */}
        <Box sx={{ width: 340, mb: 2 }}>
          <Box sx={{ display: 'flex', gap: '3px' }}>
            {Array.from({ length: 24 }).map((_, i) => (
              <Box key={i} sx={{
                flex: 1, height: 3, borderRadius: 2,
                background: `${accent}14`,
                '@keyframes seg': {
                  '0%,100%': { background: `${accent}14` },
                  '50%':     { background: `${accent}bb` },
                },
                animation: `seg 2.2s ease-in-out ${i * 0.08}s infinite`,
              }} />
            ))}
          </Box>
        </Box>

        {/* Timer chip */}
        <Chip
          icon={
            <Box sx={{
              width: 6, height: 6, borderRadius: '50%', bgcolor: accent,
              '@keyframes blink': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.15 } },
              animation: 'blink 1s ease-in-out infinite',
              ml: '8px !important',
            }} />
          }
          label={fmt(elapsed)}
          sx={{
            fontFamily: '"JetBrains Mono", monospace', fontWeight: 600,
            fontSize: '0.88rem', letterSpacing: '0.08em',
            bgcolor: `${accent}0f`,
            border: `1px solid ${accent}2e`,
            color: accent, px: 1, height: 34, mb: 5,
          }}
        />

        {/* Step indicators */}
        <Box sx={{ display: 'flex', gap: 3 }}>
          {STEPS.map((label, i) => (
            <Box key={label} sx={{ textAlign: 'center' }}>
              <Box sx={{
                width: 6, height: 6, borderRadius: '50%', mx: 'auto', mb: 0.75,
                bgcolor: i < step ? '#6b8f71' : i === step ? accent : `${accent}33`,
                boxShadow: i === step ? `0 0 10px ${accent}99` : 'none',
                transition: 'all 0.4s ease',
              }} />
              <Typography sx={{
                fontFamily: '"Raleway", sans-serif',
                fontSize: '0.58rem', letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: i === step ? accent : i < step ? '#6b8f71' : `${accent}55`,
                transition: 'color 0.4s ease',
                ...(i === step && {
                  '@keyframes stepPulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
                  animation: 'stepPulse 1.5s ease-in-out infinite',
                }),
              }}>
                {i + 1}. {label}
              </Typography>
            </Box>
          ))}
        </Box>

      </Box>
    </Backdrop>
  )
}
