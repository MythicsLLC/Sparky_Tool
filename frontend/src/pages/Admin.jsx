import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Box, Typography, CircularProgress, Grid, Card, CardContent,
  Tabs, Tab, Chip, Alert, Tooltip, IconButton, TextField, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Select, MenuItem, FormControl, InputLabel, Switch, FormControlLabel,
  Divider, Collapse,
} from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import ViewToggle from '../components/ViewToggle'
import { getDataGridSx } from '../utils/dataGridSx'
import { useTheme } from '@mui/material/styles'
import RefreshIcon               from '@mui/icons-material/Refresh'
import ContentCopyIcon           from '@mui/icons-material/ContentCopy'
import DeleteIcon                from '@mui/icons-material/Delete'
import EditIcon                  from '@mui/icons-material/Edit'
import SearchIcon                from '@mui/icons-material/Search'
import AdminPanelSettingsIcon    from '@mui/icons-material/AdminPanelSettings'
import PersonIcon                from '@mui/icons-material/Person'
import PersonAddIcon             from '@mui/icons-material/PersonAdd'
import ShieldIcon                from '@mui/icons-material/Shield'
import CheckCircleOutlineIcon    from '@mui/icons-material/CheckCircleOutline'
import ErrorOutlineIcon          from '@mui/icons-material/ErrorOutline'
import HourglassEmptyIcon        from '@mui/icons-material/HourglassEmpty'
import BarChartIcon              from '@mui/icons-material/BarChart'
import TrendingUpIcon            from '@mui/icons-material/TrendingUp'
import GroupIcon                 from '@mui/icons-material/Group'
import SpeedIcon                 from '@mui/icons-material/Speed'
import StorageIcon               from '@mui/icons-material/Storage'
import CloudSyncIcon             from '@mui/icons-material/CloudSync'
import CheckIcon                 from '@mui/icons-material/Check'
import SaveIcon                  from '@mui/icons-material/Save'
import CancelIcon                from '@mui/icons-material/Cancel'
import SendIcon                  from '@mui/icons-material/Send'
import WarningAmberIcon          from '@mui/icons-material/WarningAmber'
import SmartToyIcon             from '@mui/icons-material/SmartToy'
import AddIcon                  from '@mui/icons-material/Add'
import KeyIcon                  from '@mui/icons-material/Key'
import StarIcon                 from '@mui/icons-material/Star'
import StarOutlineIcon          from '@mui/icons-material/StarOutline'
import ToggleOnIcon             from '@mui/icons-material/ToggleOn'
import ToggleOffIcon            from '@mui/icons-material/ToggleOff'
import LinkIcon                 from '@mui/icons-material/Link'
import CodeIcon                 from '@mui/icons-material/Code'
import FlagIcon                 from '@mui/icons-material/Flag'
import TimelineIcon             from '@mui/icons-material/Timeline'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import FiberManualRecordIcon    from '@mui/icons-material/FiberManualRecord'
import RocketLaunchIcon        from '@mui/icons-material/RocketLaunch'
import OpenInNewIcon           from '@mui/icons-material/OpenInNew'
import GitHubIcon              from '@mui/icons-material/GitHub'
import RefreshOutlinedIcon     from '@mui/icons-material/RefreshOutlined'
import { LineChart, BarChart, PieChart } from '@mui/x-charts'
import { useAuth } from '../AuthContext'
import MythicsLoader from '../components/MythicsLoader'
import {
  listAdminStats, listAdminLogs, listAdminUsers, listAdminRuns,
  inviteAdminUser, setUserRole, updateAdminUser, deleteAdminUser,
  listAiModels, createAiModel, updateAiModel, deleteAiModel, setDefaultAiModel,
  listWideEvents,
  listAdminFeatureFlags, createFeatureFlag, updateFeatureFlag,
  toggleFeatureFlag, deleteFeatureFlag,
  adminConvStats,
  listAdminEngines, createEngine, updateEngine, deleteEngine,
  getVercelStats,
  formatApiError,
} from '../api'

// ── tiny helpers ──────────────────────────────────────────────────────────────

function fmtMs(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fmtDay(str) {
  if (!str) return ''
  return new Date(str).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── MonoValue ─────────────────────────────────────────────────────────────────

function MonoValue({ val }) {
  const [copied, setCopied] = useState(false)
  if (!val) {
    return (
      <Typography component="span" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.7rem', color: 'text.disabled' }}>
        —
      </Typography>
    )
  }
  const copy = () => {
    navigator.clipboard.writeText(val)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Typography component="span" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.7rem', color: 'primary.main' }}>
        {val}
      </Typography>
      <Tooltip title={copied ? 'Copied!' : 'Copy'} placement="top">
        <IconButton size="small" onClick={copy} sx={{ p: 0.25, opacity: 0.45, '&:hover': { opacity: 1 } }}>
          {copied ? <CheckIcon sx={{ fontSize: 11, color: '#6b8f71' }} /> : <ContentCopyIcon sx={{ fontSize: 11 }} />}
        </IconButton>
      </Tooltip>
    </Box>
  )
}

// ── StatusChip ────────────────────────────────────────────────────────────────

function StatusChip({ status, sftp_skipped }) {
  let label = status
  let bg    = 'rgba(201,168,76,0.12)'
  let color = '#c9a84c'
  let Icon  = HourglassEmptyIcon

  if (status === 'success' && sftp_skipped) {
    label = 'PS only'; bg = 'rgba(100,149,180,0.14)'; color = '#6495b4'; Icon = CloudSyncIcon
  } else if (status === 'success') {
    label = 'success'; bg = 'rgba(107,143,113,0.14)'; color = '#6b8f71'; Icon = CheckCircleOutlineIcon
  } else if (status === 'error') {
    label = 'error'; bg = 'rgba(180,80,80,0.16)'; color = '#b45050'; Icon = ErrorOutlineIcon
  }

  const chip = (
    <Chip
      icon={<Icon sx={{ fontSize: '12px !important', color: `${color} !important` }} />}
      label={label}
      size="small"
      sx={{ bgcolor: bg, color, fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', height: 22 }}
    />
  )
  if (status === 'success' && sftp_skipped) {
    return <Tooltip title="PeopleSoft triggered — SFTP not configured, no CSV downloaded" arrow>{chip}</Tooltip>
  }
  return chip
}

// ── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, Icon, accent }) {
  const theme = useTheme()
  const color = accent || theme.palette.primary.main
  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, bgcolor: color, opacity: 0.75 }} />
      <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'text.disabled', mb: 1 }}>
              {label}
            </Typography>
            <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '2.2rem', fontWeight: 700, color: 'text.primary', lineHeight: 1 }}>{value}</Typography>
            {sub && <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.74rem', color: 'text.disabled', mt: 0.75 }}>{sub}</Typography>}
          </Box>
          {Icon && (
            <Box sx={{ width: 36, height: 36, borderRadius: '6px', bgcolor: `${color}1e`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon sx={{ fontSize: 18, color }} />
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  )
}

// ── RoleSelect: inline role picker with per-row loading ───────────────────────

function RoleSelect({ userId, currentRole, isSelf, onRoleChange, loadingId }) {
  const theme = useTheme()
  const accent = theme.palette.primary.main
  const isLoading = loadingId === userId
  if (isSelf) {
    return (
      <Chip
        label={currentRole}
        size="small"
        icon={currentRole === 'admin' ? <ShieldIcon sx={{ fontSize: '11px !important' }} /> : <PersonIcon sx={{ fontSize: '11px !important' }} />}
        sx={{
          bgcolor: currentRole === 'admin' ? `${accent}1a` : 'rgba(128,128,128,0.1)',
          color: currentRole === 'admin' ? 'primary.main' : 'text.secondary',
          fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', height: 22,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}
      />
    )
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Select
        value={currentRole}
        size="small"
        disabled={isLoading}
        onChange={(e) => onRoleChange(userId, e.target.value)}
        sx={{
          fontFamily: '"Raleway", sans-serif',
          fontSize: '0.7rem',
          height: 28,
          minWidth: 90,
          color: currentRole === 'admin' ? 'primary.main' : 'text.secondary',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: currentRole === 'admin' ? `${accent}40` : 'divider',
          },
          '& .MuiSelect-icon': { fontSize: 16 },
        }}
      >
        <MenuItem value="user"  sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.75rem' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <PersonIcon sx={{ fontSize: 14, color: 'text.secondary' }} /> user
          </Box>
        </MenuItem>
        <MenuItem value="admin" sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.75rem' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <ShieldIcon sx={{ fontSize: 14, color: 'primary.main' }} /> admin
          </Box>
        </MenuItem>
      </Select>
      {isLoading && <CircularProgress size={12} sx={{ color: 'primary.main' }} />}
    </Box>
  )
}

// ── Invite dialog ─────────────────────────────────────────────────────────────

function InviteDialog({ open, onClose, onInvited, token }) {
  const [form, setForm]   = useState({ email: '', first_name: '', last_name: '', role: 'user' })
  const [busy, setBusy]   = useState(false)
  const [err,  setErr]    = useState('')

  const reset = () => { setForm({ email: '', first_name: '', last_name: '', role: 'user' }); setErr('') }
  const close = () => { reset(); onClose() }

  const submit = async () => {
    const email = form.email.trim().toLowerCase()
    if (!email || !email.includes('@')) { setErr('A valid email address is required.'); return }
    setBusy(true); setErr('')
    try {
      const res = await inviteAdminUser({ ...form, email }, token)
      onInvited(res.data)
      close()
    } catch (e) {
      setErr(formatApiError(e, 'Failed to invite user. Check that CLERK_API_SECRET is configured.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.4rem', color: 'text.primary', pb: 1 }}>
        Invite a new user
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem', color: 'text.secondary', mb: 2.5, lineHeight: 1.6 }}>
          Creates the account in Clerk and pre-assigns the chosen role. The user will receive a Clerk sign-in email.
        </Typography>
        <Box sx={{ display: 'grid', gap: 2 }}>
          <TextField
            label="Email address *"
            size="small"
            fullWidth
            autoFocus
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            sx={{ '& .MuiInputBase-root': { fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' } }}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <TextField
              label="First name"
              size="small"
              value={form.first_name}
              onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
              sx={{ '& .MuiInputBase-root': { fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' } }}
            />
            <TextField
              label="Last name"
              size="small"
              value={form.last_name}
              onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
              sx={{ '& .MuiInputBase-root': { fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' } }}
            />
          </Box>
          <FormControl size="small" fullWidth>
            <InputLabel sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.8rem' }}>Role</InputLabel>
            <Select
              value={form.role}
              label="Role"
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.8rem' }}
            >
              <MenuItem value="user"  sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <PersonIcon sx={{ fontSize: 15, color: 'text.secondary' }} /> User
                </Box>
              </MenuItem>
              <MenuItem value="admin" sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <ShieldIcon sx={{ fontSize: 15, color: 'primary.main' }} /> Admin
                </Box>
              </MenuItem>
            </Select>
          </FormControl>
          {err && (
            <Alert severity="error" sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.75rem', py: 0.5 }}>{err}</Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={close} variant="outlined" startIcon={<CancelIcon sx={{ fontSize: 15 }} />} sx={{ color: 'text.secondary', borderColor: 'divider', fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          disabled={busy || !form.email.trim()}
          variant="contained"
          startIcon={busy ? <CircularProgress size={14} /> : <SendIcon sx={{ fontSize: 15 }} />}
          sx={{ bgcolor: 'primary.main', color: 'background.default', fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}
        >
          {busy ? 'Sending…' : 'Invite'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function Admin() {
  const { token, user } = useAuth()
  const theme = useTheme()
  const accent = theme.palette.primary.main
  const dark   = theme.palette.mode === 'dark'

  const [tab,     setTab]     = useState(0)
  const [stats,   setStats]   = useState(null)
  const [logs,    setLogs]    = useState([])
  const [users,   setUsers]   = useState([])
  const [runs,    setRuns]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  // filters
  const [runStatusFilter, setRunStatusFilter] = useState('all')
  const [userSearch,      setUserSearch]      = useState('')
  const [logTypeFilter,   setLogTypeFilter]   = useState('all')

  // view-mode toggles (persisted per table)
  const [overviewView, setOverviewView] = useState(() => localStorage.getItem('admin_overview_view') || 'table')
  const [runsView,     setRunsView]     = useState(() => localStorage.getItem('admin_runs_view')     || 'table')
  const [usersView,    setUsersView]    = useState(() => localStorage.getItem('admin_users_view')    || 'table')
  const [logsView,     setLogsView]     = useState(() => localStorage.getItem('admin_logs_view')     || 'table')

  const saveView = (key, setter) => (v) => { setter(v); localStorage.setItem(key, v) }

  const [aiModels,      setAiModels]      = useState([])
  const [aiModelDialog, setAiModelDialog] = useState(null) // null | 'add' | model-object
  const [aiModelForm,   setAiModelForm]   = useState({
    name: '', provider: 'gemini', model_id: '', api_key: '', base_url: '', is_default: false, is_active: true,
  })
  const [aiModelLoading, setAiModelLoading] = useState(false)
  const [deleteAiDialog, setDeleteAiDialog] = useState(null) // null | { id, name }
  const [curlOpen,       setCurlOpen]       = useState(false)
  const [curlText,       setCurlText]       = useState('')

  // ── Wide Events ───────────────────────────────────────────────────────────
  const [wideEvents,      setWideEvents]      = useState([])
  const [wideEventsTotal, setWideEventsTotal] = useState(0)
  const [wideEventSearch, setWideEventSearch] = useState('')
  const [wideLoading,     setWideLoading]     = useState(false)

  // ── Feature Flags ─────────────────────────────────────────────────────────
  const [flags,          setFlags]          = useState([])
  const [flagDialog,     setFlagDialog]     = useState(false)
  const [flagForm,       setFlagForm]       = useState({ key: '', name: '', description: '', enabled: false })
  const [flagLoading,    setFlagLoading]    = useState(false)
  const [deleteFlagDlg,  setDeleteFlagDlg]  = useState(null) // { id, key }

  // ── Engines ───────────────────────────────────────────────────────────────
  const [engines,       setEngines]       = useState([])
  const [engineDialog,  setEngineDialog]  = useState(null) // null | 'add' | engine-object
  const [engineForm,    setEngineForm]    = useState({ name: '', process_name: '', description: '', is_active: true, sort_order: 0 })
  const [engineLoading, setEngineLoading] = useState(false)
  const [deleteEngDlg,  setDeleteEngDlg]  = useState(null) // null | { id, name }

  // ── AI Usage ──────────────────────────────────────────────────────────────
  const [aiUsage, setAiUsage] = useState(null)

  // ── Vercel Analytics ──────────────────────────────────────────────────────
  const [vercel,        setVercel]        = useState(null)
  const [vercelLoading, setVercelLoading] = useState(false)
  const [vercelError,   setVercelError]   = useState(null)

  const loadVercel = useCallback(() => {
    if (!token) return
    setVercelLoading(true)
    setVercelError(null)
    getVercelStats(token)
      .then(r => setVercel(r.data))
      .catch(e => setVercelError(formatApiError(e)))
      .finally(() => setVercelLoading(false))
  }, [token])

  // per-row role loading
  const [roleLoadingId, setRoleLoadingId] = useState(null)

  // dialogs
  const [inviteOpen,    setInviteOpen]    = useState(false)
  const [deleteDialog,  setDeleteDialog]  = useState(null) // { id, email }
  const [deleteClerk,   setDeleteClerk]   = useState(false)
  const [editDialog,    setEditDialog]    = useState(null) // user object
  const [editForm,      setEditForm]      = useState({ first_name: '', last_name: '' })
  const [actionLoading, setActionLoading] = useState(false)

  const load = useCallback(() => {
    if (!token) return
    setLoading(true)
    Promise.all([
      listAdminStats(token),
      listAdminLogs(token,  { limit: 200 }),
      listAdminUsers(token, { limit: 200 }),
      listAdminRuns(token,  { limit: 200 }),
      listAiModels(token),
      listAdminFeatureFlags(token),
      adminConvStats(token).catch(() => ({ data: null })),
      listAdminEngines(token),
    ])
      .then(([statsRes, logsRes, usersRes, runsRes, aiRes, flagRes, usageRes, engRes]) => {
        setStats(statsRes.data)
        setLogs(logsRes.data.items ?? [])
        setUsers(usersRes.data.items ?? [])
        setRuns(runsRes.data.items ?? [])
        setAiModels(aiRes.data.items ?? [])
        setFlags(flagRes.data.items ?? [])
        if (usageRes.data) setAiUsage(usageRes.data)
        setEngines(engRes.data.items ?? [])
        setError(null)
      })
      .catch((err) => setError(formatApiError(err, 'Unable to load admin data')))
      .finally(() => setLoading(false))
  }, [token])

  const loadWideEvents = useCallback((q = '') => {
    if (!token) return
    setWideLoading(true)
    const params = { limit: 200 }
    if (q) params.q = q
    listWideEvents(token, params)
      .then((res) => { setWideEvents(res.data.items ?? []); setWideEventsTotal(res.data.total ?? 0) })
      .catch(() => {})
      .finally(() => setWideLoading(false))
  }, [token])

  useEffect(() => { load() }, [load])

  // ── auto-refresh runs while any run is in "running" status ────────────────
  // Polls every 4 s so instance_id / report_id appear as soon as they land in DB.
  // Stops automatically once no "running" rows remain.
  useEffect(() => {
    if (!token) return
    if (!runs.some((r) => r.status === 'running')) return
    const id = setInterval(() => {
      // Refresh both runs list and stats (which contains recent_runs)
      Promise.all([
        listAdminRuns(token,  { limit: 200 }),
        listAdminStats(token),
      ])
        .then(([runsRes, statsRes]) => {
          setRuns(runsRes.data.items ?? [])
          setStats(statsRes.data)
        })
        .catch(() => {})
    }, 4000)
    return () => clearInterval(id)
  }, [runs, token])

  // ── user actions ──────────────────────────────────────────────────────────

  const handleRoleChange = async (userId, newRole) => {
    setRoleLoadingId(userId)
    try {
      await setUserRole(userId, newRole, token)
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u))
    } catch (err) {
      setError(formatApiError(err, 'Failed to update role'))
    } finally {
      setRoleLoadingId(null)
    }
  }

  const handleDeleteUser = async () => {
    if (!deleteDialog) return
    setActionLoading(true)
    try {
      await deleteAdminUser(deleteDialog.id, { also_clerk: deleteClerk }, token)
      setUsers((prev) => prev.filter((u) => u.id !== deleteDialog.id))
      setDeleteDialog(null)
      setDeleteClerk(false)
    } catch (err) {
      setError(formatApiError(err, 'Failed to delete user'))
    } finally {
      setActionLoading(false)
    }
  }

  const openEdit = (u) => {
    setEditDialog(u)
    setEditForm({ first_name: u.first_name || '', last_name: u.last_name || '' })
  }

  const handleEditSave = async () => {
    if (!editDialog) return
    setActionLoading(true)
    try {
      await updateAdminUser(editDialog.id, editForm, token)
      setUsers((prev) => prev.map((u) => u.id === editDialog.id ? { ...u, ...editForm } : u))
      setEditDialog(null)
    } catch (err) {
      setError(formatApiError(err, 'Failed to update user'))
    } finally {
      setActionLoading(false)
    }
  }

  const handleInvited = (newUser) => {
    // Prepend newly created user to the list so they appear immediately
    setUsers((prev) => {
      const exists = prev.some((u) => u.id === newUser.id)
      return exists ? prev.map((u) => u.id === newUser.id ? newUser : u) : [newUser, ...prev]
    })
  }

  // ── AI model actions ──────────────────────────────────────────────────────

  const openAddModel = () => {
    setAiModelForm({ name: '', provider: 'gemini', model_id: '', api_key: '', base_url: '', is_default: false, is_active: true })
    setCurlOpen(false); setCurlText('')
    setAiModelDialog('add')
  }

  const openEditModel = (m) => {
    setAiModelForm({ name: m.name, provider: m.provider, model_id: m.model_id, api_key: '', base_url: m.base_url, is_default: m.is_default, is_active: m.is_active })
    setCurlOpen(false); setCurlText('')
    setAiModelDialog(m)
  }

  const handleParseCurl = () => {
    const text = curlText.trim()
    if (!text) return
    const parsed = {}

    // API key from Authorization Bearer header
    const authMatch = text.match(/Authorization[^:]*:\s*(?:"|')?Bearer\s+([A-Za-z0-9_\-.]+)/i)
    if (authMatch) parsed.api_key = authMatch[1]

    // First https URL — strip to base (origin + version prefix if present)
    const urlMatch = text.match(/https?:\/\/[^\s'"\\]+/)
    if (urlMatch) {
      try {
        const url = new URL(urlMatch[0])
        const parts = url.pathname.split('/').filter(Boolean)
        const vIdx  = parts.findIndex((p) => /^v\d+/i.test(p))
        parsed.base_url = url.origin + (vIdx >= 0 ? '/' + parts.slice(0, vIdx + 1).join('/') : '')
      } catch {}
    }

    // Model ID from JSON body
    const modelMatch = text.match(/"model"\s*:\s*"([^"]+)"/)
    if (modelMatch) parsed.model_id = modelMatch[1]

    // Infer provider from URL domain then model prefix
    const base = (parsed.base_url || '').toLowerCase()
    const mid  = (parsed.model_id  || '').toLowerCase()
    if      (base.includes('x.ai')            || mid.startsWith('grok'))                         parsed.provider = 'grok'
    else if (base.includes('openai.com')      || mid.startsWith('gpt') || mid.startsWith('o1') || mid.startsWith('o3')) parsed.provider = 'openai'
    else if (base.includes('anthropic.com')   || mid.startsWith('claude'))                       parsed.provider = 'anthropic'
    else if (base.includes('googleapis.com')  || base.includes('generativelanguage') || mid.startsWith('gemini')) parsed.provider = 'gemini'
    else                                                                                          parsed.provider = 'generic'

    setAiModelForm((prev) => ({
      ...prev,
      ...(parsed.api_key  ? { api_key:  parsed.api_key  } : {}),
      ...(parsed.model_id ? { model_id: parsed.model_id } : {}),
      ...(parsed.base_url ? { base_url: parsed.base_url } : {}),
      ...(parsed.provider ? { provider: parsed.provider } : {}),
    }))
    setCurlText('')
    setCurlOpen(false)
  }

  const handleSaveAiModel = async () => {
    setAiModelLoading(true)
    try {
      if (aiModelDialog === 'add') {
        const res = await createAiModel(aiModelForm, token)
        setAiModels((prev) => [...prev, res.data])
      } else {
        const payload = { ...aiModelForm }
        if (!payload.api_key) delete payload.api_key
        const res = await updateAiModel(aiModelDialog.id, payload, token)
        setAiModels((prev) => prev.map((m) => m.id === res.data.id ? res.data : m))
      }
      setAiModelDialog(null)
    } catch (e) {
      setError(formatApiError(e, 'Failed to save model'))
    } finally {
      setAiModelLoading(false)
    }
  }

  const handleDeleteAiModel = async () => {
    if (!deleteAiDialog) return
    setAiModelLoading(true)
    try {
      await deleteAiModel(deleteAiDialog.id, token)
      setAiModels((prev) => prev.filter((m) => m.id !== deleteAiDialog.id))
      setDeleteAiDialog(null)
    } catch (e) {
      setError(formatApiError(e, 'Failed to delete model'))
    } finally {
      setAiModelLoading(false)
    }
  }

  const handleSetDefault = async (id) => {
    try {
      const res = await setDefaultAiModel(id, token)
      setAiModels((prev) => prev.map((m) => ({ ...m, is_default: m.id === res.data.id })))
    } catch (e) {
      setError(formatApiError(e, 'Failed to set default'))
    }
  }

  // ── Engine actions ────────────────────────────────────────────────────────

  const openAddEngine = () => {
    setEngineForm({ name: '', process_name: '', description: '', is_active: true, sort_order: 0 })
    setEngineDialog('add')
  }

  const openEditEngine = (e) => {
    setEngineForm({ name: e.name, process_name: e.process_name, description: e.description, is_active: e.is_active, sort_order: e.sort_order })
    setEngineDialog(e)
  }

  const handleSaveEngine = async () => {
    setEngineLoading(true)
    try {
      if (engineDialog === 'add') {
        const res = await createEngine(engineForm, token)
        setEngines((prev) => [...prev, res.data])
      } else {
        const res = await updateEngine(engineDialog.id, engineForm, token)
        setEngines((prev) => prev.map((e) => e.id === res.data.id ? res.data : e))
      }
      setEngineDialog(null)
    } catch (e) {
      setError(formatApiError(e, 'Failed to save engine'))
    } finally {
      setEngineLoading(false)
    }
  }

  const handleDeleteEngine = async () => {
    if (!deleteEngDlg) return
    setEngineLoading(true)
    try {
      await deleteEngine(deleteEngDlg.id, token)
      setEngines((prev) => prev.filter((e) => e.id !== deleteEngDlg.id))
      setDeleteEngDlg(null)
    } catch (e) {
      setError(formatApiError(e, 'Failed to delete engine'))
    } finally {
      setEngineLoading(false)
    }
  }

  // ── keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName ?? ''
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return
      const mod = e.ctrlKey || e.metaKey
      const anyOpen = inviteOpen || Boolean(deleteDialog) || Boolean(editDialog)
        || Boolean(aiModelDialog) || Boolean(deleteAiDialog)
        || flagDialog || Boolean(deleteFlagDlg)
        || Boolean(deleteEngDlg)

      if (e.key === 'Escape') {
        if (inviteOpen)        { setInviteOpen(false);       return }
        if (deleteDialog)      { setDeleteDialog(null);      return }
        if (editDialog)        { setEditDialog(null);        return }
        if (aiModelDialog)     { setAiModelDialog(null);     return }
        if (deleteAiDialog)    { setDeleteAiDialog(null);    return }
        if (flagDialog)        { setFlagDialog(false);       return }
        if (deleteFlagDlg)     { setDeleteFlagDlg(null);     return }
        if (deleteEngDlg)      { setDeleteEngDlg(null);      return }
        return
      }
      if (anyOpen || mod) return

      if (e.key >= '1' && e.key <= '9') { setTab(Number(e.key) - 1); return }
      if (e.key === 'r' || e.key === 'R') { load(); return }
      if (e.key === 'n' || e.key === 'N') {
        if (tab === 2) { setInviteOpen(true); return }
        if (tab === 4) { openAddModel(); return }
        if (tab === 6) { setFlagDialog(true); return }
        if (tab === 8) { openAddEngine(); return }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, inviteOpen, deleteDialog, editDialog, aiModelDialog, deleteAiDialog, flagDialog, deleteFlagDlg, deleteEngDlg, load, openAddModel, openAddEngine])

  // ── guards ────────────────────────────────────────────────────────────────

  if (!user?.role || user.role !== 'admin') {
    return (
      <Box sx={{ p: 6 }}>
        <Typography sx={{ color: 'text.primary', fontSize: '1.4rem', mb: 2 }}>Admin access required</Typography>
        <Typography sx={{ color: 'text.secondary' }}>Only users with an admin role can view this panel.</Typography>
      </Box>
    )
  }

  if (loading) return <MythicsLoader sx={{ minHeight: '60vh' }} />

  // ── derived ───────────────────────────────────────────────────────────────

  const filteredRuns = runs.filter((r) => {
    if (runStatusFilter === 'all') return true
    if (runStatusFilter === 'ps_only') return r.sftp_skipped && r.status === 'success'
    return r.status === runStatusFilter
  })

  const filteredUsers = users.filter((u) => {
    if (!userSearch) return true
    const q = userSearch.toLowerCase()
    return (
      u.email?.toLowerCase().includes(q) ||
      u.first_name?.toLowerCase().includes(q) ||
      u.last_name?.toLowerCase().includes(q)
    )
  })

  const filteredLogs = logs.filter((e) =>
    logTypeFilter === 'all' ? true : e.event_type === logTypeFilter,
  )

  const logEventTypes = [...new Set(logs.map((e) => e.event_type))].sort()

  const failedStepData = stats?.failed_by_step
    ? Object.entries(stats.failed_by_step).map(([step, count]) => ({ step, count }))
    : []

  const pieData = stats ? [
    { name: 'Success', value: (stats.success_runs || 0) - (stats.sftp_skipped || 0), color: '#6b8f71' },
    { name: 'PS Only', value: stats.sftp_skipped || 0,   color: '#6495b4' },
    { name: 'Error',   value: stats.error_runs   || 0,   color: '#b45050' },
    { name: 'Running', value: stats.running_runs  || 0,  color: accent },
  ].filter((d) => d.value > 0) : []

  const tickFill   = theme.palette.text.secondary

  // tab label helpers
  const tabLabel = (label, count) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      {label}
      {count != null && (
        <Box component="span" sx={{
          minWidth: 18, height: 18, px: 0.5, borderRadius: '9px',
          bgcolor: `${accent}20`, color: 'primary.main',
          fontFamily: '"JetBrains Mono", monospace', fontSize: '0.7rem',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
        }}>
          {count}
        </Box>
      )}
    </Box>
  )

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ flex: 1, minHeight: '100%', bgcolor: 'background.default', px: { xs: 3, sm: 5 }, pt: 4, pb: 6 }}>

      {/* accent sweep line */}
      <Box sx={{ height: 2, background: `linear-gradient(90deg, ${accent}cc, transparent 70%)`, mb: 4, mx: { xs: -3, sm: -5 } }} />

      {/* header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', mb: 4, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.28em', color: 'text.disabled', textTransform: 'uppercase', mb: 0.5 }}>
            System
          </Typography>
          <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '2.4rem', fontWeight: 700, color: 'text.primary', letterSpacing: '0.02em', lineHeight: 1 }}>
            Admin Console
          </Typography>
        </Box>
        <Tooltip title="Reload all data">
          <IconButton onClick={load} size="small" sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: `${accent}12` } }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>{error}</Alert>
      )}

      {/* ── KPI row ───────────────────────────────────────────────────────── */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={6} sm={4} md={2}>
            <StatCard label="Total users"     value={stats.total_users ?? 0}  Icon={GroupIcon} />
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <StatCard label="Total runs"      value={stats.total_runs ?? 0}   Icon={BarChartIcon} sub={`${stats.running_runs ?? 0} running`} />
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <StatCard label="Success rate"    value={`${stats.success_rate ?? 0}%`} Icon={TrendingUpIcon} accent="#6b8f71" sub={`${stats.success_runs} ok · ${stats.error_runs} err`} />
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <StatCard label="Avg runtime"     value={fmtMs(stats.avg_duration_ms)} Icon={SpeedIcon} />
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <StatCard label="AI analyses"     value={(stats.total_conversations ?? 0).toLocaleString()} Icon={SmartToyIcon} sub={`$${(stats.total_ai_cost_usd ?? 0).toFixed(3)} est. cost`} />
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <StatCard label="Feature flags"   value={`${stats.enabled_feature_flags ?? 0} / ${stats.total_feature_flags ?? 0}`} Icon={FlagIcon} accent="#c9a84c" sub="enabled / total" />
          </Grid>
        </Grid>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 3,
          borderBottom: '1px solid',
          borderColor: 'divider',
          '& .MuiTab-root': { fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary', minHeight: 44, gap: 0.5 },
          '& .Mui-selected': { color: 'primary.main' },
          '& .MuiTabs-indicator': { bgcolor: 'primary.main' },
        }}
      >
        <Tab label={tabLabel('Overview')}              icon={<BarChartIcon sx={{ fontSize: 14 }} />}            iconPosition="start" />
        <Tab label={tabLabel('Runs', runs.length)}     icon={<CloudSyncIcon sx={{ fontSize: 14 }} />}           iconPosition="start" />
        <Tab label={tabLabel('Users', users.length)}   icon={<GroupIcon sx={{ fontSize: 14 }} />}               iconPosition="start" />
        <Tab label={tabLabel('Audit Log')}             icon={<AdminPanelSettingsIcon sx={{ fontSize: 14 }} />}  iconPosition="start" />
        <Tab label={tabLabel('AI Models', aiModels.length)} icon={<SmartToyIcon sx={{ fontSize: 14 }} />} iconPosition="start" />
        <Tab label={tabLabel('Events', wideEventsTotal || undefined)} icon={<TimelineIcon sx={{ fontSize: 14 }} />} iconPosition="start" onClick={() => { if (wideEvents.length === 0) loadWideEvents() }} />
        <Tab label={tabLabel('Feature Flags', flags.length)} icon={<FlagIcon sx={{ fontSize: 14 }} />} iconPosition="start" />
        <Tab label={tabLabel('AI Usage')}             icon={<AccountBalanceWalletIcon sx={{ fontSize: 14 }} />} iconPosition="start" />
        <Tab label={tabLabel('Engines', engines.length)} icon={<StorageIcon sx={{ fontSize: 14 }} />} iconPosition="start" />
        <Tab label={tabLabel('System Analytics')} icon={<RocketLaunchIcon sx={{ fontSize: 14 }} />} iconPosition="start" onClick={() => { if (!vercel && !vercelLoading) loadVercel() }} />
      </Tabs>

      {/* ═══ TAB 0: OVERVIEW ════════════════════════════════════════════════ */}
      {tab === 0 && stats && (
        <Box sx={{ display: 'grid', gap: 4 }}>

          {/* Run trend chart */}
          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
              <TrendingUpIcon sx={{ fontSize: 16, color: 'primary.main' }} />
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'text.primary' }}>
                Run volume — last 30 days
              </Typography>
            </Box>
            {stats.runs_per_day?.length > 0 ? (
              <LineChart
                height={220}
                dataset={stats.runs_per_day}
                xAxis={[{ dataKey: 'day', scaleType: 'point', valueFormatter: fmtDay, tickLabelStyle: { fontSize: 11, fill: tickFill, fontFamily: '"Raleway", sans-serif' } }]}
                yAxis={[{ tickLabelStyle: { fontSize: 11, fill: tickFill } }]}
                series={[
                  { dataKey: 'success', label: 'Success', color: '#6b8f71', area: true, showMark: false, curve: 'monotoneX' },
                  { dataKey: 'errors',  label: 'Errors',  color: '#b45050', area: true, showMark: false, curve: 'monotoneX' },
                ]}
                margin={{ top: 40, right: 16, bottom: 28, left: 32 }}
                grid={{ horizontal: true }}
                slotProps={{ legend: { direction: 'row', position: { vertical: 'top', horizontal: 'right' }, labelStyle: { fontSize: 12, fontFamily: '"Raleway", sans-serif', fill: tickFill } } }}
              />
            ) : (
              <Typography sx={{ color: 'text.disabled', fontSize: '0.82rem', py: 4, textAlign: 'center' }}>
                No run data in the last 30 days
              </Typography>
            )}
          </Card>

          <Grid container spacing={3}>
            {/* Status breakdown pie */}
            <Grid item xs={12} md={5}>
              <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', p: 3, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <BarChartIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                  <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'text.primary' }}>
                    Status breakdown
                  </Typography>
                </Box>
                {pieData.length > 0 ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <PieChart
                      width={140} height={140}
                      series={[{
                        data: pieData.map((entry) => ({ id: entry.name, value: entry.value, label: entry.name, color: entry.color })),
                        innerRadius: 40, outerRadius: 64,
                      }]}
                      slotProps={{ legend: { hidden: true } }}
                    />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {pieData.map((entry) => (
                        <Box key={entry.name} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: entry.color, flexShrink: 0 }} />
                          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', color: 'text.secondary' }}>
                            {entry.name}
                          </Typography>
                          <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem', color: 'text.primary', ml: 'auto', pl: 1 }}>
                            {entry.value}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                ) : (
                  <Typography sx={{ color: 'text.disabled', fontSize: '0.82rem', py: 3 }}>No runs yet</Typography>
                )}
              </Card>
            </Grid>

            {/* Failed steps bar chart */}
            <Grid item xs={12} md={7}>
              <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', p: 3, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <ErrorOutlineIcon sx={{ fontSize: 16, color: '#b45050' }} />
                  <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'text.primary' }}>
                    Failure by step
                  </Typography>
                </Box>
                {failedStepData.length > 0 ? (
                  <BarChart
                    layout="horizontal"
                    height={130}
                    dataset={failedStepData}
                    yAxis={[{ dataKey: 'step', scaleType: 'band', tickLabelStyle: { fontSize: 11, fill: tickFill, fontFamily: '"JetBrains Mono", monospace' } }]}
                    xAxis={[{ tickLabelStyle: { fontSize: 10, fill: tickFill } }]}
                    series={[{ dataKey: 'count', label: 'Failures', color: '#b45050' }]}
                    margin={{ left: 72, right: 12, top: 4, bottom: 4 }}
                    grid={{ vertical: true }}
                    slotProps={{ legend: { hidden: true } }}
                  />
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 3 }}>
                    <CheckCircleOutlineIcon sx={{ fontSize: 18, color: '#6b8f71' }} />
                    <Typography sx={{ color: 'text.secondary', fontSize: '0.82rem' }}>No step failures recorded</Typography>
                  </Box>
                )}
              </Card>
            </Grid>
          </Grid>

          {/* Recent 10 runs */}
          {stats.recent_runs?.length > 0 && (
            <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
              <Box sx={{ px: 3, pt: 2, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <CloudSyncIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'text.primary' }}>
                  Recent activity
                </Typography>
                <Box sx={{ ml: 'auto' }}>
                  <ViewToggle value={overviewView} onChange={saveView('admin_overview_view', setOverviewView)} />
                </Box>
              </Box>
              {overviewView === 'table' ? (
                <DataGrid
                  rows={stats.recent_runs}
                  getRowId={(r) => r.id}
                  autoHeight
                  disableRowSelectionOnClick
                  pageSizeOptions={[10, 25]}
                  initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                  sx={{ ...getDataGridSx(accent, dark ? 'dark' : 'light'), border: 'none', borderRadius: 0 }}
                  columns={[
                    { field: 'user_email',   headerName: 'User',        flex: 1,   minWidth: 140, renderCell: (p) => <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif' }}>{p.value || '—'}</Typography> },
                    { field: 'config_name',  headerName: 'Config',      flex: 1,   minWidth: 120 },
                    { field: 'instance_id',  headerName: 'Instance ID', flex: 1,   minWidth: 130, renderCell: (p) => <MonoValue val={p.value} /> },
                    { field: 'report_id',    headerName: 'Report ID',   flex: 1,   minWidth: 130, renderCell: (p) => <MonoValue val={p.value} /> },
                    { field: 'status',       headerName: 'Status',      width: 110, renderCell: (p) => <StatusChip status={p.value} sftp_skipped={p.row.sftp_skipped} /> },
                    { field: 'duration_ms',  headerName: 'Duration',    width: 110, renderCell: (p) => <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: 'text.secondary' }}>{fmtMs(p.value)}</Typography> },
                    { field: 'started_at',   headerName: 'Started',     width: 150, renderCell: (p) => <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif', whiteSpace: 'nowrap' }}>{fmtDate(p.value)}</Typography> },
                  ]}
                />
              ) : (
                <Box sx={{ p: 2 }}>
                  <Grid container spacing={2}>
                    {stats.recent_runs.map((r) => (
                      <Grid item xs={12} sm={6} md={4} key={r.id}>
                        <Card variant="outlined" sx={{ bgcolor: 'background.default', borderColor: 'divider' }}>
                          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem', fontWeight: 700, color: 'text.primary' }}>{r.config_name || '—'}</Typography>
                              <StatusChip status={r.status} sftp_skipped={r.sftp_skipped} />
                            </Box>
                            {[
                              { label: 'User',        val: r.user_email },
                              { label: 'Instance ID', val: r.instance_id, mono: true },
                              { label: 'Report ID',   val: r.report_id,   mono: true },
                              { label: 'Duration',    val: fmtMs(r.duration_ms) },
                              { label: 'Started',     val: fmtDate(r.started_at) },
                            ].map(({ label, val, mono }) => (
                              <Box key={label} sx={{ display: 'flex', gap: 1, mb: 0.5, alignItems: 'flex-start' }}>
                                <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.disabled', fontFamily: '"Raleway", sans-serif', minWidth: 76, flexShrink: 0, pt: 0.1 }}>{label}</Typography>
                                {mono ? <MonoValue val={val} /> : <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif' }}>{val || '—'}</Typography>}
                              </Box>
                            ))}
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              )}
            </Card>
          )}
        </Box>
      )}

      {/* ═══ TAB 1: RUNS ════════════════════════════════════════════════════ */}
      {tab === 1 && (
        <Box>
          {/* Status filter row */}
          <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { key: 'all',     label: 'All',     color: 'text.secondary' },
              { key: 'success', label: 'Success', color: '#6b8f71' },
              { key: 'error',   label: 'Error',   color: '#b45050' },
              { key: 'running', label: 'Running', color: accent },
              { key: 'ps_only', label: 'PS Only', color: '#6495b4' },
            ].map(({ key, label, color }) => {
              const cnt = key === 'all'
                ? runs.length
                : key === 'ps_only'
                  ? runs.filter(r => r.sftp_skipped && r.status === 'success').length
                  : runs.filter(r => r.status === key).length
              const isHex = color.startsWith('#')
              return (
                <Chip
                  key={key}
                  label={`${label} (${cnt})`}
                  size="small"
                  onClick={() => setRunStatusFilter(key)}
                  sx={{
                    cursor: 'pointer',
                    bgcolor: runStatusFilter === key ? `${isHex ? color : accent}22` : 'transparent',
                    color: runStatusFilter === key ? (isHex ? color : 'primary.main') : 'text.secondary',
                    border: '1px solid',
                    borderColor: runStatusFilter === key ? (isHex ? color : 'primary.main') : 'divider',
                    fontFamily: '"Raleway", sans-serif',
                    fontSize: '0.62rem',
                    transition: 'all 0.15s ease',
                  }}
                />
              )
            })}
          </Box>

          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
            <Box sx={{ px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', borderBottom: '1px solid', borderColor: 'divider' }}>
              <ViewToggle value={runsView} onChange={saveView('admin_runs_view', setRunsView)} />
            </Box>
            {runsView === 'table' ? (
              <DataGrid
                rows={filteredRuns}
                getRowId={(r) => r.id}
                autoHeight
                disableRowSelectionOnClick
                pageSizeOptions={[25, 50, 100]}
                initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                sx={{ ...getDataGridSx(accent, dark ? 'dark' : 'light'), border: 'none', borderRadius: 0 }}
                columns={[
                  { field: 'id',          headerName: '#',            width: 64,  renderCell: (p) => <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled', fontFamily: '"JetBrains Mono", monospace' }}>{p.value}</Typography> },
                  { field: 'user_email',  headerName: 'User',         flex: 1,   minWidth: 140,
                    renderCell: (p) => (
                      <Tooltip title={p.row.user_email || p.row.user_id || ''} arrow>
                        <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.row.user_email || p.row.user_id || '—'}
                        </Typography>
                      </Tooltip>
                    ),
                  },
                  { field: 'config_name', headerName: 'Config',       flex: 1,   minWidth: 130,
                    renderCell: (p) => (
                      <Box>
                        <Typography sx={{ fontSize: '0.74rem', fontFamily: '"Raleway", sans-serif', color: 'text.primary' }}>{p.row.config_name || '—'}</Typography>
                        {p.row.ps_process_name && <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', fontFamily: '"JetBrains Mono", monospace' }}>{p.row.ps_process_name}</Typography>}
                      </Box>
                    ),
                  },
                  { field: 'instance_id', headerName: 'Instance ID',  flex: 1,   minWidth: 130, renderCell: (p) => <MonoValue val={p.value} /> },
                  { field: 'report_id',   headerName: 'Report ID',    flex: 1,   minWidth: 130, renderCell: (p) => <MonoValue val={p.value} /> },
                  { field: 'status',      headerName: 'Status',       width: 110, renderCell: (p) => <StatusChip status={p.value} sftp_skipped={p.row.sftp_skipped} /> },
                  { field: 'row_count',   headerName: 'Rows',         width: 80,  type: 'number',
                    renderCell: (p) => <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: 'text.secondary' }}>{p.value != null ? p.value.toLocaleString() : '—'}</Typography>,
                  },
                  { field: 'duration_ms', headerName: 'Duration',     width: 110, renderCell: (p) => <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: 'text.secondary' }}>{fmtMs(p.value)}</Typography> },
                  { field: 'failed_step', headerName: 'Step',         width: 100,
                    renderCell: (p) => p.value
                      ? <Chip label={p.value} size="small" sx={{ bgcolor: 'rgba(180,80,80,0.1)', color: '#b45050', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.7rem', height: 22 }} />
                      : <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled' }}>—</Typography>,
                  },
                  { field: 'started_at',  headerName: 'Started',      width: 150, renderCell: (p) => <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif', whiteSpace: 'nowrap' }}>{fmtDate(p.value)}</Typography> },
                ]}
              />
            ) : (
              <Box sx={{ p: 2 }}>
                {!filteredRuns.length
                  ? <Typography sx={{ color: 'text.disabled', textAlign: 'center', py: 6, fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' }}>No runs match the current filter</Typography>
                  : (
                    <Grid container spacing={2}>
                      {filteredRuns.map((r) => (
                        <Grid item xs={12} sm={6} md={4} key={r.id}>
                          <Card variant="outlined" sx={{ bgcolor: 'background.default', borderColor: 'divider' }}>
                            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem', fontWeight: 700, color: 'text.primary' }}>{r.config_name || '—'}</Typography>
                                <StatusChip status={r.status} sftp_skipped={r.sftp_skipped} />
                              </Box>
                              {[
                                { label: 'User',        val: r.user_email || r.user_id },
                                { label: 'Process',     val: r.ps_process_name },
                                { label: 'Instance ID', val: r.instance_id, mono: true },
                                { label: 'Report ID',   val: r.report_id,   mono: true },
                                { label: 'Rows',        val: r.row_count != null ? r.row_count.toLocaleString() : null },
                                { label: 'Duration',    val: fmtMs(r.duration_ms) },
                                { label: 'Failed Step', val: r.failed_step },
                                { label: 'Started',     val: fmtDate(r.started_at) },
                              ].filter(({ val }) => val).map(({ label, val, mono }) => (
                                <Box key={label} sx={{ display: 'flex', gap: 1, mb: 0.5, alignItems: 'flex-start' }}>
                                  <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.disabled', fontFamily: '"Raleway", sans-serif', minWidth: 76, flexShrink: 0, pt: 0.1 }}>{label}</Typography>
                                  {mono ? <MonoValue val={val} /> : <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif' }}>{val}</Typography>}
                                </Box>
                              ))}
                            </CardContent>
                          </Card>
                        </Grid>
                      ))}
                    </Grid>
                  )
                }
              </Box>
            )}
          </Card>
        </Box>
      )}

      {/* ═══ TAB 2: USERS ═══════════════════════════════════════════════════ */}
      {tab === 2 && (
        <Box>
          {/* Controls row */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <TextField
              size="small"
              placeholder="Search by name or email…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} /></InputAdornment> }}
              sx={{ minWidth: 260, '& .MuiOutlinedInput-root': { fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' } }}
            />
            <Button
              variant="contained"
              startIcon={<PersonAddIcon sx={{ fontSize: 16 }} />}
              onClick={() => setInviteOpen(true)}
              sx={{
                bgcolor: 'primary.main', color: 'background.default',
                fontFamily: '"Raleway", sans-serif', fontWeight: 700,
                fontSize: '0.7rem', letterSpacing: '0.1em',
                px: 2.5, py: 0.9, borderRadius: '1px',
                boxShadow: `0 2px 12px ${accent}30`,
                '&:hover': { bgcolor: 'primary.light' },
              }}
            >
              Invite User
            </Button>
          </Box>

          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
            <Box sx={{ px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', borderBottom: '1px solid', borderColor: 'divider' }}>
              <ViewToggle value={usersView} onChange={saveView('admin_users_view', setUsersView)} />
            </Box>
            {usersView === 'table' ? (
              <DataGrid
                rows={filteredUsers}
                getRowId={(r) => r.id}
                autoHeight
                disableRowSelectionOnClick
                pageSizeOptions={[25, 50, 100]}
                initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                sx={{ ...getDataGridSx(accent, dark ? 'dark' : 'light'), border: 'none', borderRadius: 0 }}
                columns={[
                  {
                    field: 'first_name', headerName: 'User', flex: 1, minWidth: 160,
                    valueGetter: (_, row) => [row.first_name, row.last_name].filter(Boolean).join(' ') || '—',
                    renderCell: (p) => {
                      const isSelf = p.row.id === user.id
                      return (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: p.row.role === 'admin' ? `${accent}22` : 'rgba(128,128,128,0.12)' }}>
                            {p.row.role === 'admin' ? <ShieldIcon sx={{ fontSize: 13, color: 'primary.main' }} /> : <PersonIcon sx={{ fontSize: 13, color: 'text.secondary' }} />}
                          </Box>
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.74rem', color: 'text.primary', lineHeight: 1.2 }}>{p.value}</Typography>
                              {isSelf && <Chip label="you" size="small" sx={{ height: 14, fontSize: '0.5rem', bgcolor: `${accent}18`, color: 'primary.main', px: 0 }} />}
                            </Box>
                            <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', fontFamily: '"JetBrains Mono", monospace' }}>{p.row.id.slice(0, 12)}…</Typography>
                          </Box>
                        </Box>
                      )
                    },
                  },
                  { field: 'email', headerName: 'Email', flex: 1, minWidth: 160, renderCell: (p) => <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif' }}>{p.value}</Typography> },
                  {
                    field: 'role', headerName: 'Role', width: 150, sortable: false,
                    renderCell: (p) => (
                      <RoleSelect userId={p.row.id} currentRole={p.value} isSelf={p.row.id === user.id} onRoleChange={handleRoleChange} loadingId={roleLoadingId} />
                    ),
                  },
                  { field: 'run_count', headerName: 'Runs', width: 80, type: 'number', renderCell: (p) => <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem', color: 'text.secondary' }}>{p.value ?? 0}</Typography> },
                  { field: 'onboarded', headerName: 'Onboarded', width: 100, renderCell: (p) => p.value ? <CheckCircleOutlineIcon sx={{ fontSize: 16, color: '#6b8f71' }} /> : <Typography sx={{ color: 'text.disabled', fontSize: '0.72rem' }}>—</Typography> },
                  { field: 'last_seen_at', headerName: 'Last seen', width: 120, renderCell: (p) => <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif' }}>{p.value ? new Date(p.value).toLocaleDateString() : '—'}</Typography> },
                  {
                    field: 'actions', headerName: 'Actions', width: 90, sortable: false,
                    renderCell: (p) => (
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Edit name"><IconButton size="small" onClick={() => openEdit(p.row)} sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}><EditIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                        {p.row.id !== user.id && (
                          <Tooltip title="Delete user"><IconButton size="small" onClick={() => { setDeleteDialog({ id: p.row.id, email: p.row.email }); setDeleteClerk(false) }} sx={{ color: 'text.secondary', '&:hover': { color: '#c98f8f' } }}><DeleteIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                        )}
                      </Box>
                    ),
                  },
                ]}
              />
            ) : (
              <Box sx={{ p: 2 }}>
                {!filteredUsers.length
                  ? <Typography sx={{ color: 'text.disabled', textAlign: 'center', py: 6, fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' }}>{userSearch ? 'No users match the search' : 'No users yet'}</Typography>
                  : (
                    <Grid container spacing={2}>
                      {filteredUsers.map((u) => {
                        const name   = [u.first_name, u.last_name].filter(Boolean).join(' ') || '—'
                        const isSelf = u.id === user.id
                        return (
                          <Grid item xs={12} sm={6} md={4} key={u.id}>
                            <Card variant="outlined" sx={{ bgcolor: 'background.default', borderColor: 'divider' }}>
                              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                                  <Box sx={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: u.role === 'admin' ? `${accent}22` : 'rgba(128,128,128,0.12)' }}>
                                    {u.role === 'admin' ? <ShieldIcon sx={{ fontSize: 15, color: 'primary.main' }} /> : <PersonIcon sx={{ fontSize: 15, color: 'text.secondary' }} />}
                                  </Box>
                                  <Box sx={{ flex: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.8rem', fontWeight: 700, color: 'text.primary' }}>{name}</Typography>
                                      {isSelf && <Chip label="you" size="small" sx={{ height: 15, fontSize: '0.5rem', bgcolor: `${accent}18`, color: 'primary.main', px: 0 }} />}
                                    </Box>
                                    <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif' }}>{u.email}</Typography>
                                  </Box>
                                </Box>
                                {[
                                  { label: 'Role',      custom: <RoleSelect userId={u.id} currentRole={u.role} isSelf={isSelf} onRoleChange={handleRoleChange} loadingId={roleLoadingId} /> },
                                  { label: 'Runs',      val: String(u.run_count ?? 0) },
                                  { label: 'Onboarded', val: u.onboarded ? '✓ Yes' : 'No' },
                                  { label: 'Last seen', val: u.last_seen_at ? new Date(u.last_seen_at).toLocaleDateString() : '—' },
                                ].map(({ label, val, custom }) => (
                                  <Box key={label} sx={{ display: 'flex', gap: 1, mb: 0.6, alignItems: 'center' }}>
                                    <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.disabled', fontFamily: '"Raleway", sans-serif', minWidth: 70, flexShrink: 0 }}>{label}</Typography>
                                    {custom || <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif' }}>{val}</Typography>}
                                  </Box>
                                ))}
                                <Box sx={{ display: 'flex', gap: 0.5, mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                                  <Tooltip title="Edit name"><IconButton size="small" onClick={() => openEdit(u)} sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}><EditIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                                  {!isSelf && <Tooltip title="Delete user"><IconButton size="small" onClick={() => { setDeleteDialog({ id: u.id, email: u.email }); setDeleteClerk(false) }} sx={{ color: 'text.secondary', '&:hover': { color: '#c98f8f' } }}><DeleteIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>}
                                </Box>
                              </CardContent>
                            </Card>
                          </Grid>
                        )
                      })}
                    </Grid>
                  )
                }
              </Box>
            )}
          </Card>
        </Box>
      )}

      {/* ═══ TAB 3: AUDIT LOG ═══════════════════════════════════════════════ */}
      {tab === 3 && (
        <Box>
          <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.8rem' }}>Event type</InputLabel>
              <Select
                value={logTypeFilter}
                label="Event type"
                onChange={(e) => setLogTypeFilter(e.target.value)}
                sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.8rem' }}
              >
                <MenuItem value="all">All events</MenuItem>
                {logEventTypes.map((t) => (
                  <MenuItem key={t} value={t} sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem' }}>{t}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.65rem', color: 'text.disabled' }}>
              {filteredLogs.length} event{filteredLogs.length !== 1 ? 's' : ''}
            </Typography>
          </Box>

          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
            <Box sx={{ px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', borderBottom: '1px solid', borderColor: 'divider' }}>
              <ViewToggle value={logsView} onChange={saveView('admin_logs_view', setLogsView)} />
            </Box>
            {logsView === 'table' ? (
              <DataGrid
                rows={filteredLogs}
                getRowId={(r) => r.id}
                autoHeight
                disableRowSelectionOnClick
                pageSizeOptions={[25, 50, 100]}
                initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                sx={{ ...getDataGridSx(accent, dark ? 'dark' : 'light'), border: 'none', borderRadius: 0 }}
                columns={[
                  {
                    field: 'created_at', headerName: 'When', width: 170,
                    renderCell: (p) => (
                      <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif', whiteSpace: 'nowrap' }}>
                        {p.value ? new Date(p.value).toLocaleString() : '—'}
                      </Typography>
                    ),
                  },
                  {
                    field: 'user_name', headerName: 'User', flex: 1, minWidth: 140,
                    renderCell: (p) => (
                      <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif' }}>
                        {p.value || '—'}
                      </Typography>
                    ),
                  },
                  {
                    field: 'event_type', headerName: 'Event', flex: 1, minWidth: 160,
                    renderCell: (p) => {
                      const t = p.value || ''
                      const bg    = t.startsWith('run') ? 'rgba(100,149,180,0.12)' : t.includes('deleted') ? 'rgba(180,80,80,0.12)' : t.includes('invite') ? 'rgba(107,143,113,0.12)' : t.includes('role') ? `${accent}15` : 'rgba(128,128,128,0.1)'
                      const color = t.startsWith('run') ? '#6495b4'  : t.includes('deleted') ? '#b45050' : t.includes('invite') ? '#6b8f71' : t.includes('role') ? accent : theme.palette.text.secondary
                      return <Chip label={t} size="small" sx={{ bgcolor: bg, color, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.7rem', height: 22 }} />
                    },
                  },
                  {
                    field: 'detail', headerName: 'Detail', flex: 2, minWidth: 200, sortable: false,
                    renderCell: (p) => (
                      <Tooltip title={<pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 11 }}>{JSON.stringify(p.value, null, 2)}</pre>} arrow>
                        <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.66rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'default' }}>
                          {JSON.stringify(p.value)}
                        </Typography>
                      </Tooltip>
                    ),
                  },
                  {
                    field: 'ip_address', headerName: 'IP', width: 130,
                    renderCell: (p) => (
                      <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled', fontFamily: '"JetBrains Mono", monospace' }}>
                        {p.value || '—'}
                      </Typography>
                    ),
                  },
                ]}
              />
            ) : (
              <Box sx={{ p: 2 }}>
                {!filteredLogs.length
                  ? <Typography sx={{ color: 'text.disabled', textAlign: 'center', py: 6, fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' }}>No audit events</Typography>
                  : (
                    <Grid container spacing={2}>
                      {filteredLogs.map((entry) => {
                        const t = entry.event_type || ''
                        const chipBg    = t.startsWith('run') ? 'rgba(100,149,180,0.12)' : t.includes('deleted') ? 'rgba(180,80,80,0.12)' : t.includes('invite') ? 'rgba(107,143,113,0.12)' : t.includes('role') ? `${accent}15` : 'rgba(128,128,128,0.1)'
                        const chipColor = t.startsWith('run') ? '#6495b4' : t.includes('deleted') ? '#b45050' : t.includes('invite') ? '#6b8f71' : t.includes('role') ? accent : theme.palette.text.secondary
                        return (
                          <Grid item xs={12} sm={6} md={4} key={entry.id}>
                            <Card variant="outlined" sx={{ bgcolor: 'background.default', borderColor: 'divider' }}>
                              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                                  <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif' }}>
                                    {entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}
                                  </Typography>
                                  <Chip label={t || '—'} size="small" sx={{ bgcolor: chipBg, color: chipColor, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.7rem', height: 22 }} />
                                </Box>
                                {[
                                  { label: 'User', val: entry.user_name },
                                  { label: 'IP',   val: entry.ip_address },
                                ].map(({ label, val }) => (
                                  <Box key={label} sx={{ display: 'flex', gap: 1, mb: 0.5, alignItems: 'flex-start' }}>
                                    <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.disabled', fontFamily: '"Raleway", sans-serif', minWidth: 50, flexShrink: 0, pt: 0.1 }}>{label}</Typography>
                                    <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif' }}>{val || '—'}</Typography>
                                  </Box>
                                ))}
                                {entry.detail && (
                                  <Box sx={{ mt: 1 }}>
                                    <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.disabled', fontFamily: '"Raleway", sans-serif', mb: 0.3 }}>Detail</Typography>
                                    <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem', color: 'text.secondary', wordBreak: 'break-all', bgcolor: 'background.paper', p: 0.75, borderRadius: '4px', border: '1px solid', borderColor: 'divider' }}>
                                      {JSON.stringify(entry.detail)}
                                    </Typography>
                                  </Box>
                                )}
                              </CardContent>
                            </Card>
                          </Grid>
                        )
                      })}
                    </Grid>
                  )
                }
              </Box>
            )}
          </Card>
        </Box>
      )}

      {/* ═══ TAB 4: AI MODELS ══════════════════════════════════════════════ */}
      {tab === 4 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon sx={{ fontSize: 16 }} />}
              onClick={openAddModel}
              sx={{
                bgcolor: 'primary.main', color: 'background.default',
                fontFamily: '"Raleway", sans-serif', fontWeight: 700,
                fontSize: '0.7rem', letterSpacing: '0.1em',
                px: 2.5, py: 0.9, borderRadius: '1px',
                boxShadow: `0 2px 12px ${accent}30`,
                '&:hover': { bgcolor: 'primary.light' },
              }}
            >
              Add Model
            </Button>
          </Box>

          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
            <DataGrid
              rows={aiModels}
              getRowId={(r) => r.id}
              autoHeight
              disableRowSelectionOnClick
              pageSizeOptions={[25, 50]}
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
              sx={{ ...getDataGridSx(accent, dark ? 'dark' : 'light'), border: 'none', borderRadius: 0 }}
              columns={[
                {
                  field: 'name', headerName: 'Name', flex: 1, minWidth: 160,
                  renderCell: (p) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <SmartToyIcon sx={{ fontSize: 14, color: 'primary.main', opacity: 0.7 }} />
                      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.74rem', color: 'text.primary' }}>
                        {p.value}
                      </Typography>
                      {p.row.is_default && (
                        <Chip label="default" size="small" sx={{ height: 16, fontSize: '0.52rem', bgcolor: `${accent}20`, color: 'primary.main', px: 0 }} />
                      )}
                    </Box>
                  ),
                },
                {
                  field: 'provider', headerName: 'Provider', width: 110,
                  renderCell: (p) => {
                    const colors = { gemini: '#4285f4', openai: '#10a37f', anthropic: '#d4a84b', grok: '#1da1f2', generic: '#888' }
                    const col = colors[p.value] || '#888'
                    return (
                      <Chip
                        label={p.value}
                        size="small"
                        sx={{ bgcolor: `${col}18`, color: col, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6rem', height: 20 }}
                      />
                    )
                  },
                },
                {
                  field: 'model_id', headerName: 'Model ID', flex: 1, minWidth: 160,
                  renderCell: (p) => (
                    <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.7rem', color: 'text.secondary' }}>
                      {p.value}
                    </Typography>
                  ),
                },
                {
                  field: 'api_key', headerName: 'API Key', width: 130,
                  renderCell: (p) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <KeyIcon sx={{ fontSize: 12, color: p.value ? 'text.disabled' : '#b45050' }} />
                      <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: p.value ? 'text.disabled' : '#b45050' }}>
                        {p.value || 'not set'}
                      </Typography>
                    </Box>
                  ),
                },
                {
                  field: 'base_url', headerName: 'Base URL', flex: 1, minWidth: 130,
                  renderCell: (p) => p.value
                    ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <LinkIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
                        <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.66rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.value}
                        </Typography>
                      </Box>
                    )
                    : <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled' }}>—</Typography>,
                },
                {
                  field: 'is_active', headerName: 'Active', width: 80,
                  renderCell: (p) => p.value
                    ? <ToggleOnIcon  sx={{ fontSize: 22, color: '#6b8f71' }} />
                    : <ToggleOffIcon sx={{ fontSize: 22, color: 'text.disabled' }} />,
                },
                {
                  field: 'actions', headerName: 'Actions', width: 130, sortable: false,
                  renderCell: (p) => (
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                      <Tooltip title={p.row.is_default ? 'Already default' : 'Set as default'}>
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleSetDefault(p.row.id)}
                            disabled={p.row.is_default}
                            sx={{ color: p.row.is_default ? accent : 'text.secondary', '&:hover': { color: accent } }}
                          >
                            {p.row.is_default ? <StarIcon sx={{ fontSize: 15 }} /> : <StarOutlineIcon sx={{ fontSize: 15 }} />}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEditModel(p.row)} sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}>
                          <EditIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => setDeleteAiDialog({ id: p.row.id, name: p.row.name })} sx={{ color: 'text.secondary', '&:hover': { color: '#c98f8f' } }}>
                          <DeleteIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ),
                },
              ]}
            />
          </Card>
        </Box>
      )}

      {/* ═══ TAB 5: WIDE EVENTS ═════════════════════════════════════════════ */}
      {tab === 5 && (
        <Box>
          <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Search event, endpoint, user…"
              value={wideEventSearch}
              onChange={(e) => setWideEventSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadWideEvents(wideEventSearch)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} /></InputAdornment> }}
              sx={{ minWidth: 260, '& .MuiOutlinedInput-root': { fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' } }}
            />
            <Button size="small" variant="outlined" startIcon={<RefreshIcon sx={{ fontSize: 15 }} />}
              onClick={() => loadWideEvents(wideEventSearch)}
              sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', borderColor: 'divider', color: 'text.secondary' }}
            >
              Refresh
            </Button>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.65rem', color: 'text.disabled', ml: 'auto' }}>
              {wideEventsTotal.toLocaleString()} total events
            </Typography>
          </Box>

          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
            {wideLoading ? (
              <Box sx={{ p: 6, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={24} sx={{ color: 'primary.main' }} />
              </Box>
            ) : (
              <DataGrid
                rows={wideEvents}
                getRowId={(r) => r.id}
                autoHeight
                disableRowSelectionOnClick
                pageSizeOptions={[25, 50, 100]}
                initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                sx={{ ...getDataGridSx(accent, dark ? 'dark' : 'light'), border: 'none', borderRadius: 0 }}
                columns={[
                  {
                    field: 'created_at', headerName: 'When', width: 160,
                    renderCell: (p) => <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif', whiteSpace: 'nowrap' }}>{p.value ? new Date(p.value).toLocaleString() : '—'}</Typography>,
                  },
                  {
                    field: 'event', headerName: 'Event', flex: 1, minWidth: 180,
                    renderCell: (p) => (
                      <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: 'primary.main' }}>
                        {p.value}
                      </Typography>
                    ),
                  },
                  {
                    field: 'status', headerName: 'Status', width: 100,
                    renderCell: (p) => {
                      const col = p.value === 'success' ? '#6b8f71' : p.value === 'failed' ? '#b45050' : p.value === 'running' ? accent : 'text.secondary'
                      return <Chip label={p.value} size="small" sx={{ bgcolor: `${col}18`, color: col, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.7rem', height: 22 }} />
                    },
                  },
                  {
                    field: 'tier', headerName: 'Tier', width: 60,
                    renderCell: (p) => <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.7rem', color: 'text.disabled' }}>T{p.value}</Typography>,
                  },
                  {
                    field: 'http_method', headerName: 'Method', width: 80,
                    renderCell: (p) => <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: 'text.secondary' }}>{p.value || '—'}</Typography>,
                  },
                  {
                    field: 'http_status', headerName: 'HTTP', width: 70,
                    renderCell: (p) => {
                      const col = !p.value ? 'text.disabled' : p.value < 300 ? '#6b8f71' : p.value < 400 ? accent : '#b45050'
                      return <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: col }}>{p.value || '—'}</Typography>
                    },
                  },
                  {
                    field: 'endpoint', headerName: 'Endpoint', flex: 1, minWidth: 180,
                    renderCell: (p) => <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.65rem', color: 'text.disabled', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.value || '—'}</Typography>,
                  },
                  {
                    field: 'user_name', headerName: 'User', width: 140,
                    renderCell: (p) => <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif' }}>{p.value || p.row.user_id?.slice(0, 12) || '—'}</Typography>,
                  },
                  {
                    field: 'total_duration_ms', headerName: 'Duration', width: 100,
                    renderCell: (p) => <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: 'text.secondary' }}>{p.value != null ? fmtMs(p.value) : '—'}</Typography>,
                  },
                ]}
              />
            )}
          </Card>
        </Box>
      )}

      {/* ═══ TAB 6: FEATURE FLAGS ════════════════════════════════════════════ */}
      {tab === 6 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon sx={{ fontSize: 16 }} />}
              onClick={() => { setFlagForm({ key: '', name: '', description: '', enabled: false }); setFlagDialog(true) }}
              sx={{ bgcolor: 'primary.main', color: 'background.default', fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.1em', px: 2.5, py: 0.9, borderRadius: '1px', boxShadow: `0 2px 12px ${accent}30` }}
            >
              New Flag
            </Button>
          </Box>

          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
            <DataGrid
              rows={flags}
              getRowId={(r) => r.id}
              autoHeight
              disableRowSelectionOnClick
              pageSizeOptions={[25, 50]}
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
              sx={{ ...getDataGridSx(accent, dark ? 'dark' : 'light'), border: 'none', borderRadius: 0 }}
              columns={[
                {
                  field: 'key', headerName: 'Key', flex: 1, minWidth: 180,
                  renderCell: (p) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <FlagIcon sx={{ fontSize: 13, color: p.row.enabled ? '#6b8f71' : 'text.disabled' }} />
                      <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem', color: 'text.primary' }}>{p.value}</Typography>
                    </Box>
                  ),
                },
                { field: 'name', headerName: 'Name', flex: 1, minWidth: 150, renderCell: (p) => <Typography sx={{ fontSize: '0.74rem', fontFamily: '"Raleway", sans-serif', color: 'text.secondary' }}>{p.value || '—'}</Typography> },
                {
                  field: 'enabled', headerName: 'Enabled', width: 110,
                  renderCell: (p) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <FiberManualRecordIcon sx={{ fontSize: 10, color: p.value ? '#6b8f71' : 'text.disabled' }} />
                      <Typography sx={{ fontSize: '0.7rem', fontFamily: '"Raleway", sans-serif', color: p.value ? '#6b8f71' : 'text.disabled' }}>
                        {p.value ? 'enabled' : 'disabled'}
                      </Typography>
                    </Box>
                  ),
                },
                { field: 'status', headerName: 'Status', width: 100, renderCell: (p) => <Chip label={p.value} size="small" sx={{ height: 19, fontSize: '0.58rem', fontFamily: '"JetBrains Mono", monospace', bgcolor: p.value === 'active' ? 'rgba(107,143,113,0.12)' : 'rgba(128,128,128,0.1)', color: p.value === 'active' ? '#6b8f71' : 'text.secondary' }} /> },
                { field: 'description', headerName: 'Description', flex: 2, minWidth: 180, renderCell: (p) => <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', fontFamily: '"Raleway", sans-serif' }}>{p.value || '—'}</Typography> },
                {
                  field: 'actions', headerName: 'Actions', width: 120, sortable: false,
                  renderCell: (p) => (
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                      <Tooltip title={p.row.enabled ? 'Disable' : 'Enable'}>
                        <IconButton size="small" onClick={() => {
                          toggleFeatureFlag(p.row.id, token)
                            .then((r) => setFlags((prev) => prev.map((f) => f.id === r.data.id ? r.data : f)))
                            .catch(() => {})
                        }} sx={{ color: p.row.enabled ? '#6b8f71' : 'text.disabled', '&:hover': { color: p.row.enabled ? '#b45050' : '#6b8f71' } }}>
                          {p.row.enabled ? <ToggleOnIcon sx={{ fontSize: 20 }} /> : <ToggleOffIcon sx={{ fontSize: 20 }} />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => setDeleteFlagDlg({ id: p.row.id, key: p.row.key })} sx={{ color: 'text.secondary', '&:hover': { color: '#c98f8f' } }}>
                          <DeleteIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ),
                },
              ]}
            />
          </Card>

          {/* Create flag dialog */}
          <Dialog open={flagDialog} onClose={() => setFlagDialog(false)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.4rem', color: 'text.primary', pb: 1 }}>New Feature Flag</DialogTitle>
            <DialogContent>
              <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
                <TextField label="Key *" size="small" fullWidth autoFocus placeholder="e.g. enable_new_dashboard" value={flagForm.key} onChange={(e) => setFlagForm((p) => ({ ...p, key: e.target.value }))} sx={{ '& .MuiInputBase-root': { fontFamily: '"JetBrains Mono", monospace', fontSize: '0.82rem' } }} />
                <TextField label="Display name" size="small" fullWidth value={flagForm.name} onChange={(e) => setFlagForm((p) => ({ ...p, name: e.target.value }))} sx={{ '& .MuiInputBase-root': { fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' } }} />
                <TextField label="Description" size="small" fullWidth multiline rows={2} value={flagForm.description} onChange={(e) => setFlagForm((p) => ({ ...p, description: e.target.value }))} sx={{ '& .MuiInputBase-root': { fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' } }} />
                <FormControlLabel control={<Switch size="small" checked={flagForm.enabled} onChange={(e) => setFlagForm((p) => ({ ...p, enabled: e.target.checked }))} />} label={<Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>Start enabled</Typography>} />
              </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
              <Button onClick={() => setFlagDialog(false)} variant="outlined" startIcon={<CancelIcon sx={{ fontSize: 15 }} />} sx={{ color: 'text.secondary', borderColor: 'divider', fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!flagForm.key.trim()) return
                  setFlagLoading(true)
                  createFeatureFlag(flagForm, token)
                    .then((r) => { setFlags((p) => [...p, r.data]); setFlagDialog(false) })
                    .catch((e) => setError(formatApiError(e, 'Failed to create flag')))
                    .finally(() => setFlagLoading(false))
                }}
                disabled={flagLoading || !flagForm.key.trim()}
                variant="contained"
                startIcon={flagLoading ? <CircularProgress size={14} /> : <SaveIcon sx={{ fontSize: 15 }} />}
                sx={{ bgcolor: 'primary.main', color: 'background.default', fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}
              >
                {flagLoading ? 'Creating…' : 'Create'}
              </Button>
            </DialogActions>
          </Dialog>

          {/* Delete flag dialog */}
          <Dialog open={Boolean(deleteFlagDlg)} onClose={() => setDeleteFlagDlg(null)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.3rem', color: 'text.primary', pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <WarningAmberIcon sx={{ fontSize: 20, color: '#b45050' }} /> Delete flag?
            </DialogTitle>
            <DialogContent>
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.7 }}>
                Permanently delete <strong style={{ color: theme.palette.text.primary, fontFamily: 'monospace' }}>{deleteFlagDlg?.key}</strong>. Any code checking this flag will treat it as disabled.
              </Typography>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
              <Button onClick={() => setDeleteFlagDlg(null)} variant="outlined" startIcon={<CancelIcon sx={{ fontSize: 15 }} />} sx={{ color: 'text.secondary', borderColor: 'divider', fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}>Cancel</Button>
              <Button
                onClick={() => {
                  setFlagLoading(true)
                  deleteFeatureFlag(deleteFlagDlg.id, token)
                    .then(() => { setFlags((p) => p.filter((f) => f.id !== deleteFlagDlg.id)); setDeleteFlagDlg(null) })
                    .catch((e) => setError(formatApiError(e, 'Failed to delete flag')))
                    .finally(() => setFlagLoading(false))
                }}
                disabled={flagLoading}
                variant="contained"
                startIcon={flagLoading ? <CircularProgress size={14} /> : <DeleteIcon sx={{ fontSize: 15 }} />}
                sx={{ bgcolor: '#8f4a4a', '&:hover': { bgcolor: '#b45050' }, fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}
              >
                {flagLoading ? 'Deleting…' : 'Delete'}
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}

      {/* ═══ TAB 7: AI USAGE ════════════════════════════════════════════════ */}
      {tab === 7 && (
        <Box>
          {aiUsage ? (
            <Box sx={{ display: 'grid', gap: 3 }}>
              {/* KPI row */}
              <Grid container spacing={2}>
                {[
                  { label: 'Conversations', value: (aiUsage.total_conversations ?? 0).toLocaleString(), Icon: SmartToyIcon },
                  { label: 'Total tokens',  value: (aiUsage.total_tokens ?? 0).toLocaleString(),       Icon: CodeIcon },
                  { label: 'Estimated cost', value: `$${(aiUsage.total_cost_usd ?? 0).toFixed(4)}`,    Icon: AccountBalanceWalletIcon, accent: '#c9a84c' },
                ].map(({ label, value, Icon, accent: a }) => (
                  <Grid item xs={12} sm={4} key={label}>
                    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
                      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                          <Box>
                            <Typography sx={{ fontSize: '0.58rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'text.secondary', mb: 0.75 }}>{label}</Typography>
                            <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '2rem', fontWeight: 700, color: 'text.primary', lineHeight: 1 }}>{value}</Typography>
                          </Box>
                          <Icon sx={{ fontSize: 22, color: a || 'primary.main', opacity: 0.7, mt: 0.5 }} />
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>

              {/* Per-provider breakdown */}
              {aiUsage.by_provider?.length > 0 && (
                <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
                  <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'text.secondary', mb: 2 }}>
                      Usage by provider
                    </Typography>
                    <DataGrid
                      rows={aiUsage.by_provider}
                      getRowId={(r) => r.provider}
                      autoHeight
                      hideFooter
                      disableRowSelectionOnClick
                      sx={{ ...getDataGridSx(accent, dark ? 'dark' : 'light'), border: 'none' }}
                      columns={[
                        {
                          field: 'provider', headerName: 'Provider', width: 130,
                          renderCell: (p) => {
                            const colors = { gemini: '#4285f4', openai: '#10a37f', anthropic: '#d4a84b', grok: '#1da1f2', generic: '#888' }
                            const col = colors[p.value] || '#888'
                            return <Chip label={p.value} size="small" sx={{ bgcolor: `${col}18`, color: col, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6rem', height: 20 }} />
                          },
                        },
                        { field: 'conversations',     headerName: 'Conversations',   width: 130, type: 'number', renderCell: (p) => <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem', color: 'text.secondary' }}>{(p.value ?? 0).toLocaleString()}</Typography> },
                        { field: 'prompt_tokens',     headerName: 'Prompt tokens',   flex: 1,   type: 'number', renderCell: (p) => <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem', color: 'text.secondary' }}>{(p.value ?? 0).toLocaleString()}</Typography> },
                        { field: 'completion_tokens', headerName: 'Completion tok.',  flex: 1,   type: 'number', renderCell: (p) => <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem', color: 'text.secondary' }}>{(p.value ?? 0).toLocaleString()}</Typography> },
                        { field: 'total_tokens',      headerName: 'Total tokens',    flex: 1,   type: 'number', renderCell: (p) => <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem', color: 'text.primary', fontWeight: 600 }}>{(p.value ?? 0).toLocaleString()}</Typography> },
                        { field: 'cost_usd',          headerName: 'Est. cost (USD)', width: 140, type: 'number', renderCell: (p) => <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem', color: '#c9a84c' }}>${(p.value ?? 0).toFixed(4)}</Typography> },
                      ]}
                    />
                  </CardContent>
                </Card>
              )}
            </Box>
          ) : (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <Typography sx={{ color: 'text.disabled', fontFamily: '"Raleway", sans-serif', fontSize: '0.85rem' }}>
                No AI usage data yet. Run a file analysis to start tracking.
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* ── Invite user dialog ────────────────────────────────────────────── */}
      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={handleInvited}
        token={token}
      />

      {/* ── Delete user dialog ────────────────────────────────────────────── */}
      <Dialog open={Boolean(deleteDialog)} onClose={() => setDeleteDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.3rem', color: 'text.primary', pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon sx={{ fontSize: 20, color: '#b45050' }} /> Delete user?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.7 }}>
            Remove <strong style={{ color: theme.palette.text.primary }}>{deleteDialog?.email}</strong> from the platform.
            Their run history and audit records will also be deleted.
          </Typography>
          <Divider sx={{ my: 2, borderColor: 'divider' }} />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={deleteClerk}
                onChange={(e) => setDeleteClerk(e.target.checked)}
                sx={{ '& .MuiSwitch-thumb': { bgcolor: deleteClerk ? '#b45050' : undefined } }}
              />
            }
            label={
              <Box>
                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem', color: 'text.primary' }}>
                  Also delete from Clerk
                </Typography>
                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.65rem', color: 'text.disabled', lineHeight: 1.4 }}>
                  If off, the user can still log in via Clerk — a new local account will be created on next sign-in.
                </Typography>
              </Box>
            }
            sx={{ alignItems: 'flex-start', mt: 0.5 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setDeleteDialog(null)} variant="outlined" startIcon={<CancelIcon sx={{ fontSize: 15 }} />} sx={{ color: 'text.secondary', borderColor: 'divider', fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}>
            Cancel
          </Button>
          <Button onClick={handleDeleteUser} disabled={actionLoading} variant="contained" startIcon={actionLoading ? <CircularProgress size={14} /> : <DeleteIcon sx={{ fontSize: 15 }} />} sx={{ bgcolor: '#8f4a4a', '&:hover': { bgcolor: '#b45050' }, fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}>
            {actionLoading ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Edit user dialog ──────────────────────────────────────────────── */}
      <Dialog open={Boolean(editDialog)} onClose={() => setEditDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.3rem', color: 'text.primary', pb: 1 }}>
          Edit user
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
            <TextField
              label="First name"
              size="small"
              fullWidth
              value={editForm.first_name}
              onChange={(e) => setEditForm((p) => ({ ...p, first_name: e.target.value }))}
              sx={{ '& .MuiInputBase-root': { fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' } }}
            />
            <TextField
              label="Last name"
              size="small"
              fullWidth
              value={editForm.last_name}
              onChange={(e) => setEditForm((p) => ({ ...p, last_name: e.target.value }))}
              sx={{ '& .MuiInputBase-root': { fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' } }}
            />
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.65rem', color: 'text.disabled' }}>
              Email address is managed by Clerk and cannot be changed here.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setEditDialog(null)} variant="outlined" startIcon={<CancelIcon sx={{ fontSize: 15 }} />} sx={{ color: 'text.secondary', borderColor: 'divider', fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}>
            Cancel
          </Button>
          <Button onClick={handleEditSave} disabled={actionLoading} variant="contained" startIcon={actionLoading ? <CircularProgress size={14} /> : <SaveIcon sx={{ fontSize: 15 }} />} sx={{ bgcolor: 'primary.main', color: 'background.default', fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}>
            {actionLoading ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══ TAB 8: ENGINES ════════════════════════════════════════════════ */}
      {tab === 8 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.65rem', color: 'text.disabled', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {engines.length} engine{engines.length !== 1 ? 's' : ''} configured
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon sx={{ fontSize: 16 }} />}
              onClick={openAddEngine}
              sx={{
                bgcolor: 'primary.main', color: 'background.default',
                fontFamily: '"Raleway", sans-serif', fontWeight: 700,
                fontSize: '0.7rem', letterSpacing: '0.1em',
                px: 2.5, py: 0.9, borderRadius: '1px',
                boxShadow: `0 2px 12px ${accent}30`,
                '&:hover': { bgcolor: 'primary.light' },
              }}
            >
              Add Engine
            </Button>
          </Box>

          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
            {engines.length === 0 ? (
              <Box sx={{ py: 8, textAlign: 'center' }}>
                <StorageIcon sx={{ fontSize: 36, color: 'text.disabled', mb: 2 }} />
                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem', color: 'text.disabled' }}>
                  No engines yet. Add the first one.
                </Typography>
              </Box>
            ) : (
              <DataGrid
                rows={engines}
                getRowId={(r) => r.id}
                autoHeight
                disableRowSelectionOnClick
                pageSizeOptions={[25, 50]}
                initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                sx={{ ...getDataGridSx(accent, dark ? 'dark' : 'light'), border: 'none', borderRadius: 0 }}
                columns={[
                  {
                    field: 'name', headerName: 'Name', flex: 1, minWidth: 160,
                    renderCell: (p) => (
                      <Box>
                        <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.76rem', fontWeight: 700, color: 'text.primary' }}>{p.value}</Typography>
                        {p.row.description && <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.63rem', color: 'text.disabled' }}>{p.row.description}</Typography>}
                      </Box>
                    ),
                  },
                  {
                    field: 'process_name', headerName: 'PS Process Name', flex: 1, minWidth: 160,
                    renderCell: (p) => (
                      <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem', color: 'primary.main' }}>{p.value}</Typography>
                    ),
                  },
                  {
                    field: 'is_active', headerName: 'Status', width: 110,
                    renderCell: (p) => (
                      <Chip
                        label={p.value ? 'Active' : 'Inactive'}
                        size="small"
                        sx={{
                          bgcolor: p.value ? 'rgba(107,143,113,0.14)' : 'rgba(128,128,128,0.1)',
                          color:   p.value ? '#6b8f71' : 'text.secondary',
                          fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', height: 22,
                        }}
                      />
                    ),
                  },
                  {
                    field: 'sort_order', headerName: 'Order', width: 80,
                    renderCell: (p) => <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.7rem', color: 'text.secondary' }}>{p.value}</Typography>,
                  },
                  {
                    field: 'created_at', headerName: 'Created', width: 140,
                    renderCell: (p) => <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', color: 'text.secondary' }}>{fmtDate(p.value)}</Typography>,
                  },
                  {
                    field: 'actions', headerName: 'Actions', width: 90, sortable: false,
                    renderCell: (p) => (
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Edit engine">
                          <IconButton size="small" onClick={() => openEditEngine(p.row)} sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}>
                            <EditIcon sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete engine">
                          <IconButton size="small" onClick={() => setDeleteEngDlg({ id: p.row.id, name: p.row.name })} sx={{ color: 'text.secondary', '&:hover': { color: '#c98f8f' } }}>
                            <DeleteIcon sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    ),
                  },
                ]}
              />
            )}
          </Card>
        </Box>
      )}

      {/* ── Add / Edit Engine dialog ──────────────────────────────────────── */}
      <Dialog open={Boolean(engineDialog)} onClose={() => setEngineDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.4rem', color: 'text.primary', pb: 1 }}>
          {engineDialog === 'add' ? 'Add Engine' : 'Edit Engine'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 2, pt: 0.5 }}>
            <TextField
              label="Name *"
              size="small"
              fullWidth
              autoFocus
              value={engineForm.name}
              onChange={(e) => setEngineForm((p) => ({ ...p, name: e.target.value }))}
              sx={{ '& .MuiInputBase-root': { fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' } }}
            />
            <TextField
              label="PeopleSoft process name *"
              size="small"
              fullWidth
              placeholder="e.g. SM_DISCOVERY"
              value={engineForm.process_name}
              onChange={(e) => setEngineForm((p) => ({ ...p, process_name: e.target.value.toUpperCase() }))}
              helperText="The exact process name used in the PeopleSoft trigger API body."
              sx={{ '& .MuiInputBase-root': { fontFamily: '"JetBrains Mono", monospace', fontSize: '0.82rem' } }}
            />
            <TextField
              label="Description"
              size="small"
              fullWidth
              multiline
              rows={2}
              value={engineForm.description}
              onChange={(e) => setEngineForm((p) => ({ ...p, description: e.target.value }))}
              sx={{ '& .MuiInputBase-root': { fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' } }}
            />
            <TextField
              label="Sort order"
              size="small"
              type="number"
              value={engineForm.sort_order}
              onChange={(e) => setEngineForm((p) => ({ ...p, sort_order: parseInt(e.target.value, 10) || 0 }))}
              inputProps={{ min: 0 }}
              helperText="Lower number = listed first"
              sx={{ '& .MuiInputBase-root': { fontFamily: '"JetBrains Mono", monospace', fontSize: '0.82rem' } }}
            />
            <FormControlLabel
              control={<Switch size="small" checked={engineForm.is_active} onChange={(e) => setEngineForm((p) => ({ ...p, is_active: e.target.checked }))} />}
              label={<Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>Active (visible to users)</Typography>}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setEngineDialog(null)} variant="outlined" startIcon={<CancelIcon sx={{ fontSize: 15 }} />} sx={{ color: 'text.secondary', borderColor: 'divider', fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveEngine}
            disabled={engineLoading || !engineForm.name.trim() || !engineForm.process_name.trim()}
            variant="contained"
            startIcon={engineLoading ? <CircularProgress size={14} /> : <SaveIcon sx={{ fontSize: 15 }} />}
            sx={{ bgcolor: 'primary.main', color: 'background.default', fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}
          >
            {engineLoading ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Engine dialog ──────────────────────────────────────────── */}
      <Dialog open={Boolean(deleteEngDlg)} onClose={() => setDeleteEngDlg(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.3rem', color: 'text.primary', pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon sx={{ fontSize: 20, color: '#b45050' }} /> Delete engine?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.7 }}>
            Remove <strong style={{ color: theme.palette.text.primary }}>{deleteEngDlg?.name}</strong>. Existing user configurations that reference this engine will have their engine field cleared.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setDeleteEngDlg(null)} variant="outlined" startIcon={<CancelIcon sx={{ fontSize: 15 }} />} sx={{ color: 'text.secondary', borderColor: 'divider', fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}>
            Cancel
          </Button>
          <Button onClick={handleDeleteEngine} disabled={engineLoading} variant="contained" startIcon={engineLoading ? <CircularProgress size={14} /> : <DeleteIcon sx={{ fontSize: 15 }} />} sx={{ bgcolor: '#8f4a4a', '&:hover': { bgcolor: '#b45050' }, fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}>
            {engineLoading ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Add / Edit AI Model dialog ───────────────────────────────────── */}
      <Dialog open={Boolean(aiModelDialog)} onClose={() => setAiModelDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.4rem', color: 'text.primary', pb: 1 }}>
          {aiModelDialog === 'add' ? 'Add AI Model' : 'Edit AI Model'}
        </DialogTitle>
        <DialogContent>
          {/* ── cURL import ──────────────────────────────────────────────── */}
          <Box sx={{ mb: 2 }}>
            <Button
              size="small"
              onClick={() => setCurlOpen((p) => !p)}
              startIcon={<CodeIcon sx={{ fontSize: 14 }} />}
              sx={{
                fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem',
                color: curlOpen ? 'primary.main' : 'text.secondary',
                textTransform: 'none', p: 0, minWidth: 0,
                '&:hover': { color: 'primary.main', bgcolor: 'transparent' },
              }}
            >
              {curlOpen ? 'Hide cURL importer' : 'Paste a cURL command to auto-fill ↓'}
            </Button>
            <Collapse in={curlOpen}>
              <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <TextField
                  multiline
                  minRows={4}
                  maxRows={9}
                  fullWidth
                  size="small"
                  placeholder={'curl https://api.x.ai/v1/responses \\\n    -H "Content-Type: application/json" \\\n    -H "Authorization: Bearer YOUR_KEY" \\\n    -d \'{"model": "grok-4", "input": "..."}\''}
                  value={curlText}
                  onChange={(e) => setCurlText(e.target.value)}
                  sx={{ '& .MuiInputBase-root': { fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem' } }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleParseCurl}
                  disabled={!curlText.trim()}
                  sx={{
                    alignSelf: 'flex-start',
                    fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem',
                    borderColor: `${accent}44`, color: accent,
                    '&:hover': { borderColor: accent, bgcolor: `${accent}08` },
                  }}
                >
                  Parse &amp; fill fields
                </Button>
              </Box>
            </Collapse>
          </Box>

          <Box sx={{ display: 'grid', gap: 2, mt: 0.5 }}>
            <TextField
              label="Display name *"
              size="small"
              fullWidth
              autoFocus
              value={aiModelForm.name}
              onChange={(e) => setAiModelForm((p) => ({ ...p, name: e.target.value }))}
              sx={{ '& .MuiInputBase-root': { fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' } }}
            />
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.8rem' }}>Provider *</InputLabel>
              <Select
                value={aiModelForm.provider}
                label="Provider *"
                onChange={(e) => setAiModelForm((p) => ({ ...p, provider: e.target.value }))}
                sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.8rem' }}
              >
                {['gemini', 'openai', 'anthropic', 'grok', 'generic'].map((p) => (
                  <MenuItem key={p} value={p} sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.78rem' }}>{p}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Model ID *"
              size="small"
              fullWidth
              placeholder="e.g. gemini-2.0-flash, gpt-4o, claude-sonnet-4-6"
              value={aiModelForm.model_id}
              onChange={(e) => setAiModelForm((p) => ({ ...p, model_id: e.target.value }))}
              sx={{ '& .MuiInputBase-root': { fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8rem' } }}
            />
            <TextField
              label={aiModelDialog === 'add' ? 'API Key *' : 'API Key (leave blank to keep existing)'}
              size="small"
              fullWidth
              type="password"
              value={aiModelForm.api_key}
              onChange={(e) => setAiModelForm((p) => ({ ...p, api_key: e.target.value }))}
              sx={{ '& .MuiInputBase-root': { fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8rem' } }}
            />
            {(aiModelForm.provider === 'generic' || aiModelForm.provider === 'grok') && (
              <TextField
                label={aiModelForm.provider === 'grok' ? 'Base URL (default: https://api.x.ai/v1)' : 'Base URL *'}
                size="small"
                fullWidth
                placeholder="https://api.example.com/v1"
                value={aiModelForm.base_url}
                onChange={(e) => setAiModelForm((p) => ({ ...p, base_url: e.target.value }))}
                sx={{ '& .MuiInputBase-root': { fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8rem' } }}
              />
            )}
            <Box sx={{ display: 'flex', gap: 3 }}>
              <FormControlLabel
                control={<Switch size="small" checked={aiModelForm.is_default} onChange={(e) => setAiModelForm((p) => ({ ...p, is_default: e.target.checked }))} />}
                label={<Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>Set as default</Typography>}
              />
              <FormControlLabel
                control={<Switch size="small" checked={aiModelForm.is_active} onChange={(e) => setAiModelForm((p) => ({ ...p, is_active: e.target.checked }))} />}
                label={<Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>Active</Typography>}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setAiModelDialog(null)} variant="outlined" startIcon={<CancelIcon sx={{ fontSize: 15 }} />} sx={{ color: 'text.secondary', borderColor: 'divider', fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveAiModel}
            disabled={aiModelLoading || !aiModelForm.name.trim() || !aiModelForm.model_id.trim()}
            variant="contained"
            startIcon={aiModelLoading ? <CircularProgress size={14} /> : <SaveIcon sx={{ fontSize: 15 }} />}
            sx={{ bgcolor: 'primary.main', color: 'background.default', fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}
          >
            {aiModelLoading ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete AI Model dialog ───────────────────────────────────────── */}
      <Dialog open={Boolean(deleteAiDialog)} onClose={() => setDeleteAiDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.3rem', color: 'text.primary', pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon sx={{ fontSize: 20, color: '#b45050' }} /> Delete model?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.7 }}>
            Remove <strong style={{ color: theme.palette.text.primary }}>{deleteAiDialog?.name}</strong> from the platform. The API key stored for this model will be permanently deleted.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setDeleteAiDialog(null)} variant="outlined" startIcon={<CancelIcon sx={{ fontSize: 15 }} />} sx={{ color: 'text.secondary', borderColor: 'divider', fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}>
            Cancel
          </Button>
          <Button onClick={handleDeleteAiModel} disabled={aiModelLoading} variant="contained" startIcon={aiModelLoading ? <CircularProgress size={14} /> : <DeleteIcon sx={{ fontSize: 15 }} />} sx={{ bgcolor: '#8f4a4a', '&:hover': { bgcolor: '#b45050' }, fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}>
            {aiModelLoading ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══ TAB 9: SYSTEM ANALYTICS (VERCEL) ═════════════════════════════ */}
      {tab === 9 && (
        <Box>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ width: 36, height: 36, borderRadius: '8px', bgcolor: `${accent}1e`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RocketLaunchIcon sx={{ fontSize: 18, color: accent }} />
              </Box>
              <Box>
                <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.5rem', fontWeight: 700, color: 'text.primary', lineHeight: 1 }}>
                  System Analytics
                </Typography>
                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', fontWeight: 700, color: 'text.disabled', letterSpacing: '0.14em', textTransform: 'uppercase', mt: 0.25 }}>
                  Vercel hosting · deployments &amp; projects
                </Typography>
              </Box>
            </Box>
            <Button
              variant="outlined"
              size="small"
              startIcon={vercelLoading ? <CircularProgress size={13} /> : <RefreshOutlinedIcon sx={{ fontSize: 15 }} />}
              onClick={loadVercel}
              disabled={vercelLoading}
              sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', fontWeight: 700, borderColor: `${accent}44`, color: accent, '&:hover': { borderColor: accent, bgcolor: `${accent}08` } }}
            >
              Refresh
            </Button>
          </Box>

          {/* Not-configured state */}
          {vercelError?.includes('VERCEL_TOKEN') && (
            <Alert severity="warning" sx={{ mb: 3, fontFamily: '"Raleway", sans-serif', fontSize: '0.8rem' }}>
              <strong>VERCEL_TOKEN not set.</strong> Add <code>VERCEL_TOKEN=your_token</code> (and optionally <code>VERCEL_TEAM_ID</code>) to the backend <code>.env</code> file to enable Vercel analytics.
            </Alert>
          )}

          {/* Generic error */}
          {vercelError && !vercelError.includes('VERCEL_TOKEN') && (
            <Alert severity="error" sx={{ mb: 3, fontFamily: '"Raleway", sans-serif', fontSize: '0.8rem' }}>{vercelError}</Alert>
          )}

          {/* Loading skeleton */}
          {vercelLoading && !vercel && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 10 }}>
              <CircularProgress size={28} sx={{ color: accent }} />
            </Box>
          )}

          {/* Empty prompt */}
          {!vercelLoading && !vercel && !vercelError && (
            <Box sx={{ py: 10, textAlign: 'center' }}>
              <RocketLaunchIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 2 }} />
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem', color: 'text.disabled', mb: 2 }}>
                Click <strong>Refresh</strong> to load Vercel deployment data.
              </Typography>
              <Button variant="contained" onClick={loadVercel} sx={{ bgcolor: 'primary.main', color: 'background.default', fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.72rem' }}>
                Load Now
              </Button>
            </Box>
          )}

          {/* Data */}
          {vercel && (() => {
            const s = vercel.summary
            const deployStateColor = (st) =>
              st === 'READY'    ? '#6b8f71' :
              st === 'ERROR'    ? '#b45050' :
              st === 'BUILDING' ? accent    :
              st === 'QUEUED'   ? '#7a7060' : '#7a7060'

            const kpis = [
              { label: 'Total Deployments', value: s.total_deployments, sub: 'last 30 fetched' },
              { label: 'Production OK',     value: s.prod_success,      sub: 'READY state',   color: '#6b8f71' },
              { label: 'Production Errors', value: s.prod_error,        sub: 'ERROR state',   color: s.prod_error > 0 ? '#b45050' : undefined },
              { label: 'Avg Build Time',    value: s.avg_build_s != null ? `${s.avg_build_s}s` : '—', sub: 'across all deploys' },
              { label: 'In Progress',       value: s.in_progress,       sub: 'building/queued', color: s.in_progress > 0 ? accent : undefined },
            ]

            return (
              <>
                {/* KPI row */}
                <Grid container spacing={2.5} sx={{ mb: 3.5 }}>
                  {kpis.map(({ label, value, sub, color }) => (
                    <Grid item xs={6} sm={4} md={2.4} key={label}>
                      <Card sx={{
                        position: 'relative', overflow: 'hidden',
                        bgcolor: 'background.paper',
                        border: `1px solid ${dark ? `${accent}26` : `${accent}32`}`,
                        borderTop: `3px solid ${(color || accent)}bf`,
                        p: 0,
                      }}>
                        <Box sx={{ p: 2 }}>
                          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'text.disabled', mb: 1 }}>
                            {label}
                          </Typography>
                          <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '2.2rem', fontWeight: 700, color: color || accent, lineHeight: 1 }}>
                            {value}
                          </Typography>
                          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.64rem', color: 'text.disabled', mt: 0.5 }}>
                            {sub}
                          </Typography>
                        </Box>
                      </Card>
                    </Grid>
                  ))}
                </Grid>

                <Grid container spacing={3}>
                  {/* Recent deployments */}
                  <Grid item xs={12} md={8}>
                    <Card sx={{ bgcolor: 'background.paper', border: `1px solid ${dark ? `${accent}26` : `${accent}32`}` }}>
                      <Box sx={{ px: 2.5, pt: 2, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1, borderBottom: `1px solid ${dark ? `${accent}18` : `${accent}22`}` }}>
                        <RocketLaunchIcon sx={{ fontSize: 14, color: accent }} />
                        <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.secondary', flex: 1 }}>
                          Recent Deployments
                        </Typography>
                        <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.64rem', color: 'text.disabled' }}>
                          {vercel.deployments.length} shown
                        </Typography>
                      </Box>
                      <Box sx={{ maxHeight: 440, overflowY: 'auto', '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: `${accent}30`, borderRadius: 2 } }}>
                        {vercel.deployments.length === 0 ? (
                          <Box sx={{ py: 6, textAlign: 'center' }}>
                            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem', color: 'text.disabled' }}>No deployments found</Typography>
                          </Box>
                        ) : vercel.deployments.map((d, i) => (
                          <Box key={d.uid} sx={{
                            display: 'flex', alignItems: 'flex-start', gap: 1.5,
                            px: 2.5, py: 1.4,
                            borderBottom: i < vercel.deployments.length - 1 ? `1px solid ${dark ? `${accent}10` : `${accent}14`}` : 'none',
                            '&:hover': { bgcolor: `${accent}06` },
                          }}>
                            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: deployStateColor(d.state), mt: 0.6, flexShrink: 0 }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem', fontWeight: 700, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                                  {d.name}
                                </Typography>
                                <Chip label={d.state} size="small" sx={{ height: 18, fontSize: '0.6rem', fontFamily: '"Raleway", sans-serif', fontWeight: 700, bgcolor: `${deployStateColor(d.state)}22`, color: deployStateColor(d.state), letterSpacing: '0.06em' }} />
                                {d.target === 'production' && (
                                  <Chip label="PROD" size="small" sx={{ height: 18, fontSize: '0.6rem', fontFamily: '"Raleway", sans-serif', fontWeight: 700, bgcolor: `${accent}1e`, color: accent, letterSpacing: '0.06em' }} />
                                )}
                              </Box>
                              {d.meta.message && (
                                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', color: 'text.secondary', mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {d.meta.message}
                                </Typography>
                              )}
                              <Box sx={{ display: 'flex', gap: 2, mt: 0.5, flexWrap: 'wrap' }}>
                                {d.meta.branch && <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.64rem', color: 'text.disabled' }}>{d.meta.branch}</Typography>}
                                {d.meta.author && <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.64rem', color: 'text.disabled' }}>{d.meta.author}</Typography>}
                                {d.build_ms && <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.64rem', color: 'text.disabled' }}>{(d.build_ms / 1000).toFixed(1)}s build</Typography>}
                                {d.created_at && <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.64rem', color: 'text.disabled' }}>{new Date(d.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Typography>}
                              </Box>
                            </Box>
                            {d.url && (
                              <Tooltip title={`https://${d.url}`} arrow>
                                <IconButton size="small" component="a" href={`https://${d.url}`} target="_blank" rel="noopener noreferrer" sx={{ color: 'text.disabled', '&:hover': { color: accent }, flexShrink: 0, p: 0.3 }}>
                                  <OpenInNewIcon sx={{ fontSize: 13 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        ))}
                      </Box>
                    </Card>
                  </Grid>

                  {/* Projects sidebar */}
                  <Grid item xs={12} md={4}>
                    <Card sx={{ bgcolor: 'background.paper', border: `1px solid ${dark ? `${accent}26` : `${accent}32`}` }}>
                      <Box sx={{ px: 2.5, pt: 2, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1, borderBottom: `1px solid ${dark ? `${accent}18` : `${accent}22`}` }}>
                        <StorageIcon sx={{ fontSize: 14, color: accent }} />
                        <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.secondary', flex: 1 }}>
                          Projects
                        </Typography>
                        <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.64rem', color: 'text.disabled' }}>
                          {vercel.projects.length}
                        </Typography>
                      </Box>
                      <Box>
                        {vercel.projects.length === 0 ? (
                          <Box sx={{ py: 4, textAlign: 'center' }}>
                            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem', color: 'text.disabled' }}>No projects found</Typography>
                          </Box>
                        ) : vercel.projects.map((p, i) => (
                          <Box key={p.id} sx={{
                            px: 2.5, py: 1.6,
                            borderBottom: i < vercel.projects.length - 1 ? `1px solid ${dark ? `${accent}10` : `${accent}14`}` : 'none',
                            '&:hover': { bgcolor: `${accent}06` },
                          }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.8rem', fontWeight: 700, color: 'text.primary', flex: 1 }}>
                                {p.name}
                              </Typography>
                              {p.link.repo && (
                                <Tooltip title={p.link.repo} arrow>
                                  <IconButton size="small" component="a" href={p.link.type === 'github' ? `https://github.com/${p.link.repo}` : p.link.repo} target="_blank" rel="noopener noreferrer" sx={{ color: 'text.disabled', '&:hover': { color: accent }, p: 0.25 }}>
                                    <GitHubIcon sx={{ fontSize: 13 }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                              {p.framework && <Chip label={p.framework} size="small" sx={{ height: 18, fontSize: '0.6rem', fontFamily: '"JetBrains Mono", monospace', bgcolor: `${accent}12`, color: accent }} />}
                              {p.node_ver  && <Chip label={`Node ${p.node_ver}`} size="small" sx={{ height: 18, fontSize: '0.6rem', fontFamily: '"JetBrains Mono", monospace', bgcolor: dark ? 'rgba(107,143,113,0.14)' : 'rgba(107,143,113,0.1)', color: '#6b8f71' }} />}
                            </Box>
                            {p.updated_at && (
                              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.62rem', color: 'text.disabled', mt: 0.4 }}>
                                Updated {new Date(p.updated_at).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </Typography>
                            )}
                          </Box>
                        ))}
                      </Box>
                    </Card>
                  </Grid>
                </Grid>
              </>
            )
          })()}
        </Box>
      )}

    </Box>
  )
}
