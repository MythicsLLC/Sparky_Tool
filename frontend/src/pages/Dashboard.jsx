import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react'
import {
  Box, Typography, Button, Alert, CircularProgress,
  Select, MenuItem, Chip, Grid, Card, CardContent,
  Tooltip, IconButton, Tabs, Tab,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { DataGrid } from '@mui/x-data-grid'
import MythicsLogo from '../assets/MythicsLogo'
import MythicsLoader from '../components/MythicsLoader'
import ViewToggle from '../components/ViewToggle'
import { getDataGridSx } from '../utils/dataGridSx'
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
import PictureAsPdfIcon      from '@mui/icons-material/PictureAsPdf'
import KPICards    from '../components/KPICards'
import Charts      from '../components/Charts'
import DataTable   from '../components/DataTable'
import LoadingDialog         from '../components/LoadingDialog'
import HistorySidebar      from '../components/HistorySidebar'
import { useAuth } from '../AuthContext'
import { listConfigs, listRuns, runConfig, downloadRunPdf, downloadFunctionalPdf, downloadOperationalPdf, formatApiError, listRunOutputs } from '../api'
import { timeAgo } from '../utils/time'
import RunDiffDialog       from '../components/RunDiffDialog'
import MultiSectionReport from '../components/MultiSectionReport'
import CompareArrows from '@mui/icons-material/CompareArrows'
import VerifiedIcon  from '@mui/icons-material/VerifiedUser'

const FunctionalDashboard  = lazy(() => import('./FunctionalDashboard'))
const OperationalDashboard = lazy(() => import('./OperationalDashboard'))
const AnalyzeDashboard     = lazy(() => import('./AnalyzeDashboard'))
const RunAnalyseDashboard  = lazy(() => import('./RunAnalyseDashboard'))

// ── formatters ────────────────────────────────────────────────────────────────

function fmtMs(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
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
        <IconButton size="small" onClick={copy} aria-label={copied ? 'Copied' : `Copy ${val}`} sx={{ p: 0.25, opacity: 0.35, '&:hover': { opacity: 1 } }}>
          {copied ? <CheckIcon sx={{ fontSize: 10, color: '#6b8f71' }} /> : <ContentCopyIcon sx={{ fontSize: 10 }} />}
        </IconButton>
      </Tooltip>
    </Box>
  )
}

// ── StatusPill ────────────────────────────────────────────────────────────────

function StatusPill({ status, sftp_skipped }) {
  const theme = useTheme()
  const accent = theme.palette.primary.main
  let label = status, bg = `${accent}18`, color = accent, Icon = HourglassEmptyIcon
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
  const theme = useTheme()
  const accentColor = accent || theme.palette.primary.main
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
  const [runsView,       setRunsView]       = useState(
    () => localStorage.getItem('dashboard_runs_view') || 'table'
  )
  const [dashTab,        setDashTab]        = useState(
    () => parseInt(localStorage.getItem('dashboard_tab') || '0', 10)
  )
  const [pdfTabLoading,    setPdfTabLoading]    = useState(false)
  const [functionalState,  setFunctionalState]  = useState(null) // {filename, data}
  const [runOutputs,       setRunOutputs]       = useState([])
  const [diffOpen,         setDiffOpen]         = useState(false)
  const tabRef = useRef(null)

  const TAB_NAMES = ['Run Dashboard', 'Functional Dashboard', 'Operational Dashboard', 'AI Analysis', 'Run & Analyse']

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

  const handleRunsViewChange = useCallback((v) => {
    setRunsView(v)
    localStorage.setItem('dashboard_runs_view', v)
  }, [])

  const handleDashTabChange = useCallback((_, v) => {
    setDashTab(v)
    localStorage.setItem('dashboard_tab', String(v))
  }, [])

  const downloadTabPdf = useCallback(async () => {
    setPdfTabLoading(true)
    try {
      let blob, filename

      if (dashTab === 0) {
        // Run Dashboard — send KPI + runs to Python backend
        blob     = await downloadRunPdf({ kpi, runs })
        filename = `sparky_run_dashboard_${new Date().toISOString().slice(0, 10)}.pdf`

      } else if (dashTab === 1) {
        // Functional Dashboard — send parsed CoreHR data to Python backend
        if (!functionalState) throw new Error('No Functional Dashboard data loaded yet.')
        blob     = await downloadFunctionalPdf(functionalState)
        filename = `sparky_functional_${new Date().toISOString().slice(0, 10)}.pdf`

      } else if (dashTab === 2) {
        // Operational Dashboard — send run list to Python backend
        blob     = await downloadOperationalPdf({ runs })
        filename = `sparky_operational_${new Date().toISOString().slice(0, 10)}.pdf`
      }

      if (blob) {
        const url = URL.createObjectURL(blob)
        const a   = document.createElement('a')
        a.href     = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      setError(formatApiError(err, 'PDF generation failed. Please try again.'))
    } finally {
      setPdfTabLoading(false)
    }
  }, [dashTab, kpi, runs, functionalState, token])

  const selectedConfig = useMemo(
    () => configs.find((c) => c.id === activeConfigId) || null,
    [configs, activeConfigId],
  )

  const refreshRuns = useCallback(() => {
    if (!token) return Promise.resolve()
    return listRuns(token).then((res) => setRuns(res.data.items)).catch(() => {})
  }, [token])

  useEffect(() => {
    if (!token) return
    setPageLoading(true)
    Promise.all([listConfigs(token), listRuns(token), listRunOutputs(token)])
      .then(([configsRes, runsRes, outputsRes]) => {
        const saved = configsRes.data
        setConfigs(saved)
        if (saved.length && !activeConfigId) setActiveConfigId(saved[0].id)
        setRuns(runsRes.data.items)
        setRunOutputs(outputsRes.data.items || [])
      })
      .catch((err) => setError(formatApiError(err, 'Unable to load dashboard data')))
      .finally(() => setPageLoading(false))
  }, [token])

  // Poll the runs list every 2 s while a run is active so instance_id and
  // report_id surface in the table as soon as the backend commits them —
  // well before the long-running POST response arrives.
  useEffect(() => {
    if (!running) return
    const id = setInterval(refreshRuns, 2000)
    return () => clearInterval(id)
  }, [running, refreshRuns])

  const handleRun = useCallback(async () => {
    if (!activeConfigId) { setError('Select a configuration first.'); return }
    setRunning(true)
    setError(null)
    // Fetch immediately so the new "running" row appears in the table right away.
    refreshRuns()
    try {
      const response = await runConfig(activeConfigId, token)
      setLastResult(response.data)
      await refreshRuns()
      listRunOutputs(token).then((r) => setRunOutputs(r.data.items || [])).catch(() => {})
    } catch (err) {
      setError(formatApiError(err, 'Run failed unexpectedly'))
      await refreshRuns()
    } finally {
      setRunning(false)
    }
  }, [activeConfigId, token, refreshRuns])

  // ── keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName ?? ''
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return
      const mod = e.ctrlKey || e.metaKey
      if ((e.key === 'r' || e.key === 'R') && !mod && !running && configs.length) { handleRun(); return }
      if (e.key >= '1' && e.key <= '5' && !mod) { handleDashTabChange(null, Number(e.key) - 1); return }
      if ((e.key === 'p' || e.key === 'P') && !mod && dashTab !== 3 && dashTab !== 4 && !pdfTabLoading) { downloadTabPdf(); return }
      if ((e.key === 'c' || e.key === 'C') && !mod && runOutputs.length >= 2) { setDiffOpen(true); return }
      if ((e.key === 'v' || e.key === 'V') && !mod && dashTab === 0) {
        handleRunsViewChange(runsView === 'table' ? 'cards' : 'table'); return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, configs, dashTab, pdfTabLoading, runOutputs, runsView, handleRun, handleDashTabChange, downloadTabPdf, handleRunsViewChange])

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ display: 'flex', minHeight: '100%', bgcolor: 'background.default' }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>

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
              Dashboard
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
                : <MythicsLogo width={24} />
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

        {/* ── Sub-tabs: Run | Functional | Operational | Analyse ─────────── */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 4, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Tabs
            value={dashTab}
            onChange={handleDashTabChange}
            sx={{
              flex: 1,
              borderBottom: 'none',
              '& .MuiTab-root': {
                fontFamily: '"Raleway", sans-serif',
                fontSize: '0.63rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'text.secondary',
                minHeight: 40,
              },
              '& .Mui-selected':      { color: accent },
              '& .MuiTabs-indicator': { bgcolor: accent },
            }}
          >
            <Tab label="Run" />
            <Tab label="Functional" />
            <Tab label="Operational" />
            <Tab label="Analyse" />
            <Tab label="Run & Analyse" />
          </Tabs>

          {/* PDF download button — hidden on AI Analysis and Run & Analyse tabs */}
          {dashTab !== 3 && dashTab !== 4 && (
            <Tooltip title={`Download ${TAB_NAMES[dashTab]} as PDF  (P)`} arrow placement="left">
              <span>
                <IconButton
                  onClick={downloadTabPdf}
                  disabled={pdfTabLoading || pageLoading}
                  size="small"
                  aria-label={`Download ${TAB_NAMES[dashTab]} as PDF`}
                  sx={{
                    mr: 0.5,
                    color: pdfTabLoading ? 'text.disabled' : 'text.secondary',
                    '&:hover': { color: accent, bgcolor: `${accent}12` },
                    transition: 'all 0.15s ease',
                  }}
                >
                  {pdfTabLoading
                    ? <CircularProgress size={14} sx={{ color: accent }} />
                    : <PictureAsPdfIcon sx={{ fontSize: 18 }} />
                  }
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Box>

        {/* ── Tab panels ────────────────────────────────────────────────────── */}
        {dashTab === 0 && (
          <Box ref={tabRef}>

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
          <MythicsLoader size={72} sx={{ py: 8 }} />
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
                <MythicsLogo width={82} style={{ opacity: 0.4 }} />
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

        {/* ── recent runs ───────────────────────────────────────────────────── */}
        {runs.length > 0 && (
          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', mb: 5 }}>
            {/* Header */}
            <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <CloudSyncIcon sx={{ fontSize: 14, color: 'primary.main' }} />
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'text.primary' }}>
                Recent Runs
              </Typography>
              <Chip label={runs.length} size="small" sx={{ height: 16, fontSize: '0.55rem', fontFamily: '"JetBrains Mono", monospace', bgcolor: `${accent}18`, color: 'primary.main' }} />
              <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
                {runOutputs.length >= 2 && (
                  <Tooltip title="Compare two runs side by side" arrow>
                    <Button
                      size="small"
                      startIcon={<CompareArrows sx={{ fontSize: 13 }} />}
                      onClick={() => setDiffOpen(true)}
                      aria-label="Compare two runs side by side"
                      sx={{
                        fontFamily: '"Raleway", sans-serif', fontSize: '0.62rem', fontWeight: 700,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        color: accent, borderColor: `${accent}44`, px: 1.5, py: 0.5,
                        '&:hover': { bgcolor: `${accent}0a`, borderColor: accent },
                      }}
                      variant="outlined"
                    >
                      Compare
                    </Button>
                  </Tooltip>
                )}
                <ViewToggle value={runsView} onChange={handleRunsViewChange} />
              </Box>
            </Box>

            {/* DataGrid view */}
            {runsView === 'table' ? (
              <DataGrid
                rows={runs}
                getRowId={(r) => r.id}
                autoHeight
                disableRowSelectionOnClick
                pageSizeOptions={[10, 25, 50]}
                initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                sx={{ ...getDataGridSx(accent, theme.palette.mode), border: 'none', borderRadius: 0 }}
                columns={[
                  {
                    field: 'config_name', headerName: 'Config', flex: 1.2, minWidth: 140,
                    renderCell: (p) => (
                      <Box>
                        <Typography sx={{ fontSize: '0.74rem', fontFamily: '"Raleway", sans-serif', color: 'text.primary' }}>{p.row.config_name || '—'}</Typography>
                        {p.row.ps_process_name && <Typography sx={{ fontSize: '0.58rem', color: 'text.disabled', fontFamily: '"JetBrains Mono", monospace' }}>{p.row.ps_process_name}</Typography>}
                      </Box>
                    ),
                  },
                  { field: 'instance_id', headerName: 'Instance ID', flex: 1, minWidth: 130, renderCell: (p) => <MonoCopy val={p.value} /> },
                  { field: 'report_id',   headerName: 'Report ID',   flex: 1, minWidth: 130, renderCell: (p) => <MonoCopy val={p.value} /> },
                  { field: 'status', headerName: 'Status', width: 110, renderCell: (p) => <StatusPill status={p.value} sftp_skipped={p.row.sftp_skipped} /> },
                  { field: 'row_count', headerName: 'Rows', width: 80, type: 'number',
                    renderCell: (p) => <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: 'text.secondary' }}>{p.value != null ? p.value.toLocaleString() : '—'}</Typography>,
                  },
                  { field: 'duration_ms', headerName: 'Duration', width: 110,
                    renderCell: (p) => <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: 'text.secondary' }}>{fmtMs(p.value)}</Typography>,
                  },
                  {
                    field: 'started_at', headerName: 'When', width: 120,
                    renderCell: (p) => p.row.status === 'running' ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: accent, flexShrink: 0, animation: 'dashPulse 1.4s ease-in-out infinite', '@keyframes dashPulse': { '0%,100%': { opacity: 1, transform: 'scale(1)' }, '50%': { opacity: 0.35, transform: 'scale(0.7)' } } }} />
                        <Typography sx={{ fontSize: '0.68rem', color: 'primary.main', fontFamily: '"Raleway", sans-serif' }}>Running</Typography>
                      </Box>
                    ) : (
                      <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif' }}>{timeAgo(p.value)}</Typography>
                    ),
                  },
                ]}
              />
            ) : (
              /* Card view */
              <Box sx={{ p: 2 }}>
                <Grid container spacing={2}>
                  {runs.map((r) => (
                    <Grid item xs={12} sm={6} md={4} key={r.id}>
                      <Card variant="outlined" sx={{ bgcolor: 'background.default', borderColor: 'divider', height: '100%' }}>
                        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem', fontWeight: 700, color: 'text.primary' }}>{r.config_name || '—'}</Typography>
                            <StatusPill status={r.status} sftp_skipped={r.sftp_skipped} />
                          </Box>
                          {r.ps_process_name && <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', fontFamily: '"JetBrains Mono", monospace', mb: 1.5 }}>{r.ps_process_name}</Typography>}
                          {[
                            { label: 'Instance ID', val: r.instance_id, mono: true },
                            { label: 'Report ID',   val: r.report_id,   mono: true },
                          ].map(({ label, val, mono }) => (
                            <Box key={label} sx={{ display: 'flex', gap: 1, mb: 0.75, alignItems: 'flex-start' }}>
                              <Typography sx={{ fontSize: '0.54rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'text.disabled', fontFamily: '"Raleway", sans-serif', minWidth: 80, flexShrink: 0, pt: 0.1 }}>{label}</Typography>
                              <MonoCopy val={val} />
                            </Box>
                          ))}
                          <Box sx={{ display: 'flex', gap: 2, mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider', flexWrap: 'wrap' }}>
                            {[
                              { label: 'Rows',     val: r.row_count != null ? r.row_count.toLocaleString() : '—' },
                              { label: 'Duration', val: fmtMs(r.duration_ms) },
                              { label: 'When',     val: r.status === 'running' ? 'Running…' : timeAgo(r.started_at) },
                            ].map(({ label, val }) => (
                              <Box key={label}>
                                <Typography sx={{ fontSize: '0.52rem', color: 'text.disabled', fontFamily: '"Raleway", sans-serif', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</Typography>
                                <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem', color: 'text.secondary' }}>{val}</Typography>
                              </Box>
                            ))}
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}
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

            {/* DQ results */}
            {lastResult.dq_results?.length > 0 && (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <VerifiedIcon sx={{ fontSize: 14, color: lastResult.dq_results.some((r) => !r.passed) ? '#c9a84c' : '#6b8f71' }} />
                  <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'text.disabled' }}>
                    Data Quality
                  </Typography>
                  <Chip
                    label={`${lastResult.dq_results.filter((r) => !r.passed).length} failed / ${lastResult.dq_results.length} rules`}
                    size="small"
                    sx={{ height: 16, fontSize: '0.55rem',
                      bgcolor: lastResult.dq_results.some((r) => !r.passed) ? 'rgba(201,168,76,0.14)' : 'rgba(107,143,113,0.14)',
                      color: lastResult.dq_results.some((r) => !r.passed) ? '#c9a84c' : '#6b8f71',
                      fontFamily: '"JetBrains Mono", monospace' }}
                  />
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {lastResult.dq_results.map((r) => (
                    <Box key={r.rule_id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1,
                      borderRadius: '4px', bgcolor: r.passed ? 'rgba(107,143,113,0.06)' : 'rgba(201,168,76,0.08)',
                      border: `1px solid ${r.passed ? 'rgba(107,143,113,0.2)' : 'rgba(201,168,76,0.2)'}` }}>
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: r.passed ? '#6b8f71' : '#c9a84c', flexShrink: 0 }} />
                      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', color: 'text.primary', flex: 1 }}>{r.rule_name}</Typography>
                      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.65rem', color: r.passed ? '#6b8f71' : '#c9a84c' }}>{r.message}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* SFTP-skipped notice or full results */}
            {lastResult.sftp_skipped ? (
              <Alert severity="info" sx={{ bgcolor: 'rgba(100,149,180,0.08)', border: '1px solid rgba(100,149,180,0.2)', color: '#8ab4cc', '& .MuiAlert-icon': { color: '#6495b4' } }}>
                <Typography sx={{ fontWeight: 700, mb: 0.5, fontSize: '0.88rem' }}>Process completed — no CSV data</Typography>
                <Typography sx={{ fontSize: '0.82rem' }}>{lastResult.message}</Typography>
              </Alert>
            ) : lastResult.report_type === 'multi_section' ? (
              <MultiSectionReport sections={lastResult.sections} />
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
        )}

        <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress size={28} /></Box>}>
          {dashTab === 1 && <Box ref={tabRef}><FunctionalDashboard onDataChange={setFunctionalState} /></Box>}
          {dashTab === 2 && <Box ref={tabRef}><OperationalDashboard /></Box>}
          {dashTab === 3 && <Box ref={tabRef}><AnalyzeDashboard /></Box>}
          {dashTab === 4 && <Box ref={tabRef}><RunAnalyseDashboard /></Box>}
        </Suspense>

      </Box>

      </Box>
      <HistorySidebar runs={runs} runOutputs={runOutputs} accent={accent} />

      <LoadingDialog open={running} />

      <RunDiffDialog open={diffOpen} onClose={() => setDiffOpen(false)} runOutputs={runOutputs} />
    </Box>
  )
}
