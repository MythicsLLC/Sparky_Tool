import { Box, Typography, Button } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import GridViewIcon             from '@mui/icons-material/GridView'
import TuneIcon                 from '@mui/icons-material/Tune'
import ScheduleIcon             from '@mui/icons-material/Schedule'
import AdminPanelSettingsIcon   from '@mui/icons-material/AdminPanelSettings'

const NAV_BASE = [
  { id: 'dashboard', label: 'Dashboard',    icon: GridViewIcon  },
  { id: 'settings',  label: 'Configuration', icon: TuneIcon      },
  { id: 'schedules', label: 'Schedules',    icon: ScheduleIcon  },
]

export default function Sidebar({ route, navigate, user, onSignOut }) {
  const theme   = useTheme()
  const accent  = theme.palette.primary.main
  const navItems = [...NAV_BASE]
  if (user?.role === 'admin') {
    navItems.push({ id: 'admin', label: 'Admin', icon: AdminPanelSettingsIcon })
  }

  return (
    <Box
      component="nav"
      sx={{
        width: 260,
        flexShrink: 0,
        height: '100vh',
        position: 'sticky',
        top: 0,
        bgcolor: 'background.default',
        borderRight: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ height: 2, background: `linear-gradient(90deg, transparent 0%, ${accent} 30%, ${accent}cc 50%, ${accent} 70%, transparent 100%)` }} />

      <Box sx={{ px: 3.5, pt: 4, pb: 3.5 }}>
        <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontWeight: 700, fontSize: '1.15rem', letterSpacing: '0.22em', color: 'primary.main', textTransform: 'uppercase', lineHeight: 1, mb: 0.6 }}>
          Sparky Tool
        </Typography>
        <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontWeight: 400, fontSize: '0.6rem', letterSpacing: '0.25em', color: 'text.disabled', textTransform: 'uppercase' }}>
          Analytics Platform
        </Typography>
      </Box>

      <Box sx={{ mx: 3.5, height: '1px', bgcolor: 'divider', mb: 2 }} />

      <Box sx={{ flex: 1, px: 2 }}>
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = route === id
          return (
            <Box
              key={id}
              onClick={() => navigate(id)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.5,
                py: 1.4,
                mb: 0.5,
                cursor: 'pointer',
                borderLeft: active ? `2px solid ${accent}` : '2px solid transparent',
                background: active ? `${accent}0f` : 'transparent',
                transition: 'background 0.18s ease, border-color 0.18s ease',
                '&:hover': {
                  background: `${accent}0a`,
                  '& .nav-label': { color: 'text.primary' },
                  '& .nav-icon': { color: accent },
                },
              }}
            >
              <Icon className="nav-icon" sx={{ fontSize: 16, color: active ? accent : 'text.disabled', transition: 'color 0.18s ease' }} />
              <Typography className="nav-label" sx={{ fontFamily: '"Raleway", sans-serif', fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: active ? accent : 'text.secondary', transition: 'color 0.18s ease' }}>
                {label}
              </Typography>
            </Box>
          )
        })}
      </Box>

      <Box sx={{ px: 3.5, py: 3, borderTop: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.62rem', letterSpacing: '0.16em', color: 'text.secondary', textTransform: 'uppercase' }}>
          {user?.email || 'Unknown user'}
        </Typography>
        <Button
          size="small"
          onClick={onSignOut}
          sx={{ color: 'primary.main', borderColor: `${accent}4d`, borderRadius: 1, mt: 1, fontSize: '0.65rem', textTransform: 'uppercase' }}
          variant="outlined"
        >
          Sign out
        </Button>
      </Box>
    </Box>
  )
}
