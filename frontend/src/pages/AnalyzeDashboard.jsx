import { useState, useCallback } from 'react'
import {
  Box, Typography, Card, CardContent, Grid, CircularProgress,
  Alert, Chip, Button, Divider,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, RadialBarChart, RadialBar,
  ScatterChart, Scatter, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import UploadFileIcon   from '@mui/icons-material/UploadFile'
import InsightsIcon     from '@mui/icons-material/Insights'
import TableChartIcon   from '@mui/icons-material/TableChart'
import AutoAwesomeIcon  from '@mui/icons-material/AutoAwesome'
import { useAuth }  from '../AuthContext'
import { analyzeFile } from '../api'

// ── palette shared across all charts ──────────────────────────────────────────

const PALETTE = [
  '#6b8f71', '#6495b4', '#c9a84c', '#b45050',
  '#9b59b6', '#e67e22', '#1abc9c', '#e74c3c',
  '#3498db', '#2ecc71', '#f39c12', '#8e44ad',
]

// ── helpers ────────────────────────────────────────────────────────────────────

function fmt(v) {
  if (v == null) return ''
  if (typeof v === 'number') {
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`
    if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`
    return Number.isInteger(v) ? String(v) : v.toFixed(2)
  }
  return String(v)
}

// Shorten long tick labels so axes stay readable
function shortLabel(val, maxLen = 14) {
  const s = String(val ?? '')
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s
}

// ── per-type chart renderers ───────────────────────────────────────────────────

function BarChartCard({ spec }) {
  const colors = spec.colors?.length ? spec.colors : PALETTE
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={spec.data} margin={{ top: 4, right: 16, bottom: 40, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey={spec.xKey} tick={{ fontSize: 10 }} tickFormatter={shortLabel} angle={-30} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} width={48} />
        <ChartTooltip formatter={(v) => fmt(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 11 }} />
        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
        {(spec.yKeys || []).map((k, i) => (
          <Bar key={k} dataKey={k} fill={colors[i % colors.length]} radius={[2, 2, 0, 0]} maxBarSize={36} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function LineChartCard({ spec }) {
  const colors = spec.colors?.length ? spec.colors : PALETTE
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={spec.data} margin={{ top: 4, right: 16, bottom: 40, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey={spec.xKey} tick={{ fontSize: 10 }} tickFormatter={shortLabel} angle={-30} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} width={48} />
        <ChartTooltip formatter={(v) => fmt(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 11 }} />
        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
        {(spec.yKeys || []).map((k, i) => (
          <Line key={k} type="monotone" dataKey={k} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function AreaChartCard({ spec }) {
  const colors = spec.colors?.length ? spec.colors : PALETTE
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={spec.data} margin={{ top: 4, right: 16, bottom: 40, left: 8 }}>
        <defs>
          {(spec.yKeys || []).map((k, i) => (
            <linearGradient key={k} id={`ag_${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={colors[i % colors.length]} stopOpacity={0.35} />
              <stop offset="95%" stopColor={colors[i % colors.length]} stopOpacity={0.03} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey={spec.xKey} tick={{ fontSize: 10 }} tickFormatter={shortLabel} angle={-30} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} width={48} />
        <ChartTooltip formatter={(v) => fmt(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 11 }} />
        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
        {(spec.yKeys || []).map((k, i) => (
          <Area key={k} type="monotone" dataKey={k} stroke={colors[i % colors.length]} fill={`url(#ag_${k})`} strokeWidth={2} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

function PieChartCard({ spec }) {
  const colors = spec.colors?.length ? spec.colors : PALETTE
  const nameKey = spec.nameKey || 'name'
  const dataKey = spec.dataKey || 'value'
  const RADIAN = Math.PI / 180
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.04) return null
    const r  = innerRadius + (outerRadius - innerRadius) * 0.5
    const x  = cx + r * Math.cos(-midAngle * RADIAN)
    const y  = cy + r * Math.sin(-midAngle * RADIAN)
    return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10}>{`${(percent * 100).toFixed(0)}%`}</text>
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={spec.data}
          cx="50%" cy="50%"
          innerRadius="38%" outerRadius="65%"
          dataKey={dataKey}
          nameKey={nameKey}
          labelLine={false}
          label={renderLabel}
        >
          {(spec.data || []).map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <ChartTooltip formatter={(v) => fmt(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 11 }} />
        <Legend wrapperStyle={{ fontSize: 10 }} formatter={(val) => shortLabel(val, 20)} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function RadialBarCard({ spec }) {
  const colors = spec.colors?.length ? spec.colors : PALETTE
  const nameKey = spec.nameKey || 'name'
  const dataKey = spec.dataKey || 'value'
  // Assign fill per entry so each arc gets a distinct colour
  const data = (spec.data || []).map((d, i) => ({ ...d, fill: colors[i % colors.length] }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadialBarChart innerRadius="20%" outerRadius="90%" data={data} startAngle={180} endAngle={0}>
        <RadialBar dataKey={dataKey} nameKey={nameKey} background label={{ position: 'insideStart', fill: '#fff', fontSize: 10 }} />
        <ChartTooltip formatter={(v) => `${fmt(v)}%`} contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 11 }} />
        <Legend wrapperStyle={{ fontSize: 10 }} formatter={(val) => shortLabel(val, 20)} />
      </RadialBarChart>
    </ResponsiveContainer>
  )
}

function ScatterChartCard({ spec }) {
  const color = (spec.colors || PALETTE)[0]
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ScatterChart margin={{ top: 4, right: 16, bottom: 16, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="x" name={spec.xKey || 'x'} tick={{ fontSize: 10 }} tickFormatter={fmt} />
        <YAxis dataKey="y" name={(spec.yKeys || ['y'])[0]} tick={{ fontSize: 10 }} tickFormatter={fmt} width={48} />
        <ChartTooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 11 }} />
        <Scatter data={spec.data} fill={color} opacity={0.75} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

function ComposedChartCard({ spec }) {
  const colors = spec.colors?.length ? spec.colors : PALETTE
  // First yKey as bar, rest as lines
  const [barKey, ...lineKeys] = spec.yKeys || []
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={spec.data} margin={{ top: 4, right: 16, bottom: 40, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey={spec.xKey} tick={{ fontSize: 10 }} tickFormatter={shortLabel} angle={-30} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} width={48} />
        <ChartTooltip formatter={(v) => fmt(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 11 }} />
        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
        {barKey  && <Bar  dataKey={barKey}  fill={colors[0]} radius={[2, 2, 0, 0]} maxBarSize={36} />}
        {lineKeys.map((k, i) => (
          <Line key={k} type="monotone" dataKey={k} stroke={colors[i + 1]} strokeWidth={2} dot={false} />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── main DynamicChart dispatcher ───────────────────────────────────────────────

function DynamicChart({ spec }) {
  const type = (spec.type || 'bar').toLowerCase()
  switch (type) {
    case 'line':       return <LineChartCard    spec={spec} />
    case 'area':       return <AreaChartCard    spec={spec} />
    case 'pie':        return <PieChartCard     spec={spec} />
    case 'radialbar':  return <RadialBarCard    spec={spec} />
    case 'scatter':    return <ScatterChartCard spec={spec} />
    case 'composed':   return <ComposedChartCard spec={spec} />
    default:           return <BarChartCard     spec={spec} />
  }
}

// ── chart card wrapper ─────────────────────────────────────────────────────────

function ChartCard({ spec }) {
  const theme  = useTheme()
  const accent = theme.palette.primary.main
  const typeLabel = (spec.type || 'bar').toUpperCase()
  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%' }}>
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', bgcolor: accent, opacity: 0.45 }} />
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 }, position: 'relative' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
          <Box>
            <Typography sx={{ fontSize: '0.72rem', fontFamily: '"Raleway", sans-serif', fontWeight: 700, color: 'text.primary' }}>
              {spec.title}
            </Typography>
            {spec.description && (
              <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', mt: 0.4 }}>
                {spec.description}
              </Typography>
            )}
          </Box>
          <Chip
            label={typeLabel}
            size="small"
            sx={{ fontSize: '0.52rem', height: 18, bgcolor: `${accent}18`, color: accent, fontFamily: '"Raleway", sans-serif' }}
          />
        </Box>
        <DynamicChart spec={spec} />
      </CardContent>
    </Card>
  )
}

// ── drop zone ──────────────────────────────────────────────────────────────────

function DropZone({ onFile, loading }) {
  const theme  = useTheme()
  const accent = theme.palette.primary.main
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) onFile(f)
  }, [onFile])

  const handleChange = (e) => {
    const f = e.target.files?.[0]
    if (f) onFile(f)
  }

  return (
    <Box
      onDragOver={(e) => { e.preventDefault(); setDragging(true)  }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      sx={{
        border: `2px dashed ${dragging ? accent : 'rgba(255,255,255,0.15)'}`,
        borderRadius: '6px',
        p: { xs: 5, sm: 8 },
        textAlign: 'center',
        bgcolor: dragging ? `${accent}0a` : 'transparent',
        transition: 'all 0.2s ease',
        cursor: loading ? 'default' : 'pointer',
      }}
      onClick={() => !loading && document.getElementById('file-input').click()}
    >
      <input
        id="file-input"
        type="file"
        accept=".csv,.xlsx,.xlsm,.xls"
        style={{ display: 'none' }}
        onChange={handleChange}
      />

      {loading ? (
        <>
          <CircularProgress size={32} sx={{ color: accent, mb: 2 }} />
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif' }}>
            Gemini is analysing your data…
          </Typography>
        </>
      ) : (
        <>
          <UploadFileIcon sx={{ fontSize: 42, color: accent, opacity: 0.6, mb: 1.5 }} />
          <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: '"Raleway", sans-serif', color: 'text.primary', mb: 0.5 }}>
            Drop a file here or click to browse
          </Typography>
          <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif' }}>
            Supports&nbsp;.csv, .xlsx, .xlsm, .xls
          </Typography>
        </>
      )}
    </Box>
  )
}

// ── meta bar (shown after analysis) ───────────────────────────────────────────

function MetaBar({ meta, onReset }) {
  const theme  = useTheme()
  const accent = theme.palette.primary.main
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 3 }}>
      <TableChartIcon sx={{ fontSize: 16, color: accent }} />
      <Typography sx={{ fontSize: '0.72rem', fontFamily: '"Raleway", sans-serif', color: 'text.primary', fontWeight: 700 }}>
        {meta.filename}
      </Typography>
      <Chip label={`${meta.total_rows?.toLocaleString()} rows`}    size="small" sx={{ fontSize: '0.6rem', height: 18 }} />
      <Chip label={`${meta.total_columns} columns`}                size="small" sx={{ fontSize: '0.6rem', height: 18 }} />
      <Box sx={{ flex: 1 }} />
      <Button
        size="small"
        variant="outlined"
        onClick={onReset}
        sx={{ fontSize: '0.62rem', fontFamily: '"Raleway", sans-serif', borderColor: 'divider', color: 'text.secondary' }}
      >
        Upload new file
      </Button>
    </Box>
  )
}

// ── AnalyzeDashboard ───────────────────────────────────────────────────────────

export default function AnalyzeDashboard() {
  const { token }  = useAuth()
  const theme      = useTheme()
  const accent     = theme.palette.primary.main

  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [chartSpec, setChartSpec] = useState(null)   // full Gemini response

  const handleFile = useCallback(async (file) => {
    setError(null)
    setChartSpec(null)
    setLoading(true)
    try {
      const { data } = await analyzeFile(file, token)
      setChartSpec(data)
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || 'Unknown error'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [token])

  const charts = chartSpec?.charts || []

  return (
    <Box sx={{ pt: 1 }}>

      {/* ── header ─────────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <AutoAwesomeIcon sx={{ fontSize: 16, color: accent }} />
        <Typography sx={{
          fontFamily: '"Raleway", sans-serif',
          fontSize: '0.6rem',
          fontWeight: 700,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'text.disabled',
        }}>
          AI File Analyser
        </Typography>
      </Box>

      {/* ── error ─────────────────────────────────────────────────────────── */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* ── drop zone (hide after analysis) ────────────────────────────────── */}
      {!chartSpec && (
        <DropZone onFile={handleFile} loading={loading} />
      )}

      {/* ── results ─────────────────────────────────────────────────────────── */}
      {chartSpec && (
        <>
          <MetaBar meta={chartSpec.meta || {}} onReset={() => setChartSpec(null)} />

          {/* summary card */}
          {chartSpec.summary && (
            <Card variant="outlined" sx={{ bgcolor: `${accent}0a`, borderColor: `${accent}30`, mb: 3 }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 }, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                <InsightsIcon sx={{ fontSize: 18, color: accent, flexShrink: 0, mt: 0.2 }} />
                <Typography sx={{ fontSize: '0.76rem', fontFamily: '"Raleway", sans-serif', color: 'text.primary', lineHeight: 1.7 }}>
                  {chartSpec.summary}
                </Typography>
              </CardContent>
            </Card>
          )}

          <Divider sx={{ mb: 3 }} />

          {/* chart grid */}
          <Grid container spacing={3}>
            {charts.map((spec) => (
              <Grid item xs={12} md={6} key={spec.id || spec.title}>
                <Box sx={{ position: 'relative' }}>
                  <ChartCard spec={spec} />
                </Box>
              </Grid>
            ))}
          </Grid>

          {charts.length === 0 && (
            <Alert severity="warning">Gemini did not return any charts for this dataset.</Alert>
          )}
        </>
      )}
    </Box>
  )
}
