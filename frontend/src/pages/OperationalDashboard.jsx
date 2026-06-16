import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Box, Typography, Alert, CircularProgress, Grid, Card, CardContent,
  Button, Chip,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { LineChart, BarChart } from '@mui/x-charts'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import ErrorOutlineIcon       from '@mui/icons-material/ErrorOutline'
import RefreshIcon            from '@mui/icons-material/Refresh'
import TrendingUpIcon         from '@mui/icons-material/TrendingUp'
import SpeedIcon              from '@mui/icons-material/Speed'
import BarChartIcon           from '@mui/icons-material/BarChart'
import { useAuth } from '../AuthContext'
import { listRuns, checkConnectivity } from '../api'
import MythicsLoader from '../components/MythicsLoader'

// ── formatters ─────────────────────────────────────────────────────────────────

function fmtMs(ms) {
  if (ms == null) return '—'
  if (ms < 1000)  return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function fmtDay(str) {
  if (!str) return ''
  return new Date(str).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function timeAgo(ts) {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── KpiCard ────────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, Icon, color }) {
  const c = color || '#c9a84c'
  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, bgcolor: c, opacity: 0.55 }} />
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography sx={{ fontSize: '0.52rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'text.disabled', mb: 0.75 }}>
              {label}
            </Typography>
            <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '2rem', fontWeight: 700, color: 'text.primary', lineHeight: 1 }}>
              {value}
            </Typography>
            {sub && (
              <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', mt: 0.75, fontFamily: '"Raleway", sans-serif' }}>
                {sub}
              </Typography>
            )}
          </Box>
          {Icon && (
            <Box sx={{ width: 32, height: 32, borderRadius: '4px', bgcolor: `${c}14`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon sx={{ fontSize: 16, color: c }} />
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  )
}

// ── HealthRow: one service in the connectivity card ───────────────────────────

function HealthRow({ label, result }) {
  const status   = result?.status
  const isOk     = status === 'ok'
  const isErr    = status === 'error'
  const isNone   = status === 'not_configured' || status === 'no_config'
  const dotColor = isOk ? '#6b8f71' : isErr ? '#b45050' : '#888'

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1.2, borderRadius: '3px',
      bgcolor: isOk ? 'rgba(107,143,113,0.06)' : isErr ? 'rgba(180,80,80,0.06)' : 'rgba(128,128,128,0.04)',
    }}>
      <Box sx={{
        width: 8, height: 8, borderRadius: '50%', bgcolor: dotColor, flexShrink: 0,
        ...(isOk ? { boxShadow: `0 0 6px ${dotColor}88` } : {}),
      }} />
      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.74rem', color: 'text.primary', flex: 1 }}>
        {label}
      </Typography>
      <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.64rem', color: dotColor }}>
        {isOk   ? `OK · ${result.latency_ms}ms` :
         isErr  ? 'Unreachable' :
         isNone ? 'Not configured' : '—'}
      </Typography>
    </Box>
  )
}

// ── OperationalDashboard ───────────────────────────────────────────────────────

export default function OperationalDashboard() {
  const { token } = useAuth()
  const theme  = useTheme()
  const accent = theme.palette.primary.main

  const [runs,        setRuns]        = useState([])
  const [loadingRuns, setLoadingRuns] = useState(true)
  const [health,      setHealth]      = useState(null)
  const [checking,    setChecking]    = useState(false)
  const [error,       setError]       = useState(null)

  const tickFill = theme.palette.text.secondary

  const loadRuns = useCallback(() => {
    if (!token) return
    return listRuns(token, { limit: 200 })
      .then((res) => setRuns(res.data.items || []))
      .catch(() => setError('Could not load run history'))
  }, [token])

  useEffect(() => {
    loadRuns()?.finally(() => setLoadingRuns(false))
  }, [loadRuns])

  const handleCheck = () => {
    setChecking(true)
    checkConnectivity(token)
      .then((res) => setHealth(res.data))
      .catch(() => setHealth({
        peoplesoft: { status: 'error', error: 'Request failed' },
        windows:    { status: 'error', error: 'Request failed' },
      }))
      .finally(() => setChecking(false))
  }

  // ── Derived metrics ───────────────────────────────────────────────────────

  const kpi = useMemo(() => {
    if (!runs.length) return null
    const completed  = runs.filter((r) => r.status === 'success' || r.status === 'error')
    const successful = runs.filter((r) => r.status === 'success')
    const withDur    = successful.filter((r) => r.duration_ms != null)
    const avgMs      = withDur.length
      ? Math.round(withDur.reduce((s, r) => s + r.duration_ms, 0) / withDur.length)
      : null
    const rate       = completed.length
      ? Math.round(successful.length / completed.length * 100)
      : null
    const weekAgo    = Date.now() - 7 * 24 * 60 * 60 * 1000
    const errorsWeek = runs.filter((r) => r.status === 'error' && new Date(r.started_at).getTime() > weekAgo).length
    return {
      total:    runs.length,
      rate,
      avgMs,
      errorsWeek,
      successCnt: successful.length,
      errorCnt:   runs.filter((r) => r.status === 'error').length,
    }
  }, [runs])

  const runsByDay = useMemo(() => {
    const map    = {}
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    runs.forEach((r) => {
      if (!r.started_at) return
      const dt = new Date(r.started_at)
      if (dt.getTime() < cutoff) return
      const day = r.started_at.slice(0, 10)
      if (!map[day]) map[day] = { day, success: 0, errors: 0 }
      if (r.status === 'success') map[day].success++
      if (r.status === 'error')   map[day].errors++
    })
    return Object.values(map).sort((a, b) => a.day.localeCompare(b.day))
  }, [runs])

  const failuresByStep = useMemo(() => {
    const map = {}
    runs.filter((r) => r.status === 'error' && r.failed_step).forEach((r) => {
      map[r.failed_step] = (map[r.failed_step] || 0) + 1
    })
    return Object.entries(map)
      .map(([step, count]) => ({ step, count }))
      .sort((a, b) => b.count - a.count)
  }, [runs])

  const recentErrors = useMemo(
    () => runs.filter((r) => r.status === 'error').slice(0, 10),
    [runs],
  )

  // ── render ─────────────────────────────────────────────────────────────────
  if (loadingRuns) return <MythicsLoader size={72} sx={{ py: 10 }} />

  return (
    <Box sx={{ display: 'grid', gap: 4 }}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* ── KPI strip ──────────────────────────────────────────────────── */}
      {kpi && (
        <Grid container spacing={2}>
          <Grid item xs={6} sm={3}>
            <KpiCard label="Total Runs"       value={kpi.total}                               Icon={BarChartIcon}    color={accent} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <KpiCard label="Success Rate"     value={kpi.rate != null ? `${kpi.rate}%` : '—'} Icon={TrendingUpIcon}  color="#6b8f71"
              sub={`${kpi.successCnt} ok · ${kpi.errorCnt} err`} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <KpiCard label="Avg Duration"     value={fmtMs(kpi.avgMs)}                        Icon={SpeedIcon}       color="#6495b4" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <KpiCard label="Errors This Week" value={kpi.errorsWeek}                          Icon={ErrorOutlineIcon} color="#b45050" />
          </Grid>
        </Grid>
      )}

      <Grid container spacing={3}>
        {/* ── Live health card ──────────────────────────────────────────── */}
        <Grid item xs={12} md={4}>
          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%' }}>
            <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'text.secondary' }}>
                🔌 Connection Health
              </Typography>
              <Button
                size="small"
                startIcon={checking ? <CircularProgress size={12} /> : <RefreshIcon sx={{ fontSize: 14 }} />}
                onClick={handleCheck}
                disabled={checking}
                sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.65rem', letterSpacing: '0.08em', color: accent, '&:hover': { bgcolor: `${accent}12` } }}
              >
                {checking ? 'Checking…' : 'Check Now'}
              </Button>
            </Box>
            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {health ? (
                <>
                  <HealthRow label="PeopleSoft"     result={health.peoplesoft} />
                  <HealthRow label="Windows Server" result={health.windows} />
                </>
              ) : (
                <>
                  {['PeopleSoft', 'Windows Server'].map((lbl) => (
                    <Box key={lbl} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1.2, borderRadius: '3px', bgcolor: 'rgba(128,128,128,0.04)' }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#555', flexShrink: 0 }} />
                      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.74rem', color: 'text.disabled', flex: 1 }}>{lbl}</Typography>
                      <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.64rem', color: 'text.disabled' }}>Not checked</Typography>
                    </Box>
                  ))}
                </>
              )}
            </Box>
          </Card>
        </Grid>

        {/* ── Failures by step ──────────────────────────────────────────── */}
        <Grid item xs={12} md={4}>
          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%' }}>
            <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'text.secondary' }}>
                ⚠ Failures by Step
              </Typography>
            </Box>
            <Box sx={{ p: 2.5 }}>
              {failuresByStep.length ? (
                <BarChart
                  height={120}
                  layout="horizontal"
                  dataset={failuresByStep}
                  xAxis={[{ tickLabelStyle: { fontSize: 10, fill: tickFill } }]}
                  yAxis={[{ dataKey: 'step', scaleType: 'band', tickLabelStyle: { fontSize: 11, fill: tickFill, fontFamily: '"JetBrains Mono", monospace' } }]}
                  series={[{ dataKey: 'count', label: 'Failures', color: '#b45050' }]}
                  margin={{ left: 70, right: 16, top: 0, bottom: 0 }}
                  grid={{ vertical: true }}
                  slotProps={{ legend: { hidden: true } }}
                />
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 3 }}>
                  <CheckCircleOutlineIcon sx={{ fontSize: 18, color: '#6b8f71' }} />
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.82rem', fontFamily: '"Raleway", sans-serif' }}>
                    No step failures recorded
                  </Typography>
                </Box>
              )}
            </Box>
          </Card>
        </Grid>

        {/* ── Recent error log ──────────────────────────────────────────── */}
        <Grid item xs={12} md={4}>
          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%' }}>
            <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'text.secondary' }}>
                📋 Recent Errors
              </Typography>
            </Box>
            <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {recentErrors.length ? recentErrors.map((r) => (
                <Box key={r.id} sx={{ px: 1.5, py: 1, borderRadius: '3px', bgcolor: 'rgba(180,80,80,0.04)', border: '1px solid rgba(180,80,80,0.1)' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', color: 'text.primary', fontWeight: 600 }}>
                      {r.config_name || '—'}
                    </Typography>
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', color: 'text.disabled' }}>
                      {timeAgo(r.started_at)}
                    </Typography>
                  </Box>
                  {r.failed_step && (
                    <Chip label={r.failed_step} size="small" sx={{ height: 16, fontSize: '0.52rem', bgcolor: 'rgba(180,80,80,0.12)', color: '#b45050', fontFamily: '"JetBrains Mono", monospace', mr: 0.5 }} />
                  )}
                  {r.error_detail && (
                    <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.58rem', color: 'text.disabled', mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.error_detail}
                    </Typography>
                  )}
                </Box>
              )) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 3, px: 1.5 }}>
                  <CheckCircleOutlineIcon sx={{ fontSize: 18, color: '#6b8f71' }} />
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.82rem', fontFamily: '"Raleway", sans-serif' }}>No errors</Typography>
                </Box>
              )}
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* ── 30-day run health chart ───────────────────────────────────── */}
      {runsByDay.length > 0 && (
        <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
            <BarChartIcon sx={{ fontSize: 16, color: accent }} />
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'text.primary' }}>
              Run Health — Last 30 Days
            </Typography>
          </Box>
          <LineChart
            height={200}
            dataset={runsByDay}
            xAxis={[{ dataKey: 'day', scaleType: 'point', valueFormatter: fmtDay, tickLabelStyle: { fontSize: 10, fill: tickFill } }]}
            yAxis={[{ tickLabelStyle: { fontSize: 10, fill: tickFill } }]}
            series={[
              { dataKey: 'success', label: 'Success', color: '#6b8f71', area: true, showMark: false },
              { dataKey: 'errors',  label: 'Errors',  color: '#b45050', area: true, showMark: false },
            ]}
            margin={{ top: 4, right: 8, left: 8, bottom: 24 }}
            grid={{ horizontal: true }}
            slotProps={{ legend: { direction: 'row', position: { vertical: 'top', horizontal: 'right' } } }}
          />
        </Card>
      )}
    </Box>
  )
}
