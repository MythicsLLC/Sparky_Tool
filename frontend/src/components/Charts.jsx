import { Paper, Typography, Box } from '@mui/material'
import { BarChart, PieChart } from '@mui/x-charts'
import { useThemeContext } from '../ThemeContext'

const LEGEND_SLOT = {
  direction: 'row',
  position: { vertical: 'bottom', horizontal: 'center' },
  itemMarkWidth: 8,
  itemMarkHeight: 8,
  markGap: 4,
  itemGap: 14,
  labelStyle: { fontSize: 10, fontFamily: '"Raleway", sans-serif' },
}

function SectionLabel({ title, badge }) {
  const { accent } = useThemeContext()
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ width: 2, height: 20, background: `linear-gradient(180deg, ${accent} 0%, ${accent}18 100%)` }} />
        <Typography sx={{
          fontFamily: '"Cormorant Garamond", serif',
          fontWeight: 600, fontSize: '1.1rem',
          letterSpacing: '0.04em', color: 'text.primary',
        }}>
          {title}
        </Typography>
      </Box>
      <Box sx={{
        px: 1.2, py: 0.3,
        border: `1px solid ${accent}2e`,
        fontSize: '0.55rem', letterSpacing: '0.2em',
        color: 'text.secondary',
        fontFamily: '"Raleway", sans-serif', fontWeight: 700,
      }}>
        {badge}
      </Box>
    </Box>
  )
}

export default function Charts({ kpis = {} }) {
  const { accent, mode } = useThemeContext()
  const dark = mode === 'dark'

  const textPrimary = dark ? '#ede8d0' : '#1a1814'
  const textMuted   = dark ? '#5a5040' : '#8a7e6e'
  const borderColor = dark ? `${accent}14` : `${accent}22`
  const tickLabelStyle = {
    fontSize: 11,
    fontFamily: '"Raleway", sans-serif',
    fill: textMuted,
  }

  const PALETTE = [accent, textMuted, textPrimary, `${accent}99`, `${accent}66`, `${accent}44`]

  const numeric     = Object.entries(kpis).filter(([, v]) => v.type === 'numeric')
  const categorical = Object.entries(kpis).filter(([, v]) => v.type === 'categorical')

  const barData = numeric.map(([col, s]) => ({
    name: col,
    Mean: parseFloat(s.mean.toFixed(2)),
    Min:  parseFloat(s.min.toFixed(2)),
    Max:  parseFloat(s.max.toFixed(2)),
  }))

  const cardSx = (delay = 0) => ({
    bgcolor: 'background.paper',
    border: `1px solid ${borderColor}`,
    borderRadius: '3px',
    p: 3,
    transition: 'border-color 0.28s ease, box-shadow 0.28s ease',
    '&:hover': {
      borderColor: `${accent}2e`,
      boxShadow: `0 4px 20px ${accent}0a`,
    },
    '@keyframes chartEnter': {
      from: { opacity: 0, transform: 'translateY(16px)' },
      to:   { opacity: 1, transform: 'none' },
    },
    animation: 'chartEnter 0.5s cubic-bezier(0.16,1,0.3,1) both',
    animationDelay: `${delay}ms`,
  })

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {barData.length > 0 && (
        <Paper elevation={0} sx={cardSx(0)}>
          <SectionLabel title="Numeric Summary" badge="BAR CHART" />
          <BarChart
            height={320}
            skipAnimation={false}
            dataset={barData}
            xAxis={[{ dataKey: 'name', scaleType: 'band', tickLabelStyle }]}
            yAxis={[{ tickLabelStyle }]}
            series={[
              { dataKey: 'Mean', label: 'Mean', color: accent },
              { dataKey: 'Min',  label: 'Min',  color: `${accent}55` },
              { dataKey: 'Max',  label: 'Max',  color: textPrimary },
            ]}
            margin={{ top: 12, right: 20, bottom: 28, left: 44 }}
            grid={{ horizontal: true }}
            slotProps={{ legend: LEGEND_SLOT }}
          />
        </Paper>
      )}

      {categorical.map(([col, stats], i) => {
        const pieData = Object.entries(stats.value_counts).map(([name, value], idx) => ({
          id: idx, label: name, value, color: PALETTE[idx % PALETTE.length],
        }))
        const total = pieData.reduce((s, d) => s + d.value, 0)
        return (
          <Paper key={col} elevation={0} sx={cardSx((i + 1) * 90)}>
            <SectionLabel title={`${col} — Distribution`} badge="PIE CHART" />
            <PieChart
              height={320}
              skipAnimation={false}
              series={[{
                data: pieData,
                outerRadius: 118, innerRadius: 52, paddingAngle: 3,
                arcLabel: (item) => total
                  ? `${((item.value / total) * 100).toFixed(0)}%`
                  : item.label,
                arcLabelMinAngle: 18,
              }]}
              sx={{
                '& .MuiPieArcLabel-root': {
                  fontSize: 10, fill: textMuted,
                  fontFamily: '"Raleway", sans-serif',
                },
              }}
              slotProps={{ legend: LEGEND_SLOT }}
            />
          </Paper>
        )
      })}
    </Box>
  )
}
