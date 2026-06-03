import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, Button, Card, CardContent, Grid, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Select, MenuItem, FormControl, InputLabel,
  Switch, FormControlLabel, Alert, CircularProgress,
  IconButton, Tooltip,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import AddIcon          from '@mui/icons-material/Add'
import EditIcon         from '@mui/icons-material/Edit'
import DeleteIcon       from '@mui/icons-material/DeleteOutline'
import ScheduleIcon     from '@mui/icons-material/Schedule'
import CheckCircleIcon  from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { useAuth } from '../AuthContext'
import { listConfigs, listSchedules, createSchedule, updateSchedule, deleteSchedule, formatApiError } from '../api'
import MythicsLoader from '../components/MythicsLoader'

const FREQ_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }
const DOW_LABELS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS       = Array.from({ length: 24 }, (_, i) => i)
const MINUTES     = [0, 15, 30, 45]
const DOM         = Array.from({ length: 28 }, (_, i) => i + 1)

function pad(n) { return String(n).padStart(2, '0') }

function scheduleDescription(s) {
  const time = `${pad(s.run_hour)}:${pad(s.run_minute)} UTC`
  if (s.frequency === 'weekly')  return `Every ${DOW_LABELS[s.day_of_week]} at ${time}`
  if (s.frequency === 'monthly') return `Day ${s.day_of_month} of month at ${time}`
  return `Every day at ${time}`
}

const EMPTY_FORM = {
  config_id: '', label: '', frequency: 'daily',
  run_hour: 6, run_minute: 0, day_of_week: 0, day_of_month: 1, is_active: true,
}

export default function SchedulesPage() {
  const { token } = useAuth()
  const theme  = useTheme()
  const accent = theme.palette.primary.main

  const [schedules, setSchedules] = useState([])
  const [configs,   setConfigs]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId,  setEditingId]  = useState(null)
  const [form,       setForm]       = useState(EMPTY_FORM)

  const refresh = useCallback(() => {
    if (!token) return
    return Promise.all([listSchedules(token), listConfigs(token)])
      .then(([s, c]) => { setSchedules(s.data); setConfigs(c.data) })
      .catch((e) => setError(formatApiError(e)))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => { refresh() }, [refresh])

  const openNew = () => {
    setForm({ ...EMPTY_FORM, config_id: configs[0]?.id || '' })
    setEditingId(null)
    setDialogOpen(true)
  }

  const openEdit = (s) => {
    setForm({
      config_id: s.config_id, label: s.label, frequency: s.frequency,
      run_hour: s.run_hour, run_minute: s.run_minute,
      day_of_week: s.day_of_week, day_of_month: s.day_of_month,
      is_active: s.is_active,
    })
    setEditingId(s.id)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.config_id) return
    setSaving(true)
    setError(null)
    try {
      const payload = { ...form, config_id: Number(form.config_id) }
      if (editingId) await updateSchedule(editingId, payload, token)
      else           await createSchedule(payload, token)
      setDialogOpen(false)
      await refresh()
    } catch (e) {
      setError(formatApiError(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this schedule?')) return
    try {
      await deleteSchedule(id, token)
      await refresh()
    } catch (e) {
      setError(formatApiError(e))
    }
  }

  const f = (k) => (v) => setForm((p) => ({ ...p, [k]: v }))

  // ── keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName ?? ''
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return
      const mod = e.ctrlKey || e.metaKey
      if (e.key === 'Escape' && dialogOpen) { setDialogOpen(false); return }
      if (mod && e.key === 's' && dialogOpen) { e.preventDefault(); handleSave(); return }
      if ((e.key === 'n' || e.key === 'N') && !mod && !dialogOpen) { openNew(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialogOpen, handleSave, openNew])

  if (loading) return <MythicsLoader size={60} sx={{ py: 10 }} />

  return (
    <Box sx={{ px: { xs: 3, sm: 5 }, pt: 4, pb: 6 }}>
      <Box sx={{ height: 2, background: `linear-gradient(90deg, ${accent}cc, transparent 70%)`, mb: 4, mx: -5 }} />

      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', mb: 4 }}>
        <Box>
          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.54rem', letterSpacing: '0.32em', color: 'text.disabled', textTransform: 'uppercase', mb: 0.5 }}>
            Automation
          </Typography>
          <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '2.4rem', fontWeight: 700, color: 'text.primary', lineHeight: 1 }}>
            Scheduled Runs
          </Typography>
        </Box>
        <Button
          startIcon={<AddIcon />}
          onClick={openNew}
          disabled={!configs.length}
          sx={{
            bgcolor: accent, color: 'background.default',
            fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.72rem',
            letterSpacing: '0.14em', px: 3, py: 1.2, borderRadius: '2px',
            '&:hover': { bgcolor: 'primary.light' }, '&:disabled': { opacity: 0.45 },
          }}
        >
          New Schedule
        </Button>
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>{error}</Alert>}

      {!configs.length && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Create a configuration in Settings before setting up schedules.
        </Alert>
      )}

      {schedules.length === 0 && configs.length > 0 && (
        <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', p: 6, textAlign: 'center' }}>
          <ScheduleIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
          <Typography sx={{ color: 'text.secondary', fontFamily: '"Raleway", sans-serif', mb: 2 }}>
            No schedules yet. Runs will fire automatically on your chosen schedule.
          </Typography>
          <Button onClick={openNew} variant="contained"
            sx={{ bgcolor: accent, color: 'background.default', fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.72rem' }}>
            Create Schedule
          </Button>
        </Card>
      )}

      <Grid container spacing={2}>
        {schedules.map((s) => (
          <Grid item xs={12} sm={6} md={4} key={s.id}>
            <Card variant="outlined" sx={{
              bgcolor: 'background.paper', borderColor: s.is_active ? `${accent}44` : 'divider',
              position: 'relative', overflow: 'hidden',
            }}>
              <Box sx={{ height: 2, bgcolor: s.is_active ? accent : 'divider', opacity: 0.6 }} />
              <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Box sx={{ flex: 1, mr: 1 }}>
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.85rem', color: 'text.primary' }}>
                      {s.label || configs.find((c) => c.id === s.config_id)?.name || `Config #${s.config_id}`}
                    </Typography>
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.65rem', color: 'text.secondary', mt: 0.4 }}>
                      {scheduleDescription(s)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(s)} sx={{ color: 'text.disabled', '&:hover': { color: accent } }}><EditIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" onClick={() => handleDelete(s.id)} sx={{ color: 'text.disabled', '&:hover': { color: '#b45050' } }}><DeleteIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                  <Chip
                    label={FREQ_LABELS[s.frequency] || s.frequency}
                    size="small"
                    sx={{ height: 18, fontSize: '0.58rem', bgcolor: `${accent}14`, color: accent, fontFamily: '"Raleway", sans-serif' }}
                  />
                  <Chip
                    label={s.is_active ? 'Active' : 'Paused'}
                    size="small"
                    sx={{ height: 18, fontSize: '0.58rem',
                      bgcolor: s.is_active ? 'rgba(107,143,113,0.14)' : 'rgba(90,80,64,0.14)',
                      color: s.is_active ? '#6b8f71' : '#5a5040',
                      fontFamily: '"Raleway", sans-serif' }}
                  />
                  {s.last_status === 'success' && <Chip icon={<CheckCircleIcon sx={{ fontSize: '11px !important', color: '#6b8f71 !important' }} />} label="Last: OK" size="small" sx={{ height: 18, fontSize: '0.58rem', bgcolor: 'rgba(107,143,113,0.10)', color: '#6b8f71' }} />}
                  {s.last_status === 'error'   && <Chip icon={<ErrorOutlineIcon sx={{ fontSize: '11px !important', color: '#b45050 !important' }} />} label="Last: Error" size="small" sx={{ height: 18, fontSize: '0.58rem', bgcolor: 'rgba(180,80,80,0.10)', color: '#b45050' }} />}
                </Box>

                {s.next_run_at && (
                  <Typography sx={{ mt: 1.5, fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', color: 'text.disabled' }}>
                    Next: {new Date(s.next_run_at).toLocaleString()}
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* ── Create / Edit dialog ──────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { bgcolor: 'background.paper', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.5rem', fontWeight: 700 }}>
          {editingId ? 'Edit Schedule' : 'New Schedule'}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '16px !important' }}>
          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

          <FormControl fullWidth size="small">
            <InputLabel sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>Configuration</InputLabel>
            <Select value={form.config_id} label="Configuration" onChange={(e) => f('config_id')(e.target.value)}
              sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' }}>
              {configs.map((c) => <MenuItem key={c.id} value={c.id} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' }}>{c.name}</MenuItem>)}
            </Select>
          </FormControl>

          <TextField
            label="Label (optional)" size="small" fullWidth
            value={form.label} onChange={(e) => f('label')(e.target.value)}
            placeholder="Leave blank to use config name"
            InputProps={{ sx: { fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' } }}
            InputLabelProps={{ sx: { fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' } }}
          />

          <FormControl fullWidth size="small">
            <InputLabel sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>Frequency</InputLabel>
            <Select value={form.frequency} label="Frequency" onChange={(e) => f('frequency')(e.target.value)}
              sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' }}>
              {Object.entries(FREQ_LABELS).map(([k, v]) => <MenuItem key={k} value={k} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' }}>{v}</MenuItem>)}
            </Select>
          </FormControl>

          {form.frequency === 'weekly' && (
            <FormControl fullWidth size="small">
              <InputLabel sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>Day of week</InputLabel>
              <Select value={form.day_of_week} label="Day of week" onChange={(e) => f('day_of_week')(e.target.value)}
                sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' }}>
                {DOW_LABELS.map((d, i) => <MenuItem key={i} value={i} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' }}>{d}</MenuItem>)}
              </Select>
            </FormControl>
          )}

          {form.frequency === 'monthly' && (
            <FormControl fullWidth size="small">
              <InputLabel sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>Day of month</InputLabel>
              <Select value={form.day_of_month} label="Day of month" onChange={(e) => f('day_of_month')(e.target.value)}
                sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' }}>
                {DOM.map((d) => <MenuItem key={d} value={d} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' }}>{d}</MenuItem>)}
              </Select>
            </FormControl>
          )}

          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>Hour (UTC)</InputLabel>
              <Select value={form.run_hour} label="Hour (UTC)" onChange={(e) => f('run_hour')(e.target.value)}
                sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' }}>
                {HOURS.map((h) => <MenuItem key={h} value={h} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' }}>{pad(h)}:00</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>Minute</InputLabel>
              <Select value={form.run_minute} label="Minute" onChange={(e) => f('run_minute')(e.target.value)}
                sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' }}>
                {MINUTES.map((m) => <MenuItem key={m} value={m} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' }}>:{pad(m)}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>

          <FormControlLabel
            control={<Switch checked={form.is_active} onChange={(e) => f('is_active')(e.target.checked)} size="small" />}
            label={<Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>Active</Typography>}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDialogOpen(false)}
            sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !form.config_id}
            sx={{ bgcolor: accent, color: 'background.default', fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.72rem', px: 3, '&:hover': { bgcolor: 'primary.light' } }}>
            {saving ? <CircularProgress size={14} sx={{ color: 'background.default' }} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
