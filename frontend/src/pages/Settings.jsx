import { useState, useEffect } from 'react'
import {
  Box, Typography, TextField, Button, Select, MenuItem,
  FormControl, InputLabel, CircularProgress, Alert,
  InputAdornment, IconButton, Dialog, DialogContent, Tooltip,
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import CloseIcon from '@mui/icons-material/Close'
import { useAuth } from '../AuthContext'
import { listConfigs, createConfig, updateConfig, deleteConfig, testRetrieval, testPeoplesoft } from '../api'

const EMPTY = {
  name: '',
  ps_base_url: '', ps_auth_type: 'basic', ps_username: '', ps_password: '',
  ps_endpoint: '', ps_status_endpoint: '', ps_process_name: 'SM_DISCOVERY',
  retrieval_method: 'sftp',
  sftp_host: '', sftp_port: '22', sftp_username: '',
  sftp_password: '', sftp_remote_path: '',
}

function Rule() {
  return <Box sx={{ height: '1px', bgcolor: 'rgba(201,168,76,0.12)', my: 4 }} />
}

function SectionHead({ number, title, subtitle }) {
  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, mb: 0.5 }}>
        <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '0.75rem', color: '#c9a84c', letterSpacing: '0.1em' }}>{number}</Typography>
        <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.4rem', fontWeight: 600, color: '#ede8d0', letterSpacing: '0.03em' }}>{title}</Typography>
      </Box>
      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', letterSpacing: '0.12em', color: '#3a3428' }}>{subtitle}</Typography>
      <Box sx={{ height: '1px', width: 32, bgcolor: 'rgba(201,168,76,0.3)', mt: 1.5 }} />
    </Box>
  )
}

function Field({ label, children }) {
  return (
    <Box>
      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#5a5040', mb: 0.8 }}>{label}</Typography>
      {children}
    </Box>
  )
}

const inputSx = {
  '& .MuiOutlinedInput-root': {
    fontFamily: '"Raleway", sans-serif',
    fontSize: '0.85rem',
    color: '#ede8d0',
    bgcolor: 'rgba(201,168,76,0.02)',
    borderRadius: '1px',
  },
  '& .MuiInputBase-input::placeholder': { color: '#3a3428', opacity: 1 },
}

export default function Settings() {
  const { user, token, markOnboarded } = useAuth()
  const [configs, setConfigs] = useState([])
  const [selectedConfigId, setSelectedConfigId] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)
  const [showPsPass, setShowPsPass] = useState(false)
  const [showSftpPass, setShowSftpPass] = useState(false)
  const [testStatus, setTestStatus] = useState(null)
  const [psTestStatus, setPsTestStatus] = useState(null)
  const [psBodyOpen, setPsBodyOpen] = useState(false)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    listConfigs(token)
      .then((res) => {
        setConfigs(res.data)
        if (res.data.length) {
          handleSelectConfig(res.data[0].id, res.data)
        }
      })
      .catch(() => setError('Failed to load configurations.'))
      .finally(() => setLoading(false))
  }, [token])

  const handleSelectConfig = (configId, list = configs) => {
    if (configId === 'new') {
      setSelectedConfigId(null)
      setForm(EMPTY)
      return
    }

    const config = list.find((item) => item.id === configId)
    if (!config) return
    setSelectedConfigId(configId)
    setForm({
      name: config.name || '',
      ps_base_url: config.ps_base_url || '',
      ps_auth_type: config.ps_auth_type || 'basic',
      ps_username: config.ps_username || '',
      ps_password: '',
      ps_endpoint: config.ps_endpoint || '',
      ps_status_endpoint: config.ps_status_endpoint || '',
      ps_process_name: config.ps_process_name || 'SM_DISCOVERY',
      retrieval_method: config.retrieval_method || 'sftp',
      sftp_host: config.sftp_host || '',
      sftp_port: config.sftp_port ? String(config.sftp_port) : '22',
      sftp_username: config.sftp_username || '',
      sftp_password: '',
      sftp_remote_path: config.sftp_remote_path || '',
    })
  }

  const RETRIEVAL_KEYS = ['retrieval_method', 'sftp_host', 'sftp_port', 'sftp_username', 'sftp_password', 'sftp_remote_path']
  const PS_KEYS = ['ps_base_url', 'ps_auth_type', 'ps_username', 'ps_password', 'ps_endpoint', 'ps_status_endpoint', 'ps_process_name']

  const set = (k) => (e) => {
    setForm((prev) => ({ ...prev, [k]: e.target.value }))
    if (RETRIEVAL_KEYS.includes(k)) setTestStatus(null)
    if (PS_KEYS.includes(k)) setPsTestStatus(null)
  }

  const handleDeleteConfig = async () => {
    if (!selectedConfigId) return
    setLoading(true)
    try {
      await deleteConfig(selectedConfigId, token)
      const remaining = configs.filter((item) => item.id !== selectedConfigId)
      setConfigs(remaining)
      if (remaining.length) {
        handleSelectConfig(remaining[0].id, remaining)
      } else {
        setSelectedConfigId(null)
        setForm(EMPTY)
      }
    } catch {
      setError('Unable to remove configuration.')
    } finally {
      setLoading(false)
    }
  }

  const handlePsTest = async () => {
    setPsTestStatus('testing')
    try {
      const res = await testPeoplesoft({
        ps_base_url: form.ps_base_url,
        ps_auth_type: form.ps_auth_type,
        ps_username: form.ps_username,
        ps_password: form.ps_password,
        ps_endpoint: form.ps_endpoint,
        ps_status_endpoint: form.ps_status_endpoint,
        ps_process_name: form.ps_process_name,
      })
      setPsTestStatus({ ok: true, http_status: res.data.http_status, body: res.data.body ?? '', instance_id: res.data.instance_id ?? '', status_http_status: res.data.status_http_status, status_body: res.data.status_body ?? '' })
    } catch (err) {
      setPsTestStatus({ ok: false, message: err.response?.data?.detail ?? 'API test failed' })
    }
  }

  const handleTest = async () => {
    setTestStatus('testing')
    try {
      const res = await testRetrieval({
        retrieval_method: form.retrieval_method,
        sftp_host: form.sftp_host,
        sftp_port: parseInt(form.sftp_port, 10) || 22,
        sftp_username: form.sftp_username,
        sftp_password: form.sftp_password,
        sftp_remote_path: form.sftp_remote_path,
      })
      setTestStatus({ ok: true, size_kb: res.data.size_kb })
    } catch (err) {
      setTestStatus({ ok: false, message: err.response?.data?.detail ?? 'Connection test failed' })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    // Trim all string fields before sending so leading/trailing whitespace never persists
    const trimmed = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
    )
    try {
      if (selectedConfigId) {
        await updateConfig(selectedConfigId, trimmed, token)
      } else {
        const response = await createConfig(trimmed, token)
        setSelectedConfigId(response.data.id)
        setConfigs((prev) => [response.data, ...prev])
      }
      if (!user?.onboarded) {
        await markOnboarded()
      }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 4000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save configuration.')
    } finally {
      setSaving(false)
    }
  }

  const passAdornment = (show, toggle) => ({
    endAdornment: (
      <InputAdornment position="end">
        <IconButton size="small" onClick={toggle} sx={{ color: '#3a3428', '&:hover': { color: '#c9a84c' } }}>
          {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
        </IconButton>
      </InputAdornment>
    ),
  })

  if (loading) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#0b0c0e' }}>
        <CircularProgress size={32} sx={{ color: '#c9a84c' }} />
      </Box>
    )
  }

  return (
    <Box sx={{ flex: 1, bgcolor: '#0b0c0e', px: 5, py: 5, maxWidth: 900 }}>
      <Box sx={{ mb: 1.5 }}>
        <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.58rem', letterSpacing: '0.3em', color: '#3a3428', textTransform: 'uppercase', mb: 0.5 }}>Setup</Typography>
        <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '2rem', fontWeight: 700, color: '#ede8d0', letterSpacing: '0.04em', lineHeight: 1 }}>Configuration & onboarding</Typography>
      </Box>

      <Box sx={{ height: '1px', bgcolor: 'rgba(201,168,76,0.12)', mb: 5 }} />

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 4, bgcolor: 'rgba(143,74,74,0.1)', border: '1px solid rgba(143,74,74,0.3)', color: '#c98f8f', borderRadius: '1px', '& .MuiAlert-icon': { color: '#8f4a4a' } }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 4, bgcolor: 'rgba(107,143,113,0.1)', border: '1px solid rgba(107,143,113,0.3)', color: '#8fc99a', borderRadius: '1px', '& .MuiAlert-icon': { color: '#6b8f71' } }}>
          Configuration saved successfully.
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 4 }}>
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel sx={{ color: '#7a7060' }}>Saved configuration</InputLabel>
          <Select value={selectedConfigId || ''} label="Saved configuration" onChange={(e) => handleSelectConfig(e.target.value)} sx={{ color: '#ede8d0', bgcolor: 'rgba(201,168,76,0.02)', borderRadius: '1px' }}>
            {configs.map((config) => (
              <MenuItem key={config.id} value={config.id}>{config.name || `Config ${config.id}`}</MenuItem>
            ))}
            <MenuItem value="new">Create new profile</MenuItem>
          </Select>
        </FormControl>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button onClick={() => { setSelectedConfigId(null); setForm(EMPTY) }} variant="outlined" sx={{ color: '#c9a84c', borderColor: 'rgba(201,168,76,0.2)' }}>New configuration</Button>
          {selectedConfigId && (
            <Button onClick={handleDeleteConfig} variant="outlined" sx={{ color: '#c98f8f', borderColor: 'rgba(201,74,74,0.2)' }}>Delete</Button>
          )}
        </Box>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Field label="Configuration name">
          <TextField fullWidth size="small" value={form.name} onChange={set('name')} placeholder="e.g. Production HR, UAT Environment" sx={inputSx} />
        </Field>
      </Box>

      <Rule />

      <SectionHead number="01" title="PeopleSoft integration" subtitle="Broker authentication and process wiring" />

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, mb: 4 }}>
        <Box sx={{ gridColumn: '1 / -1' }}>
          <Field label="Base URL">
            <TextField fullWidth size="small" value={form.ps_base_url} onChange={set('ps_base_url')} placeholder="https://your-ps-host/PSIGW" sx={inputSx} />
          </Field>
        </Box>

        <Field label="Auth type">
          <FormControl fullWidth size="small">
            <Select value={form.ps_auth_type} onChange={set('ps_auth_type')} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.85rem', color: '#ede8d0', bgcolor: 'rgba(201,168,76,0.02)', borderRadius: '1px' }}>
              <MenuItem value="basic">Basic Auth</MenuItem>
              <MenuItem value="bearer">Bearer Token</MenuItem>
            </Select>
          </FormControl>
        </Field>

        {form.ps_auth_type === 'basic' ? (
          <>
            <Field label="Username">
              <TextField fullWidth size="small" value={form.ps_username} onChange={set('ps_username')} sx={inputSx} />
            </Field>
            <Field label="Password">
              <TextField fullWidth size="small" type={showPsPass ? 'text' : 'password'} value={form.ps_password} onChange={set('ps_password')} sx={inputSx} InputProps={passAdornment(showPsPass, () => setShowPsPass((prev) => !prev))} />
            </Field>
          </>
        ) : (
          <Field label="Bearer token">
            <TextField fullWidth size="small" type={showPsPass ? 'text' : 'password'} value={form.ps_password} onChange={set('ps_password')} sx={inputSx} InputProps={passAdornment(showPsPass, () => setShowPsPass((prev) => !prev))} />
          </Field>
        )}

        <Field label="Trigger endpoint">
          <TextField fullWidth size="small" value={form.ps_endpoint} onChange={set('ps_endpoint')} placeholder="/api/v1/trigger" sx={inputSx} />
        </Field>

        <Field label="Status endpoint">
          <TextField fullWidth size="small" value={form.ps_status_endpoint} onChange={set('ps_status_endpoint')} placeholder="/api/v1/status" helperText="GET {endpoint}/{InstanceID} is polled until STATUS = Success. Required for polling and for the API test." FormHelperTextProps={{ sx: { fontFamily: '"Raleway"', fontSize: '0.6rem', color: '#3a3428' } }} sx={inputSx} />
        </Field>

        <Field label="Process name">
          <TextField fullWidth size="small" value={form.ps_process_name} onChange={set('ps_process_name')} sx={inputSx} />
        </Field>

        <Box sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button onClick={handlePsTest} disabled={psTestStatus === 'testing' || !form.ps_base_url || !form.ps_endpoint || !form.ps_status_endpoint} variant="outlined" startIcon={psTestStatus === 'testing' ? <CircularProgress size={13} sx={{ color: '#c9a84c' }} /> : null} sx={{ color: '#c9a84c', borderColor: 'rgba(201,168,76,0.35)', borderRadius: '1px', fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.16em', px: 2.5, py: 0.9, '&:hover:not(:disabled)': { borderColor: '#c9a84c', bgcolor: 'rgba(201,168,76,0.04)' }, '&:disabled': { opacity: 0.4 } }}> {psTestStatus === 'testing' ? 'Testing…' : 'Test API Call'} </Button>

          {psTestStatus && psTestStatus !== 'testing' && (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 2, py: 1.2, border: psTestStatus.ok ? '1px solid rgba(107,143,113,0.3)' : '1px solid rgba(143,74,74,0.3)', bgcolor: psTestStatus.ok ? 'rgba(107,143,113,0.06)' : 'rgba(143,74,74,0.06)', flex: 1, minWidth: 0, '@keyframes resultIn': { from: { opacity: 0, transform: 'translateX(-6px)' }, to: { opacity: 1, transform: 'none' } }, animation: 'resultIn 0.25s ease both' }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', mt: 0.3, flexShrink: 0, bgcolor: psTestStatus.ok ? '#6b8f71' : '#8f4a4a', boxShadow: psTestStatus.ok ? '0 0 6px rgba(107,143,113,0.6)' : '0 0 6px rgba(143,74,74,0.6)' }} />
              <Box>
                {psTestStatus.ok ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <Box>
                      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', color: '#8fc99a', letterSpacing: '0.06em', mb: 0.2 }}>API test passed</Typography>
                      <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.62rem', color: '#5a5040', letterSpacing: '0.04em' }}>HTTP {psTestStatus.http_status}{psTestStatus.status_http_status != null ? ` · Status ${psTestStatus.status_http_status}` : ''}</Typography>
                    </Box>
                    <Button onClick={() => setPsBodyOpen(true)} variant="outlined" size="small" sx={{ color: '#c9a84c', borderColor: 'rgba(201,168,76,0.3)', borderRadius: '1px', fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.58rem', letterSpacing: '0.14em', px: 1.5, py: 0.5, flexShrink: 0, '&:hover': { borderColor: '#c9a84c', bgcolor: 'rgba(201,168,76,0.04)' } }}>View response</Button>
                  </Box>
                ) : (
                  <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', color: '#c98f8f', letterSpacing: '0.04em', lineHeight: 1.5 }}>{psTestStatus.message}</Typography>
                )}
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      <Rule />

      <SectionHead number="02" title="Data retrieval" subtitle="Configure secure SFTP / SCP extraction" />

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, mb: 4 }}>
        <Box sx={{ gridColumn: '1 / -1' }}>
          <Field label="Retrieval method">
            <FormControl fullWidth size="small">
              <Select value={form.retrieval_method} onChange={set('retrieval_method')} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.85rem', color: '#ede8d0', bgcolor: 'rgba(201,168,76,0.02)', borderRadius: '1px' }}>
                <MenuItem value="sftp">SFTP — Secure File Transfer Protocol</MenuItem>
                <MenuItem value="scp">SSH / SCP — Server exec via SSH</MenuItem>
              </Select>
            </FormControl>
          </Field>
        </Box>

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
          <TextField fullWidth size="small" type={showSftpPass ? 'text' : 'password'} value={form.sftp_password} onChange={set('sftp_password')} autoComplete="new-password" InputProps={passAdornment(showSftpPass, () => setShowSftpPass((prev) => !prev))} sx={inputSx} />
        </Field>
        <Box sx={{ gridColumn: '1 / -1' }}>
          <Field label="Remote path">
            <TextField fullWidth size="small" value={form.sftp_remote_path} onChange={set('sftp_remote_path')} placeholder="/path/to/{report_id}/output.csv" helperText="Use {report_id} or {instance_id} as placeholders — replaced at run time with values from PeopleSoft." FormHelperTextProps={{ sx: { fontFamily: '"Raleway"', fontSize: '0.6rem', color: '#3a3428' } }} sx={inputSx} />
          </Field>
        </Box>

        <Box sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button onClick={handleTest} disabled={testStatus === 'testing' || !form.sftp_host} variant="outlined" startIcon={testStatus === 'testing' ? <CircularProgress size={13} sx={{ color: '#c9a84c' }} /> : null} sx={{ color: '#c9a84c', borderColor: 'rgba(201,168,76,0.35)', borderRadius: '1px', fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.16em', px: 2.5, py: 0.9, '&:hover:not(:disabled)': { borderColor: '#c9a84c', bgcolor: 'rgba(201,168,76,0.04)' }, '&:disabled': { opacity: 0.4 } }}> {testStatus === 'testing' ? 'Testing…' : 'Test connection'} </Button>

          {testStatus && testStatus !== 'testing' && (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 2, py: 1.2, border: testStatus.ok ? '1px solid rgba(107,143,113,0.3)' : '1px solid rgba(143,74,74,0.3)', bgcolor: testStatus.ok ? 'rgba(107,143,113,0.06)' : 'rgba(143,74,74,0.06)', flex: 1, minWidth: 0, '@keyframes resultIn': { from: { opacity: 0, transform: 'translateX(-6px)' }, to: { opacity: 1, transform: 'none' } }, animation: 'resultIn 0.25s ease both' }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', mt: 0.3, flexShrink: 0, bgcolor: testStatus.ok ? '#6b8f71' : '#8f4a4a', boxShadow: testStatus.ok ? '0 0 6px rgba(107,143,113,0.6)' : '0 0 6px rgba(143,74,74,0.6)' }} />
              <Box>
                {testStatus.ok ? (
                  <>
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', color: '#8fc99a', letterSpacing: '0.06em', mb: 0.2 }}>Connection successful</Typography>
                    <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.62rem', color: '#5a5040', letterSpacing: '0.04em' }}>{form.sftp_remote_path} {testStatus.size_kb != null && <Box component="span" sx={{ ml: 1.5, color: '#c9a84c' }}>{testStatus.size_kb >= 1024 ? `${(testStatus.size_kb / 1024).toFixed(1)} MB` : `${testStatus.size_kb} KB`}</Box>}</Typography>
                  </>
                ) : (
                  <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', color: '#c98f8f', letterSpacing: '0.04em', lineHeight: 1.5 }}>{testStatus.message}</Typography>
                )}
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      <Rule />

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={handleSave} disabled={saving} startIcon={saving ? <CircularProgress size={14} sx={{ color: '#0b0c0e' }} /> : <SaveIcon sx={{ fontSize: 16 }} />} sx={{ background: saving ? 'rgba(201,168,76,0.4)' : '#c9a84c', color: '#0b0c0e', fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.14em', px: 3.5, py: 1.3, borderRadius: '1px', boxShadow: '0 2px 16px rgba(201,168,76,0.2)', '&:hover:not(:disabled)': { background: '#e8c96a', boxShadow: '0 4px 20px rgba(201,168,76,0.35)' }, '&:disabled': { opacity: 0.5 }, transition: 'all 0.2s ease' }}>
          {saving ? 'Saving...' : selectedConfigId ? 'Update configuration' : 'Create configuration'}
        </Button>
      </Box>

      <Dialog open={psBodyOpen} onClose={() => setPsBodyOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { background: '#111316', border: '1px solid rgba(201,168,76,0.2)', borderRadius: '1px' } }}>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, py: 2, borderBottom: '1px solid rgba(201,168,76,0.12)' }}>
            <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.2rem', fontWeight: 600, color: '#ede8d0', letterSpacing: '0.04em' }}>API Test Results</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Tooltip title="Copy all" placement="top">
                <IconButton size="small" onClick={() => { const parts = []; if (psTestStatus?.body) parts.push(`Trigger:\n${psTestStatus.body}`); if (psTestStatus?.status_body) parts.push(`Status:\n${psTestStatus.status_body}`); navigator.clipboard.writeText(parts.join('\n\n')); }} sx={{ color: '#5a5040', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '1px', '&:hover': { color: '#c9a84c', borderColor: 'rgba(201,168,76,0.4)', bgcolor: 'rgba(201,168,76,0.04)' } }}>
                  <CloseIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
              <IconButton size="small" onClick={() => setPsBodyOpen(false)} sx={{ color: '#5a5040', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '1px', '&:hover': { color: '#ede8d0', borderColor: 'rgba(201,168,76,0.3)', bgcolor: 'rgba(201,168,76,0.04)' } }}>
                <CloseIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Box>
          </Box>
          <Box sx={{ px: 3, py: 2.5, maxHeight: '70vh', overflowY: 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#5a5040' }}>Trigger Response</Typography>
              {psTestStatus?.http_status && (<Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.62rem', color: '#c9a84c' }}>HTTP {psTestStatus.http_status}</Typography>)}
            </Box>
            <Box component="pre" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.78rem', color: '#ede8d0', lineHeight: 1.7, m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', mb: 3 }}>{psTestStatus?.body ?? ''}</Box>
            {psTestStatus?.status_body != null && (
              <>
                <Box sx={{ height: '1px', bgcolor: 'rgba(201,168,76,0.1)', mb: 3 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
                  <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#5a5040' }}>Status Response</Typography>
                  {psTestStatus.status_http_status != null && (<Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.62rem', color: '#c9a84c' }}>HTTP {psTestStatus.status_http_status}</Typography>)}
                </Box>
                <Box component="pre" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.78rem', color: '#ede8d0', lineHeight: 1.7, m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{psTestStatus.status_body}</Box>
              </>
            )}
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  )
}
