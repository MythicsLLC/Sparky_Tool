import { useTheme } from '@mui/material/styles'
import { Box, Typography, Card, CardContent, Chip } from '@mui/material'
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

export function DynamicChart({ spec }) {
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

  if (type === 'scatter') {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="x" type="number" name={xKey} tick={{ fontSize: 10 }} />
          <YAxis dataKey="y" type="number" name={yKeys[0] || 'y'} tick={{ fontSize: 10 }} />
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
          return (
            <Bar key={key} dataKey={key} fill={c(i)} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          )
        })}
      </ChartWrapper>
    </ResponsiveContainer>
  )
}

export function ChartCard({ spec }) {
  const theme  = useTheme()
  const accent = theme.palette.primary.main
  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%' }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
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

        <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', mt: 1, textAlign: 'right' }}>
          {(spec.data || []).length} data points
        </Typography>
      </CardContent>
    </Card>
  )
}
