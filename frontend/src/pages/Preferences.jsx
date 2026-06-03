import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, Card, CardContent, Grid,
  Switch, FormControlLabel, Select, MenuItem,
  FormControl, InputLabel, Slider, Button,
  CircularProgress, Alert, Divider, Chip, TextField,
} from '@mui/material'
import TuneIcon         from '@mui/icons-material/Tune'
import SaveIcon         from '@mui/icons-material/Save'
import RestoreIcon      from '@mui/icons-material/Restore'
import SuccessCheck     from '../components/SuccessCheck'
import { useAuth } from '../AuthContext'
import { getPreferences, updatePreferences, getNotificationSettings, updateNotificationSettings, formatApiError } from '../api'
import MythicsLoader from '../components/MythicsLoader'
import KbdHint, { MOD } from '../components/KbdHint'

const DEFAULTS = {
  dateFormat:                'YYYY-MM-DD',
  dateTimeFormat:            'YYYY-MM-DD HH:mm:ss',
  numericThousandsSeparator: true,
  numericDecimalPlaces:      2,
  nullDisplay:               '',
  booleanDisplay:            'true/false',
  maxColumnWidth:            300,
  autosizeColumns:           true,
  hideBlankColumns:          false,
  defaultRowLimit:           500,
  dashboardView:             'operational',
  runNotifications:          true,
  compactMode:               false,
}

const DATE_FORMATS    = ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY', 'MMM D, YYYY']
const BOOL_DISPLAYS   = ['true/false', 'yes/no', '1/0', 'on/off']
const DASHBOARD_VIEWS = ['operational', 'functional', 'analyze']
const ROW_LIMITS      = [100, 200, 500, 1000, 2000]

function SectionCard({ title, children }) {
  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'text.secondary', mb: 2 }}>
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  )
}

function Row({ label, sub, children }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1, gap: 2 }}>
      <Box>
        <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem', color: 'text.primary' }}>{label}</Typography>
        {sub && <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.62rem', color: 'text.disabled', mt: 0.2 }}>{sub}</Typography>}
      </Box>
      <Box sx={{ flexShrink: 0 }}>{children}</Box>
    </Box>
  )
}

const NOTIF_DEFAULTS = {
  notify_on_success: true, notify_on_failure: true,
  email_enabled: false, email_address: '',
  slack_webhook_url: '', teams_webhook_url: '',
}

export default function Preferences() {
  const { token } = useAuth()
  const [prefs,        setPrefs]        = useState(DEFAULTS)
  const [notif,        setNotif]        = useState(NOTIF_DEFAULTS)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [savingNotif,  setSavingNotif]  = useState(false)
  const [savedNotif,   setSavedNotif]   = useState(false)
  const [error,        setError]        = useState(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [prefsRes, notifRes] = await Promise.all([getPreferences(token), getNotificationSettings(token)])
      setPrefs({ ...DEFAULTS, ...prefsRes.data })
      setNotif({ ...NOTIF_DEFAULTS, ...notifRes.data })
    } catch (e) {
      setError(formatApiError(e, 'Failed to load preferences'))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const set = (key) => (val) => setPrefs((p) => ({ ...p, [key]: val }))
  const setN = (key) => (val) => setNotif((p) => ({ ...p, [key]: val }))

  const handleSave = async () => {
    setSaving(true); setError(null); setSaved(false)
    try {
      await updatePreferences(prefs, token)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(formatApiError(e, 'Failed to save preferences'))
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNotif = async () => {
    setSavingNotif(true); setSavedNotif(false)
    try {
      await updateNotificationSettings(notif, token)
      setSavedNotif(true)
      setTimeout(() => setSavedNotif(false), 2500)
    } catch (e) {
      setError(formatApiError(e, 'Failed to save notification settings'))
    } finally {
      setSavingNotif(false)
    }
  }

  const handleReset = () => setPrefs(DEFAULTS)

  // ── keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName ?? ''
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 's') { e.preventDefault(); handleSave(); return }
      if (mod && e.key === 'R' && e.shiftKey) { e.preventDefault(); handleReset(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSave])

  if (loading) return <MythicsLoader sx={{ minHeight: '60vh' }} />

  return (
    <Box sx={{ px: { xs: 2, sm: 4 }, py: 4, maxWidth: 760, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.57rem', letterSpacing: '0.3em', color: 'text.disabled', textTransform: 'uppercase', mb: 0.5 }}>
            Account
          </Typography>
          <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '2rem', fontWeight: 700, color: 'text.primary' }}>
            Preferences
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center' }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RestoreIcon sx={{ fontSize: 15 }} />}
            onClick={handleReset}
            sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', borderColor: 'divider', color: 'text.secondary' }}
          >
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>Reset<KbdHint keys={`${MOD}+Shift+R`} /></Box>
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={saving ? <CircularProgress size={14} /> : <SaveIcon sx={{ fontSize: 15 }} />}
            onClick={handleSave}
            disabled={saving}
            sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', bgcolor: 'primary.main', color: 'background.default' }}
          >
            {saved ? 'Saved!' : <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>Save<KbdHint keys={`${MOD}+S`} /></Box>}
          </Button>
          {saved && <SuccessCheck size={30} />}
        </Box>
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

        {/* Date & numbers */}
        <SectionCard title="Date & Numbers">
          <Row label="Date format">
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <Select value={prefs.dateFormat} onChange={(e) => set('dateFormat')(e.target.value)} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.8rem' }}>
                {DATE_FORMATS.map((f) => <MenuItem key={f} value={f} sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.78rem' }}>{f}</MenuItem>)}
              </Select>
            </FormControl>
          </Row>
          <Divider sx={{ borderColor: 'divider', my: 0.5 }} />
          <Row label="Thousands separator" sub="Show commas in large numbers">
            <Switch checked={prefs.numericThousandsSeparator} onChange={(e) => set('numericThousandsSeparator')(e.target.checked)} size="small" />
          </Row>
          <Divider sx={{ borderColor: 'divider', my: 0.5 }} />
          <Row label="Decimal places" sub="Applied to numeric columns">
            <Box sx={{ width: 140 }}>
              <Slider
                value={prefs.numericDecimalPlaces}
                onChange={(_, v) => set('numericDecimalPlaces')(v)}
                min={0} max={6} step={1} marks
                size="small"
                valueLabelDisplay="auto"
              />
            </Box>
          </Row>
          <Divider sx={{ borderColor: 'divider', my: 0.5 }} />
          <Row label="Boolean display">
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <Select value={prefs.booleanDisplay} onChange={(e) => set('booleanDisplay')(e.target.value)} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.8rem' }}>
                {BOOL_DISPLAYS.map((b) => <MenuItem key={b} value={b} sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.78rem' }}>{b}</MenuItem>)}
              </Select>
            </FormControl>
          </Row>
        </SectionCard>

        {/* Dashboard */}
        <SectionCard title="Dashboard">
          <Row label="Default view" sub="Which tab opens first on Dashboard">
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select value={prefs.dashboardView} onChange={(e) => set('dashboardView')(e.target.value)} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.8rem', textTransform: 'capitalize' }}>
                {DASHBOARD_VIEWS.map((v) => <MenuItem key={v} value={v} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem', textTransform: 'capitalize' }}>{v}</MenuItem>)}
              </Select>
            </FormControl>
          </Row>
          <Divider sx={{ borderColor: 'divider', my: 0.5 }} />
          <Row label="Default row limit" sub="Maximum rows returned by queries">
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <Select value={prefs.defaultRowLimit} onChange={(e) => set('defaultRowLimit')(e.target.value)} sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8rem' }}>
                {ROW_LIMITS.map((n) => <MenuItem key={n} value={n} sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.78rem' }}>{n.toLocaleString()}</MenuItem>)}
              </Select>
            </FormControl>
          </Row>
          <Divider sx={{ borderColor: 'divider', my: 0.5 }} />
          <Row label="Auto-size columns" sub="Fit column widths to content on load">
            <Switch checked={prefs.autosizeColumns} onChange={(e) => set('autosizeColumns')(e.target.checked)} size="small" />
          </Row>
          <Divider sx={{ borderColor: 'divider', my: 0.5 }} />
          <Row label="Hide blank columns" sub="Collapse columns that are entirely empty">
            <Switch checked={prefs.hideBlankColumns} onChange={(e) => set('hideBlankColumns')(e.target.checked)} size="small" />
          </Row>
          <Divider sx={{ borderColor: 'divider', my: 0.5 }} />
          <Row label="Max column width" sub="Pixels (300–800)">
            <Box sx={{ width: 140 }}>
              <Slider
                value={prefs.maxColumnWidth}
                onChange={(_, v) => set('maxColumnWidth')(v)}
                min={100} max={800} step={50}
                size="small"
                valueLabelDisplay="auto"
              />
            </Box>
          </Row>
        </SectionCard>

        {/* Notifications */}
        <SectionCard title="Notifications & Display">
          <Row label="Run notifications" sub="Alert when a PeopleSoft run completes">
            <Switch checked={prefs.runNotifications} onChange={(e) => set('runNotifications')(e.target.checked)} size="small" />
          </Row>
          <Divider sx={{ borderColor: 'divider', my: 0.5 }} />
          <Row label="Compact mode" sub="Reduce spacing in tables and cards">
            <Switch checked={prefs.compactMode} onChange={(e) => set('compactMode')(e.target.checked)} size="small" />
          </Row>
        </SectionCard>

        {/* Email & Webhook notifications */}
        <SectionCard title="Email & Webhook Notifications">
          <Row label="Notify on success" sub="Send notification when a run completes successfully">
            <Switch checked={notif.notify_on_success} onChange={(e) => setN('notify_on_success')(e.target.checked)} size="small" />
          </Row>
          <Divider sx={{ borderColor: 'divider', my: 0.5 }} />
          <Row label="Notify on failure" sub="Send notification when a run fails">
            <Switch checked={notif.notify_on_failure} onChange={(e) => setN('notify_on_failure')(e.target.checked)} size="small" />
          </Row>
          <Divider sx={{ borderColor: 'divider', my: 0.5 }} />
          <Row label="Send email" sub="Requires SMTP_HOST env var on the backend">
            <Switch checked={notif.email_enabled} onChange={(e) => setN('email_enabled')(e.target.checked)} size="small" />
          </Row>
          {notif.email_enabled && (
            <Box sx={{ mt: 1.5 }}>
              <TextField
                fullWidth size="small" label="Email address (blank = use account email)"
                value={notif.email_address}
                onChange={(e) => setN('email_address')(e.target.value)}
                InputProps={{ sx: { fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' } }}
                InputLabelProps={{ sx: { fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' } }}
              />
            </Box>
          )}
          <Divider sx={{ borderColor: 'divider', my: 1 }} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField
              fullWidth size="small" label="Slack webhook URL (optional)"
              value={notif.slack_webhook_url}
              onChange={(e) => setN('slack_webhook_url')(e.target.value)}
              placeholder="https://hooks.slack.com/services/…"
              InputProps={{ sx: { fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' } }}
              InputLabelProps={{ sx: { fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' } }}
            />
            <TextField
              fullWidth size="small" label="Teams webhook URL (optional)"
              value={notif.teams_webhook_url}
              onChange={(e) => setN('teams_webhook_url')(e.target.value)}
              placeholder="https://outlook.office.com/webhook/…"
              InputProps={{ sx: { fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' } }}
              InputLabelProps={{ sx: { fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' } }}
            />
          </Box>
          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              size="small" onClick={handleSaveNotif} disabled={savingNotif}
              startIcon={savingNotif ? <CircularProgress size={13} /> : <SaveIcon sx={{ fontSize: 14 }} />}
              sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem',
                bgcolor: 'primary.main', color: 'background.default', px: 2 }}
              variant="contained"
            >
              {savedNotif ? 'Saved!' : 'Save notification settings'}
            </Button>
            {savedNotif && <SuccessCheck size={28} />}
          </Box>
        </SectionCard>

      </Box>
    </Box>
  )
}
