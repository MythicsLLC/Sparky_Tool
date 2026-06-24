import { memo } from 'react'
import { Grid, Card, Typography, Box } from '@mui/material'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import { useThemeContext } from '../ThemeContext'

function fmt(n) {
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + 'K'
  return n.toFixed(2)
}

function KPICards({ kpis = {} }) {
  const { accent, mode } = useThemeContext()
  const dark = mode === 'dark'

  const textMuted    = dark ? '#5a5040' : '#8a7e6e'
  const textDisabled = dark ? '#3a3428' : '#b0a898'
  const textSub      = dark ? '#7a7060' : '#6b6050'

  const numeric = Object.entries(kpis).filter(([, v]) => v.type === 'numeric')

  return (
    <Grid container spacing={2.5}>
      {numeric.map(([col, stats], index) => {
        const range   = stats.max - stats.min
        const meanPct = range > 0 ? ((stats.mean - stats.min) / range) * 100 : 50

        return (
          <Grid item xs={12} sm={6} md={4} lg={3} key={col}>
            <Card sx={{
              height: '100%',
              bgcolor: 'background.paper',
              border: `1px solid ${accent}18`,
              borderTop: `2px solid ${accent}55`,
              borderRadius: '2px',
              position: 'relative',
              overflow: 'hidden',
              cursor: 'default',
              '@keyframes cardEnter': {
                from: { opacity: 0, transform: 'translateY(16px)' },
                to:   { opacity: 1, transform: 'translateY(0)' },
              },
              animation: 'cardEnter 0.5s cubic-bezier(0.16,1,0.3,1) both',
              animationDelay: `${index * 60}ms`,
              transition: 'border-color 0.25s ease, box-shadow 0.25s ease',
              '&:hover': {
                borderColor: `${accent}33`,
                boxShadow: dark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 4px 20px rgba(0,0,0,0.1)',
              },
            }}>
              {/* Corner accent glow */}
              <Box sx={{
                position: 'absolute', top: 0, right: 0,
                width: 40, height: 40,
                background: `linear-gradient(225deg, ${accent}0a 0%, transparent 60%)`,
                pointerEvents: 'none',
              }} />

              <Box sx={{ p: 2.5 }}>
                <Typography sx={{
                  fontFamily: '"Raleway", sans-serif',
                  fontSize: '0.7rem', fontWeight: 700,
                  letterSpacing: '0.26em', color: textMuted,
                  textTransform: 'uppercase', mb: 2.5,
                }}>
                  {col}
                </Typography>

                <Typography sx={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '2rem', fontWeight: 600,
                  color: accent, lineHeight: 1, mb: 0.3,
                }}>
                  {fmt(stats.mean)}
                </Typography>
                <Typography sx={{
                  fontFamily: '"Raleway", sans-serif',
                  fontSize: '0.68rem', letterSpacing: '0.18em',
                  color: textDisabled, textTransform: 'uppercase', mb: 2.5,
                }}>
                  Average
                </Typography>

                {/* Range bar */}
                <Box sx={{ mb: 2.5 }}>
                  <Box sx={{
                    height: 2,
                    bgcolor: `${accent}12`,
                    position: 'relative', overflow: 'hidden',
                  }}>
                    <Box sx={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${meanPct}%`,
                      background: `linear-gradient(90deg, ${accent}44, ${accent})`,
                    }} />
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75 }}>
                    <Typography sx={{ fontSize: '0.6rem', color: textDisabled, fontFamily: '"JetBrains Mono", monospace' }}>
                      {fmt(stats.min)}
                    </Typography>
                    <Typography sx={{ fontSize: '0.6rem', color: textDisabled, fontFamily: '"JetBrains Mono", monospace' }}>
                      {fmt(stats.max)}
                    </Typography>
                  </Box>
                </Box>

                {/* Count + Sum */}
                <Box sx={{ borderTop: `1px solid ${accent}0f`, pt: 1.5, mb: 1.5 }}>
                  {[
                    { label: 'Count', value: stats.count.toLocaleString() },
                    { label: 'Sum',   value: fmt(stats.sum) },
                  ].map(({ label, value }) => (
                    <Box key={label} sx={{
                      display: 'flex', justifyContent: 'space-between',
                      py: 0.5,
                      borderBottom: `1px solid ${accent}08`,
                      '&:last-child': { borderBottom: 'none' },
                    }}>
                      <Typography sx={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: textDisabled, textTransform: 'uppercase', fontFamily: '"Raleway", sans-serif' }}>
                        {label}
                      </Typography>
                      <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, fontFamily: '"JetBrains Mono", monospace', color: textSub }}>
                        {value}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                {/* Min / Max chips */}
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Box sx={{ flex: 1, p: 1, border: `1px solid ${accent}18`, bgcolor: `${accent}05` }}>
                    <Typography sx={{ fontSize: '0.52rem', color: textMuted, letterSpacing: '0.12em', fontFamily: '"Raleway", sans-serif', mb: 0.3 }}>
                      MIN
                    </Typography>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: textSub, fontFamily: '"JetBrains Mono", monospace', display: 'flex', alignItems: 'center', gap: 0.3 }}>
                      <TrendingDownIcon sx={{ fontSize: 10 }} />{fmt(stats.min)}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1, p: 1, border: `1px solid ${accent}18`, bgcolor: `${accent}05` }}>
                    <Typography sx={{ fontSize: '0.52rem', color: textMuted, letterSpacing: '0.12em', fontFamily: '"Raleway", sans-serif', mb: 0.3 }}>
                      MAX
                    </Typography>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: accent, fontFamily: '"JetBrains Mono", monospace', display: 'flex', alignItems: 'center', gap: 0.3 }}>
                      <TrendingUpIcon sx={{ fontSize: 10 }} />{fmt(stats.max)}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Card>
          </Grid>
        )
      })}
    </Grid>
  )
}

export default memo(KPICards)
