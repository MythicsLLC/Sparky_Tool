import { useState } from 'react'
import {
  AppBar, Toolbar, Box, Typography,
  Avatar, Chip, Tooltip,
  Divider, ListItemIcon, ListItemText, Switch,
  Menu, MenuItem,
  Dialog, DialogContent,
} from '@mui/material'
import GridViewIcon           from '@mui/icons-material/GridView'
import TuneIcon               from '@mui/icons-material/Tune'
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import ManageAccountsIcon     from '@mui/icons-material/ManageAccounts'
import PaletteIcon            from '@mui/icons-material/Palette'
import PersonIcon             from '@mui/icons-material/Person'
import SettingsIcon           from '@mui/icons-material/Settings'
import LogoutIcon             from '@mui/icons-material/Logout'
import LightModeIcon          from '@mui/icons-material/LightMode'
import DarkModeIcon           from '@mui/icons-material/DarkMode'
import ExpandMoreIcon         from '@mui/icons-material/ExpandMore'
import ShieldIcon             from '@mui/icons-material/Shield'
import VerifiedUserIcon       from '@mui/icons-material/VerifiedUser'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import InfoOutlinedIcon       from '@mui/icons-material/InfoOutlined'
import TuneOutlinedIcon       from '@mui/icons-material/TuneOutlined'
import { useThemeContext, ACCENT_OPTIONS } from '../ThemeContext'
import SparkyDog from '../assets/SparkyDog'
import SparkyWordmark from './SparkyWordmark'

const NAV_BASE = [
  { id: 'dashboard', label: 'Dashboard',     icon: GridViewIcon },
  { id: 'settings',  label: 'Configuration', icon: TuneIcon },
]

const menuPaperSx = {
  bgcolor: 'background.paper',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 2,
  backgroundImage: 'none',
}

// Shared expand transition used by all pills
const expandTransition = 'max-width 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.15s ease, padding-left 0.22s ease'

function NavPill({ icon: Icon, label, active, onClick, accent }) {
  const [hovered, setHovered] = useState(false)
  const expanded = active || hovered

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
  }

  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      sx={{
        display: 'flex', alignItems: 'center',
        height: 52, px: 1.25,
        cursor: 'pointer',
        borderBottom: `2px solid ${active ? accent : 'transparent'}`,
        bgcolor: hovered ? `${accent}0e` : 'transparent',
        transition: 'background 0.15s ease, border-color 0.15s ease',
        outline: 'none',
        '&:focus-visible': { outline: `2px solid ${accent}`, outlineOffset: '-2px' },
      }}
    >
      <Icon sx={{
        fontSize: 15, flexShrink: 0,
        color: active ? accent : hovered ? `${accent}cc` : 'text.secondary',
        transition: 'color 0.15s ease',
      }} />
      <Box sx={{
        overflow: 'hidden',
        maxWidth: expanded ? 150 : 0,
        opacity: expanded ? 1 : 0,
        paddingLeft: expanded ? '6px' : 0,
        transition: expandTransition,
      }}>
        <Typography sx={{
          fontFamily: '"Raleway", sans-serif',
          fontWeight: 600, fontSize: '0.63rem', letterSpacing: '0.12em',
          textTransform: 'uppercase', whiteSpace: 'nowrap',
          color: active ? accent : 'text.secondary',
        }}>
          {label}
        </Typography>
      </Box>
    </Box>
  )
}

export default function Topbar({ route, navigate, user, onSignOut }) {
  const { mode, accent, toggleMode, setAccentColor } = useThemeContext()

  const [accountAnchor,    setAccountAnchor]    = useState(null)
  const [themeAnchor,      setThemeAnchor]      = useState(null)
  const [userAnchor,       setUserAnchor]       = useState(null)
  const [aboutOpen,        setAboutOpen]        = useState(false)
  const [dogHistoryOpen,   setDogHistoryOpen]   = useState(false)
  const [accountHovered,   setAccountHovered]   = useState(false)
  const [themeHovered,     setThemeHovered]     = useState(false)
  const [userPillHovered,  setUserPillHovered]  = useState(false)

  const navItems = [...NAV_BASE]
  if (user?.role === 'admin') navItems.push({ id: 'admin', label: 'Admin', icon: AdminPanelSettingsIcon })

  const initials    = [user?.first_name?.[0], user?.last_name?.[0]].filter(Boolean).join('') ||
                      user?.email?.[0]?.toUpperCase() || '?'
  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email || 'User'

  const closeAll = () => {
    setAccountAnchor(null)
    setThemeAnchor(null)
    setUserAnchor(null)
  }

  return (
    <>
    <AppBar position="sticky" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', zIndex: 1200 }}>
      {/* gold accent top line */}
      <Box sx={{ height: 2, background: `linear-gradient(90deg, transparent 0%, ${accent} 30%, ${accent}dd 50%, ${accent} 70%, transparent 100%)` }} />

      <Toolbar sx={{ minHeight: '52px !important', px: { xs: 1.5, sm: 2.5 }, gap: 1 }}>

        {/* ── Brand ───────────────────────────────── */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 1.5, flexShrink: 0 }}>
          <Tooltip title="Did you know? — The story of Sparky" placement="bottom" arrow>
            <Box
              role="button"
              tabIndex={0}
              aria-label="The story of Sparky"
              onClick={() => setDogHistoryOpen(true)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDogHistoryOpen(true) } }}
              sx={{
                cursor: 'pointer',
                borderRadius: '50%',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                outline: 'none',
                '&:hover': { transform: 'scale(1.12)', boxShadow: `0 0 12px ${accent}66` },
                '&:focus-visible': { outline: `2px solid ${accent}`, outlineOffset: '2px' },
              }}
            >
              <SparkyDog size={34} circular />
            </Box>
          </Tooltip>
          <Box
            role="button"
            tabIndex={0}
            aria-label="Go to dashboard"
            onClick={() => navigate('dashboard')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('dashboard') } }}
            sx={{ display: { xs: 'none', sm: 'block' }, cursor: 'pointer', outline: 'none', '&:focus-visible': { outline: `2px solid ${accent}`, outlineOffset: '2px', borderRadius: '2px' } }}
          >
            <Typography component="div" sx={{ fontFamily: '"Cormorant Garamond", serif', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.2em', color: accent, textTransform: 'uppercase', lineHeight: 1, userSelect: 'none' }}>
              <SparkyWordmark text="Sparky Tool" accent={accent} />
            </Typography>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontWeight: 400, fontSize: '0.48rem', letterSpacing: '0.25em', color: 'text.disabled', textTransform: 'uppercase' }}>
              Analytics Platform
            </Typography>
          </Box>
        </Box>

        {/* ── Nav Pills ─────────────────────────────── */}
        <Box sx={{ display: 'flex', alignItems: 'center', height: 52 }}>
          {navItems.map(({ id, label, icon }) => (
            <NavPill
              key={id}
              icon={icon}
              label={label}
              active={route === id}
              onClick={() => navigate(id)}
              accent={accent}
            />
          ))}
        </Box>

        <Box sx={{ flex: 1 }} />

        {/* ── Account / Persona picker ─────────────── */}
        <Box
          role="button"
          tabIndex={0}
          aria-label="Account menu"
          aria-haspopup="true"
          aria-expanded={Boolean(accountAnchor)}
          onClick={(e) => setAccountAnchor(e.currentTarget)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAccountAnchor(e.currentTarget) } }}
          onMouseEnter={() => setAccountHovered(true)}
          onMouseLeave={() => setAccountHovered(false)}
          onFocus={() => setAccountHovered(true)}
          onBlur={() => setAccountHovered(false)}
          sx={{
            display: 'flex', alignItems: 'center', cursor: 'pointer',
            px: 1.25, height: 34, borderRadius: 1,
            border: '1px solid',
            borderColor: accountHovered ? accent : 'divider',
            bgcolor: accountHovered ? `${accent}12` : 'transparent',
            transition: 'border-color 0.15s ease, background 0.15s ease',
            flexShrink: 0, outline: 'none',
            '&:focus-visible': { outline: `2px solid ${accent}`, outlineOffset: '2px' },
          }}
        >
          <ManageAccountsIcon sx={{ fontSize: 16, color: accent, flexShrink: 0 }} />
          <Box sx={{
            overflow: 'hidden',
            maxWidth: accountHovered ? 140 : 0,
            opacity: accountHovered ? 1 : 0,
            paddingLeft: accountHovered ? '6px' : 0,
            transition: expandTransition,
          }}>
            <Typography sx={{
              fontFamily: '"Raleway", sans-serif', fontSize: '0.63rem', fontWeight: 600,
              letterSpacing: '0.08em', color: 'text.primary', textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}>
              {displayName}
            </Typography>
          </Box>
          <ExpandMoreIcon sx={{ fontSize: 14, color: 'text.disabled', flexShrink: 0, ml: 0.5 }} />
        </Box>

        <Menu
          anchorEl={accountAnchor}
          open={Boolean(accountAnchor)}
          onClose={() => setAccountAnchor(null)}
          PaperProps={{ sx: { ...menuPaperSx, minWidth: 260 } }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          {/* profile header */}
          <Box sx={{ px: 2.5, pt: 2, pb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
              <Avatar sx={{ width: 38, height: 38, bgcolor: accent, color: '#0b0c0e', fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.85rem' }}>
                {initials}
              </Avatar>
              <Box>
                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.8rem', color: 'text.primary', lineHeight: 1.2 }}>
                  {displayName}
                </Typography>
                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.62rem', color: 'text.secondary', mt: 0.2 }}>
                  {user?.email}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              <Chip
                icon={user?.role === 'admin' ? <ShieldIcon sx={{ fontSize: '11px !important' }} /> : <PersonIcon sx={{ fontSize: '11px !important' }} />}
                label={user?.role || 'user'}
                size="small"
                sx={{ bgcolor: user?.role === 'admin' ? `${accent}22` : 'rgba(128,128,128,0.1)', color: user?.role === 'admin' ? accent : 'text.secondary', fontFamily: '"Raleway", sans-serif', fontSize: '0.57rem', height: 20, letterSpacing: '0.08em', textTransform: 'uppercase' }}
              />
              {user?.onboarded && (
                <Chip
                  icon={<CheckCircleOutlineIcon sx={{ fontSize: '11px !important' }} />}
                  label="Onboarded"
                  size="small"
                  sx={{ bgcolor: 'rgba(107,143,113,0.12)', color: '#6b8f71', fontFamily: '"Raleway", sans-serif', fontSize: '0.57rem', height: 20 }}
                />
              )}
            </Box>
          </Box>
          <Divider sx={{ borderColor: 'divider' }} />
          <MenuItem onClick={() => { navigate('settings'); closeAll() }} sx={{ gap: 1.5, py: 1.2, mx: 0.5, borderRadius: 1 }}>
            <ListItemIcon sx={{ minWidth: 'auto' }}><TuneIcon sx={{ fontSize: 16, color: accent }} /></ListItemIcon>
            <ListItemText primary="Manage configurations" primaryTypographyProps={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.73rem', color: 'text.primary' }} />
          </MenuItem>
          {user?.role === 'admin' && (
            <MenuItem onClick={() => { navigate('admin'); closeAll() }} sx={{ gap: 1.5, py: 1.2, mx: 0.5, borderRadius: 1 }}>
              <ListItemIcon sx={{ minWidth: 'auto' }}><AdminPanelSettingsIcon sx={{ fontSize: 16, color: accent }} /></ListItemIcon>
              <ListItemText primary="Admin panel" primaryTypographyProps={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.73rem', color: 'text.primary' }} />
            </MenuItem>
          )}
          {user?.role === 'admin' && (
            <MenuItem sx={{ gap: 1.5, py: 1.2, mx: 0.5, mb: 0.5, borderRadius: 1 }}>
              <ListItemIcon sx={{ minWidth: 'auto' }}><VerifiedUserIcon sx={{ fontSize: 16, color: 'text.secondary' }} /></ListItemIcon>
              <ListItemText primary="Manage users" primaryTypographyProps={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.73rem', color: 'text.primary' }} secondary="Admin → Users tab" secondaryTypographyProps={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem' }} />
            </MenuItem>
          )}
        </Menu>

        {/* ── Theme picker ─────────────────────────── */}
        <Box
          role="button"
          tabIndex={0}
          aria-label="Theme and accent color"
          aria-haspopup="true"
          aria-expanded={Boolean(themeAnchor)}
          onClick={(e) => setThemeAnchor(e.currentTarget)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setThemeAnchor(e.currentTarget) } }}
          onMouseEnter={() => setThemeHovered(true)}
          onMouseLeave={() => setThemeHovered(false)}
          onFocus={() => setThemeHovered(true)}
          onBlur={() => setThemeHovered(false)}
          sx={{
            display: 'flex', alignItems: 'center',
            height: 34, px: 0.75, borderRadius: 1,
            cursor: 'pointer',
            color: themeHovered ? accent : 'text.secondary',
            bgcolor: themeHovered ? `${accent}12` : 'transparent',
            transition: 'color 0.15s ease, background 0.15s ease',
            outline: 'none',
            '&:focus-visible': { outline: `2px solid ${accent}`, outlineOffset: '2px' },
          }}
        >
          <PaletteIcon sx={{ fontSize: 16, flexShrink: 0, color: 'inherit' }} />
          <Box sx={{
            overflow: 'hidden',
            maxWidth: themeHovered ? 80 : 0,
            opacity: themeHovered ? 1 : 0,
            paddingLeft: themeHovered ? '6px' : 0,
            transition: expandTransition,
          }}>
            <Typography sx={{
              fontFamily: '"Raleway", sans-serif', fontSize: '0.63rem', fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap',
              color: accent,
            }}>
              Theme
            </Typography>
          </Box>
        </Box>

        <Menu
          anchorEl={themeAnchor}
          open={Boolean(themeAnchor)}
          onClose={() => setThemeAnchor(null)}
          PaperProps={{ sx: { ...menuPaperSx, minWidth: 210 } }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <Box sx={{ px: 2.5, pt: 2, pb: 1.5 }}>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.57rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'text.secondary', mb: 1.5 }}>
              Mode
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <DarkModeIcon sx={{ fontSize: 16, color: mode === 'dark' ? accent : 'text.disabled' }} />
              <Switch
                checked={mode === 'light'}
                onChange={toggleMode}
                size="small"
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: accent },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: accent },
                }}
              />
              <LightModeIcon sx={{ fontSize: 16, color: mode === 'light' ? accent : 'text.disabled' }} />
            </Box>
          </Box>
          <Divider sx={{ borderColor: 'divider' }} />
          <Box sx={{ px: 2.5, pt: 1.5, pb: 2 }}>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.57rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'text.secondary', mb: 1.5 }}>
              Accent colour
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {ACCENT_OPTIONS.map((opt) => (
                <Tooltip key={opt.value} title={opt.label} placement="top" arrow>
                  <Box
                    onClick={() => setAccentColor(opt.value)}
                    sx={{
                      width: 26, height: 26, borderRadius: '50%',
                      bgcolor: opt.value, cursor: 'pointer',
                      outline: accent === opt.value ? `3px solid ${opt.value}` : '3px solid transparent',
                      outlineOffset: '2px',
                      border: '2px solid',
                      borderColor: accent === opt.value ? 'background.paper' : 'transparent',
                      transition: 'all 0.15s ease',
                      '&:hover': { transform: 'scale(1.15)' },
                    }}
                  />
                </Tooltip>
              ))}
            </Box>
          </Box>
        </Menu>

        {/* ── User menu ────────────────────────────── */}
        <Box
          onClick={(e) => setUserAnchor(e.currentTarget)}
          onMouseEnter={() => setUserPillHovered(true)}
          onMouseLeave={() => setUserPillHovered(false)}
          sx={{
            display: 'flex', alignItems: 'center',
            height: 34, pl: 0.4, pr: 0.4,
            borderRadius: 5,
            cursor: 'pointer',
            border: '1px solid',
            borderColor: userPillHovered ? accent : 'transparent',
            bgcolor: userPillHovered ? `${accent}0e` : 'transparent',
            transition: 'border-color 0.15s ease, background 0.15s ease',
          }}
        >
          <Avatar sx={{ width: 28, height: 28, bgcolor: accent, color: '#0b0c0e', fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.65rem', flexShrink: 0 }}>
            {initials}
          </Avatar>
          <Box sx={{
            overflow: 'hidden',
            maxWidth: userPillHovered ? 140 : 0,
            opacity: userPillHovered ? 1 : 0,
            paddingLeft: userPillHovered ? '8px' : 0,
            transition: expandTransition,
          }}>
            <Typography sx={{
              fontFamily: '"Raleway", sans-serif', fontSize: '0.63rem', fontWeight: 600,
              letterSpacing: '0.08em', color: 'text.primary', whiteSpace: 'nowrap',
            }}>
              {displayName}
            </Typography>
          </Box>
        </Box>

        <Menu
          anchorEl={userAnchor}
          open={Boolean(userAnchor)}
          onClose={() => setUserAnchor(null)}
          PaperProps={{ sx: { ...menuPaperSx, minWidth: 230 } }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <Box sx={{ px: 2.5, pt: 2, pb: 1.5 }}>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.8rem', color: 'text.primary' }}>{displayName}</Typography>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.62rem', color: 'text.secondary', mt: 0.2 }}>{user?.email}</Typography>
          </Box>
          <Divider sx={{ borderColor: 'divider' }} />
          <MenuItem onClick={() => { navigate('preferences'); closeAll() }} sx={{ gap: 1.5, py: 1.1, mx: 0.5, borderRadius: 1 }}>
            <ListItemIcon sx={{ minWidth: 'auto' }}><TuneOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} /></ListItemIcon>
            <ListItemText primary="Preferences" primaryTypographyProps={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.73rem', color: 'text.primary' }} />
          </MenuItem>
          <MenuItem onClick={() => { navigate('settings'); closeAll() }} sx={{ gap: 1.5, py: 1.1, mx: 0.5, borderRadius: 1 }}>
            <ListItemIcon sx={{ minWidth: 'auto' }}><SettingsIcon sx={{ fontSize: 16, color: 'text.secondary' }} /></ListItemIcon>
            <ListItemText primary="Configuration" primaryTypographyProps={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.73rem', color: 'text.primary' }} />
          </MenuItem>
          {user?.role === 'admin' && (
            <MenuItem onClick={() => { navigate('admin'); closeAll() }} sx={{ gap: 1.5, py: 1.1, mx: 0.5, borderRadius: 1 }}>
              <ListItemIcon sx={{ minWidth: 'auto' }}><AdminPanelSettingsIcon sx={{ fontSize: 16, color: 'text.secondary' }} /></ListItemIcon>
              <ListItemText primary="Admin panel" primaryTypographyProps={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.73rem', color: 'text.primary' }} />
            </MenuItem>
          )}
          <MenuItem
            onClick={() => { setUserAnchor(null); setAboutOpen(true) }}
            sx={{ gap: 1.5, py: 1.1, mx: 0.5, borderRadius: 1 }}
          >
            <ListItemIcon sx={{ minWidth: 'auto' }}><InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} /></ListItemIcon>
            <ListItemText primary="About Sparky" primaryTypographyProps={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.73rem', color: 'text.primary' }} />
          </MenuItem>
          <Divider sx={{ borderColor: 'divider', my: 0.5 }} />
          <MenuItem onClick={onSignOut} sx={{ gap: 1.5, py: 1.1, mx: 0.5, mb: 0.5, borderRadius: 1, '&:hover': { bgcolor: 'rgba(143,74,74,0.08)' } }}>
            <ListItemIcon sx={{ minWidth: 'auto' }}><LogoutIcon sx={{ fontSize: 16, color: '#c98f8f' }} /></ListItemIcon>
            <ListItemText primary="Sign out" primaryTypographyProps={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.73rem', color: '#c98f8f' }} />
          </MenuItem>
        </Menu>

      </Toolbar>
    </AppBar>

    {/* ── Sparky History "Did you know?" dialog ───────────────────── */}
    <Dialog
      open={dogHistoryOpen}
      onClose={() => setDogHistoryOpen(false)}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'background.paper',
          backgroundImage: 'none',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
        },
      }}
    >
      <Box sx={{ height: 2, background: `linear-gradient(90deg, transparent 0%, ${accent} 30%, ${accent}dd 70%, transparent 100%)` }} />

      <DialogContent sx={{ p: 0 }}>
        {/* Header band */}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 2,
          px: 3.5, py: 2.5,
          borderBottom: '1px solid', borderColor: 'divider',
          bgcolor: `${accent}08`,
        }}>
          <SparkyDog size={64} circular style={{ flexShrink: 0 }} />
          <Box>
            <Typography sx={{
              fontFamily: '"Raleway", sans-serif',
              fontSize: '0.52rem', letterSpacing: '0.3em', textTransform: 'uppercase',
              color: accent, mb: 0.5,
            }}>
              Did you know?
            </Typography>
            <Typography sx={{
              fontFamily: '"Cormorant Garamond", serif',
              fontSize: '1.9rem', fontWeight: 700,
              color: 'text.primary', lineHeight: 1,
            }}>
              The Legend of Sparky
            </Typography>
            <Typography sx={{
              fontFamily: '"Raleway", sans-serif',
              fontSize: '0.68rem', color: 'text.secondary', mt: 0.5,
            }}>
              PeopleSoft's golden retriever who made enterprise software human
            </Typography>
          </Box>
        </Box>

        {/* Story body */}
        <Box sx={{ px: 3.5, py: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>

          {[
            {
              year: '1987',
              title: 'A company built differently',
              body: 'Dave Duffield co-founded PeopleSoft in Pleasanton, California with a radical idea: enterprise HR software should be easy to use and genuinely friendly. Sparky the golden retriever was introduced as the company mascot — a deliberate signal that PeopleSoft cared about people, not just processes.',
            },
            {
              year: '1990s',
              title: 'Sparky becomes a star',
              body: 'As PeopleSoft grew into a Fortune 500 company serving thousands of organisations worldwide, Sparky appeared in ads, merchandise, and office decor everywhere. Employees were fiercely loyal and the dog embodied the culture: approachable, warm, and employee-first. Plush Sparky toys were given out at conferences.',
            },
            {
              year: 'Jun 2003',
              title: 'Oracle fires the first shot',
              body: 'Oracle CEO Larry Ellison launched a hostile $5.1 billion takeover bid — just days after PeopleSoft announced it would acquire rival J.D. Edwards. PeopleSoft CEO Craig Conway called it "atrociously bad behaviour" and vowed the company would never be sold.',
            },
            {
              year: '2003–2004',
              title: 'Sparky leads the resistance',
              body: 'PeopleSoft employees and customers rallied behind Sparky as a symbol of defiance. Protesters outside Oracle\'s offices waved Sparky banners. Staff wore "Protect Sparky" t-shirts. Customers worried Oracle would kill the products they\'d built their businesses on. Oracle raised its bid five times — to $10.3 billion.',
            },
            {
              year: 'Dec 2004',
              title: 'The $10.3 billion ending',
              body: 'After 18 months of resistance, PeopleSoft\'s board accepted Oracle\'s final offer of $10.3 billion — the largest enterprise software acquisition in history at the time. Within weeks, Oracle laid off roughly 5,000 PeopleSoft employees, including CEO Craig Conway. Sparky retired from the marketing world.',
            },
            {
              year: 'Today',
              title: 'The spirit lives on',
              body: 'Oracle PeopleSoft still runs in thousands of universities, governments, and corporations. The products survived — and so did the values Sparky stood for. This tool carries that name as a tribute: software that\'s powerful under the hood, but built with people in mind.',
            },
          ].map(({ year, title, body }, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 56 }}>
                <Typography sx={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '0.58rem', color: accent,
                  letterSpacing: '0.05em', fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}>
                  {year}
                </Typography>
                <Box sx={{ width: '1px', flex: 1, mt: 0.5, bgcolor: i < 5 ? `${accent}30` : 'transparent' }} />
              </Box>
              <Box sx={{ pb: i < 5 ? 1 : 0 }}>
                <Typography sx={{
                  fontFamily: '"Raleway", sans-serif',
                  fontSize: '0.74rem', fontWeight: 700,
                  color: 'text.primary', mb: 0.5,
                }}>
                  {title}
                </Typography>
                <Typography sx={{
                  fontFamily: '"Raleway", sans-serif',
                  fontSize: '0.76rem', color: 'text.secondary',
                  lineHeight: 1.75,
                }}>
                  {body}
                </Typography>
              </Box>
            </Box>
          ))}

          <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2.5, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {[
              ['Founded', '1987'],
              ['Acquisition', 'Dec 2004'],
              ['Final bid', '$10.3 B'],
              ['Employees laid off', '~5,000'],
              ['Mascot', 'Golden Retriever'],
            ].map(([label, val]) => (
              <Box key={label} sx={{
                display: 'flex', alignItems: 'center', gap: 0.75,
                px: 1.5, py: 0.6,
                border: '1px solid', borderColor: 'divider',
                borderRadius: '2px',
                bgcolor: `${accent}08`,
              }}>
                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.56rem', color: 'text.disabled', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                  {label}
                </Typography>
                <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.65rem', color: accent, fontWeight: 700 }}>
                  {val}
                </Typography>
              </Box>
            ))}
          </Box>

        </Box>
      </DialogContent>
    </Dialog>

    {/* ── About Sparky dialog ─────────────────────────────────────── */}
    <Dialog
      open={aboutOpen}
      onClose={() => setAboutOpen(false)}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'background.paper',
          backgroundImage: 'none',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
        },
      }}
    >
      <Box sx={{ height: 2, background: `linear-gradient(90deg, transparent 0%, ${accent} 30%, ${accent}dd 70%, transparent 100%)` }} />

      <DialogContent sx={{ textAlign: 'center', px: 4, py: 3.5 }}>

        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
          <SparkyDog size={160} />
        </Box>

        <Typography sx={{
          fontFamily: '"Cormorant Garamond", serif',
          fontSize: '2.4rem', fontWeight: 700,
          color: 'text.primary', letterSpacing: '0.06em', lineHeight: 1,
        }}>
          Sparky
        </Typography>
        <Typography sx={{
          fontFamily: '"Raleway", sans-serif',
          fontSize: '0.54rem', letterSpacing: '0.32em',
          color: accent, textTransform: 'uppercase', mt: 0.5, mb: 0.25,
        }}>
          PeopleSoft Analytics Tool
        </Typography>

        <Box sx={{ height: '1px', bgcolor: 'divider', my: 2.5 }} />

        <Typography sx={{
          fontFamily: '"Raleway", sans-serif',
          fontSize: '0.8rem', color: 'text.secondary',
          lineHeight: 1.85, fontStyle: 'italic', mb: 2.5,
        }}>
          Named in honour of the original <strong style={{ fontStyle: 'normal', fontWeight: 700 }}>PeopleSoft Sparky</strong> — the golden
          retriever mascot who made enterprise HR software approachable, joyful, and human.
          His spirit lives on in every run.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, textAlign: 'left', mb: 2.5 }}>
          {[
            ['Frontend',  'React 18 · MUI v5 · Recharts · Vite'],
            ['Backend',   'FastAPI · SQLAlchemy · Neon PostgreSQL'],
            ['Auth',      'Clerk'],
            ['Built by',  'Mythics Inc.'],
          ].map(([label, value]) => (
            <Box key={label} sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
              <Typography sx={{
                fontFamily: '"Raleway", sans-serif',
                fontSize: '0.58rem', color: 'text.disabled',
                letterSpacing: '0.18em', textTransform: 'uppercase',
                flexShrink: 0, width: 68,
              }}>
                {label}
              </Typography>
              <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider', opacity: 0.5 }} />
              <Typography sx={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '0.64rem', color: 'text.secondary',
                flexShrink: 0,
              }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>

        <Box sx={{ height: '1px', bgcolor: 'divider', mb: 2 }} />

        <Typography sx={{
          fontFamily: '"Raleway", sans-serif',
          fontSize: '0.58rem', color: 'text.disabled', letterSpacing: '0.06em',
        }}>
          © 2024–2025 Mythics Inc. · All rights reserved.
        </Typography>

      </DialogContent>
    </Dialog>
    </>
  )
}
