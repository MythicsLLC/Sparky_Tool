import { useTheme } from '@mui/material/styles'
import { Box, Typography, Card, CardContent, Chip } from '@mui/material'
import { BarChart, LineChart, PieChart, ScatterChart, Gauge, gaugeClasses } from '@mui/x-charts'

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
  const tickLabelStyle = { fontSize: 10, fontFamily: theme.typography.fontFamily }

  if (!data.length) {
    return (
      <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>No data</Typography>
      </Box>
    )
  }

  if (type === 'pie') {
    const total = data.reduce((sum, d) => sum + (Number(d[dataKey]) || 0), 0)
    return (
      <PieChart
        height={260}
        series={[{
          data: data.map((d, i) => ({ id: i, value: Number(d[dataKey]) || 0, label: d[nameKey], color: c(i) })),
          innerRadius: 42, outerRadius: 95, paddingAngle: 2,
          arcLabel: (item) => total ? `${((item.value / total) * 100).toFixed(0)}%` : '',
          arcLabelMinAngle: 18,
        }]}
        sx={{ '& .MuiPieArcLabel-root': { fontSize: 10, fill: '#fff' } }}
        slotProps={{ legend: { hidden: false, direction: 'row', position: { vertical: 'bottom', horizontal: 'center' } } }}
      />
    )
  }

  if (type === 'radialBar') {
    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center', alignItems: 'center', py: 1 }}>
        {data.map((d, i) => {
          const value = Number(d[dataKey]) || 0
          return (
            <Box key={i} sx={{ textAlign: 'center', width: 104 }}>
              <Gauge
                width={92} height={92}
                value={value} valueMax={100}
                text={({ value: v }) => `${v}%`}
                sx={{
                  [`& .${gaugeClasses.valueArc}`]: { fill: c(i) },
                  [`& .${gaugeClasses.valueText}`]: { fontSize: 14, fontWeight: 700 },
                }}
              />
              <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', mt: 0.5 }}>{d[nameKey]}</Typography>
            </Box>
          )
        })}
      </Box>
    )
  }

  if (type === 'scatter') {
    return (
      <ScatterChart
        height={260}
        series={[{
          data: data.map((d, i) => ({ x: d.x, y: d.y, id: i })),
          color: c(0),
        }]}
        xAxis={[{ label: xKey, tickLabelStyle }]}
        yAxis={[{ label: yKeys[0] || 'y', tickLabelStyle }]}
        margin={{ top: 8, right: 16, bottom: 36, left: 50 }}
        grid={{ vertical: true, horizontal: true }}
      />
    )
  }

  const safeYKeys = yKeys.length ? yKeys : Object.keys(data[0] || {}).filter((k) => k !== xKey)
  const series = safeYKeys.map((key, i) => ({
    dataKey: key,
    label: key,
    color: c(i),
    ...(type === 'area' ? { area: true, showMark: false } : {}),
  }))
  const ChartComponent = type === 'line' || type === 'area' ? LineChart : BarChart

  return (
    <ChartComponent
      height={260}
      dataset={data}
      xAxis={[{ dataKey: xKey, scaleType: type === 'bar' ? 'band' : 'point', tickLabelStyle }]}
      yAxis={[{ tickLabelStyle }]}
      series={series}
      margin={{ top: 8, right: 16, bottom: 24, left: 40 }}
      grid={{ horizontal: true }}
      slotProps={{ legend: { hidden: safeYKeys.length <= 1 } }}
    />
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
