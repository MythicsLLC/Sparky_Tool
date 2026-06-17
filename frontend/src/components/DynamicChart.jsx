import { useState, useCallback } from 'react'
import { useTheme } from '@mui/material/styles'
import {
  Box, Typography, Card, CardContent, Chip,
  ToggleButtonGroup, ToggleButton, Tooltip,
} from '@mui/material'
import { BarChart, LineChart, PieChart, ScatterChart, Gauge, gaugeClasses } from '@mui/x-charts'
import BarChartIcon          from '@mui/icons-material/BarChart'
import ShowChartIcon         from '@mui/icons-material/ShowChart'
import StackedLineChartIcon  from '@mui/icons-material/StackedLineChart'
import PieChartOutlineIcon   from '@mui/icons-material/PieChartOutline'

export const PALETTE = ['#6b8f71','#6495b4','#c9a84c','#b45050','#9b59b6','#e67e22','#1abc9c','#e74c3c']
const pal = (i) => PALETTE[i % PALETTE.length]

export const TYPE_LABELS = {
  bar: 'Bar', line: 'Line', area: 'Area',
  pie: 'Pie', radialBar: 'Gauge', scatter: 'Scatter',
}

const TYPE_ICONS = {
  bar:  BarChartIcon,
  line: ShowChartIcon,
  area: StackedLineChartIcon,
  pie:  PieChartOutlineIcon,
}

const SWITCHABLE_TYPES = ['bar', 'line', 'area', 'pie']
const STORAGE_KEY = 'sparky_chart_type_overrides'

function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }
  catch { return {} }
}

function useChartTypeOverride(chartId, defaultType) {
  const [type, setType] = useState(() => loadOverrides()[chartId] ?? defaultType)

  const setOverride = useCallback((newType) => {
    setType(newType)
    try {
      const overrides = loadOverrides()
      overrides[chartId] = newType
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
    } catch {}
  }, [chartId])

  return [type, setOverride]
}

const LEGEND_SLOT = {
  direction: 'row',
  position: { vertical: 'bottom', horizontal: 'center' },
  itemMarkWidth: 8,
  itemMarkHeight: 8,
  markGap: 4,
  itemGap: 14,
  labelStyle: { fontSize: 10, fontFamily: '"Raleway", sans-serif' },
}

export function DynamicChart({ spec, typeOverride }) {
  const {
    type: specType, data = [],
    xKey, yKeys = [],
    nameKey = 'name', dataKey = 'value',
    colors = PALETTE,
  } = spec
  const type = typeOverride ?? specType
  const c = (i) => colors[i] || pal(i)
  const theme = useTheme()
  const tickLabelStyle = { fontSize: 10, fontFamily: theme.typography.fontFamily, fill: theme.palette.text.secondary }

  if (!data.length) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>No data</Typography>
      </Box>
    )
  }

  // When switching to pie from bar-shaped data, resolve name/value keys
  const pieNameKey = xKey || nameKey
  const pieDataKey = yKeys[0] || dataKey

  if (type === 'pie') {
    const pieRows = data.map((d, i) => ({
      id: i,
      value: Number(d[pieDataKey]) || 0,
      label: String(d[pieNameKey] ?? i),
      color: c(i),
    }))
    const total = pieRows.reduce((s, d) => s + d.value, 0)
    return (
      <PieChart
        height={290}
        skipAnimation={false}
        series={[{
          data: pieRows,
          innerRadius: 52, outerRadius: 104, paddingAngle: 2,
          arcLabel: (item) => total ? `${((item.value / total) * 100).toFixed(0)}%` : '',
          arcLabelMinAngle: 20,
        }]}
        sx={{ '& .MuiPieArcLabel-root': { fontSize: 10, fill: '#fff', fontFamily: '"Raleway", sans-serif' } }}
        slotProps={{ legend: LEGEND_SLOT }}
      />
    )
  }

  if (type === 'radialBar') {
    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center', alignItems: 'center', py: 2, flex: 1 }}>
        {data.map((d, i) => (
          <Box key={i} sx={{ textAlign: 'center', width: 104 }}>
            <Gauge
              width={92} height={92}
              value={Number(d[dataKey]) || 0} valueMax={100}
              text={({ value: v }) => `${v}%`}
              sx={{
                [`& .${gaugeClasses.valueArc}`]: { fill: c(i) },
                [`& .${gaugeClasses.valueText}`]: { fontSize: 14, fontWeight: 700 },
              }}
            />
            <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', mt: 0.5 }}>{d[nameKey]}</Typography>
          </Box>
        ))}
      </Box>
    )
  }

  if (type === 'scatter') {
    return (
      <ScatterChart
        height={290}
        skipAnimation={false}
        series={[{ data: data.map((d, i) => ({ x: d.x, y: d.y, id: i })), color: c(0) }]}
        xAxis={[{ label: xKey, tickLabelStyle }]}
        yAxis={[{ label: yKeys[0] || 'y', tickLabelStyle }]}
        margin={{ top: 12, right: 20, bottom: 42, left: 52 }}
        grid={{ vertical: true, horizontal: true }}
      />
    )
  }

  // bar / line / area — also handles data originally shaped for pie
  const resolvedXKey = xKey || nameKey
  const baseYKeys = yKeys.length
    ? yKeys
    : Object.keys(data[0] || {}).filter((k) => k !== resolvedXKey && k !== nameKey)
  const finalYKeys = baseYKeys.length ? baseYKeys : [dataKey]

  const series = finalYKeys.map((key, i) => ({
    dataKey: key,
    label: key,
    color: c(i),
    ...(type === 'area' ? { area: true, showMark: false } : {}),
  }))

  const ChartComp = type === 'line' || type === 'area' ? LineChart : BarChart

  return (
    <ChartComp
      height={290}
      skipAnimation={false}
      dataset={data}
      xAxis={[{ dataKey: resolvedXKey, scaleType: type === 'bar' ? 'band' : 'point', tickLabelStyle }]}
      yAxis={[{ tickLabelStyle }]}
      series={series}
      margin={{ top: 12, right: 20, bottom: 28, left: 44 }}
      grid={{ horizontal: true }}
      slotProps={{ legend: { ...LEGEND_SLOT, hidden: finalYKeys.length <= 1 } }}
    />
  )
}

export function ChartCard({ spec, index = 0 }) {
  const theme  = useTheme()
  const accent = theme.palette.primary.main
  const chartId = spec.id || spec.title
  const isSwitchable = SWITCHABLE_TYPES.includes(spec.type)
  const [type, setType] = useChartTypeOverride(chartId, spec.type)

  return (
    <Card
      variant="outlined"
      sx={{
        bgcolor: 'background.paper',
        borderColor: 'divider',
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 0.28s ease, box-shadow 0.28s ease',
        '&:hover': {
          borderColor: `${accent}44`,
          boxShadow: `0 6px 28px ${accent}12`,
        },
        '@keyframes cardSlideIn': {
          from: { opacity: 0, transform: 'translateY(22px)' },
          to:   { opacity: 1, transform: 'none' },
        },
        animation: 'cardSlideIn 0.5s cubic-bezier(0.16,1,0.3,1) both',
        animationDelay: `${index * 75}ms`,
      }}
    >
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2 }, display: 'flex', flexDirection: 'column', flex: 1 }}>

        {/* ── Title & description ─────────────────────────────────────────── */}
        <Box sx={{ mb: 1.5 }}>
          <Typography sx={{
            fontFamily: '"Raleway", sans-serif', fontWeight: 700,
            fontSize: '0.84rem', lineHeight: 1.3, mb: 0.4,
            color: 'text.primary',
          }}>
            {spec.title}
          </Typography>
          {spec.description && (
            <Typography sx={{
              fontSize: '0.67rem', color: 'text.secondary',
              lineHeight: 1.6, fontFamily: '"Raleway", sans-serif',
            }}>
              {spec.description}
            </Typography>
          )}
        </Box>

        {/* ── Type switcher + current-type badge ─────────────────────────── */}
        <Box sx={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1.75, pb: 1.5,
          borderBottom: `1px solid ${accent}12`,
        }}>
          {isSwitchable ? (
            <ToggleButtonGroup
              size="small"
              exclusive
              value={type}
              onChange={(_, val) => val && setType(val)}
              sx={{
                '& .MuiToggleButton-root': {
                  px: 0.9, py: 0.35,
                  border: `1px solid ${accent}20`,
                  color: 'text.disabled',
                  fontSize: 0,
                  borderRadius: '4px !important',
                  transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
                  '&.Mui-selected': {
                    bgcolor: `${accent}16`,
                    color: accent,
                    borderColor: `${accent}44`,
                  },
                  '&:hover': { bgcolor: `${accent}0c`, color: accent },
                },
                '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
                  ml: '4px', borderLeft: `1px solid ${accent}20 !important`,
                },
              }}
            >
              {SWITCHABLE_TYPES.map((t) => {
                const Icon = TYPE_ICONS[t]
                return (
                  <Tooltip key={t} title={TYPE_LABELS[t]} placement="top" arrow>
                    <ToggleButton value={t} aria-label={TYPE_LABELS[t]}>
                      <Icon sx={{ fontSize: 14 }} />
                    </ToggleButton>
                  </Tooltip>
                )
              })}
            </ToggleButtonGroup>
          ) : (
            <Box />
          )}

          <Chip
            label={TYPE_LABELS[type] || type}
            size="small"
            sx={{
              bgcolor: `${accent}14`, color: accent,
              fontFamily: '"Raleway", sans-serif',
              fontSize: '0.57rem', fontWeight: 700,
              letterSpacing: '0.07em', height: 18,
            }}
          />
        </Box>

        {/* ── Chart area — flex-grows to fill remaining card height ──────── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 240 }}>
          <DynamicChart spec={spec} typeOverride={type} />
        </Box>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <Box sx={{ pt: 1, mt: 0.5, borderTop: `1px solid ${accent}0e`, textAlign: 'right' }}>
          <Typography sx={{
            fontSize: '0.58rem', color: 'text.disabled',
            fontFamily: '"Raleway", sans-serif',
          }}>
            {(spec.data || []).length} data points
          </Typography>
        </Box>

      </CardContent>
    </Card>
  )
}
