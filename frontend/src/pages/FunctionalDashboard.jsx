import { useState, useEffect, useMemo } from 'react'
import {
  Box, Typography, Alert, CircularProgress, Grid, Card, CardContent,
  Select, MenuItem, FormControl, InputLabel, TextField, InputAdornment,
  ToggleButtonGroup, ToggleButton, Chip, Divider,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { DataGrid } from '@mui/x-data-grid'
import {
  PieChart, Pie, Cell, Tooltip as ChartTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  RadialBarChart, RadialBar,
} from 'recharts'
import SearchIcon       from '@mui/icons-material/Search'
import StorageIcon      from '@mui/icons-material/Storage'
import PublicIcon       from '@mui/icons-material/Public'
import TuneIcon         from '@mui/icons-material/Tune'
import BusinessIcon     from '@mui/icons-material/Business'
import FolderOpenIcon   from '@mui/icons-material/FolderOpen'
import PieChartIcon     from '@mui/icons-material/PieChart'
import BarChartIcon     from '@mui/icons-material/BarChart'
import CategoryIcon     from '@mui/icons-material/Category'
import NumbersIcon      from '@mui/icons-material/Numbers'
import { getDataGridSx } from '../utils/dataGridSx'
import { useAuth }  from '../AuthContext'
import { getCoreHRFiles, getCoreHRFile } from '../api'

// ── constants ──────────────────────────────────────────────────────────────────

const COLOR_ON  = '#6b8f71'
const COLOR_OFF = '#b45050'
const COLOR_BLU = '#6495b4'

// Module name → category lookup (applied client-side)
function categoriseModule(name) {
  const n = name.toLowerCase()
  if (/\bepay\b|ecompensation|eprofile|edevelopment|ebenefits|eperformance|eprofile manager|ecompensation manager|self.service|employee self/.test(n)) return 'Self-Service'
  if (/payroll|pay\/bill|payroll interface|salary points|retroactive|load in prelim|concurrent calc|change.*check|change reversal/.test(n)) return 'Payroll'
  if (/benefit|fsa|cobra|benefit billing|deduction/.test(n)) return 'Benefits'
  if (/talent|candidate|succession|human resource|directory interface|hrms/.test(n)) return 'Human Capital'
  if (/absence|fmla|time and labor|labor rules/.test(n)) return 'Workforce'
  if (/general ledger|project costing|receivable|encumbrance|comm control|french public|german public|education.*gov/.test(n)) return 'Finance & Public'
  if (/pension|stock admin/.test(n)) return 'Pension & Stock'
  return 'Administration'
}

// ── helpers ────────────────────────────────────────────────────────────────────

function CardHeader({ icon: Icon, label, accent }) {
  return (
    <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
      {Icon && <Icon sx={{ fontSize: 14, color: accent }} />}
      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'text.secondary' }}>
        {label}
      </Typography>
    </Box>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, color, sub }) {
  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, bgcolor: color, opacity: 0.65 }} />
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Typography sx={{ fontSize: '0.52rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'text.disabled', mb: 0.75 }}>
          {label}
        </Typography>
        <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '2rem', fontWeight: 700, color: 'text.primary', lineHeight: 1 }}>
          {value}
        </Typography>
        {sub && <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', mt: 0.5, fontFamily: '"Raleway", sans-serif' }}>{sub}</Typography>}
      </CardContent>
    </Card>
  )
}

// ── Donut: Module ON/OFF ───────────────────────────────────────────────────────
function ModuleDonut({ on, off, accent, theme }) {
  const data = [
    { name: 'Enabled', value: on,  color: COLOR_ON  },
    { name: 'Disabled', value: off, color: dark(theme) ? 'rgba(180,80,80,0.55)' : COLOR_OFF },
  ]
  const total     = on + off
  const pct       = total ? Math.round(on / total * 100) : 0
  const gridColor = dark(theme) ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'

  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%' }}>
      <CardHeader icon={PieChartIcon} label="Module Adoption" accent={accent} />
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Box sx={{ position: 'relative', width: '100%', height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%" cy="50%"
                innerRadius={58} outerRadius={82}
                startAngle={90} endAngle={-270}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <ChartTooltip
                contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, fontFamily: '"Raleway", sans-serif', fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Centre label */}
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '2rem', fontWeight: 700, color: 'text.primary', lineHeight: 1 }}>
              {pct}%
            </Typography>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.55rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'text.disabled', mt: 0.25 }}>
              enabled
            </Typography>
          </Box>
        </Box>
        {/* Legend */}
        <Box sx={{ display: 'flex', gap: 3, mt: 1 }}>
          {data.map((d) => (
            <Box key={d.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: d.color }} />
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.66rem', color: 'text.secondary' }}>
                {d.value} {d.name}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Card>
  )
}

// ── Radial adoption gauge ─────────────────────────────────────────────────────
function AdoptionGauge({ on, off, accent, theme }) {
  const total = on + off || 1
  const pct   = Math.round(on / total * 100)
  const data  = [{ name: 'Adoption', value: pct, fill: COLOR_ON }]

  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%' }}>
      <CardHeader icon={BarChartIcon} label="Adoption Rate" accent={accent} />
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Box sx={{ position: 'relative', width: '100%', height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%" cy="85%"
              innerRadius="60%" outerRadius="100%"
              startAngle={180} endAngle={0}
              data={[
                { name: 'bg',        value: 100, fill: dark(theme) ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)' },
                { name: 'Adoption',  value: pct, fill: COLOR_ON },
              ]}
            >
              <RadialBar dataKey="value" background={false} />
            </RadialBarChart>
          </ResponsiveContainer>
          <Box sx={{ position: 'absolute', bottom: 4, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.9rem', fontWeight: 700, color: COLOR_ON, lineHeight: 1 }}>{pct}%</Typography>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.55rem', color: 'text.disabled', letterSpacing: '0.14em', textTransform: 'uppercase' }}>of modules on</Typography>
          </Box>
        </Box>
        <Divider sx={{ width: '100%', my: 1.5 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-around', width: '100%' }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.4rem', fontWeight: 700, color: COLOR_ON }}>{on}</Typography>
            <Typography sx={{ fontSize: '0.56rem', color: 'text.disabled', letterSpacing: '0.12em', textTransform: 'uppercase' }}>active</Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.4rem', fontWeight: 700, color: COLOR_OFF }}>{off}</Typography>
            <Typography sx={{ fontSize: '0.56rem', color: 'text.disabled', letterSpacing: '0.12em', textTransform: 'uppercase' }}>inactive</Typography>
          </Box>
        </Box>
      </Box>
    </Card>
  )
}

// ── Category breakdown bar chart ───────────────────────────────────────────────
function CategoryBar({ modules, accent, theme }) {
  const cats = useMemo(() => {
    const map = {}
    Object.entries(modules || {}).forEach(([name, enabled]) => {
      const cat = categoriseModule(name)
      if (!map[cat]) map[cat] = { cat, on: 0, off: 0 }
      if (enabled) map[cat].on++; else map[cat].off++
    })
    return Object.values(map).sort((a, b) => (b.on + b.off) - (a.on + a.off))
  }, [modules])

  const gridColor = dark(theme) ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'
  const tickFill  = theme.palette.text.secondary

  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
      <CardHeader icon={CategoryIcon} label="Modules by Category" accent={accent} />
      <Box sx={{ p: 2.5, pt: 2 }}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={cats} margin={{ top: 0, right: 8, left: -22, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="cat"
              tick={{ fontSize: 9.5, fill: tickFill, fontFamily: '"Raleway", sans-serif' }}
              angle={-35} textAnchor="end" interval={0}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: tickFill }} />
            <ChartTooltip
              contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, fontFamily: '"Raleway", sans-serif', fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontFamily: '"Raleway", sans-serif', fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="on"  name="Enabled"  fill={COLOR_ON}  radius={[3, 3, 0, 0]} />
            <Bar dataKey="off" name="Disabled" fill={COLOR_OFF} radius={[3, 3, 0, 0]} opacity={0.7} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Card>
  )
}

// ── Horizontal module bar chart (all modules, ON first) ───────────────────────
function ModuleBar({ modules, accent, theme }) {
  const data = useMemo(() => {
    return Object.entries(modules || {})
      .map(([name, enabled]) => ({
        name: name.length > 28 ? name.slice(0, 26) + '…' : name,
        fullName: name,
        enabled: enabled ? 1 : 0,
      }))
      .sort((a, b) => b.enabled - a.enabled || a.name.localeCompare(b.name))
      .slice(0, 30)
  }, [modules])

  const gridColor = dark(theme) ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'
  const tickFill  = theme.palette.text.secondary

  const CustomBar = (props) => {
    const { x, y, width, height, enabled } = props
    return <rect x={x} y={y} width={width} height={height} fill={enabled ? COLOR_ON : COLOR_OFF} rx={2} opacity={enabled ? 0.85 : 0.5} />
  }

  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
      <CardHeader icon={BarChartIcon} label={`Module Status — Top ${data.length}`} accent={accent} />
      <Box sx={{ p: 2, overflowX: 'auto' }}>
        <Box sx={{ minWidth: 340 }}>
          <ResponsiveContainer width="100%" height={Math.max(data.length * 22, 300)}>
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 40, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
              <XAxis type="number" domain={[0, 1]} hide />
              <YAxis
                type="category" dataKey="name" width={180}
                tick={{ fontSize: 10.5, fill: tickFill, fontFamily: '"Raleway", sans-serif' }}
              />
              <ChartTooltip
                contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, fontFamily: '"Raleway", sans-serif', fontSize: 12 }}
                formatter={(val, name, { payload }) => [payload.enabled ? 'Enabled' : 'Disabled', payload.fullName]}
              />
              <Bar dataKey="enabled" shape={<CustomBar />} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Box>
    </Card>
  )
}

// ── Countries visual bar ───────────────────────────────────────────────────────
function CountriesChart({ countries, accent, theme }) {
  const data = useMemo(() =>
    Object.entries(countries || {}).map(([name, active]) => ({ name, active: active ? 1 : 0 }))
      .sort((a, b) => b.active - a.active || a.name.localeCompare(b.name)),
  [countries])

  const gridColor = dark(theme) ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'
  const tickFill  = theme.palette.text.secondary
  const activeCount = data.filter((d) => d.active).length

  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
      <CardHeader icon={PublicIcon} label={`Country Coverage — ${activeCount} Active`} accent={accent} />
      <Box sx={{ p: 2.5 }}>
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={data} margin={{ top: 0, right: 8, left: -20, bottom: 50 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 9.5, fill: tickFill, fontFamily: '"Raleway", sans-serif' }}
              angle={-45} textAnchor="end" interval={0}
            />
            <YAxis allowDecimals={false} domain={[0, 1]} ticks={[0, 1]} tickFormatter={(v) => v ? 'Yes' : 'No'} tick={{ fontSize: 10, fill: tickFill }} />
            <ChartTooltip
              contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, fontFamily: '"Raleway", sans-serif', fontSize: 12 }}
              formatter={(v, n, { payload }) => [payload.active ? 'Active' : 'Inactive', payload.name]}
            />
            <Bar
              dataKey="active"
              radius={[3, 3, 0, 0]}
              isAnimationActive
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.active ? COLOR_ON : dark(theme) ? 'rgba(100,149,180,0.2)' : 'rgba(100,149,180,0.18)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Card>
  )
}

// ── Numeric parameters bar chart ───────────────────────────────────────────────
function NumericParamsChart({ parameters, accent, theme }) {
  const data = useMemo(() => {
    const numericKeys = [
      'Minimum Standard Hours', 'Default Standard Hours', 'Maximum Standard Hours',
      'EIP Message Limit', 'Update Incumbents Limit', 'Cache Retention Days',
      'Benefits Deduction Class Order', 'Empl ID Field Length',
    ]
    return Object.entries(parameters || {})
      .filter(([k, v]) => numericKeys.includes(k) || (!isNaN(Number(v)) && Number(v) > 0))
      .map(([k, v]) => ({ name: k.length > 22 ? k.slice(0, 20) + '…' : k, fullName: k, value: Number(v) || 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [parameters])

  const gridColor = dark(theme) ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'
  const tickFill  = theme.palette.text.secondary

  if (!data.length) return null

  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
      <CardHeader icon={NumbersIcon} label="Numeric Configuration Values" accent={accent} />
      <Box sx={{ p: 2.5 }}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 0, right: 16, left: -8, bottom: 50 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 9.5, fill: tickFill, fontFamily: '"Raleway", sans-serif' }}
              angle={-35} textAnchor="end" interval={0}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: tickFill }} />
            <ChartTooltip
              contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, fontFamily: '"Raleway", sans-serif', fontSize: 12 }}
              formatter={(v, n, { payload }) => [v, payload.fullName]}
            />
            <Bar dataKey="value" fill={COLOR_BLU} radius={[3, 3, 0, 0]} opacity={0.85} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Card>
  )
}

// ── Pie: countries active/inactive ────────────────────────────────────────────
function CountriesPie({ countries, accent, theme }) {
  const active   = Object.values(countries || {}).filter(Boolean).length
  const inactive = Object.values(countries || {}).filter((v) => !v).length
  const data = [
    { name: 'Active',   value: active,   color: COLOR_ON  },
    { name: 'Inactive', value: inactive, color: dark(theme) ? 'rgba(100,149,180,0.3)' : 'rgba(100,149,180,0.35)' },
  ]

  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%' }}>
      <CardHeader icon={PublicIcon} label="Country Ratio" accent={accent} />
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Box sx={{ position: 'relative', width: '100%', height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="value" stroke="none">
                {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <ChartTooltip contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, fontFamily: '"Raleway", sans-serif', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.6rem', fontWeight: 700, color: 'text.primary', lineHeight: 1 }}>{active}</Typography>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.52rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.disabled' }}>active</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 3 }}>
          {data.map((d) => (
            <Box key={d.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: d.color }} />
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.66rem', color: 'text.secondary' }}>{d.value} {d.name}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Card>
  )
}

// ── Key Parameters panel ───────────────────────────────────────────────────────
function ParamsPanel({ parameters, accent }) {
  // Separate text/code params from numeric ones
  const textParams = useMemo(() =>
    Object.entries(parameters || {}).filter(([, v]) => isNaN(Number(v)) || v === ''),
  [parameters])

  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%' }}>
      <CardHeader icon={TuneIcon} label="Key Parameters" accent={accent} />
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 0.75, maxHeight: 320, overflow: 'auto' }}>
        {textParams.map(([key, val]) => (
          <Box key={key} sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', color: 'text.secondary', flexShrink: 0, maxWidth: '55%' }}>
              {key}
            </Typography>
            <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: accent, textAlign: 'right', wordBreak: 'break-all' }}>
              {val || '—'}
            </Typography>
          </Box>
        ))}
      </Box>
    </Card>
  )
}

// ── dark() helper ──────────────────────────────────────────────────────────────
function dark(theme) { return theme.palette.mode === 'dark' }

// ═══════════════════════════════════════════════════════════════════════════════
// FunctionalDashboard
// ═══════════════════════════════════════════════════════════════════════════════

export default function FunctionalDashboard() {
  const { token } = useAuth()
  const theme     = useTheme()
  const accent    = theme.palette.primary.main
  const mode      = theme.palette.mode

  const [files,        setFiles]        = useState([])
  const [selectedFile, setSelectedFile] = useState('')
  const [data,         setData]         = useState(null)
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [loadingData,  setLoadingData]  = useState(false)
  const [error,        setError]        = useState(null)
  const [moduleSearch, setModuleSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('all')  // 'all' | 'on' | 'off'

  // ── load file list ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return
    getCoreHRFiles(token)
      .then((res) => {
        const list = res.data.files || []
        setFiles(list)
        if (list.length) setSelectedFile(list[0].filename)
      })
      .catch(() => setError('Could not load CoreHR files'))
      .finally(() => setLoadingFiles(false))
  }, [token])

  // ── load file data when selection changes ──────────────────────────────────
  useEffect(() => {
    if (!token || !selectedFile) return
    setLoadingData(true)
    setData(null)
    getCoreHRFile(selectedFile, token)
      .then((res) => setData(res.data))
      .catch(() => setError(`Could not parse ${selectedFile}`))
      .finally(() => setLoadingData(false))
  }, [token, selectedFile])

  // ── derived KPI ────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    if (!data) return null
    const moduleEntries   = Object.entries(data.modules || {})
    const on              = moduleEntries.filter(([, v]) =>  v).length
    const off             = moduleEntries.filter(([, v]) => !v).length
    const activeCountries = Object.values(data.countries || {}).filter(Boolean).length
    const totalCountries  = Object.keys(data.countries || {}).length
    return { on, off, activeCountries, totalCountries, buCount: (data.business_units || []).length, total: on + off }
  }, [data])

  // ── filtered module rows ───────────────────────────────────────────────────
  const filteredModules = useMemo(() => {
    if (!data) return []
    return Object.entries(data.modules || {})
      .filter(([key, val]) => {
        const matchSearch = !moduleSearch || key.toLowerCase().includes(moduleSearch.toLowerCase())
        const matchFilter = moduleFilter === 'all' || (moduleFilter === 'on' ? val : !val)
        return matchSearch && matchFilter
      })
      .map(([key, val], i) => ({ id: i, module: key, enabled: val, category: categoriseModule(key) }))
  }, [data, moduleSearch, moduleFilter])

  // ── BU rows ────────────────────────────────────────────────────────────────
  const buRows = useMemo(
    () => (data?.business_units || []).map((bu, i) => ({ id: i, ...bu })),
    [data],
  )

  // ── guard renders ──────────────────────────────────────────────────────────
  if (loadingFiles) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress size={24} sx={{ color: 'primary.main' }} />
      </Box>
    )
  }

  if (!files.length) {
    return (
      <Box sx={{ py: 8, textAlign: 'center' }}>
        <FolderOpenIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 2 }} />
        <Typography sx={{ fontFamily: '"Raleway", sans-serif', color: 'text.secondary', fontSize: '0.88rem' }}>
          No CoreHR Discovery files found
        </Typography>
        <Typography sx={{ fontFamily: '"Raleway", sans-serif', color: 'text.disabled', fontSize: '0.76rem', mt: 0.5 }}>
          Run a Discovery configuration to generate one
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'grid', gap: 4 }}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* ── File picker ────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 340 }}>
          <InputLabel sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.8rem' }}>
            CoreHR Discovery File
          </InputLabel>
          <Select
            value={selectedFile}
            label="CoreHR Discovery File"
            onChange={(e) => setSelectedFile(e.target.value)}
            sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.76rem' }}
          >
            {files.map((f) => (
              <MenuItem key={f.filename} value={f.filename}
                sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.74rem' }}>
                {f.filename}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {data && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {data.run_date && (
              <Chip label={`Run: ${data.run_date}`} size="small"
                sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', bgcolor: `${accent}12`, color: 'text.secondary' }} />
            )}
            {data.company && (
              <Chip label={`Company: ${data.company}`} size="small"
                sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', bgcolor: `${accent}12`, color: 'primary.main' }} />
            )}
          </Box>
        )}
        {loadingData && <CircularProgress size={18} sx={{ color: 'primary.main' }} />}
      </Box>

      {data && kpi && (
        <>
          {/* ══ Row 1: KPI strip ════════════════════════════════════════════ */}
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}><KpiCard label="Modules ON"       value={kpi.on}              color={COLOR_ON}  sub={`of ${kpi.total} total`} /></Grid>
            <Grid item xs={6} sm={3}><KpiCard label="Modules OFF"      value={kpi.off}             color={COLOR_OFF} sub={`${Math.round(kpi.off/kpi.total*100)}% inactive`} /></Grid>
            <Grid item xs={6} sm={3}><KpiCard label="Countries Active" value={kpi.activeCountries} color={COLOR_BLU} sub={`of ${kpi.totalCountries} configured`} /></Grid>
            <Grid item xs={6} sm={3}><KpiCard label="Business Units"   value={kpi.buCount}         color={accent}  /></Grid>
          </Grid>

          {/* ══ Row 2: Donut + Adoption gauge + Category bar ════════════════ */}
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6} md={3}>
              <ModuleDonut on={kpi.on} off={kpi.off} accent={accent} theme={theme} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <AdoptionGauge on={kpi.on} off={kpi.off} accent={accent} theme={theme} />
            </Grid>
            <Grid item xs={12} md={6}>
              <CategoryBar modules={data.modules} accent={accent} theme={theme} />
            </Grid>
          </Grid>

          {/* ══ Row 3: Horizontal module bar (full width) ═══════════════════ */}
          <ModuleBar modules={data.modules} accent={accent} theme={theme} />

          {/* ══ Row 4: Countries pie + Country chart + Params ═══════════════ */}
          <Grid container spacing={3}>
            <Grid item xs={12} sm={4} md={3}>
              <CountriesPie countries={data.countries} accent={accent} theme={theme} />
            </Grid>
            <Grid item xs={12} sm={8} md={5}>
              <CountriesChart countries={data.countries} accent={accent} theme={theme} />
            </Grid>
            <Grid item xs={12} md={4}>
              <ParamsPanel parameters={data.parameters} accent={accent} />
            </Grid>
          </Grid>

          {/* ══ Row 5: Numeric parameters chart ═════════════════════════════ */}
          <NumericParamsChart parameters={data.parameters} accent={accent} theme={theme} />

          {/* ══ Row 6: Searchable module DataGrid ═══════════════════════════ */}
          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
            <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StorageIcon sx={{ fontSize: 14, color: accent }} />
                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'text.secondary' }}>
                  Module Detail
                </Typography>
              </Box>
              <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <TextField
                  size="small"
                  placeholder="Search modules…"
                  value={moduleSearch}
                  onChange={(e) => setModuleSearch(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                      </InputAdornment>
                    ),
                    sx: { fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' },
                  }}
                  sx={{
                    width: 200,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '2px',
                      '& fieldset': { borderColor: 'divider' },
                      '&.Mui-focused fieldset': { borderColor: accent },
                    },
                  }}
                />
                <ToggleButtonGroup
                  value={moduleFilter} exclusive
                  onChange={(_, v) => v && setModuleFilter(v)}
                  size="small"
                  sx={{
                    '& .MuiToggleButton-root': {
                      px: 1.2, py: 0.4, fontFamily: '"Raleway", sans-serif',
                      fontSize: '0.58rem', letterSpacing: '0.1em', textTransform: 'uppercase',
                      border: '1px solid', borderColor: 'divider', color: 'text.disabled',
                      borderRadius: '2px !important',
                      '&.Mui-selected': { bgcolor: `${accent}18`, color: accent, borderColor: `${accent}40` },
                    },
                  }}
                >
                  <ToggleButton value="all">All</ToggleButton>
                  <ToggleButton value="on">ON</ToggleButton>
                  <ToggleButton value="off">OFF</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            </Box>
            <DataGrid
              rows={filteredModules}
              autoHeight
              disableRowSelectionOnClick
              pageSizeOptions={[25, 50, 100]}
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
              sx={{ ...getDataGridSx(accent, mode), border: 'none', borderRadius: 0 }}
              columns={[
                {
                  field: 'module', headerName: 'Module', flex: 1.5, minWidth: 200,
                  renderCell: (p) => (
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.74rem', color: 'text.primary' }}>{p.value}</Typography>
                  ),
                },
                {
                  field: 'category', headerName: 'Category', flex: 1, minWidth: 130,
                  renderCell: (p) => (
                    <Chip label={p.value} size="small"
                      sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.56rem', height: 18,
                        bgcolor: `${accent}10`, color: accent }} />
                  ),
                },
                {
                  field: 'enabled', headerName: 'Status', width: 100,
                  renderCell: (p) => (
                    <Chip
                      label={p.value ? 'ON' : 'OFF'}
                      size="small"
                      sx={{
                        bgcolor: p.value ? 'rgba(107,143,113,0.14)' : 'rgba(180,80,80,0.12)',
                        color:   p.value ? COLOR_ON : COLOR_OFF,
                        fontFamily: '"Raleway", sans-serif',
                        fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', height: 20,
                      }}
                    />
                  ),
                },
              ]}
            />
          </Card>

          {/* ══ Row 7: Business Units ════════════════════════════════════════ */}
          {buRows.length > 0 && (
            <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
              <CardHeader icon={BusinessIcon} label="Business Units" accent={accent} />
              <DataGrid
                rows={buRows}
                autoHeight
                disableRowSelectionOnClick
                hideFooter={buRows.length <= 10}
                sx={{ ...getDataGridSx(accent, mode), border: 'none', borderRadius: 0 }}
                columns={[
                  {
                    field: 'code', headerName: 'BU Code', width: 140,
                    renderCell: (p) => (
                      <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.74rem', color: 'primary.main' }}>{p.value}</Typography>
                    ),
                  },
                  {
                    field: 'description', headerName: 'Description', flex: 1, minWidth: 160,
                    renderCell: (p) => (
                      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.74rem', color: 'text.primary' }}>{p.value || '—'}</Typography>
                    ),
                  },
                  {
                    field: 'active', headerName: 'Active', width: 110,
                    renderCell: (p) => p.value
                      ? <Chip label="Active" size="small" sx={{ bgcolor: 'rgba(107,143,113,0.14)', color: COLOR_ON, fontFamily: '"Raleway", sans-serif', fontSize: '0.58rem', height: 20 }} />
                      : <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled' }}>—</Typography>,
                  },
                ]}
              />
            </Card>
          )}
        </>
      )}
    </Box>
  )
}
