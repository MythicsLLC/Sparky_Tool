import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Box, Typography, Button, Alert, CircularProgress,
  Select, MenuItem, Chip, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableHead, TableRow,
  Tooltip, IconButton,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import MythicsLogo from '../assets/MythicsLogo'
import ContentCopyIcon        from '@mui/icons-material/ContentCopy'
import CheckIcon              from '@mui/icons-material/Check'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import ErrorOutlineIcon       from '@mui/icons-material/ErrorOutline'
import HourglassEmptyIcon     from '@mui/icons-material/HourglassEmpty'
import CloudSyncIcon          from '@mui/icons-material/CloudSync'
import TrendingUpIcon         from '@mui/icons-material/TrendingUp'
import SpeedIcon              from '@mui/icons-material/Speed'
import BarChartIcon           from '@mui/icons-material/BarChart'
import AccessTimeIcon         from '@mui/icons-material/AccessTime'
import SettingsIcon           from '@mui/icons-material/Settings'
import KPICards    from '../components/KPICards'
import Charts      from '../components/Charts'
import DataTable   from '../components/DataTable'
import LoadingDialog from '../components/LoadingDialog'
import { useAuth } from '../AuthContext'
import { listConfigs, listRuns, runConfig } from '../api'

// ── formatters ────────────────────────────────────────────────────────────────

function fmtMs(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function timeAgo(ts) {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── MonoCopy ──────────────────────────────────────────────────────────────────

function MonoCopy({ val }) {
  const [copied, setCopied] = useState(false)
  if (!val) return (
    <Typography component="span" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.7rem', color: 'text.disabled' }}>—</Typography>
  )
  const copy = () => { navigator.clipboard.writeText(val); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Typography component="span" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.7rem', color: 'primary.main' }}>{val}</Typography>
      <Tooltip title={copied ? 'Copied!' : 'Copy'} placement="top">
        <IconButton size="small" onClick={copy} sx={{ p: 0.25, opacity: 0.35, '&:hover': { opacity: 1 } }}>
          {copied ? <CheckIcon sx={{ fontSize: 10, color: '#6b8f71' }} /> : <ContentCopyIcon sx={{ fontSize: 10 }} />}
        </IconButton>
      </Tooltip>
    </Box>
  )
}

// ── StatusPill ────────────────────────────────────────────────────────────────

function StatusPill({ status, sftp_skipped }) {
  let label = status, bg = 'rgba(201,168,76,0.12)', color = '#c9a84c', Icon = HourglassEmptyIcon
  if (status === 'success' && sftp_skipped) {
    label = 'PS only'; bg = 'rgba(100,149,180,0.14)'; color = '#6495b4'; Icon = CloudSyncIcon
  } else if (status === 'success') {
    label = 'success'; bg = 'rgba(107,143,113,0.14)'; color = '#6b8f71'; Icon = CheckCircleOutlineIcon
  } else if (status === 'error') {
    label = 'error'; bg = 'rgba(180,80,80,0.16)'; color = '#b45050'; Icon = ErrorOutlineIcon
  }
  return (
    <Chip
      icon={<Icon sx={{ fontSize: '11px !important', color: `${color} !important` }} />}
      label={label}
      size="small"
      sx={{ bgcolor: bg, color, fontFamily: '"Raleway", sans-serif', fontSize: '0.58rem', letterSpacing: '0.05em', height: 20 }}
    />
  )
}

// ── KpiCard ───────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, Icon, accent, mono }) {
  const accentColor = accent || '#c9a84c'
  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', bgcolor: accentColor, opacity: 0.55 }} />
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ fontSize: '0.54rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'text.disabled', mb: 1 }}>
              {label}
            </Typography>
            <Typography sx={{
              fontFamily: mono ? '"JetBrains Mono", monospace' : '"Cormorant Garamond", serif',
              fontSize: mono ? '1.15rem' : '2.1rem',
              fontWeight: 700,
              color: 'text.primary',
              lineHeight: 1,
            }}>
              {value}
            </Typography>
            {sub && (
              <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', mt: 0.75, fontFamily: '"Raleway", sans-serif' }}>{sub}</Typography>
            )}
          </Box>
          {Icon && (
            <Box sx={{ width: 32, height: 32, borderRadius: '4px', bgcolor: `${accentColor}14`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon sx={{ fontSize: 16, color: accentColor }} />
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  )
}

// ── table cell styles ─────────────────────────────────────────────────────────

const cellSx = { fontFamily: '"Raleway", sans-serif', fontSize: '0.74rem', color: 'text.primary',   borderColor: 'divider', py: 1.25 }
const headSx = { fontFamily: '"Raleway", sans-serif', fontSize: '0.57rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'text.secondary', borderColor: 'divider', py: 1.25, bgcolor: 'background.default' }

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, token } = useAuth()
  const theme  = useTheme()
  const accent = theme.palette.primary.main

  const [configs,        setConfigs]        = useState([])
  const [runs,           setRuns]           = useState([])
  const [activeConfigId, setActiveConfigId] = useState(null)
  const [lastResult,     setLastResult]     = useState(null)
  const [pageLoading,    setPageLoading]    = useState(false)
  const [running,        setRunning]        = useState(false)
  const [error,          setError]          = useState(null)

  const selectedConfig = useMemo(
    () => configs.find((c) => c.id === activeConfigId) || null,
    [configs, activeConfigId],
  )

  const refreshRuns = useCallback(() => {
    if (!token) return
    listRuns(token).then((res) => setRuns(res.data.items)).catch(() => {})
  }, [token])

  useEffect(() => {
    if (!token) return
    setPageLoading(true)
    Promise.all([listConfigs(token), listRuns(token)])
      .then(([configsRes, runsRes]) => {
        const saved = configsRes.data
        setConfigs(saved)
        if (saved.length && !activeConfigId) setActiveConfigId(saved[0].id)
        setRuns(runsRes.data.items)
      })
      .catch((err) => setError(err.response?.data?.detail || 'Unable to load dashboard data'))
      .finally(() => setPageLoading(false))
  }, [token])

  const handleRun = async () => {
    if (!activeConfigId) { setError('Select a configuration first.'); return }
    setRunning(true)
    setError(null)
    try {
      const response = await runConfig(activeConfigId, token)
      setLastResult(response.data)
      await refreshRuns()
    } catch (err) {
      setError(err.response?.data?.detail || 'Run failed unexpectedly')
    } finally {
      setRunning(false)
    }
  }

  // ── KPIs derived from loaded runs ─────────────────────────────────────────

  const kpi = useMemo(() => {
    if (!runs.length) return null
    const completed  = runs.filter((r) => r.status === 'success' || r.status === 'error')
    const successful = runs.filter((r) => r.status === 'success')
    const withDur    = successful.filter((r) => r.duration_ms != null)
    const avgMs      = withDur.length ? Math.round(withDur.reduce((s, r) => s + r.duration_ms, 0) / withDur.length) : null
    const rate       = completed.length ? Math.round(successful.length / completed.length * 100) : null
    return {
      total:      runs.length,
      rate,
      avgMs,
      successCnt: successful.length,
      errorCnt:   runs.filter((r) => r.status === 'error').length,
      runningCnt: runs.filter((r) => r.status === 'running').length,
      lastRun:    runs[0] || null,
    }
  }, [runs])

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ flex: 1, minHeight: '100%', bgcolor: 'background.default' }}>

      {/* accent line */}
      <Box sx={{ height: 2, background: `linear-gradient(90deg, ${accent}cc, transparent 70%)` }} />

      <Box sx={{ px: { xs: 3, sm: 5 }, pt: 4, pb: 6 }}>

        {/* ── header ────────────────────────────────────────────────────────── */}
        <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', mb: 4, flexWrap: 'wrap', gap: 2.5 }}>
          <Box>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.54rem', letterSpacing: '0.32em', color: 'text.disabled', textTransform: 'uppercase', mb: 0.5 }}>
              Sparky Platform
            </Typography>
            <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '2.4rem', fontWeight: 700, color: 'text.primary', letterSpacing: '0.02em', lineHeight: 1 }}>
              Operational Dashboard
            </Typography>
          </Box>

          {/* config selector + run button */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            {configs.length > 0 ? (
              <Select
                value={activeConfigId || ''}
                onChange={(e) => setActiveConfigId(e.target.value)}
                size="small"
                disabled={running}
                displayEmpty
                sx={{
                  minWidth: 190,
                  fontFamily: '"Raleway", sans-serif',
                  fontSize: '0.8rem',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                  '& .MuiSelect-select': { py: 1.15 },
                }}
              >
                {configs.map((c) => (
                  <MenuItem key={c.id} value={c.id} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.8rem' }}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            ) : (
              !pageLoading && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<SettingsIcon sx={{ fontSize: 14 }} />}
                  onClick={() => { window.location.hash = 'settings' }}
                  sx={{ borderColor: 'divider', color: 'text.secondary', fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem' }}
                >
                  Add config
                </Button>
              )
            )}

            <Button
              startIcon={running
                ? <CircularProgress size={13} sx={{ color: 'background.default' }} />
                : <MythicsLogo width={22} />
              }
              onClick={handleRun}
              disabled={running || pageLoading || !configs.length}
              sx={{
                bgcolor: 'primary.main',
                color:   'background.default',
                fontFamily: '"Raleway", sans-serif',
                fontWeight: 700,
                fontSize: '0.72rem',
                letterSpacing: '0.14em',
                px: 3,
                py: 1.2,
                borderRadius: '2px',
                boxShadow: `0 2px 20px ${accent}35`,
                '&:hover': { bgcolor: 'primary.light', boxShadow: `0 4px 28px ${accent}55` },
                '&:disabled': { opacity: 0.45 },
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {running ? 'Running…' : 'Run'}
            </Button>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>{error}</Alert>
        )}

        {/* ── KPI strip ─────────────────────────────────────────────────────── */}
        {kpi && (
          <Grid container spacing={2} sx={{ mb: 4 }}>
            <Grid item xs={6} sm={3}>
              <KpiCard
                label="Total Runs"
                value={kpi.total}
                Icon={BarChartIcon}
                sub={kpi.runningCnt ? `${kpi.runningCnt} running now` : `${kpi.successCnt} ok · ${kpi.errorCnt} err`}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <KpiCard
                label="Success Rate"
                value={kpi.rate != null ? `${kpi.rate}%` : '—'}
                Icon={TrendingUpIcon}
                accent="#6b8f71"
                sub={`${kpi.successCnt} success · ${kpi.errorCnt} error`}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <KpiCard
                label="Avg Duration"
                value={kpi.avgMs != null ? fmtMs(kpi.avgMs) : '—'}
                Icon={SpeedIcon}
                accent="#6495b4"
                mono
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <KpiCard
                label="Last Run"
                value={kpi.lastRun ? timeAgo(kpi.lastRun.started_at) : '—'}
                Icon={AccessTimeIcon}
                accent={
                  kpi.lastRun?.status === 'success' ? '#6b8f71' :
                  kpi.lastRun?.status === 'error'   ? '#b45050' : accent
                }
                sub={kpi.lastRun?.config_name || undefined}
                mono
              />
            </Grid>
          </Grid>
        )}

        {/* page-load spinner */}
        {pageLoading && !runs.length && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={24} sx={{ color: 'primary.main' }} />
          </Box>
        )}

        {/* onboarding nudge */}
        {!pageLoading && user && !user.onboarded && !runs.length && (
          <Alert
            severity="info"
            sx={{ mb: 3, bgcolor: `${accent}0a`, border: `1px solid ${accent}22`, '& .MuiAlert-icon': { color: accent } }}
          >
            Complete setup: save a configuration in Settings, then trigger your first run above.
          </Alert>
        )}

        {/* ── no-configs empty state ────────────────────────────────────────── */}
        {!pageLoading && !configs.length && (
          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', p: 6, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2.5 }}>
              <Box sx={{ position: 'relative', display: 'inline-block' }}>
                <MythicsLogo width={100} style={{ opacity: 0.5 }} />
                <Box sx={{
                  position: 'absolute', bottom: -2, right: -2,
                  width: 22, height: 22, borderRadius: '50%',
                  bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
                  display: 'grid', placeItems: 'center',
                }}>
                  <SettingsIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
                </Box>
              </Box>
            </Box>
            <Typography sx={{ color: 'text.primary', fontFamily: '"Raleway", sans-serif', fontWeight: 700, mb: 1 }}>
              No configurations yet
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.82rem', mb: 3 }}>
              Create a PeopleSoft configuration in Settings to start running the engine.
            </Typography>
            <Button
              variant="contained"
              startIcon={<SettingsIcon sx={{ fontSize: 15 }} />}
              onClick={() => { window.location.hash = 'settings' }}
              sx={{ bgcolor: 'primary.main', color: 'background.default', fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.72rem' }}
            >
              Go to Settings
            </Button>
          </Card>
        )}

        {/* ── recent runs table ──────────────────────────────────────────────── */}
        {runs.length > 0 && (
          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', mb: 5 }}>
            <Box sx={{
              px: 3, py: 2,
              display: 'flex', alignItems: 'center', gap: 1.5,
              borderBottom: '1px solid', borderColor: 'divider',
            }}>
              <CloudSyncIcon sx={{ fontSize: 14, color: 'primary.main' }} />
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'text.primary' }}>
                Recent Runs
              </Typography>
              <Chip
                label={runs.length}
                size="small"
                sx={{ height: 16, fontSize: '0.55rem', fontFamily: '"JetBrains Mono", monospace', bgcolor: `${accent}18`, color: 'primary.main' }}
              />
            </Box>

            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={headSx}>Config</TableCell>
                    <TableCell sx={headSx}>Instance ID</TableCell>
                    <TableCell sx={headSx}>Report ID</TableCell>
                    <TableCell sx={headSx}>Status</TableCell>
                    <TableCell sx={{ ...headSx, textAlign: 'right' }}>Rows</TableCell>
                    <TableCell sx={headSx}>Duration</TableCell>
                    <TableCell sx={headSx}>When</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {runs.slice(0, 12).map((r) => (
                    <TableRow key={r.id} hover sx={{ '&:hover': { bgcolor: `${accent}06` } }}>
                      <TableCell sx={cellSx}>
                        <Typography sx={{ fontSize: '0.74rem', color: 'text.primary', fontFamily: '"Raleway", sans-serif' }}>
                          {r.config_name || '—'}
                        </Typography>
                        {r.ps_process_name && (
                          <Typography sx={{ fontSize: '0.58rem', color: 'text.disabled', fontFamily: '"JetBrains Mono", monospace' }}>
                            {r.ps_process_name}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={cellSx}><MonoCopy val={r.instance_id} /></TableCell>
                      <TableCell sx={cellSx}><MonoCopy val={r.report_id} /></TableCell>
                      <TableCell sx={cellSx}>
                        <StatusPill status={r.status} sftp_skipped={r.sftp_skipped} />
                      </TableCell>
                      <TableCell sx={{ ...cellSx, textAlign: 'right', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: 'text.secondary' }}>
                        {r.row_count != null ? r.row_count.toLocaleString() : <span style={{ color: theme.palette.text.disabled }}>—</span>}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: 'text.secondary' }}>
                        {fmtMs(r.duration_ms)}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                        {r.status === 'running' ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Box sx={{
                              width: 6, height: 6, borderRadius: '50%', bgcolor: accent, flexShrink: 0,
                              animation: 'dashPulse 1.4s ease-in-out infinite',
                              '@keyframes dashPulse': {
                                '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                                '50%':      { opacity: 0.35, transform: 'scale(0.7)' },
                              },
                            }} />
                            <Typography sx={{ fontSize: '0.68rem', color: 'primary.main', fontFamily: '"Raleway", sans-serif' }}>
                              Running
                            </Typography>
                          </Box>
                        ) : (
                          <Typography component="span" sx={{ color: 'text.secondary', fontSize: '0.68rem', fontFamily: '"Raleway", sans-serif' }}>
                            {timeAgo(r.started_at)}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Card>
        )}

        {/* ── last result — PS tracking + charts ────────────────────────────── */}
        {lastResult && (
          <Box sx={{ display: 'grid', gap: 5 }}>

            {/* section label */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.58rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'text.disabled', whiteSpace: 'nowrap' }}>
                Latest Run Output
              </Typography>
              <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
            </Box>

            {/* PS tracking cards */}
            <Grid container spacing={2}>
              {[
                { label: 'Instance ID', value: lastResult.instance_id },
                { label: 'Report ID',   value: lastResult.report_id   },
                { label: 'Rows Processed', value: lastResult.row_count != null ? lastResult.row_count.toLocaleString() : null },
              ].map(({ label, value }) => (
                <Grid item xs={12} md={4} key={label}>
                  <Card variant="outlined" sx={{ p: 2.5, bgcolor: 'background.paper', borderColor: 'divider' }}>
                    <Typography sx={{ color: 'text.disabled', fontSize: '0.56rem', letterSpacing: '0.2em', textTransform: 'uppercase', mb: 0.75 }}>{label}</Typography>
                    <Typography sx={{ color: value ? 'primary.main' : 'text.disabled', fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.92rem' }}>
                      {value || '—'}
                    </Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>

            {/* SFTP-skipped notice or full results */}
            {lastResult.sftp_skipped ? (
              <Alert severity="info" sx={{ bgcolor: 'rgba(100,149,180,0.08)', border: '1px solid rgba(100,149,180,0.2)', color: '#8ab4cc', '& .MuiAlert-icon': { color: '#6495b4' } }}>
                <Typography sx={{ fontWeight: 700, mb: 0.5, fontSize: '0.88rem' }}>Process completed — no CSV data</Typography>
                <Typography sx={{ fontSize: '0.82rem' }}>{lastResult.message}</Typography>
              </Alert>
            ) : (
              <>
                <Box>
                  <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'text.disabled', mb: 2 }}>
                    Visual Summary
                  </Typography>
                  <KPICards kpis={lastResult.kpis} />
                </Box>
                <Box>
                  <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'text.disabled', mb: 2 }}>
                    Trend Charts
                  </Typography>
                  <Charts kpis={lastResult.kpis} />
                </Box>
                <Box>
                  <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'text.disabled', mb: 2 }}>
                    Row Data
                  </Typography>
                  <DataTable rows={lastResult.rows} columns={lastResult.columns} />
                </Box>
              </>
            )}
          </Box>
        )}

      </Box>

      <LoadingDialog open={running} />
    </Box>
  )
}
