import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Box, Typography, Alert, CircularProgress, Grid, Card, CardContent,
  Button, Chip, Select, MenuItem, FormControl, Tooltip,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  RadialBarChart, RadialBar,
  ScatterChart, Scatter, ZAxis,
  XAxis, YAxis, CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import UploadFileIcon    from '@mui/icons-material/UploadFile'
import AutoAwesomeIcon   from '@mui/icons-material/AutoAwesome'
import TableChartIcon    from '@mui/icons-material/TableChart'
import PictureAsPdfIcon  from '@mui/icons-material/PictureAsPdf'
import HistoryIcon       from '@mui/icons-material/History'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { analyzeFile, analyzeRunOutput, listRunOutputs, deleteRunOutput, listInsightModels, downloadAnalysisPdf, formatApiError } from '../api'
import { useAuth } from '../AuthContext'
import MythicsLoader from '../components/MythicsLoader'
import SuccessCheck from '../components/SuccessCheck'

// ── colour palette (matches backend prompt) ────────────────────────────────────
const PALETTE = ['#6b8f71','#6495b4','#c9a84c','#b45050','#9b59b6','#e67e22','#1abc9c','#e74c3c']
const pal = (i) => PALETTE[i % PALETTE.length]

const PROVIDER_COLORS = { gemini: '#4285f4', openai: '#10a37f', anthropic: '#d4a84b', grok: '#1da1f2', generic: '#888' }

// ── DynamicChart ───────────────────────────────────────────────────────────────
// Renders any chart spec that Gemini returns.  One switch on `type` → Recharts.

function DynamicChart({ spec }) {
  const { type, data = [], xKey, yKeys = [], nameKey = 'name', dataKey = 'value', colors = PALETTE } = spec
  const c = (i) => colors[i] || pal(i)
  const theme = useTheme()
  const dark  = theme.palette.mode === 'dark'
  const paper = dark ? '#111316' : '#ffffff'
  const tooltipBorder = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'
  const gridColor     = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'
  const tooltipStyle  = { fontSize: 11, background: paper, border: `1px solid ${tooltipBorder}` }

  if (!data.length) {
    return (
      <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>No data</Typography>
      </Box>
    )
  }

  // ── Pie ──────────────────────────────────────────────────────────────────────
  if (type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey={dataKey}
            nameKey={nameKey}
            cx="50%" cy="50%"
            outerRadius={95} innerRadius={42}
            paddingAngle={2}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            labelLine={false}
            isAnimationActive={false}
          >
            {data.map((_, i) => <Cell key={i} fill={c(i)} />)}
          </Pie>
          <ChartTooltip
            contentStyle={tooltipStyle}
            formatter={(v) => [Number(v).toLocaleString(), '']}
          />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  // ── Radial Bar (gauge) ───────────────────────────────────────────────────────
  if (type === 'radialBar') {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <RadialBarChart data={data} innerRadius={22} outerRadius={110} cx="50%" cy="55%">
          <RadialBar background dataKey={dataKey} label={{ position: 'insideStart', fill: '#fff', fontSize: 10 }}>
            {data.map((_, i) => <Cell key={i} fill={c(i)} />)}
          </RadialBar>
          <Legend
            iconSize={10}
            formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>}
          />
          <ChartTooltip
            contentStyle={tooltipStyle}
            formatter={(v) => [`${v}%`, '']}
          />
        </RadialBarChart>
      </ResponsiveContainer>
    )
  }

  // ── Scatter ──────────────────────────────────────────────────────────────────
  if (type === 'scatter') {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="x" type="number" name={xKey} tick={{ fontSize: 10 }} />
          <YAxis dataKey="y" type="number" name={yKeys[0] || 'y'} tick={{ fontSize: 10 }} />
          <ZAxis range={[38, 38]} />
          <ChartTooltip
            cursor={{ strokeDasharray: '3 3' }}
            contentStyle={tooltipStyle}
          />
          <Scatter data={data} fill={c(0)} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    )
  }

  // ── Bar / Line / Area ────────────────────────────────────────────────────────
  const safeYKeys = yKeys.length ? yKeys : Object.keys(data[0] || {}).filter((k) => k !== xKey)

  const ChartWrapper = type === 'line' ? LineChart : type === 'area' ? AreaChart : BarChart

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ChartWrapper data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis dataKey={xKey} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10 }} />
        <ChartTooltip
          contentStyle={{ fontSize: 11, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' }}
        />
        {safeYKeys.length > 1 && <Legend iconSize={10} />}

        {safeYKeys.map((key, i) => {
          if (type === 'line') {
            return (
              <Line
                key={key} type="monotone" dataKey={key}
                stroke={c(i)} strokeWidth={2} dot={false}
                isAnimationActive={false}
              />
            )
          }
          if (type === 'area') {
            return (
              <Area
                key={key} type="monotone" dataKey={key}
                stroke={c(i)} fill={c(i)} fillOpacity={0.22} strokeWidth={2}
                dot={false} isAnimationActive={false}
              />
            )
          }
          // bar
          return (
            <Bar key={key} dataKey={key} fill={c(i)} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          )
        })}
      </ChartWrapper>
    </ResponsiveContainer>
  )
}

// ── ChartCard ──────────────────────────────────────────────────────────────────

const TYPE_LABELS = {
  bar: 'Bar', line: 'Line', area: 'Area',
  pie: 'Pie', radialBar: 'Gauge', scatter: 'Scatter',
}

function ChartCard({ spec }) {
  const theme  = useTheme()
  const accent = theme.palette.primary.main
  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%' }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        {/* header row */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
          <Box sx={{ flex: 1, mr: 1 }}>
            <Typography sx={{
              fontFamily: '"Raleway", sans-serif', fontWeight: 700,
              fontSize: '0.8rem', mb: 0.3,
            }}>
              {spec.title}
            </Typography>
            <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', lineHeight: 1.5 }}>
              {spec.description}
            </Typography>
          </Box>
          <Chip
            label={TYPE_LABELS[spec.type] || spec.type}
            size="small"
            sx={{
              bgcolor: `${accent}14`, color: accent,
              fontFamily: '"Raleway", sans-serif', fontSize: '0.58rem',
              height: 18, flexShrink: 0,
            }}
          />
        </Box>

        <DynamicChart spec={spec} />

        {/* row count badge */}
        <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', mt: 1, textAlign: 'right' }}>
          {(spec.data || []).length} data points
        </Typography>
      </CardContent>
    </Card>
  )
}

// ── DropZone ───────────────────────────────────────────────────────────────────

function DropZone({ onFile, loading }) {
  const theme   = useTheme()
  const accent  = theme.palette.primary.main
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const pick = useCallback((f) => {
    if (f) onFile(f)
  }, [onFile])

  return (
    <Box
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer?.files?.[0]) }}
      onClick={() => !loading && inputRef.current?.click()}
      sx={{
        border: `2px dashed ${dragging ? accent : theme.palette.divider}`,
        borderRadius: 2,
        py: 7, px: 4,
        textAlign: 'center',
        cursor: loading ? 'default' : 'pointer',
        transition: 'all 0.2s',
        bgcolor: dragging ? `${accent}08` : 'transparent',
        '&:hover': loading ? {} : { borderColor: `${accent}88`, bgcolor: `${accent}05` },
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        style={{ display: 'none' }}
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <MythicsLoader size={80} />
          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem', color: 'text.secondary' }}>
            AI is analysing your data…
          </Typography>
          <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled' }}>
            This takes 5 – 15 seconds depending on file size
          </Typography>
        </Box>
      ) : (
        <Box>
          <UploadFileIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1.5 }} />
          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.92rem', mb: 0.5 }}>
            Drop a CSV or Excel file here
          </Typography>
          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mb: 2 }}>
            .csv · .xlsx · .xls — Gemini reads the data and picks the best charts automatically
          </Typography>
          <Button
            variant="outlined"
            size="small"
            sx={{
              borderColor: `${accent}44`, color: accent,
              fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              '&:hover': { borderColor: accent, bgcolor: `${accent}08` },
            }}
          >
            Browse file
          </Button>
        </Box>
      )}
    </Box>
  )
}

// ── SummaryBar ─────────────────────────────────────────────────────────────────

function SummaryBar({ result, filename }) {
  const theme  = useTheme()
  const accent = theme.palette.primary.main

  const totalRows  = result.meta?.total_rows    ?? result.row_count
  const totalCols  = result.meta?.total_columns ?? result.col_count
  const sheetCount = result.meta?.sheet_count   ?? 1
  const piiActive  = result.meta?.pii_protected
  const piiCount   = result.meta?.pii_masked_count ?? 0
  const spacyUsed  = result.meta?.pii_spacy

  return (
    <Card variant="outlined" sx={{ bgcolor: `${accent}07`, borderColor: `${accent}20`, mb: 3 }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
          <TableChartIcon sx={{ fontSize: 15, color: accent }} />
          <Typography sx={{
            fontFamily: '"Raleway", sans-serif', fontWeight: 700,
            fontSize: '0.62rem', letterSpacing: '0.16em',
            textTransform: 'uppercase', color: accent,
          }}>
            {filename}
          </Typography>
          <Chip
            label={`${totalRows?.toLocaleString() ?? '—'} rows`}
            size="small"
            sx={{ bgcolor: `${accent}14`, color: accent, fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', height: 18 }}
          />
          <Chip
            label={`${totalCols ?? '—'} columns`}
            size="small"
            sx={{ bgcolor: `${accent}14`, color: accent, fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', height: 18 }}
          />
          <Chip
            label={`${(result.charts || []).length} charts`}
            size="small"
            sx={{ bgcolor: `${accent}14`, color: accent, fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', height: 18 }}
          />
          {sheetCount > 1 && (
            <Chip
              label={`${sheetCount} sheets`}
              size="small"
              sx={{ bgcolor: `${accent}14`, color: accent, fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', height: 18 }}
            />
          )}

          {/* PII protection badge */}
          {piiActive && (
            <Tooltip
              title={`${piiCount} sensitive value${piiCount !== 1 ? 's' : ''} were masked before sending to the AI${spacyUsed ? ' (regex + spaCy NER)' : ' (regex patterns)'} and restored afterward. The AI never saw your raw data.`}
              arrow
              placement="top"
            >
              <Chip
                icon={<span style={{ fontSize: 11, lineHeight: 1, marginLeft: 6 }}>🛡</span>}
                label={`PII protected · ${piiCount} values`}
                size="small"
                sx={{
                  bgcolor: 'rgba(107,143,113,0.12)',
                  color: '#6b8f71',
                  border: '1px solid rgba(107,143,113,0.25)',
                  fontFamily: '"Raleway", sans-serif',
                  fontSize: '0.6rem', height: 20,
                  cursor: 'help',
                }}
              />
            </Tooltip>
          )}
        </Box>
        <Typography sx={{ fontSize: '0.78rem', color: 'text.primary', lineHeight: 1.75 }}>
          {result.summary}
        </Typography>
      </CardContent>
    </Card>
  )
}

// ── RunOutputHistory ───────────────────────────────────────────────────────────

function RunOutputHistory({ onAnalyze, analysing }) {
  const theme  = useTheme()
  const accent = theme.palette.primary.main
  const { getToken } = useAuth()
  const [outputs,  setOutputs]  = useState([])
  const [fetched,  setFetched]  = useState(false)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => {
    getToken().then((token) =>
      listRunOutputs(token)
        .then(({ data }) => setOutputs(data.items ?? []))
        .catch(() => {})
        .finally(() => setFetched(true))
    )
  }, []) // eslint-disable-line

  const handleDelete = async (id) => {
    setDeleting(id)
    try {
      const token = await getToken()
      await deleteRunOutput(id, token)
      setOutputs((prev) => prev.filter((o) => o.id !== id))
    } catch {
      // silent — item stays in list
    } finally {
      setDeleting(null)
    }
  }

  if (!fetched || outputs.length === 0) return null

  const fmtSize = (b) => b >= 1024 * 1024
    ? `${(b / (1024 * 1024)).toFixed(1)} MB`
    : `${(b / 1024).toFixed(1)} KB`

  const fmtDate = (iso) => iso
    ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <Box sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <HistoryIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
        <Typography sx={{
          fontFamily: '"Raleway", sans-serif', fontWeight: 700,
          fontSize: '0.58rem', letterSpacing: '0.2em',
          textTransform: 'uppercase', color: 'text.disabled',
        }}>
          Run History
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {outputs.map((o) => (
          <Card key={o.id} variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {/* info */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{
                  fontFamily: '"Raleway", sans-serif', fontWeight: 700,
                  fontSize: '0.75rem', mb: 0.25,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {o.display_name}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {[
                    o.config_name && `Config: ${o.config_name}`,
                    o.engine_name && `Engine: ${o.engine_name}`,
                    o.row_count   && `${o.row_count.toLocaleString()} rows`,
                    o.file_size_bytes && fmtSize(o.file_size_bytes),
                    fmtDate(o.created_at),
                  ].filter(Boolean).map((label) => (
                    <Typography key={label} sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>
                      {label}
                    </Typography>
                  ))}
                </Box>
              </Box>

              {/* actions */}
              <Box sx={{ display: 'flex', gap: 0.75, flexShrink: 0 }}>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!!analysing || analysing === o.id}
                  onClick={() => onAnalyze(o)}
                  startIcon={analysing === o.id ? <CircularProgress size={11} /> : <AutoAwesomeIcon sx={{ fontSize: 13 }} />}
                  sx={{
                    borderColor: `${accent}44`, color: accent,
                    fontFamily: '"Raleway", sans-serif', fontSize: '0.62rem',
                    letterSpacing: '0.08em', textTransform: 'uppercase', height: 28,
                    '&:hover': { borderColor: accent, bgcolor: `${accent}08` },
                  }}
                >
                  {analysing === o.id ? 'Analysing…' : 'Analyse'}
                </Button>
                <Button
                  size="small"
                  disabled={deleting === o.id}
                  onClick={() => handleDelete(o.id)}
                  sx={{
                    minWidth: 0, width: 28, height: 28, p: 0,
                    color: 'text.disabled',
                    '&:hover': { color: '#b45050' },
                  }}
                >
                  {deleting === o.id
                    ? <CircularProgress size={11} />
                    : <DeleteOutlineIcon sx={{ fontSize: 15 }} />}
                </Button>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  )
}

// ── AnalyzeDashboard ───────────────────────────────────────────────────────────

export default function AnalyzeDashboard() {
  const theme   = useTheme()
  const accent  = theme.palette.primary.main
  const { getToken } = useAuth()
  const chartsRef = useRef(null)
  const [loading,         setLoading]         = useState(false)
  const [pdfLoading,      setPdfLoading]      = useState(false)
  const [showSuccess,     setShowSuccess]     = useState(false)
  const [pdfSuccess,      setPdfSuccess]      = useState(false)
  const [error,           setError]           = useState(null)
  const [retrying,        setRetrying]        = useState(false)
  const [result,          setResult]          = useState(null)
  const [filename,        setFilename]        = useState('')
  const [pendingFile,     setPendingFile]     = useState(null)
  const [models,          setModels]          = useState([])
  const [selectedModelId, setSelectedModelId] = useState(null)
  const [modelsLoading,   setModelsLoading]   = useState(true)
  const [modelsError,     setModelsError]     = useState(null)
  const [analysingOutput, setAnalysingOutput] = useState(null)  // run-output id being analysed
  useEffect(() => {
    setModelsLoading(true)
    setModelsError(null)
    listInsightModels()
      .then(({ data }) => {
        const items = data.items ?? []
        setModels(items)
        const def = items.find((m) => m.is_default)
        if (def) setSelectedModelId(def.id)
      })
      .catch((err) => {
        setModelsError(formatApiError(err, 'Unable to load models from the server.'))
      })
      .finally(() => setModelsLoading(false))
  }, [])

  // While the model selector is being fetched, show the same full-page
  // Mythics loading screen used elsewhere so the UX is consistent.
  if (modelsLoading && !result) {
    return <MythicsLoader sx={{ flex: 1, bgcolor: 'background.default' }} />
  }

  const _runAnalysis = useCallback(async (file, modelId) => {
    setError(null)
    setRetrying(false)
    setLoading(true)
    let willRetry = false
    try {
      const { data } = await analyzeFile(file, modelId)
      setResult(data)
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 1600)
    } catch (err) {
      const isNetwork = !err.response && (err.message === 'Network Error' || err.code === 'ERR_NETWORK')
      if (isNetwork) {
        willRetry = true
        setRetrying(true)
        setError('The AI server is waking up — retrying in 8 seconds…')
        setTimeout(async () => {
          setError(null)
          try {
            const { data } = await analyzeFile(file, modelId)
            setResult(data)
            setShowSuccess(true)
            setTimeout(() => setShowSuccess(false), 1600)
          } catch (retryErr) {
            setError(formatApiError(retryErr, 'Server still starting — please try again in a moment.'))
          } finally {
            setRetrying(false)
            setLoading(false)
          }
        }, 8000)
      } else {
        setError(formatApiError(err, 'Analysis failed — check the server logs.'))
      }
    } finally {
      if (!willRetry) setLoading(false)
    }
  }, []) // eslint-disable-line

  const handleFile = useCallback(async (file) => {
    setResult(null)
    setFilename(file.name)
    setPendingFile(file)
    await _runAnalysis(file, selectedModelId)
  }, [selectedModelId, _runAnalysis])

  const handleOutputAnalyze = useCallback(async (output) => {
    setResult(null)
    setError(null)
    setFilename(output.display_name)
    setAnalysingOutput(output.id)
    setLoading(true)
    try {
      const token = await getToken()
      const { data } = await analyzeRunOutput(output.id, selectedModelId, token)
      setResult(data)
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 1600)
    } catch (err) {
      setError(formatApiError(err, 'Analysis failed — check the server logs.'))
    } finally {
      setLoading(false)
      setAnalysingOutput(null)
    }
  }, [selectedModelId]) // eslint-disable-line react-hooks/exhaustive-deps

  const downloadPdf = useCallback(async () => {
    if (!result) return
    setPdfLoading(true)
    try {
      const blob = await downloadAnalysisPdf({
        filename: filename || 'report',
        summary:  result.summary || '',
        charts:   result.charts  || [],
        meta:     result.meta    || {},
      })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${(filename || 'report').replace(/\.[^.]+$/, '')}_analysis.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setPdfSuccess(true)
      setTimeout(() => setPdfSuccess(false), 2200)
    } catch (err) {
      console.error('PDF download failed', err)
    } finally {
      setPdfLoading(false)
    }
  }, [result, filename])

  return (
    <Box>
      {/* ── section header ────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
        <AutoAwesomeIcon sx={{ color: accent, fontSize: 18 }} />
        <Typography sx={{
          fontFamily: '"Raleway", sans-serif', fontWeight: 700,
          fontSize: '0.62rem', letterSpacing: '0.22em',
          textTransform: 'uppercase', color: 'text.secondary',
        }}>
          AI Chart Analyser
        </Typography>
        <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>
          — upload any CSV or Excel and AI auto-generates charts
        </Typography>

        {modelsLoading ? (
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={18} />
            <Typography sx={{ fontSize: '0.66rem', color: 'text.disabled' }}>Loading models…</Typography>
          </Box>
        ) : models.length > 0 ? (
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{
              fontSize: '0.55rem', letterSpacing: '0.16em', textTransform: 'uppercase',
              color: 'text.disabled', fontFamily: '"Raleway", sans-serif',
            }}>
              Model
            </Typography>
            <FormControl size="small">
              <Select
                value={selectedModelId ?? ''}
                onChange={(e) => setSelectedModelId(e.target.value === '' ? null : e.target.value)}
                displayEmpty
                sx={{
                  fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', height: 28, minWidth: 180,
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: `${accent}30` },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: `${accent}70` },
                  '& .MuiSelect-icon': { fontSize: 16 },
                }}
              >
                <MenuItem value="" sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', color: 'text.disabled' }}>
                  Default
                </MenuItem>
                {models.map((m) => (
                  <MenuItem key={m.id} value={m.id} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Box sx={{
                        width: 7, height: 7, borderRadius: '50%',
                        bgcolor: PROVIDER_COLORS[m.provider] || '#888', flexShrink: 0,
                      }} />
                      {m.name}
                      {m.is_default && (
                        <Typography component="span" sx={{ fontSize: '0.55rem', color: 'text.disabled', fontFamily: '"Raleway", sans-serif' }}>
                          (default)
                        </Typography>
                      )}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        ) : null}
      </Box>

      {/* ── drop zone (hidden once results arrive) and until models loaded ── */}
      {!result && (
        modelsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <Typography sx={{ color: 'text.disabled' }}>Loading models…</Typography>
          </Box>
        ) : modelsError ? (
          <Alert severity="error" sx={{ mt: 2 }}>{modelsError}</Alert>
        ) : (
          <DropZone onFile={handleFile} loading={loading} />
        )
      )}

      {/* ── run history (shown while no results are displayed and models loaded) ─ */}
      {!result && !loading && !modelsLoading && !modelsError && (
        <RunOutputHistory
          onAnalyze={handleOutputAnalyze}
          analysing={analysingOutput}
        />
      )}

      {/* ── error ─────────────────────────────────────────────────────────── */}
      {error && (
        <Alert
          severity={retrying ? 'info' : 'error'}
          onClose={retrying ? undefined : () => setError(null)}
          sx={{ mt: 2 }}
        >
          {error}
          {retrying && (
            <CircularProgress size={12} sx={{ ml: 1.5, verticalAlign: 'middle' }} />
          )}
        </Alert>
      )}

      {/* ── success splash (brief, auto-dismisses before charts appear) ──── */}
      {result && showSuccess && (
        <Box sx={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', py: 8, gap: 2.5,
          '@keyframes splashIn': { from: { opacity: 0, transform: 'scale(0.92)' }, to: { opacity: 1, transform: 'scale(1)' } },
          animation: 'splashIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
        }}>
          <SuccessCheck size={96} />
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{
              fontFamily: '"Cormorant Garamond", serif', fontSize: '1.55rem',
              fontWeight: 700, color: 'text.primary', letterSpacing: '0.02em', mb: 0.5,
            }}>
              Analysis complete
            </Typography>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', color: 'text.secondary' }}>
              {(result.charts || []).length} chart{(result.charts || []).length !== 1 ? 's' : ''} generated from{' '}
              <Box component="span" sx={{ color: accent }}>{filename}</Box>
            </Typography>
          </Box>
        </Box>
      )}

      {/* ── results ───────────────────────────────────────────────────────── */}
      {result && !showSuccess && (
        <Box sx={{
          '@keyframes chartsIn': { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'none' } },
          animation: 'chartsIn 0.35s ease both',
        }}>
          {/* PDF download toolbar */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.5, mb: 2 }}>
            {/* PDF success badge */}
            {pdfSuccess && (
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 0.75,
                px: 1, py: 0.3,
                border: `1px solid ${accent}59`,
                borderRadius: '3px',
                bgcolor: `${accent}0f`,
                '@keyframes pdfBadgeIn': { from: { opacity: 0, transform: 'scale(0.85)' }, to: { opacity: 1, transform: 'scale(1)' } },
                animation: 'pdfBadgeIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both',
              }}>
                <SuccessCheck size={28} />
                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.65rem', color: accent, letterSpacing: '0.06em' }}>
                  Downloaded
                </Typography>
              </Box>
            )}
            <Button
              variant="outlined"
              size="small"
              onClick={downloadPdf}
              disabled={pdfLoading}
              startIcon={pdfLoading ? <CircularProgress size={14} /> : <PictureAsPdfIcon sx={{ fontSize: 16 }} />}
              sx={{
                borderColor: `${accent}44`, color: accent,
                fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem',
                letterSpacing: '0.1em', textTransform: 'uppercase',
                '&:hover': { borderColor: accent, bgcolor: `${accent}08` },
              }}
            >
              {pdfLoading ? 'Generating…' : 'Download PDF'}
            </Button>
          </Box>

          <SummaryBar result={result} filename={filename} />

          {/* Captured area — charts grid only; header+summary added natively in PDF */}
          <Box ref={chartsRef}>
            <Grid container spacing={2.5}>
              {(result.charts || []).map((spec) => (
                <Grid item xs={12} md={6} key={spec.id || spec.title}>
                  <ChartCard spec={spec} />
                </Grid>
              ))}
            </Grid>
          </Box>

          {/* upload another */}
          <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
            <Button
              onClick={() => { setResult(null); setFilename(''); setError(null) }}
              startIcon={<UploadFileIcon sx={{ fontSize: 14 }} />}
              sx={{
                fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem',
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'text.secondary',
                '&:hover': { color: accent },
              }}
            >
              Upload another file
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  )
}
