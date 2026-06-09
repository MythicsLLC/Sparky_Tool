import { Paper, Typography, Box } from '@mui/material'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts'
import { useThemeContext } from '../ThemeContext'

export default function Charts({ kpis = {} }) {
  const { accent, mode } = useThemeContext()
  const dark = mode === 'dark'

  const paper        = dark ? '#111316' : '#ffffff'
  const textPrimary  = dark ? '#ede8d0' : '#1a1814'
  const textMuted    = dark ? '#5a5040' : '#8a7e6e'
  const textDisabled = dark ? '#3a3428' : '#b0a898'
  const gridStroke   = dark ? `${accent}08` : `${accent}12`
  const borderColor  = dark ? `${accent}14` : `${accent}22`

  const PALETTE = [accent, textMuted, textPrimary, `${accent}99`, `${accent}66`, `${accent}44`]

  const tooltipStyle = {
    contentStyle: {
      background: paper,
      border: `1px solid ${accent}2e`,
      borderRadius: 2,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 12,
      color: textPrimary,
      boxShadow: dark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 4px 16px rgba(0,0,0,0.12)',
    },
    labelStyle: { color: textMuted, letterSpacing: '0.06em' },
    cursor: { fill: `${accent}05` },
  }

  const axisStyle = {
    tick: { fill: textDisabled, fontSize: 11, fontFamily: '"JetBrains Mono", monospace' },
    axisLine: { stroke: `${accent}12` },
    tickLine: { stroke: `${accent}12` },
  }

  const numeric     = Object.entries(kpis).filter(([, v]) => v.type === 'numeric')
  const categorical = Object.entries(kpis).filter(([, v]) => v.type === 'categorical')

  const barData = numeric.map(([col, s]) => ({
    name: col,
    Mean: parseFloat(s.mean.toFixed(2)),
    Min:  parseFloat(s.min.toFixed(2)),
    Max:  parseFloat(s.max.toFixed(2)),
  }))

  const renderPieLabel = ({ name, percent, x, y }) => (
    <text x={x} y={y} fill={textMuted} fontSize={10} textAnchor="middle" dominantBaseline="central"
      fontFamily='"JetBrains Mono", monospace'>
      {`${name} ${(percent * 100).toFixed(0)}%`}
    </text>
  )

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
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="name" {...axisStyle} />
              <YAxis {...axisStyle} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontFamily: '"Raleway", sans-serif', fontSize: 11, color: textMuted, paddingTop: 12 }} />
              <Bar dataKey="Mean" fill={accent}              radius={[2,2,0,0]} />
              <Bar dataKey="Min"  fill={`${accent}55`}       radius={[2,2,0,0]} />
              <Bar dataKey="Max"  fill={textPrimary}         radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Paper>
      )}

      {categorical.map(([col, stats], i) => {
        const pieData = Object.entries(stats.value_counts).map(([name, value]) => ({ name, value }))
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
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={110} innerRadius={50} paddingAngle={3} labelLine={false} label={renderPieLabel}>
                  {pieData.map((_, idx) => <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        )
      })}
    </Box>
  )
}
