import { useRef, useState } from 'react'
import { Box, Typography, Popover, Grid } from '@mui/material'
import KeyboardIcon from '@mui/icons-material/Keyboard'
import CloseIcon    from '@mui/icons-material/Close'
import { useThemeContext } from '../ThemeContext'
import KbdHint, { MOD } from './KbdHint'

const SECTIONS = [
  {
    title: 'Navigate  (G then …)',
    rows: [
      ['G → D', 'Dashboard'],
      ['G → C', 'Configuration'],
      ['G → H', 'Schedules'],
      ['G → A', 'Admin'],
      ['G → P', 'Preferences'],
    ],
  },
  {
    title: 'Dashboard',
    rows: [
      ['R',     'Run current config'],
      ['1 – 4', 'Switch tabs'],
      ['P',     'Download PDF'],
      ['C',     'Compare runs'],
      ['V',     'Toggle table / card'],
    ],
  },
  {
    title: 'AI Analysis',
    rows: [
      [`${MOD}+O`, 'Open file browser'],
      [`${MOD}+D`, 'Download PDF'],
      [`${MOD}+↵`, 'Re-run same file'],
      ['Esc',       'Reset results'],
    ],
  },
  {
    title: 'Configuration',
    rows: [
      [`${MOD}+S`,   'Save configuration'],
      ['N',           'New configuration'],
      [`${MOD}+Del`, 'Delete configuration'],
    ],
  },
  {
    title: 'Schedules',
    rows: [
      ['N',          'New schedule'],
      [`${MOD}+S`,   'Save (dialog)'],
      ['Esc',        'Close dialog'],
    ],
  },
  {
    title: 'Admin',
    rows: [
      ['R',     'Reload data'],
      ['1 – 9', 'Switch tabs'],
      ['N',     'New item (context)'],
      ['Esc',   'Close dialog'],
    ],
  },
  {
    title: 'Preferences',
    rows: [
      [`${MOD}+S`,          'Save preferences'],
      [`${MOD}+Shift+R`,    'Reset to defaults'],
    ],
  },
  {
    title: 'Global',
    rows: [
      ['?', 'Toggle this popup'],
    ],
  },
]

export default function ShortcutsFab({ open, onOpen, onClose }) {
  const { accent } = useThemeContext()
  const [hovered, setHovered] = useState(false)
  const fabRef = useRef(null)

  return (
    <>
      {/* ── Floating button ────────────────────────────────────────────────── */}
      <Box
        ref={fabRef}
        onClick={open ? onClose : onOpen}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        sx={{
          position: 'fixed',
          bottom: 22,
          left: 22,
          zIndex: 1400,
          display: 'flex',
          alignItems: 'center',
          height: 40,
          pl: 1.25,
          pr: hovered || open ? 1.8 : 1.25,
          borderRadius: '20px',
          cursor: 'pointer',
          bgcolor: open ? accent : 'background.paper',
          border: '1px solid',
          borderColor: open ? accent : `${accent}45`,
          boxShadow: open
            ? `0 4px 28px ${accent}55, 0 0 0 3px ${accent}22`
            : `0 2px 16px rgba(0,0,0,0.4)`,
          transition: 'all 0.22s cubic-bezier(0.4,0,0.2,1)',
          userSelect: 'none',
        }}
      >
        <KeyboardIcon sx={{
          fontSize: 16, flexShrink: 0,
          color: open ? '#0b0c0e' : accent,
          transition: 'color 0.18s ease',
        }} />
        <Box sx={{
          overflow: 'hidden',
          maxWidth: hovered || open ? 130 : 0,
          opacity: hovered || open ? 1 : 0,
          paddingLeft: hovered || open ? '7px' : 0,
          transition: 'max-width 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.15s ease, padding-left 0.22s ease',
        }}>
          <Typography sx={{
            fontFamily: '"Raleway", sans-serif',
            fontWeight: 700, fontSize: '0.62rem',
            letterSpacing: '0.12em', textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            color: open ? '#0b0c0e' : accent,
            transition: 'color 0.18s ease',
          }}>
            Shortcuts
          </Typography>
        </Box>
      </Box>

      {/* ── Popup ─────────────────────────────────────────────────────────── */}
      <Popover
        open={open}
        anchorEl={fabRef.current}
        onClose={onClose}
        anchorOrigin={{ vertical: 'top',    horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        disableRestoreFocus
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            border: '1px solid',
            borderColor: `${accent}35`,
            borderRadius: 2,
            boxShadow: `0 16px 64px rgba(0,0,0,0.55), 0 0 0 1px ${accent}18`,
            overflow: 'hidden',
            width: { xs: '90vw', sm: 580 },
            maxWidth: 620,
            mb: 1.5,
          },
        }}
      >
        {/* Gold accent line */}
        <Box sx={{ height: 2, background: `linear-gradient(90deg, transparent 0%, ${accent} 25%, ${accent}ee 60%, ${accent} 80%, transparent 100%)` }} />

        {/* Header */}
        <Box sx={{
          px: 2.5, py: 1.75,
          borderBottom: '1px solid', borderColor: 'divider',
          display: 'flex', alignItems: 'center', gap: 1.5,
        }}>
          <Typography sx={{
            fontFamily: '"Cormorant Garamond", serif',
            fontWeight: 700, fontSize: '1.4rem',
            color: 'text.primary', lineHeight: 1, flex: 1,
          }}>
            Keyboard Shortcuts
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.56rem', color: 'text.disabled', letterSpacing: '0.1em' }}>
              press
            </Typography>
            <KbdHint keys="?" />
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.56rem', color: 'text.disabled', letterSpacing: '0.1em' }}>
              anywhere
            </Typography>
          </Box>
          <Box
            onClick={onClose}
            sx={{
              width: 26, height: 26, ml: 0.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', borderRadius: '50%', flexShrink: 0,
              color: 'text.disabled',
              '&:hover': { bgcolor: `${accent}18`, color: accent },
              transition: 'all 0.15s ease',
            }}
          >
            <CloseIcon sx={{ fontSize: 13 }} />
          </Box>
        </Box>

        {/* Sections grid */}
        <Box sx={{
          p: 1.5,
          maxHeight: '65vh',
          overflowY: 'auto',
          '&::-webkit-scrollbar': { width: 4 },
          '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
          '&::-webkit-scrollbar-thumb': { bgcolor: `${accent}30`, borderRadius: 2 },
        }}>
          <Grid container>
            {SECTIONS.map(({ title, rows }) => (
              <Grid item xs={12} sm={6} key={title} sx={{ p: 1 }}>
                <Typography sx={{
                  fontFamily: '"Raleway", sans-serif',
                  fontWeight: 700, fontSize: '0.53rem',
                  letterSpacing: '0.2em', textTransform: 'uppercase',
                  color: accent, mb: 0.85, pb: 0.5,
                  borderBottom: `1px solid ${accent}22`,
                }}>
                  {title}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
                  {rows.map(([keys, label]) => (
                    <Box key={keys} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', color: 'text.secondary', lineHeight: 1.4 }}>
                        {label}
                      </Typography>
                      <KbdHint keys={keys} sx={{ flexShrink: 0 }} />
                    </Box>
                  ))}
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Popover>
    </>
  )
}
