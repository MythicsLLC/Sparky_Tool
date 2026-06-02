import { useState, useEffect } from 'react'
import {
  Box, Typography, TextField, Button, Select, MenuItem,
  FormControl, CircularProgress, Alert,
  InputAdornment, IconButton, Dialog, DialogContent, Tooltip,
  Switch, FormControlLabel,
} from '@mui/material'
import SaveIcon       from '@mui/icons-material/Save'
import Visibility     from '@mui/icons-material/Visibility'
import VisibilityOff  from '@mui/icons-material/VisibilityOff'
import CloseIcon       from '@mui/icons-material/Close'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import DnsIcon        from '@mui/icons-material/Dns'
import StorageIcon    from '@mui/icons-material/Storage'
import { useAuth } from '../AuthContext'
import { useThemeContext } from '../ThemeContext'
import { listConfigs, createConfig, updateConfig, deleteConfig, testRetrieval, testPeoplesoft, testWindows, testFtp, listEngines, formatApiError } from '../api'
import WinServerBrowser from '../components/WinServerBrowser'
import FtpBrowser from '../components/FtpBrowser'
import MythicsLoader from '../components/MythicsLoader'
import SuccessCheck from '../components/SuccessCheck'
import DataQualityPanel from '../components/DataQualityPanel'

const WIN_DEFAULT_PORTS = { winrm: '5985', smb: '445', ssh: '22' }
const FTP_DEFAULT_PORTS = { ftp: '21', ftps: '21' }

const EMPTY = {
  name: '',
  engine_ids: [],
  ps_base_url: '', ps_auth_type: 'basic', ps_username: '', ps_password: '',
  ps_endpoint: '', ps_status_endpoint: '', ps_process_name: 'SM_DISCOVERY',
  retrieval_method: 'sftp',
  sftp_host: '', sftp_port: '22', sftp_username: '',
  sftp_password: '', sftp_remote_path: '',
  ps_webserver_path: '',
  win_host: '', win_port: '5985', win_username: '', win_password: '', win_use_ssl: false,
  win_auth_type: 'ntlm',
  win_connection_type: 'winrm',
  win_share: 'C$',
  win_domain: '',
  ftp_host: '', ftp_port: '21', ftp_username: '',
  ftp_password: '', ftp_remote_path: '', ftp_connection_type: 'ftp', ftp_passive: true,
}

// ── Module-level components (hooks allowed) ──────────────────────────────────

function Field({ label, children }) {
  return (
    <Box>
      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'text.secondary', mb: 0.8 }}>
        {label}
      </Typography>
      {children}
    </Box>
  )
}

function SectionCard({ number, title, subtitle, complete, children }) {
  const { accent } = useThemeContext()
  return (
    <Box sx={{
      border: `1px solid ${accent}22`,
      borderRadius: '6px',
      mb: 3,
      overflow: 'hidden',
      transition: 'box-shadow 0.25s ease',
      '&:hover': { boxShadow: `0 6px 32px ${accent}14` },
    }}>
      {/* Header strip */}
      <Box sx={{
        background: `linear-gradient(135deg, ${accent}14 0%, ${accent}04 100%)`,
        borderBottom: `1px solid ${accent}1e`,
        px: 3.5, py: 2,
        display: 'flex', alignItems: 'center', gap: 2,
      }}>
        <Box sx={{
          width: 30, height: 30, borderRadius: '50%',
          border: `1.5px solid ${accent}55`,
          background: `${accent}0e`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '0.8rem', fontWeight: 700, color: accent, lineHeight: 1 }}>
            {number}
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.25rem', fontWeight: 600, color: 'text.primary', letterSpacing: '0.03em', lineHeight: 1.2 }}>
            {title}
          </Typography>
          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', letterSpacing: '0.13em', color: 'text.disabled', mt: 0.25 }}>
            {subtitle}
          </Typography>
        </Box>
        {complete && (
          <Tooltip title="Section complete" placement="left">
            <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: accent, boxShadow: `0 0 10px ${accent}b3`, flexShrink: 0, transition: 'all 0.3s ease' }} />
          </Tooltip>
        )}
      </Box>
      {/* Content */}
      <Box sx={{ px: 3.5, py: 3 }}>
        {children}
      </Box>
    </Box>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Settings() {
  const { user, token, markOnboarded } = useAuth()
  const { accent, mode } = useThemeContext()
  const isDark = mode === 'dark'

  const [configs, setConfigs]               = useState([])
  const [engines, setEngines]               = useState([])
  const [selectedConfigId, setSelectedConfigId] = useState(null)
  const [form, setForm]                     = useState(EMPTY)
  const [loading, setLoading]               = useState(false)
  const [saving, setSaving]                 = useState(false)
  const [success, setSuccess]               = useState(false)
  const [error, setError]                   = useState(null)
  const [showPsPass, setShowPsPass]         = useState(false)
  const [showSftpPass, setShowSftpPass]     = useState(false)
  const [testStatus, setTestStatus]         = useState(null)
  const [psTestStatus, setPsTestStatus]     = useState(null)
  const [psBodyOpen, setPsBodyOpen]         = useState(false)
  const [showWinPass, setShowWinPass]       = useState(false)
  const [winTestStatus, setWinTestStatus]   = useState(null)
  const [winBrowserOpen, setWinBrowserOpen] = useState(false)
  const [showFtpPass, setShowFtpPass]       = useState(false)
  const [ftpTestStatus, setFtpTestStatus]   = useState(null)
  const [ftpBrowserOpen, setFtpBrowserOpen] = useState(false)

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      fontFamily: '"Raleway", sans-serif', fontSize: '0.85rem',
      color: 'text.primary', bgcolor: `${accent}05`, borderRadius: '3px',
    },
    '& .MuiInputBase-input::placeholder': { color: 'text.disabled', opacity: 1 },
  }

  const selectSx = {
    fontFamily: '"Raleway", sans-serif', fontSize: '0.85rem',
    color: 'text.primary', bgcolor: `${accent}05`, borderRadius: '3px',
  }

  useEffect(() => {
    if (!token) return
    setLoading(true)
    Promise.all([listConfigs(token), listEngines(token)])
      .then(([cfgRes, engRes]) => {
        setConfigs(cfgRes.data)
        setEngines(engRes.data)
        if (cfgRes.data.length) handleSelectConfig(cfgRes.data[0].id, cfgRes.data)
      })
      .catch(() => setError('Failed to load configurations.'))
      .finally(() => setLoading(false))
  }, [token])

  const handleSelectConfig = (configId, list = configs) => {
    if (configId === 'new') { setSelectedConfigId(null); setForm(EMPTY); return }
    const config = list.find((item) => item.id === configId)
    if (!config) return
    setSelectedConfigId(configId)
    setForm({
      name:               config.name || '',
      engine_ids:         config.engine_ids || [],
      ps_base_url:        config.ps_base_url || '',
      ps_auth_type:       config.ps_auth_type || 'basic',
      ps_username:        config.ps_username || '',
      ps_password:        config.ps_password || '',      // "***" sentinel if a password is saved
      ps_endpoint:        config.ps_endpoint || '',
      ps_status_endpoint: config.ps_status_endpoint || '',
      ps_process_name:    config.ps_process_name || 'SM_DISCOVERY',
      retrieval_method:   config.retrieval_method || 'sftp',
      sftp_host:          config.sftp_host || '',
      sftp_port:          config.sftp_port ? String(config.sftp_port) : '22',
      sftp_username:      config.sftp_username || '',
      sftp_password:      config.sftp_password || '',    // "***" sentinel if a password is saved
      sftp_remote_path:   config.sftp_remote_path || '',
      ps_webserver_path:  config.ps_webserver_path || '',
      ftp_host:           config.ftp_host || '',
      ftp_port:           config.ftp_port ? String(config.ftp_port) : '21',
      ftp_username:       config.ftp_username || '',
      ftp_password:       config.ftp_password || '',
      ftp_remote_path:    config.ftp_remote_path || '',
      ftp_connection_type: config.ftp_connection_type || 'ftp',
      ftp_passive:        config.ftp_passive !== undefined ? config.ftp_passive : true,
      win_host:           config.win_host || '',
      win_port:           config.win_port ? String(config.win_port) : '5985',
      win_username:       config.win_username || '',
      win_password:       config.win_password || '',     // "***" sentinel if a password is saved
      win_use_ssl:        config.win_use_ssl || false,
      win_auth_type:      config.win_auth_type || 'ntlm',
      win_connection_type: config.win_connection_type || 'winrm',
      win_share:          config.win_share || 'C$',
      win_domain:         config.win_domain || '',
    })
  }

  const RETRIEVAL_KEYS = ['retrieval_method', 'sftp_host', 'sftp_port', 'sftp_username', 'sftp_password', 'sftp_remote_path']
  const PS_KEYS  = ['ps_base_url', 'ps_auth_type', 'ps_username', 'ps_password', 'ps_endpoint', 'ps_status_endpoint', 'ps_process_name']
  const WIN_KEYS = ['win_host', 'win_port', 'win_username', 'win_password', 'win_use_ssl', 'win_auth_type', 'win_connection_type', 'win_share', 'win_domain']
  const FTP_KEYS = ['ftp_host', 'ftp_port', 'ftp_username', 'ftp_password', 'ftp_remote_path', 'ftp_connection_type', 'ftp_passive']

  const set = (k) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((prev) => ({ ...prev, [k]: value }))
    if (RETRIEVAL_KEYS.includes(k)) setTestStatus(null)
    if (PS_KEYS.includes(k))  setPsTestStatus(null)
    if (WIN_KEYS.includes(k)) setWinTestStatus(null)
    if (FTP_KEYS.includes(k)) setFtpTestStatus(null)
  }

  const parseError = (err, fallback) => {
    const detail = err?.response?.data?.detail

    if (typeof detail === 'string') return detail

    if (Array.isArray(detail)) {
      return detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
    }

    if (typeof detail === 'object' && detail !== null) {
      return detail.msg || JSON.stringify(detail)
    }

    return fallback
  }
  const handleConnectionTypeChange = (e) => {
    const type = e.target.value
    setForm((prev) => ({ ...prev, win_connection_type: type, win_port: WIN_DEFAULT_PORTS[type] || prev.win_port }))
    setWinTestStatus(null)
  }

  const handleDeleteConfig = async () => {
    if (!selectedConfigId) return
    setLoading(true)
    try {
      await deleteConfig(selectedConfigId, token)
      const remaining = configs.filter((item) => item.id !== selectedConfigId)
      setConfigs(remaining)
      if (remaining.length) handleSelectConfig(remaining[0].id, remaining)
      else { setSelectedConfigId(null); setForm(EMPTY) }
    } catch { setError('Unable to remove configuration.') }
    finally { setLoading(false) }
  }

  // Strip the "***" sentinel before sending to test endpoints — they have no sentinel awareness.
  // An empty string causes the backend to fall back to any .env-based v1 credentials.
  const livePass = (v) => (v === '***' ? '' : v)

  const handlePsTest = async () => {
    setPsTestStatus('testing')
    try {
      const res = await testPeoplesoft({
        ps_base_url: form.ps_base_url, ps_auth_type: form.ps_auth_type,
        ps_username: form.ps_username, ps_password: livePass(form.ps_password),
        ps_endpoint: form.ps_endpoint, ps_status_endpoint: form.ps_status_endpoint,
        ps_process_name: form.ps_process_name,
      })
      setPsTestStatus({ ok: true, http_status: res.data.http_status, body: res.data.body ?? '', instance_id: res.data.instance_id ?? '', status_http_status: res.data.status_http_status, status_body: res.data.status_body ?? '' })
    } catch (err) {
      setPsTestStatus({ ok: false, message: parseError(err, 'API test failed') })
    }
  }

  const handleTest = async () => {
    setTestStatus('testing')
    try {
      const res = await testRetrieval({
        retrieval_method: form.retrieval_method,
        sftp_host: form.sftp_host, sftp_port: parseInt(form.sftp_port, 10) || 22,
        sftp_username: form.sftp_username, sftp_password: livePass(form.sftp_password),
        sftp_remote_path: form.sftp_remote_path,
      })
      setTestStatus({ ok: true, size_kb: res.data.size_kb })
    } catch (err) {
      setTestStatus({ ok: false, message: parseError(err, 'Connection test failed') })
    }
  }

  const handleFtpTest = async () => {
    setFtpTestStatus('testing')
    try {
      const res = await testFtp({
        ftp_host: form.ftp_host,
        ftp_port: parseInt(form.ftp_port, 10) || 21,
        ftp_username: form.ftp_username,
        ftp_password: livePass(form.ftp_password),
        ftp_connection_type: form.ftp_connection_type,
        ftp_passive: form.ftp_passive,
      })
      setFtpTestStatus({ ok: true, ...res.data })
    } catch (err) {
      setFtpTestStatus({ ok: false, message: parseError(err, 'FTP connection failed') })
    }
  }

  const handleFtpConnectionTypeChange = (e) => {
    const type = e.target.value
    setForm((prev) => ({ ...prev, ftp_connection_type: type, ftp_port: FTP_DEFAULT_PORTS[type] || prev.ftp_port }))
    setFtpTestStatus(null)
  }

  const handleWinTest = async () => {
    setWinTestStatus('testing')
    try {
      const defaultPort = { winrm: 5985, smb: 445, ssh: 22 }[form.win_connection_type] || 5985
      const res = await testWindows({
        win_host: form.win_host, win_username: form.win_username, win_password: livePass(form.win_password),
        win_port: parseInt(form.win_port, 10) || defaultPort,
        win_use_ssl: form.win_use_ssl, win_auth_type: form.win_auth_type,
        win_connection_type: form.win_connection_type, win_share: form.win_share, win_domain: form.win_domain,
      })
      setWinTestStatus({ ok: true, ...res.data })
    } catch (err) {
      setWinTestStatus({ ok: false, message: parseError(err, 'Connection failed') })
    }
  }

  const handleSave = async () => {
    setSaving(true); setError(null); setSuccess(false)
    const trimmed = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
    )
    trimmed.engine_ids = form.engine_ids.map(Number)
    try {
      if (selectedConfigId) {
        await updateConfig(selectedConfigId, trimmed, token)
      } else {
        const response = await createConfig(trimmed, token)
        setSelectedConfigId(response.data.id)
        setConfigs((prev) => [response.data, ...prev])
      }
      if (!user?.onboarded) await markOnboarded()
      setSuccess(true)
      setTimeout(() => setSuccess(false), 4000)
    } catch (err) {
      setError(formatApiError(err, 'Failed to save configuration.'))
    } finally { setSaving(false) }
  }

  const passAdornment = (show, toggle) => ({
    endAdornment: (
      <InputAdornment position="end">
        <IconButton size="small" onClick={toggle} sx={{ color: 'text.disabled', '&:hover': { color: accent } }}>
          {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
        </IconButton>
      </InputAdornment>
    ),
  })

  // Section completion indicators
  const sec01Complete = !!(form.ps_base_url && form.ps_endpoint)
  const sec02Complete = !!(form.sftp_remote_path && (
    ['sftp', 'scp'].includes(form.retrieval_method) ? form.sftp_host : true
  ))
  const sec03Complete = !!(form.win_host && form.win_username)
  const sec04Complete = !!(form.ftp_host && form.ftp_username)

  // Shared result box
  const ResultBox = ({ status }) => status && status !== 'testing' && (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.5,
      px: status.ok ? 1.2 : 2, py: status.ok ? 0.6 : 1.2,
      borderRadius: '3px', flex: 1, minWidth: 0,
      border: status.ok ? `1px solid ${accent}4d` : '1px solid rgba(143,74,74,0.3)',
      bgcolor: status.ok ? `${accent}0d` : 'rgba(143,74,74,0.06)',
      '@keyframes resultIn': { from: { opacity: 0, transform: 'translateX(-6px)' }, to: { opacity: 1, transform: 'none' } },
      animation: 'resultIn 0.25s ease both',
    }}>
      {status.ok
        ? <SuccessCheck size={44} />
        : <Box sx={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, bgcolor: '#8f4a4a', boxShadow: '0 0 6px rgba(143,74,74,0.6)' }} />
      }
      <Box sx={{ minWidth: 0 }}>{status.children}</Box>
    </Box>
  )

  const btnSx = { color: accent, borderColor: `${accent}59`, borderRadius: '3px', fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.16em', px: 2.5, py: 0.9, '&:hover:not(:disabled)': { borderColor: accent, bgcolor: `${accent}0a` }, '&:disabled': { opacity: 0.4 } }

  if (loading) return (
    <MythicsLoader sx={{ flex: 1, minHeight: '100vh', bgcolor: 'background.default' }} />
  )

  return (
    <Box sx={{ flex: 1, bgcolor: 'background.default', display: 'flex', justifyContent: 'center', px: { xs: 2, sm: 4, md: 5 }, py: 5 }}>
    <Box sx={{ width: '100%', maxWidth: 960, display: 'flex', flexDirection: 'column' }}>

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <Box sx={{ mb: 4 }}>
        <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.55rem', letterSpacing: '0.35em', color: accent, textTransform: 'uppercase', mb: 0.75, opacity: 0.8 }}>
          Setup &amp; Onboarding
        </Typography>
        <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '2.8rem', fontWeight: 700, color: 'text.primary', letterSpacing: '0.02em', lineHeight: 0.95, mb: 1.25 }}>
          Configuration
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ height: '2px', width: 44, background: `linear-gradient(90deg, ${accent}, transparent)`, borderRadius: '1px' }} />
          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.62rem', letterSpacing: '0.14em', color: 'text.disabled' }}>
            Connect to PeopleSoft, configure data retrieval and Windows server access
          </Typography>
        </Box>
      </Box>

      {/* ── Profile card ─────────────────────────────────────────────────────── */}
      <Box sx={{
        border: `1px solid ${accent}22`, borderRadius: '6px', mb: 3, overflow: 'hidden',
        background: `linear-gradient(135deg, ${accent}0a 0%, transparent 70%)`,
        transition: 'box-shadow 0.25s ease',
        '&:hover': { boxShadow: `0 4px 20px ${accent}10` },
      }}>
        <Box sx={{ px: 3.5, py: 1.75, borderBottom: `1px solid ${accent}18`, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: accent, flex: 1 }}>
            Profile
          </Typography>
          <Button onClick={() => { setSelectedConfigId(null); setForm(EMPTY) }} variant="outlined" size="small"
            sx={{ color: accent, borderColor: `${accent}33`, borderRadius: '3px', fontFamily: '"Raleway"', fontSize: '0.6rem', letterSpacing: '0.15em', fontWeight: 700, py: 0.4, px: 1.5, minWidth: 0 }}>
            New
          </Button>
          {selectedConfigId && (
            <Button onClick={handleDeleteConfig} variant="outlined" size="small"
              sx={{ color: '#c98f8f', borderColor: 'rgba(143,74,74,0.25)', borderRadius: '3px', fontFamily: '"Raleway"', fontSize: '0.6rem', letterSpacing: '0.15em', fontWeight: 700, py: 0.4, px: 1.5, minWidth: 0 }}>
              Delete
            </Button>
          )}
        </Box>
        <Box sx={{ px: 3.5, py: 2.5, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
          <Field label="Saved configuration">
            <FormControl fullWidth size="small">
              <Select value={selectedConfigId || 'new'} onChange={(e) => handleSelectConfig(e.target.value)} sx={selectSx}>
                {configs.map((c) => <MenuItem key={c.id} value={c.id}>{c.name || `Config ${c.id}`}</MenuItem>)}
                <MenuItem value="new">— New profile —</MenuItem>
              </Select>
            </FormControl>
          </Field>
          <Field label="Configuration name">
            <TextField fullWidth size="small" value={form.name} onChange={set('name')} placeholder="e.g. Production HR, UAT Environment" sx={inputSx} />
          </Field>
          <Box sx={{ gridColumn: '1 / -1' }}>
            <Field label="Engines to run">
              {engines.length === 0 ? (
                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.62rem', color: 'text.disabled', mt: 0.5 }}>
                  No engines configured yet — ask an admin to add engines in the Admin Console.
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
                  {engines.map((e, idx) => {
                    const checked = form.engine_ids.includes(e.id)
                    const toggle = () => {
                      setForm((prev) => ({
                        ...prev,
                        engine_ids: checked
                          ? prev.engine_ids.filter((id) => id !== e.id)
                          : [...prev.engine_ids, e.id],
                      }))
                    }
                    return (
                      <Box
                        key={e.id}
                        onClick={toggle}
                        sx={{
                          display: 'flex', alignItems: 'center', gap: 1.5,
                          px: 1.5, py: 1,
                          border: '1px solid',
                          borderColor: checked ? accent : 'divider',
                          bgcolor: checked ? `${accent}08` : 'transparent',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          '&:hover': { borderColor: accent, bgcolor: `${accent}06` },
                        }}
                      >
                        {/* Checkbox visual */}
                        <Box sx={{
                          width: 16, height: 16, borderRadius: '2px', flexShrink: 0,
                          border: `1.5px solid ${checked ? accent : 'divider'}`,
                          bgcolor: checked ? accent : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.12s ease',
                        }}>
                          {checked && (
                            <Box component="span" sx={{ color: '#0b0c0e', fontSize: '10px', fontWeight: 700, lineHeight: 1 }}>✓</Box>
                          )}
                        </Box>
                        {/* Order badge */}
                        {checked && (
                          <Box sx={{
                            minWidth: 18, height: 18, borderRadius: '9px',
                            bgcolor: accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6rem', fontWeight: 700, color: '#0b0c0e', lineHeight: 1 }}>
                              {form.engine_ids.indexOf(e.id) + 1}
                            </Typography>
                          </Box>
                        )}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem', fontWeight: checked ? 700 : 400, color: checked ? 'text.primary' : 'text.secondary' }}>
                            {e.name}
                          </Typography>
                          <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6rem', color: accent, opacity: 0.75 }}>
                            {e.process_name}
                          </Typography>
                          {e.description && (
                            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.62rem', color: 'text.disabled', mt: 0.1 }}>
                              {e.description}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    )
                  })}
                </Box>
              )}
              {form.engine_ids.length > 1 && (
                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', color: 'text.disabled', mt: 0.75, letterSpacing: '0.06em' }}>
                  Engines will trigger sequentially in the order ticked (numbers shown).
                </Typography>
              )}
            </Field>
          </Box>
        </Box>
      </Box>

      {/* ── Section 01: PeopleSoft integration ───────────────────────────────── */}
      <SectionCard number="01" title="PeopleSoft integration" subtitle="Broker authentication and process wiring" complete={sec01Complete}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
          <Box sx={{ gridColumn: '1 / -1' }}>
            <Field label="Base URL">
              <TextField fullWidth size="small" value={form.ps_base_url} onChange={set('ps_base_url')} placeholder="https://your-ps-host/PSIGW" sx={inputSx} />
            </Field>
          </Box>

          <Field label="Auth type">
            <FormControl fullWidth size="small">
              <Select value={form.ps_auth_type} onChange={set('ps_auth_type')} sx={selectSx}>
                <MenuItem value="basic">Basic Auth</MenuItem>
                <MenuItem value="bearer">Bearer Token</MenuItem>
              </Select>
            </FormControl>
          </Field>

          {form.ps_auth_type === 'basic' ? (<>
            <Field label="Username">
              <TextField fullWidth size="small" value={form.ps_username} onChange={set('ps_username')} sx={inputSx} />
            </Field>
            <Field label="Password">
              <TextField fullWidth size="small" type={showPsPass ? 'text' : 'password'} value={form.ps_password} onChange={set('ps_password')} sx={inputSx} InputProps={passAdornment(showPsPass, () => setShowPsPass((p) => !p))} />
            </Field>
          </>) : (
            <Field label="Bearer token">
              <TextField fullWidth size="small" type={showPsPass ? 'text' : 'password'} value={form.ps_password} onChange={set('ps_password')} sx={inputSx} InputProps={passAdornment(showPsPass, () => setShowPsPass((p) => !p))} />
            </Field>
          )}

          <Field label="Trigger endpoint">
            <TextField fullWidth size="small" value={form.ps_endpoint} onChange={set('ps_endpoint')} placeholder="/api/v1/trigger" sx={inputSx} />
          </Field>

          <Field label="Status endpoint">
            <TextField fullWidth size="small" value={form.ps_status_endpoint} onChange={set('ps_status_endpoint')} placeholder="/api/v1/status"
              helperText="GET {endpoint}/{InstanceID} is polled until STATUS = Success."
              FormHelperTextProps={{ sx: { fontFamily: '"Raleway"', fontSize: '0.6rem', color: 'text.disabled' } }}
              sx={inputSx} />
          </Field>

          {/* PS test row */}
          <Box sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Button onClick={handlePsTest} variant="outlined"
              disabled={psTestStatus === 'testing' || !form.ps_base_url || !form.ps_endpoint || !form.ps_status_endpoint}
              startIcon={psTestStatus === 'testing' ? <CircularProgress size={13} sx={{ color: accent }} /> : null}
              sx={btnSx}>
              {psTestStatus === 'testing' ? 'Testing…' : 'Test API Call'}
            </Button>
            {psTestStatus && psTestStatus !== 'testing' && (
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                px: psTestStatus.ok ? 1.2 : 2, py: psTestStatus.ok ? 0.5 : 1.2,
                borderRadius: '3px', flex: 1, minWidth: 0,
                border: psTestStatus.ok ? `1px solid ${accent}4d` : '1px solid rgba(143,74,74,0.3)',
                bgcolor: psTestStatus.ok ? `${accent}0d` : 'rgba(143,74,74,0.06)',
                '@keyframes resultIn': { from: { opacity: 0, transform: 'translateX(-6px)' }, to: { opacity: 1, transform: 'none' } },
                animation: 'resultIn 0.25s ease both',
              }}>
                {psTestStatus.ok
                  ? <SuccessCheck size={44} />
                  : <Box sx={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, bgcolor: '#8f4a4a', boxShadow: '0 0 6px rgba(143,74,74,0.6)' }} />
                }
                <Box>
                  {psTestStatus.ok ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                      <Box>
                        <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', color: accent, letterSpacing: '0.06em', mb: 0.2 }}>API test passed</Typography>
                        <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.62rem', color: 'text.secondary', letterSpacing: '0.04em' }}>
                          HTTP {psTestStatus.http_status}{psTestStatus.status_http_status != null ? ` · Status ${psTestStatus.status_http_status}` : ''}
                        </Typography>
                      </Box>
                      <Button onClick={() => setPsBodyOpen(true)} variant="outlined" size="small"
                        sx={{ color: accent, borderColor: `${accent}4d`, borderRadius: '3px', fontFamily: '"Raleway"', fontWeight: 700, fontSize: '0.58rem', letterSpacing: '0.14em', px: 1.5, py: 0.5, flexShrink: 0, '&:hover': { borderColor: accent, bgcolor: `${accent}0a` } }}>
                        View response
                      </Button>
                    </Box>
                  ) : (
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', color: '#c98f8f', letterSpacing: '0.04em', lineHeight: 1.5 }}>{psTestStatus.message}</Typography>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </SectionCard>

      {/* ── Section 02: Data retrieval ────────────────────────────────────────── */}
      <SectionCard number="02" title="Data retrieval" subtitle="Configure how the tool downloads CSV data after PeopleSoft runs" complete={sec02Complete}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
          <Box sx={{ gridColumn: '1 / -1' }}>
            <Field label="Retrieval method">
              <FormControl fullWidth size="small">
                <Select value={form.retrieval_method} onChange={set('retrieval_method')} sx={selectSx}>
                  <MenuItem value="sftp">SFTP — Secure File Transfer (Linux / Unix)</MenuItem>
                  <MenuItem value="scp">SSH / SCP — Server exec via SSH (Linux / Unix)</MenuItem>
                  <MenuItem value="winrm">Windows / WinRM — PowerShell remote execution</MenuItem>
                  <MenuItem value="smb">Windows / SMB — File sharing (no server config needed)</MenuItem>
                  <MenuItem value="win_ssh">Windows / SSH — OpenSSH on Windows (port 22)</MenuItem>
                  <MenuItem value="ftp">FTP / FTPS — File Transfer Protocol</MenuItem>
                </Select>
              </FormControl>
            </Field>
          </Box>

          {(form.retrieval_method === 'sftp' || form.retrieval_method === 'scp') && (<>
            <Field label="Host">
              <TextField fullWidth size="small" value={form.sftp_host} onChange={set('sftp_host')} placeholder="sftp.example.com" sx={inputSx} />
            </Field>
            <Field label="Port">
              <TextField fullWidth size="small" type="number" value={form.sftp_port} onChange={set('sftp_port')} inputProps={{ min: 1, max: 65535 }} sx={inputSx} />
            </Field>
            <Field label="Username">
              <TextField fullWidth size="small" value={form.sftp_username} onChange={set('sftp_username')} autoComplete="off" sx={inputSx} />
            </Field>
            <Field label="Password">
              <TextField fullWidth size="small" type={showSftpPass ? 'text' : 'password'} value={form.sftp_password} onChange={set('sftp_password')} autoComplete="new-password" InputProps={passAdornment(showSftpPass, () => setShowSftpPass((p) => !p))} sx={inputSx} />
            </Field>
          </>)}

          {['winrm', 'smb', 'win_ssh', 'ftp'].includes(form.retrieval_method) && (
            <Box sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 2, py: 1.5, border: `1px solid ${accent}26`, bgcolor: `${accent}06`, borderRadius: '3px' }}>
              <DnsIcon sx={{ fontSize: 15, color: accent, mt: 0.15, flexShrink: 0 }} />
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', color: 'text.secondary', lineHeight: 1.6 }}>
                {form.retrieval_method === 'smb' && <><strong style={{ fontWeight: 700 }}>SMB</strong> uses the Windows Server credentials from Section 03. No server configuration is needed — admin shares (<Box component="span" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: accent }}>C$</Box>, <Box component="span" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: accent }}>D$</Box>) are available by default to Administrators.</>}
                {form.retrieval_method === 'winrm' && <><strong style={{ fontWeight: 700 }}>WinRM</strong> uses the Windows Server credentials from Section 03 to run PowerShell remotely. Requires WinRM to be enabled on the server.</>}
                {form.retrieval_method === 'win_ssh' && <><strong style={{ fontWeight: 700 }}>Windows SSH</strong> uses the Windows Server credentials from Section 03 via OpenSSH (port 22). OpenSSH must be installed on the remote server.</>}
                {form.retrieval_method === 'ftp' && <><strong style={{ fontWeight: 700 }}>FTP / FTPS</strong> uses the FTP Server credentials from Section 04. Remote path should be Unix-style, e.g. <Box component="span" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: accent }}>/reports/{'{report_id}'}/output.csv</Box>.</>}
                {form.retrieval_method !== 'ftp' && <>{' '}Remote path should be Windows-style, e.g.{' '}<Box component="span" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: accent }}>C:\psft\reports\{'{report_id}'}\output.csv</Box></>}
              </Typography>
            </Box>
          )}

          <Box sx={{ gridColumn: '1 / -1' }}>
            <Field label="Remote path">
              <TextField fullWidth size="small" value={form.sftp_remote_path} onChange={set('sftp_remote_path')}
                placeholder={['winrm', 'smb', 'win_ssh'].includes(form.retrieval_method) ? 'C:\\psft\\reports\\{report_id}\\output.csv' : '/path/to/{report_id}/output.csv'}
                helperText="Use {report_id} or {instance_id} — replaced at run time with values from PeopleSoft."
                FormHelperTextProps={{ sx: { fontFamily: '"Raleway"', fontSize: '0.6rem', color: 'text.disabled' } }}
                sx={inputSx} />
            </Field>
          </Box>

          <Box sx={{ gridColumn: '1 / -1' }}>
            <Field label="PeopleSoft web server base path">
              <TextField fullWidth size="small" value={form.ps_webserver_path} onChange={set('ps_webserver_path')}
                placeholder="C:\Users\Administrator\psft\pt\8.62\webserv\peoplesoft"
                helperText="Starting directory for the Server Browser in Section 03."
                FormHelperTextProps={{ sx: { fontFamily: '"Raleway"', fontSize: '0.6rem', color: 'text.disabled' } }}
                sx={inputSx} />
            </Field>
          </Box>

          {(form.retrieval_method === 'sftp' || form.retrieval_method === 'scp') ? (
            <Box sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Button onClick={handleTest} variant="outlined" disabled={testStatus === 'testing' || !form.sftp_host}
                startIcon={testStatus === 'testing' ? <CircularProgress size={13} sx={{ color: accent }} /> : null}
                sx={btnSx}>
                {testStatus === 'testing' ? 'Testing…' : 'Test connection'}
              </Button>
              {testStatus && testStatus !== 'testing' && (
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5,
                  px: testStatus.ok ? 1.2 : 2, py: testStatus.ok ? 0.5 : 1.2,
                  borderRadius: '3px', flex: 1, minWidth: 0,
                  border: testStatus.ok ? `1px solid ${accent}4d` : '1px solid rgba(143,74,74,0.3)',
                  bgcolor: testStatus.ok ? `${accent}0d` : 'rgba(143,74,74,0.06)',
                  '@keyframes resultIn': { from: { opacity: 0, transform: 'translateX(-6px)' }, to: { opacity: 1, transform: 'none' } },
                  animation: 'resultIn 0.25s ease both',
                }}>
                  {testStatus.ok
                    ? <SuccessCheck size={44} />
                    : <Box sx={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, bgcolor: '#8f4a4a', boxShadow: '0 0 6px rgba(143,74,74,0.6)' }} />
                  }
                  <Box>
                    {testStatus.ok ? (<>
                      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', color: accent, letterSpacing: '0.06em', mb: 0.2 }}>Connection successful</Typography>
                      <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.62rem', color: 'text.secondary', letterSpacing: '0.04em' }}>
                        {form.sftp_remote_path}{testStatus.size_kb != null && <Box component="span" sx={{ ml: 1.5, color: accent }}>{testStatus.size_kb >= 1024 ? `${(testStatus.size_kb / 1024).toFixed(1)} MB` : `${testStatus.size_kb} KB`}</Box>}
                      </Typography>
                    </>) : (
                      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', color: '#c98f8f', letterSpacing: '0.04em', lineHeight: 1.5 }}>{testStatus.message}</Typography>
                    )}
                  </Box>
                </Box>
              )}
            </Box>
          ) : (
            <Box sx={{ gridColumn: '1 / -1' }}>
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.65rem', color: 'text.disabled', letterSpacing: '0.06em' }}>
                Use <strong style={{ fontWeight: 700 }}>Test {{ winrm: 'WinRM', smb: 'SMB', win_ssh: 'SSH', ftp: 'FTP' }[form.retrieval_method] || 'connection'}</strong> in Section {{ winrm: '03', smb: '03', win_ssh: '03', ftp: '04' }[form.retrieval_method] || '03'} below.
              </Typography>
            </Box>
          )}
        </Box>
      </SectionCard>

      {/* ── Section 03: Windows server access (shown for WinRM / SMB / SSH only) ── */}
      {['winrm', 'smb', 'win_ssh'].includes(form.retrieval_method) && (
      <SectionCard number="03" title="Windows server access" subtitle="Browse and retrieve files from a Windows host — WinRM, SMB, or SSH" complete={sec03Complete}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>

          <Box sx={{ gridColumn: '1 / -1' }}>
            <Field label="Connection type">
              <FormControl fullWidth size="small">
                <Select value={form.win_connection_type} onChange={handleConnectionTypeChange} sx={selectSx}>
                  <MenuItem value="winrm">WinRM — PowerShell remote execution (port 5985)</MenuItem>
                  <MenuItem value="smb">SMB — Windows file sharing (port 445, no config needed)</MenuItem>
                  <MenuItem value="ssh">SSH — OpenSSH on Windows (port 22)</MenuItem>
                </Select>
              </FormControl>
            </Field>
          </Box>

          <Field label="Host / IP address">
            <TextField fullWidth size="small" value={form.win_host} onChange={set('win_host')} placeholder="192.168.0.37" sx={inputSx} />
          </Field>
          <Field label="Port">
            <TextField fullWidth size="small" type="number" value={form.win_port} onChange={set('win_port')} inputProps={{ min: 1, max: 65535 }} sx={inputSx} />
          </Field>
          <Field label="Username">
            <TextField fullWidth size="small" value={form.win_username} onChange={set('win_username')} placeholder="Administrator" autoComplete="off" sx={inputSx} />
          </Field>
          <Field label="Password">
            <TextField fullWidth size="small" type={showWinPass ? 'text' : 'password'} value={form.win_password} onChange={set('win_password')} autoComplete="new-password"
              InputProps={passAdornment(showWinPass, () => setShowWinPass((p) => !p))} sx={inputSx} />
          </Field>

          {/* WinRM-specific */}
          {form.win_connection_type === 'winrm' && (<>
            <Field label="Auth type">
              <FormControl fullWidth size="small">
                <Select value={form.win_auth_type} onChange={set('win_auth_type')} sx={selectSx}>
                  <MenuItem value="ntlm">NTLM — Windows challenge/response (default)</MenuItem>
                  <MenuItem value="basic">Basic — plain credentials (requires server config)</MenuItem>
                  <MenuItem value="negotiate">Negotiate — Kerberos → NTLM fallback</MenuItem>
                  <MenuItem value="kerberos">Kerberos — domain accounts only</MenuItem>
                </Select>
              </FormControl>
            </Field>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 2, py: 1.25, border: `1px solid ${accent}1a`, bgcolor: `${accent}06`, borderRadius: '3px' }}>
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.67rem', color: 'text.secondary', lineHeight: 1.6 }}>
                {form.win_auth_type === 'ntlm' && <><strong style={{ fontWeight: 700 }}>NTLM</strong> — works out-of-the-box. If rejected, run in elevated PowerShell on the server:<br /><Box component="span" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.63rem', color: accent, display: 'block', mt: 0.5 }}>winrm quickconfig -q<br />reg add HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System /v LocalAccountTokenFilterPolicy /t REG_DWORD /d 1 /f</Box></>}
                {form.win_auth_type === 'basic' && <><strong style={{ fontWeight: 700 }}>Basic</strong> — run on the server first:<br /><Box component="span" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.63rem', color: accent, display: 'block', mt: 0.5 }}>winrm set winrm/config/service/auth @{'{'}"Basic"="true"{'}'}<br />winrm set winrm/config/service @{'{'}"AllowUnencrypted"="true"{'}'}</Box></>}
                {form.win_auth_type === 'negotiate' && <><strong style={{ fontWeight: 700 }}>Negotiate</strong> — tries Kerberos first, falls back to NTLM. Best for domain-joined servers.</>}
                {form.win_auth_type === 'kerberos' && <><strong style={{ fontWeight: 700 }}>Kerberos</strong> — requires domain membership and krb5 libs. Use Negotiate instead if unsure.</>}
              </Typography>
            </Box>
            <Box sx={{ gridColumn: '1 / -1' }}>
              <FormControlLabel
                control={<Switch checked={form.win_use_ssl} onChange={set('win_use_ssl')} size="small" sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: accent }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: accent } }} />}
                label={<Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', color: 'text.secondary' }}>Use HTTPS / SSL (port 5986)</Typography>}
              />
            </Box>
          </>)}

          {/* SMB-specific */}
          {form.win_connection_type === 'smb' && (<>
            <Field label="Share name">
              <TextField fullWidth size="small" value={form.win_share} onChange={set('win_share')} placeholder="C$"
                helperText="C$ and D$ are admin shares (require Administrator). Or use an explicit share name."
                FormHelperTextProps={{ sx: { fontFamily: '"Raleway"', fontSize: '0.6rem', color: 'text.disabled' } }}
                sx={inputSx} />
            </Field>
            <Field label="Domain (optional)">
              <TextField fullWidth size="small" value={form.win_domain} onChange={set('win_domain')} placeholder="CORP"
                helperText="Leave blank for local accounts. Required only for domain / Active Directory accounts."
                FormHelperTextProps={{ sx: { fontFamily: '"Raleway"', fontSize: '0.6rem', color: 'text.disabled' } }}
                sx={inputSx} />
            </Field>
            <Box sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 2, py: 1.5, border: `1px solid ${accent}26`, bgcolor: `${accent}06`, borderRadius: '3px' }}>
              <DnsIcon sx={{ fontSize: 15, color: accent, mt: 0.15, flexShrink: 0 }} />
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', color: 'text.secondary', lineHeight: 1.6 }}>
                <strong style={{ fontWeight: 700 }}>SMB requires no server configuration.</strong> Admin shares (<Box component="span" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: accent }}>C$</Box>, <Box component="span" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: accent }}>D$</Box>) are built into Windows and accessible to the Administrators group.
              </Typography>
            </Box>
          </>)}

          {/* SSH-specific */}
          {form.win_connection_type === 'ssh' && (
            <Box sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 2, py: 1.5, border: `1px solid ${accent}26`, bgcolor: `${accent}06`, borderRadius: '3px' }}>
              <DnsIcon sx={{ fontSize: 15, color: accent, mt: 0.15, flexShrink: 0 }} />
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', color: 'text.secondary', lineHeight: 1.6 }}>
                <strong style={{ fontWeight: 700 }}>OpenSSH Server</strong> must be installed on the remote Windows host. To install (elevated PowerShell on the server):<br />
                <Box component="span" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.63rem', color: accent, display: 'block', mt: 0.5 }}>
                  Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0<br />
                  Start-Service sshd &amp;&amp; Set-Service -Name sshd -StartupType Automatic
                </Box>
              </Typography>
            </Box>
          )}

          {/* Test + Browse buttons */}
          <Box sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Button onClick={handleWinTest} variant="outlined"
              disabled={winTestStatus === 'testing' || !form.win_host || !form.win_username}
              startIcon={winTestStatus === 'testing' ? <CircularProgress size={13} sx={{ color: accent }} /> : <DnsIcon sx={{ fontSize: 14 }} />}
              sx={btnSx}>
              {winTestStatus === 'testing' ? 'Connecting…' : `Test ${{ winrm: 'WinRM', smb: 'SMB', ssh: 'SSH' }[form.win_connection_type] || 'connection'}`}
            </Button>
            <Tooltip
              title={form.win_password === '***' ? 'Re-enter the password to browse the server' : ''}
              placement="top"
            >
              <span>
                <Button onClick={() => setWinBrowserOpen(true)} variant="outlined"
                  disabled={!form.win_host || !form.win_username || !form.win_password || form.win_password === '***'}
                  startIcon={<FolderOpenIcon sx={{ fontSize: 14 }} />}
                  sx={btnSx}>
                  Browse Server
                </Button>
              </span>
            </Tooltip>

            {winTestStatus && winTestStatus !== 'testing' && (
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                px: winTestStatus.ok ? 1.2 : 2, py: winTestStatus.ok ? 0.5 : 1.2,
                borderRadius: '3px', flex: 1, minWidth: 0,
                border: winTestStatus.ok ? `1px solid ${accent}4d` : '1px solid rgba(143,74,74,0.3)',
                bgcolor: winTestStatus.ok ? `${accent}0d` : 'rgba(143,74,74,0.06)',
                '@keyframes resultIn': { from: { opacity: 0, transform: 'translateX(-6px)' }, to: { opacity: 1, transform: 'none' } },
                animation: 'resultIn 0.25s ease both',
              }}>
                {winTestStatus.ok
                  ? <SuccessCheck size={44} />
                  : <Box sx={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, bgcolor: '#8f4a4a', boxShadow: '0 0 6px rgba(143,74,74,0.6)' }} />
                }
                <Box>
                  {winTestStatus.ok ? (
                    <Box>
                      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', color: accent, letterSpacing: '0.06em', mb: 0.25 }}>
                        Connected — {winTestStatus.ComputerName}
                      </Typography>
                      <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.61rem', color: 'text.secondary' }}>
                        {form.win_connection_type === 'winrm' && `${winTestStatus.OSVersion} · PS ${winTestStatus.PSVersion} · ${winTestStatus.Username}`}
                        {form.win_connection_type === 'smb'   && `Share: \\\\${form.win_host}\\${winTestStatus.Share} · ${winTestStatus.RootEntries} items · ${winTestStatus.Protocol}`}
                        {form.win_connection_type === 'ssh'   && `${winTestStatus.Protocol} · user: ${winTestStatus.Username}`}
                      </Typography>
                    </Box>
                  ) : (
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', color: '#c98f8f', letterSpacing: '0.04em', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                      {winTestStatus.message}
                    </Typography>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </SectionCard>
      )}

      {/* ── Section 03: FTP server access (shown for FTP / FTPS only) ─────────── */}
      {form.retrieval_method === 'ftp' && (
      <SectionCard number="03" title="FTP server access" subtitle="Browse and retrieve files via plain FTP or FTPS (explicit TLS)" complete={sec04Complete}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>

          <Box sx={{ gridColumn: '1 / -1' }}>
            <Field label="Connection type">
              <FormControl fullWidth size="small">
                <Select value={form.ftp_connection_type} onChange={handleFtpConnectionTypeChange} sx={selectSx}>
                  <MenuItem value="ftp">Plain FTP (port 21)</MenuItem>
                  <MenuItem value="ftps">FTPS — Explicit TLS (port 21)</MenuItem>
                </Select>
              </FormControl>
            </Field>
          </Box>

          <Field label="Host / IP address">
            <TextField fullWidth size="small" value={form.ftp_host} onChange={set('ftp_host')} placeholder="ftp.example.com" sx={inputSx} />
          </Field>
          <Field label="Port">
            <TextField fullWidth size="small" type="number" value={form.ftp_port} onChange={set('ftp_port')} inputProps={{ min: 1, max: 65535 }} sx={inputSx} />
          </Field>
          <Field label="Username">
            <TextField fullWidth size="small" value={form.ftp_username} onChange={set('ftp_username')} placeholder="ftpuser" autoComplete="off" sx={inputSx} />
          </Field>
          <Field label="Password">
            <TextField fullWidth size="small" type={showFtpPass ? 'text' : 'password'} value={form.ftp_password} onChange={set('ftp_password')} autoComplete="new-password"
              InputProps={passAdornment(showFtpPass, () => setShowFtpPass((p) => !p))} sx={inputSx} />
          </Field>

          <Box sx={{ gridColumn: '1 / -1' }}>
            <FormControlLabel
              control={<Switch checked={form.ftp_passive} onChange={set('ftp_passive')} size="small" sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: accent }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: accent } }} />}
              label={<Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', color: 'text.secondary' }}>Passive mode (recommended — works through NAT and firewalls)</Typography>}
            />
          </Box>

          {form.ftp_connection_type === 'ftps' && (
            <Box sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 2, py: 1.5, border: `1px solid ${accent}26`, bgcolor: `${accent}06`, borderRadius: '3px' }}>
              <StorageIcon sx={{ fontSize: 15, color: accent, mt: 0.15, flexShrink: 0 }} />
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', color: 'text.secondary', lineHeight: 1.6 }}>
                <strong style={{ fontWeight: 700 }}>Explicit FTPS</strong> upgrades the control connection to TLS using AUTH TLS on port 21. The server must support RFC 4217. This is the modern standard — preferred over implicit FTPS (port 990).
              </Typography>
            </Box>
          )}

          <Box sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Button onClick={handleFtpTest} variant="outlined"
              disabled={ftpTestStatus === 'testing' || !form.ftp_host || !form.ftp_username}
              startIcon={ftpTestStatus === 'testing' ? <CircularProgress size={13} sx={{ color: accent }} /> : <StorageIcon sx={{ fontSize: 14 }} />}
              sx={btnSx}>
              {ftpTestStatus === 'testing' ? 'Connecting…' : `Test ${form.ftp_connection_type === 'ftps' ? 'FTPS' : 'FTP'}`}
            </Button>
            <Tooltip title={form.ftp_password === '***' ? 'Re-enter the password to browse the server' : ''} placement="top">
              <span>
                <Button onClick={() => setFtpBrowserOpen(true)} variant="outlined"
                  disabled={!form.ftp_host || !form.ftp_username || !form.ftp_password || form.ftp_password === '***'}
                  startIcon={<FolderOpenIcon sx={{ fontSize: 14 }} />}
                  sx={btnSx}>
                  Browse Server
                </Button>
              </span>
            </Tooltip>

            {ftpTestStatus && ftpTestStatus !== 'testing' && (
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                px: ftpTestStatus.ok ? 1.2 : 2, py: ftpTestStatus.ok ? 0.5 : 1.2,
                borderRadius: '3px', flex: 1, minWidth: 0,
                border: ftpTestStatus.ok ? `1px solid ${accent}4d` : '1px solid rgba(143,74,74,0.3)',
                bgcolor: ftpTestStatus.ok ? `${accent}0d` : 'rgba(143,74,74,0.06)',
                '@keyframes resultIn': { from: { opacity: 0, transform: 'translateX(-6px)' }, to: { opacity: 1, transform: 'none' } },
                animation: 'resultIn 0.25s ease both',
              }}>
                {ftpTestStatus.ok
                  ? <SuccessCheck size={44} />
                  : <Box sx={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, bgcolor: '#8f4a4a', boxShadow: '0 0 6px rgba(143,74,74,0.6)' }} />
                }
                <Box>
                  {ftpTestStatus.ok ? (
                    <Box>
                      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', color: accent, letterSpacing: '0.06em', mb: 0.25 }}>
                        Connected — {ftpTestStatus.ComputerName}
                      </Typography>
                      <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.61rem', color: 'text.secondary' }}>
                        {ftpTestStatus.Protocol}
                      </Typography>
                    </Box>
                  ) : (
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', color: '#c98f8f', letterSpacing: '0.04em', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                      {ftpTestStatus.message}
                    </Typography>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </SectionCard>
      )}

      {/* FTP browser dialog */}
      <FtpBrowser
        open={ftpBrowserOpen}
        onClose={() => setFtpBrowserOpen(false)}
        ftpHost={form.ftp_host}
        ftpPort={parseInt(form.ftp_port, 10) || 21}
        ftpUsername={form.ftp_username}
        ftpPassword={livePass(form.ftp_password)}
        ftpConnectionType={form.ftp_connection_type}
        ftpPassive={form.ftp_passive}
      />

      {/* ── Data Quality Rules ───────────────────────────────────────────────── */}
      {selectedConfigId && (
        <Box sx={{ border: `1px solid ${accent}22`, borderRadius: '6px', p: 2.5, mb: 2 }}>
          <DataQualityPanel configId={selectedConfigId} />
        </Box>
      )}

      {/* ── Sticky save footer ────────────────────────────────────────────────── */}
      <Box sx={{
        position: 'sticky', bottom: 0, mt: 2, py: 2,
        bgcolor: 'background.default',
        borderTop: `1px solid ${accent}1f`,
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        gap: 2, flexWrap: 'wrap', zIndex: 10,
      }}>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ flex: 1, minWidth: 0, py: 0.5, bgcolor: 'rgba(143,74,74,0.1)', border: '1px solid rgba(143,74,74,0.3)', color: isDark ? '#c98f8f' : '#8f4a4a', borderRadius: '3px', '& .MuiAlert-icon': { color: '#8f4a4a' } }}>
            {typeof error === 'string'
              ? error
              : Array.isArray(error)
                ? error.map((e) => e.msg || JSON.stringify(e)).join(', ')
                : error?.msg || JSON.stringify(error)
            }
          </Alert>
        )}
        {success && (
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            px: 1.2, py: 0.4,
            bgcolor: `${accent}0f`, border: `1px solid ${accent}4d`, borderRadius: '3px',
            '@keyframes savedIn': { from: { opacity: 0, transform: 'scale(0.94)' }, to: { opacity: 1, transform: 'scale(1)' } },
            animation: 'savedIn 0.2s ease both',
          }}>
            <SuccessCheck size={40} />
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', color: accent, letterSpacing: '0.04em' }}>
              Saved
            </Typography>
          </Box>
        )}
        <Button onClick={handleSave} disabled={saving}
          startIcon={saving ? <CircularProgress size={14} sx={{ color: isDark ? '#0b0c0e' : '#ffffff' }} /> : <SaveIcon sx={{ fontSize: 16 }} />}
          sx={{
            background: saving ? `${accent}66` : accent,
            color: isDark ? '#0b0c0e' : '#ffffff',
            fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.14em',
            px: 3.5, py: 1.3, borderRadius: '3px', flexShrink: 0,
            boxShadow: `0 2px 16px ${accent}33`,
            '&:hover:not(:disabled)': { background: accent, filter: 'brightness(1.12)', boxShadow: `0 4px 20px ${accent}59` },
            '&:disabled': { opacity: 0.5 },
            transition: 'all 0.2s ease',
          }}>
          {saving ? 'Saving...' : selectedConfigId ? 'Update configuration' : 'Create configuration'}
        </Button>
      </Box>

      {/* ── API Test Results dialog ───────────────────────────────────────────── */}
      <Dialog open={psBodyOpen} onClose={() => setPsBodyOpen(false)} maxWidth="md" fullWidth
        PaperProps={{ sx: { bgcolor: 'background.paper', border: `1px solid ${accent}33`, borderRadius: '6px' } }}>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, py: 2, borderBottom: `1px solid ${accent}1f` }}>
            <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.2rem', fontWeight: 600, color: 'text.primary', letterSpacing: '0.04em' }}>API Test Results</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Tooltip title="Copy all" placement="top">
                <IconButton size="small"
                  onClick={() => { const parts = []; if (psTestStatus?.body) parts.push(`Trigger:\n${psTestStatus.body}`); if (psTestStatus?.status_body) parts.push(`Status:\n${psTestStatus.status_body}`); navigator.clipboard.writeText(parts.join('\n\n')) }}
                  sx={{ color: 'text.secondary', border: `1px solid ${accent}26`, borderRadius: '3px', '&:hover': { color: accent, borderColor: `${accent}66`, bgcolor: `${accent}0a` } }}>
                  <ContentCopyIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
              <IconButton size="small" onClick={() => setPsBodyOpen(false)}
                sx={{ color: 'text.secondary', border: `1px solid ${accent}26`, borderRadius: '3px', '&:hover': { color: 'text.primary', borderColor: `${accent}4d`, bgcolor: `${accent}0a` } }}>
                <CloseIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Box>
          </Box>
          <Box sx={{ px: 3, py: 2.5, maxHeight: '70vh', overflowY: 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'text.secondary' }}>Trigger Response</Typography>
              {psTestStatus?.http_status && <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.62rem', color: accent }}>HTTP {psTestStatus.http_status}</Typography>}
            </Box>
            <Box component="pre" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.78rem', color: 'text.primary', lineHeight: 1.7, m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', mb: 3 }}>
              {psTestStatus?.body ?? ''}
            </Box>
            {psTestStatus?.status_body != null && (<>
              <Box sx={{ height: '1px', bgcolor: `${accent}1a`, mb: 3 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'text.secondary' }}>Status Response</Typography>
                {psTestStatus.status_http_status != null && <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.62rem', color: accent }}>HTTP {psTestStatus.status_http_status}</Typography>}
              </Box>
              <Box component="pre" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.78rem', color: 'text.primary', lineHeight: 1.7, m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {psTestStatus.status_body}
              </Box>
            </>)}
          </Box>
        </DialogContent>
      </Dialog>

      {/* ── Windows Server Browser ────────────────────────────────────────────── */}
      <WinServerBrowser
        open={winBrowserOpen}
        onClose={() => setWinBrowserOpen(false)}
        winHost={form.win_host}
        winUsername={form.win_username}
        winPassword={livePass(form.win_password)}
        winPort={parseInt(form.win_port, 10) || ({ winrm: 5985, smb: 445, ssh: 22 }[form.win_connection_type] || 5985)}
        winUseSsl={form.win_use_ssl}
        winAuthType={form.win_auth_type}
        connectionType={form.win_connection_type}
        winShare={form.win_share}
        winDomain={form.win_domain}
        rootPath={form.ps_webserver_path || (form.win_username ? `C:\\Users\\${form.win_username}` : 'C:\\')}
      />
    </Box>
    </Box>
  )
}
