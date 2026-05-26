import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, Box, Typography, CircularProgress,
} from '@mui/material'
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
  if (s < 10) return 'Triggering PeopleSoft engine...'
  if (s < 30) return 'Polling engine status, awaiting completion...'
  if (s < 90) return 'Retrieving report via SFTP...'
  return 'Computing analytics and finalising...'
}

const STEPS = ['Trigger Engine', 'Poll Status', 'Fetch via SFTP', 'Compute Analytics']

export default function LoadingDialog({ open }) {
  const { accent, mode } = useThemeContext()
  const isDark = mode === 'dark'
  const elapsed = useElapsed(open)
  const step = elapsed < 10 ? 0 : elapsed < 30 ? 1 : elapsed < 90 ? 2 : 3

  return (
    <Dialog
      open={open}
      disableEscapeKeyDown
      PaperProps={{ sx: { minWidth: 400, bgcolor: 'background.paper', border: `1px solid ${accent}33` } }}
    >
      <DialogContent sx={{ p: 4, textAlign: 'center' }}>
        {/* Sparky inside spinning ring */}
        <Box sx={{ position: 'relative', display: 'inline-flex', mb: 3 }}>
          {/* Track ring */}
          <CircularProgress
            variant="determinate"
            value={100}
            size={80}
            thickness={1}
            sx={{ color: `${accent}1a`, position: 'absolute' }}
          />
          {/* Spinning accent ring */}
          <CircularProgress
            size={80}
            thickness={1.5}
            sx={{ color: accent, animationDuration: '3s' }}
          />
          {/* Logo in the centre */}
          <Box sx={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MythicsLogo width={54} />
          </Box>
        </Box>

        {/* Title */}
        <Typography sx={{
          fontFamily: '"Cormorant Garamond", serif',
          fontSize: '1.5rem',
          fontWeight: 600,
          color: 'text.primary',
          letterSpacing: '0.04em',
          mb: 0.75,
        }}>
          Processing Request
        </Typography>

        {/* Status */}
        <Typography sx={{
          fontFamily: '"Raleway", sans-serif',
          fontSize: '0.72rem',
          letterSpacing: '0.08em',
          color: 'text.secondary',
          mb: 3.5,
          minHeight: 20,
        }}>
          {statusMsg(elapsed)}
        </Typography>

        {/* Divider rule */}
        <Box sx={{ height: '1px', bgcolor: `${accent}1a`, mb: 3 }} />

        {/* Steps */}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mb: 3 }}>
          {STEPS.map((label, i) => (
            <Box key={label} sx={{ textAlign: 'center' }}>
              <Box sx={{
                width: 6, height: 6, borderRadius: '50%', mx: 'auto', mb: 0.75,
                bgcolor: i < step ? '#6b8f71' : i === step ? accent : 'action.disabled',
                boxShadow: i === step ? `0 0 8px ${accent}99` : 'none',
                transition: 'all 0.4s ease',
              }} />
              <Typography sx={{
                fontFamily: '"Raleway", sans-serif',
                fontSize: '0.58rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: i === step ? accent : i < step ? '#6b8f71' : 'text.disabled',
                transition: 'color 0.4s ease',
              }}>
                {label}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Timer */}
        <Typography sx={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.7rem',
          color: 'text.disabled',
          letterSpacing: '0.1em',
        }}>
          {fmt(elapsed)}
        </Typography>
      </DialogContent>
    </Dialog>
  )
}
