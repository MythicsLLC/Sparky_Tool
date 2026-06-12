import { useTheme } from '@mui/material/styles'
import { Box, Typography, Card, CardContent } from '@mui/material'
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

export const PALETTE = ['#6b8f71','#6495b4','#c9a84c','#b45050','#9b59b6','#e67e22','#1abc9c','#e74c3c']
const pal = (i) => PALETTE[i % PALETTE.length]

export const TYPE_LABELS = {
  bar: 'Bar', line: 'Line', area: 'Area',
  pie: 'Pie', radialBar: 'Gauge', scatter: 'Scatter',
}

// ── Key stat derivation ────────────────────────────────────────────────────────

function _deriveKeyStats(spec) {
  const { type, data = [], dataKey = 'value', nameKey = 'name', xKey, yKeys = [], colors = PALETTE } = spec
  const c = (i) => colors[i] || pal(i)

  if (type === 'pie' || type === 'radialBar') {
    const total = data.reduce((s, d) => s + (Number(d[dataKey]) || 0), 0)
    return [...data]
      .sort((a, b) => (Number(b[dataKey]) || 0) - (Number(a[dataKey]) || 0))
      .slice(0, 4)
      .map((d, i) => {
        const val = Number(d[dataKey]) || 0
        const pct = total > 0 ? Math.round((val / total) * 100) : val
        return { label: String(d[nameKey] || ''), value: `${pct}%`, raw: val, color: c(data.indexOf(d)) }
      })
  }

  if (type === 'bar' || type === 'line' || type === 'area') {
    const yKey = yKeys[0]
    if (!yKey || !data.length) return []
    const total = data.reduce((s, d) => s + (Number(d[yKey]) || 0), 0)
    const sorted = [...data].sort((a, b) => (Number(b[yKey]) || 0) - (Number(a[yKey]) || 0))
    const top = sorted[0]
    const stats = [
      { label: 'Total', value: total >= 1000 ? `${(total / 1000).toFixed(1)}k` : total.toLocaleString(), color: c(0) },
    ]
    if (top && xKey && top[xKey]) {
      stats.push({ label: String(top[xKey]).slice(0, 18), value: String(top[yKey] || ''), color: c(1) })
    }
    return stats
  }

  return []
}

// ── Custom pie label — only shown for slices ≥ 6% ─────────────────────────────

const _renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
  if (percent < 0.06) return null
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: 10, fontWeight: 700, fontFamily: '"Raleway", sans-serif' }}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

// ── DynamicChart ───────────────────────────────────────────────────────────────

export function DynamicChart({ spec }) {
  const { type, data = [], xKey, yKeys = [], nameKey = 'name', dataKey = 'value', colors = PALETTE } = spec
  const c = (i) => colors[i] || pal(i)
  const theme = useTheme()
  const dark  = theme.palette.mode === 'dark'
  const paper = dark ? '#111316' : '#ffffff'
  const tooltipBorder = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'
  const gridColor     = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'
  const axisColor     = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)'
  const tooltipStyle  = {
    fontSize: 11, background: paper,
    border: `1px solid ${tooltipBorder}`,
    borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
    fontFamily: '"Raleway", sans-serif',
  }

  if (!data.length) {
    return (
      <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>No data</Typography>
      </Box>
    )
  }

  if (type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            dataKey={dataKey}
            nameKey={nameKey}
            cx="50%" cy="48%"
            outerRadius={88} innerRadius={44}
            paddingAngle={2}
            labelLine={false}
            label={_renderPieLabel}
            isAnimationActive={false}
          >
            {data.map((_, i) => <Cell key={i} fill={c(i)} />)}
          </Pie>
          <ChartTooltip
            contentStyle={tooltipStyle}
            formatter={(v, name) => [Number(v).toLocaleString(), name]}
          />
          <Legend
            iconSize={8}
            iconType="circle"
            wrapperStyle={{ fontSize: 10, fontFamily: '"Raleway", sans-serif', paddingTop: 8 }}
            formatter={(value) => (
              <span style={{ color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.65)', fontSize: 10 }}>
                {String(value).length > 22 ? String(value).slice(0, 22) + '…' : value}
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (type === 'radialBar') {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <RadialBarChart data={data} innerRadius={24} outerRadius={100} cx="50%" cy="50%">
          <RadialBar background dataKey={dataKey} label={{ position: 'insideStart', fill: '#fff', fontSize: 10 }}>
            {data.map((_, i) => <Cell key={i} fill={c(i)} />)}
          </RadialBar>
          <Legend
            iconSize={8} iconType="circle"
            wrapperStyle={{ fontSize: 10, fontFamily: '"Raleway", sans-serif' }}
          />
          <ChartTooltip
            contentStyle={tooltipStyle}
            formatter={(v) => [`${v}%`, '']}
          />
        </RadialBarChart>
      </ResponsiveContainer>
    )
  }

  if (type === 'scatter') {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="x" type="number" name={xKey} tick={{ fontSize: 10, fill: axisColor }} />
          <YAxis dataKey="y" type="number" name={yKeys[0] || 'y'} tick={{ fontSize: 10, fill: axisColor }} />
          <ZAxis range={[38, 38]} />
          <ChartTooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={tooltipStyle} />
          <Scatter data={data} fill={c(0)} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    )
  }

  const safeYKeys    = yKeys.length ? yKeys : Object.keys(data[0] || {}).filter((k) => k !== xKey)
  const ChartWrapper = type === 'line' ? LineChart : type === 'area' ? AreaChart : BarChart

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ChartWrapper data={data} margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 9, fill: axisColor, fontFamily: '"Raleway", sans-serif' }}
          interval="preserveStartEnd"
          tickLine={false}
          axisLine={{ stroke: gridColor }}
          angle={data.length > 8 ? -30 : 0}
          textAnchor={data.length > 8 ? 'end' : 'middle'}
        />
        <YAxis
          tick={{ fontSize: 9, fill: axisColor, fontFamily: '"Raleway", sans-serif' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
        />
        <ChartTooltip contentStyle={tooltipStyle} />
        {safeYKeys.length > 1 && (
          <Legend
            iconSize={8} iconType="circle"
            wrapperStyle={{ fontSize: 10, fontFamily: '"Raleway", sans-serif' }}
          />
        )}
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
                stroke={c(i)} fill={c(i)} fillOpacity={0.18} strokeWidth={2}
                dot={false} isAnimationActive={false}
              />
            )
          }
          return (
            <Bar key={key} dataKey={key} fill={c(i)} radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={52} />
          )
        })}
      </ChartWrapper>
    </ResponsiveContainer>
  )
}

// ── ChartCard ──────────────────────────────────────────────────────────────────

export function ChartCard({ spec }) {
  const theme  = useTheme()
  const accent = theme.palette.primary.main
  const dark   = theme.palette.mode === 'dark'
  const keyStats = _deriveKeyStats(spec)

  return (
    <Card variant="outlined" sx={{
      bgcolor: 'background.paper',
      borderColor: 'divider',
      borderTop: `2px solid ${accent}55`,
      height: '100%',
      transition: 'box-shadow 0.2s ease',
      '&:hover': { boxShadow: `0 4px 20px ${accent}18` },
    }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2 } }}>

        {/* Title + description */}
        <Box sx={{ mb: keyStats.length ? 1.5 : 2 }}>
          <Typography sx={{
            fontFamily: '"Cormorant Garamond", serif',
            fontWeight: 600, fontSize: '0.95rem',
            color: 'text.primary', lineHeight: 1.3, mb: 0.4,
          }}>
            {spec.title}
          </Typography>
          {spec.description && (
            <Typography sx={{
              fontSize: '0.65rem', color: 'text.disabled',
              lineHeight: 1.5, fontFamily: '"Raleway", sans-serif',
            }}>
              {spec.description}
            </Typography>
          )}
        </Box>

        {/* Key stat callouts */}
        {keyStats.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
            {keyStats.map(({ label, value, color }) => (
              <Box key={label} sx={{
                display: 'flex', alignItems: 'center', gap: 0.6,
                px: 1.25, py: 0.5,
                bgcolor: `${color}12`,
                border: `1px solid ${color}28`,
                borderRadius: '3px',
              }}>
                <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
                <Typography sx={{
                  fontSize: '0.6rem', color: dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)',
                  fontFamily: '"Raleway", sans-serif',
                  maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {label}
                </Typography>
                <Typography sx={{
                  fontSize: '0.68rem', fontWeight: 700, color,
                  fontFamily: '"Raleway", sans-serif', flexShrink: 0,
                }}>
                  {value}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        <DynamicChart spec={spec} />

      </CardContent>
    </Card>
  )
}
