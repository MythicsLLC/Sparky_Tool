import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Box, Typography, Alert, CircularProgress, Grid, Card, CardContent,
  Button, Chip, Select, MenuItem, FormControl,
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
import { analyzeFile, listInsightModels } from '../api'
import { useAuth } from '../AuthContext'
import MythicsLoader from '../components/MythicsLoader'

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
  return (
    <Card variant="outlined" sx={{ bgcolor: `${accent}07`, borderColor: `${accent}20`, mb: 3 }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
          <TableChartIcon sx={{ fontSize: 15, color: accent }} />
          <Typography sx={{
            fontFamily: '"Raleway", sans-serif', fontWeight: 700,
            fontSize: '0.62rem', letterSpacing: '0.16em',
            textTransform: 'uppercase', color: accent,
          }}>
            {filename}
          </Typography>
          <Chip
            label={`${result.row_count?.toLocaleString()} rows`}
            size="small"
            sx={{ bgcolor: `${accent}14`, color: accent, fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', height: 18 }}
          />
          <Chip
            label={`${result.col_count} columns`}
            size="small"
            sx={{ bgcolor: `${accent}14`, color: accent, fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', height: 18 }}
          />
          <Chip
            label={`${(result.charts || []).length} charts`}
            size="small"
            sx={{ bgcolor: `${accent}14`, color: accent, fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', height: 18 }}
          />
        </Box>
        <Typography sx={{ fontSize: '0.78rem', color: 'text.primary', lineHeight: 1.65 }}>
          {result.summary}
        </Typography>
      </CardContent>
    </Card>
  )
}

// ── AnalyzeDashboard ───────────────────────────────────────────────────────────

export default function AnalyzeDashboard() {
  const theme   = useTheme()
  const accent  = theme.palette.primary.main
  const { token } = useAuth()
  const chartsRef = useRef(null)
  const [loading,         setLoading]         = useState(false)
  const [pdfLoading,      setPdfLoading]      = useState(false)
  const [error,           setError]           = useState(null)
  const [result,          setResult]          = useState(null)
  const [filename,        setFilename]        = useState('')
  const [models,          setModels]          = useState([])
  const [selectedModelId, setSelectedModelId] = useState(null)

  useEffect(() => {
    listInsightModels()
      .then(({ data }) => {
        const items = data.items ?? []
        setModels(items)
        const def = items.find((m) => m.is_default)
        if (def) setSelectedModelId(def.id)
      })
      .catch(() => {})
  }, [token])

  const handleFile = useCallback(async (file) => {
    setError(null)
    setResult(null)
    setFilename(file.name)
    setLoading(true)
    try {
      const { data } = await analyzeFile(file, selectedModelId)
      setResult(data)
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Analysis failed — check the server logs.')
    } finally {
      setLoading(false)
    }
  }, [selectedModelId])

  const downloadPdf = useCallback(async () => {
    if (!chartsRef.current || !result) return
    setPdfLoading(true)
    try {
      const { default: html2canvas } = await import('html2canvas')
      const { jsPDF }                = await import('jspdf')

      const el      = chartsRef.current
      const canvas  = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: theme.palette.background.default,
        logging: false,
      })

      const imgData   = canvas.toDataURL('image/png')
      const pdf       = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
      const pageW     = pdf.internal.pageSize.getWidth()
      const pageH     = pdf.internal.pageSize.getHeight()
      const margin    = 32
      const printW    = pageW - margin * 2
      const imgH      = (canvas.height / canvas.width) * printW
      const totalPages = Math.ceil(imgH / pageH)

      let yOffset = 0
      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage()
        pdf.addImage(
          imgData, 'PNG',
          margin,
          margin - yOffset,
          printW,
          imgH,
        )
        yOffset += pageH - margin
      }

      const safeName = (filename || 'report').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]/gi, '_')
      pdf.save(`${safeName}_charts.pdf`)
    } catch (err) {
      console.error('PDF generation failed', err)
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

        {models.length > 0 && (
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
        )}
      </Box>

      {/* ── drop zone (hidden once results arrive) ────────────────────────── */}
      {!result && <DropZone onFile={handleFile} loading={loading} />}

      {/* ── error ─────────────────────────────────────────────────────────── */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {/* ── results ───────────────────────────────────────────────────────── */}
      {result && (
        <Box>
          {/* PDF download toolbar */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
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

          {/* Captured area */}
          <Box ref={chartsRef}>
            <SummaryBar result={result} filename={filename} />

          <Grid container spacing={2.5}>
            {(result.charts || []).map((spec) => (
              <Grid item xs={12} md={6} key={spec.id || spec.title}>
                <ChartCard spec={spec} />
              </Grid>
            ))}
          </Grid>

          </Box>{/* end chartsRef */}

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
