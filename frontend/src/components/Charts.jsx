import { Paper, Typography, Box } from '@mui/material'
import { BarChart, PieChart } from '@mui/x-charts'
import { useThemeContext } from '../ThemeContext'

export default function Charts({ kpis = {} }) {
  const { accent, mode } = useThemeContext()
  const dark = mode === 'dark'

  const textPrimary  = dark ? '#ede8d0' : '#1a1814'
  const textMuted    = dark ? '#5a5040' : '#8a7e6e'
  const borderColor  = dark ? `${accent}14` : `${accent}22`
  const tickLabelStyle = { fontSize: 11, fontFamily: '"JetBrains Mono", monospace' }

  const PALETTE = [accent, textMuted, textPrimary, `${accent}99`, `${accent}66`, `${accent}44`]

  const numeric     = Object.entries(kpis).filter(([, v]) => v.type === 'numeric')
  const categorical = Object.entries(kpis).filter(([, v]) => v.type === 'categorical')

  const barData = numeric.map(([col, s]) => ({
    name: col,
    Mean: parseFloat(s.mean.toFixed(2)),
    Min:  parseFloat(s.min.toFixed(2)),
    Max:  parseFloat(s.max.toFixed(2)),
  }))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {barData.length > 0 && (
        <Paper sx={{
          bgcolor: 'background.paper',
          border: `1px solid ${borderColor}`,
          borderRadius: '2px',
          p: 3,
          '@keyframes chartEnter': { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
          animation: 'chartEnter 0.5s cubic-bezier(0.16,1,0.3,1) both',
          transition: 'border-color 0.25s ease',
          '&:hover': { borderColor: `${accent}2e` },
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ width: 1, height: 20, background: `linear-gradient(180deg, ${accent} 0%, ${accent}18 100%)` }} />
              <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontWeight: 600, fontSize: '1.1rem', letterSpacing: '0.04em', color: 'text.primary' }}>
                Numeric Summary
              </Typography>
            </Box>
            <Box sx={{ px: 1.2, py: 0.3, border: `1px solid ${accent}2e`, fontSize: '0.55rem', letterSpacing: '0.2em', color: 'text.secondary', fontFamily: '"Raleway", sans-serif', fontWeight: 700 }}>
              BAR CHART
            </Box>
          </Box>
          <BarChart
            height={300}
            dataset={barData}
            xAxis={[{ dataKey: 'name', scaleType: 'band', tickLabelStyle }]}
            yAxis={[{ tickLabelStyle }]}
            series={[
              { dataKey: 'Mean', label: 'Mean', color: accent },
              { dataKey: 'Min',  label: 'Min',  color: `${accent}55` },
              { dataKey: 'Max',  label: 'Max',  color: textPrimary },
            ]}
            margin={{ top: 8, right: 16, bottom: 24, left: 8 }}
            grid={{ horizontal: true }}
            slotProps={{ legend: { direction: 'row', position: { vertical: 'bottom', horizontal: 'center' } } }}
          />
        </Paper>
      )}

      {categorical.map(([col, stats], i) => {
        const pieData = Object.entries(stats.value_counts).map(([name, value], idx) => ({
          id: idx, label: name, value, color: PALETTE[idx % PALETTE.length],
        }))
        return (
          <Paper key={col} sx={{
            bgcolor: 'background.paper',
            border: `1px solid ${borderColor}`,
            borderRadius: '2px',
            p: 3,
            '@keyframes chartEnter': { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
            animation: 'chartEnter 0.5s cubic-bezier(0.16,1,0.3,1) both',
            animationDelay: `${(i + 1) * 100}ms`,
            transition: 'border-color 0.25s ease',
            '&:hover': { borderColor: `${accent}2e` },
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ width: 1, height: 20, background: `linear-gradient(180deg, ${accent} 0%, ${accent}18 100%)` }} />
                <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontWeight: 600, fontSize: '1.1rem', letterSpacing: '0.04em', color: 'text.primary' }}>
                  {col} — Distribution
                </Typography>
              </Box>
              <Box sx={{ px: 1.2, py: 0.3, border: `1px solid ${accent}2e`, fontSize: '0.55rem', letterSpacing: '0.2em', color: 'text.secondary', fontFamily: '"Raleway", sans-serif', fontWeight: 700 }}>
                PIE CHART
              </Box>
            </Box>
            <PieChart
              height={300}
              series={[{
                data: pieData,
                outerRadius: 110, innerRadius: 50, paddingAngle: 3,
                arcLabel: (item) => {
                  const total = pieData.reduce((s, d) => s + d.value, 0)
                  return total ? `${item.label} ${((item.value / total) * 100).toFixed(0)}%` : item.label
                },
              }]}
              sx={{ '& .MuiPieArcLabel-root': { fontSize: 10, fill: textMuted, fontFamily: '"JetBrains Mono", monospace' } }}
            />
          </Paper>
        )
      })}
    </Box>
  )
}
