import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Box, Typography, Card, CardContent, Grid, Chip, Button,
  Select, MenuItem, CircularProgress, Alert,
  LinearProgress, Tooltip, Divider, IconButton,
} from '@mui/material'
import FlashOnIcon        from '@mui/icons-material/FlashOn'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import CloudDownloadIcon  from '@mui/icons-material/CloudDownload'
import AutoAwesomeIcon    from '@mui/icons-material/AutoAwesome'
import CheckCircleIcon    from '@mui/icons-material/CheckCircle'
import LockIcon           from '@mui/icons-material/Lock'
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates'
import WarningAmberIcon   from '@mui/icons-material/WarningAmber'
import ReplayIcon         from '@mui/icons-material/Replay'
import StorageIcon        from '@mui/icons-material/Storage'
import TaskAltIcon        from '@mui/icons-material/TaskAlt'
import VerifiedIcon       from '@mui/icons-material/VerifiedUser'
import BarChartIcon       from '@mui/icons-material/BarChart'
import HistoryIcon        from '@mui/icons-material/History'
import ArrowBackIcon      from '@mui/icons-material/ArrowBack'
import {
  runConfig, analyzeRunOutput, listRuns,
  listInsightModels, listConfigs, formatApiError,
  listAnalysisResults, getAnalysisResult, reconstructRunOutput,
} from '../api'
import { useAuth }         from '../AuthContext'
import { useThemeContext } from '../ThemeContext'
import DataTable           from '../components/DataTable'
import MultiSectionReport  from '../components/MultiSectionReport'
import { ChartCard }       from '../components/DynamicChart'

// ── constants ─────────────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Submitting to PeopleSoft', Icon: FlashOnIcon },
  { label: 'PS Job Running',           Icon: HourglassEmptyIcon },
  { label: 'Downloading via FTP',      Icon: CloudDownloadIcon },
  { label: 'AI Analysis',              Icon: AutoAwesomeIcon },
]

function fmtMs(ms) {
  if (!ms) return '—'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`
  return `${(ms / 60000).toFixed(1)} min`
}

// ── AnimatedRings ─────────────────────────────────────────────────────────────

function AnimatedRings({ accent, size = 140 }) {
  const rings = [0, 1, 2]
  return (
    <Box sx={{
      position: 'relative', width: size, height: size,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {rings.map((i) => (
        <Box key={i} sx={{
          position: 'absolute',
          width:  size - i * (size * 0.2),
          height: size - i * (size * 0.2),
          borderRadius: '50%',
          border: `1.5px solid ${accent}`,
          opacity: 0.3 + i * 0.08,
          '@keyframes ringPulse': {
            '0%':   { transform: 'scale(1)',    opacity: 0.3 + i * 0.08 },
            '50%':  { transform: 'scale(1.07)', opacity: 0.65 - i * 0.05 },
            '100%': { transform: 'scale(1)',    opacity: 0.3 + i * 0.08 },
          },
          animation: `ringPulse ${1.6 + i * 0.45}s ease-in-out infinite`,
          animationDelay: `${i * 0.22}s`,
        }} />
      ))}
      <AutoAwesomeIcon sx={{ fontSize: size * 0.26, color: accent, zIndex: 1 }} />
    </Box>
  )
}

// ── StepTracker ───────────────────────────────────────────────────────────────

function StepTracker({ activeStep, completedSteps, accent }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {STEPS.map(({ label, Icon }, i) => {
        const done   = completedSteps.has(i)
        const active = !done && i === activeStep
        return (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: done ? `${accent}20` : active ? `${accent}14` : 'transparent',
              border: `1.5px solid ${done ? accent : active ? `${accent}55` : 'divider'}`,
              transition: 'all 0.3s ease',
            }}>
              {done
                ? <CheckCircleIcon sx={{ fontSize: 14, color: accent }} />
                : <Icon sx={{ fontSize: 14, color: active ? accent : 'text.disabled', transition: 'color 0.3s ease' }} />
              }
            </Box>
            <Typography sx={{
              fontSize: '0.78rem', fontFamily: '"Raleway", sans-serif',
              fontWeight: done || active ? 600 : 400,
              color: done ? 'text.primary' : active ? accent : 'text.disabled',
              transition: 'color 0.3s ease',
              ...(active && {
                '@keyframes stepBlink': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
                animation: 'stepBlink 1.4s ease-in-out infinite',
              }),
            }}>
              {label}
            </Typography>
          </Box>
        )
      })}
    </Box>
  )
}

// ── LoadingView ───────────────────────────────────────────────────────────────

function LoadingView({ activeStep, completedSteps, phase, elapsed, accent, modelName }) {
  const progress = Math.min(95,
    completedSteps.size / STEPS.length * 90 + (phase === 'analysing' ? 12 : 0)
  )
  const phaseLabel = phase === 'analysing'
    ? `Analysing data${modelName ? ` with ${modelName}` : ''}…`
    : 'PeopleSoft run in progress…'
  const mins = Math.floor(elapsed / 60)
  const secs = String(elapsed % 60).padStart(2, '0')

  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: 500, gap: 4, py: 6,
    }}>
      <AnimatedRings accent={accent} />

      <Box sx={{ textAlign: 'center' }}>
        <Typography sx={{
          fontFamily: '"Cormorant Garamond", serif',
          fontSize: '1.25rem', fontWeight: 600, mb: 0.75, color: 'text.primary',
        }}>
          {phaseLabel}
        </Typography>
        <Typography sx={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.72rem', color: 'text.disabled',
        }}>
          {mins}:{secs} elapsed
        </Typography>
      </Box>

      <Box sx={{ width: '100%', maxWidth: 420 }}>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 3, borderRadius: 2,
            bgcolor: `${accent}1a`,
            '& .MuiLinearProgress-bar': { bgcolor: accent, borderRadius: 2 },
          }}
        />
        <Typography sx={{
          fontSize: '0.58rem', color: 'text.disabled',
          fontFamily: '"Raleway", sans-serif',
          letterSpacing: '0.14em', mt: 0.75, textAlign: 'right',
        }}>
          {Math.round(progress)}% COMPLETE
        </Typography>
      </Box>

      <StepTracker activeStep={activeStep} completedSteps={completedSteps} accent={accent} />
    </Box>
  )
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

function SectionHeader({ Icon, label, accent, sub, subColor, mt }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, mt: mt ?? 4 }}>
      <Box sx={{ width: '3px', height: 20, bgcolor: accent, opacity: 0.7, flexShrink: 0, borderRadius: '2px' }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Icon sx={{ fontSize: 16, color: accent }} />
        <Typography sx={{
          fontFamily: '"Cormorant Garamond", serif',
          fontWeight: 600, fontSize: '1.1rem', letterSpacing: '0.04em', color: 'text.primary',
        }}>
          {label}
        </Typography>
        {sub && (
          <Typography sx={{
            fontSize: '0.65rem', fontFamily: '"Raleway", sans-serif',
            color: subColor || 'text.secondary', ml: 0.5,
          }}>
            {sub}
          </Typography>
        )}
      </Box>
    </Box>
  )
}

// ── ExecutiveReportHeader ─────────────────────────────────────────────────────

function ExecutiveReportHeader({ runResult, analysisResult, accent }) {
  const meta        = analysisResult?.meta || {}
  const raw         = meta.filename || runResult?.display_name || runResult?.config_name || 'Workforce Report'
  const reportTitle = raw.replace(/\.csv$/i, '').replace(/[_-]/g, ' ')
  const createdAt   = runResult?.created_at
  const dateLabel   = createdAt
    ? new Date(createdAt).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })
    : new Date().toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })
  const modelLabel  = meta.model_id_str || ''

  return (
    <Box sx={{ mb: 3.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography sx={{
            fontFamily: '"Cormorant Garamond", serif',
            fontSize: '1.65rem', fontWeight: 700, color: 'text.primary', lineHeight: 1.2, mb: 0.6,
            letterSpacing: '0.02em', textTransform: 'capitalize',
          }}>
            {reportTitle}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', fontFamily: '"Raleway", sans-serif' }}>
              {dateLabel}
            </Typography>
            {modelLabel && (
              <Chip label={modelLabel} size="small" sx={{ bgcolor: `${accent}12`, color: accent, fontSize: '0.54rem', height: 16 }} />
            )}
            {runResult?.runs?.[0]?.duration_ms && (
              <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled', fontFamily: '"JetBrains Mono", monospace' }}>
                {fmtMs(runResult.runs[0].duration_ms)} processing time
              </Typography>
            )}
          </Box>
        </Box>
        <Chip
          label="EXECUTIVE REPORT"
          size="small"
          sx={{
            bgcolor: `${accent}14`, color: accent,
            fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.18em',
            height: 20, fontFamily: '"Raleway", sans-serif',
          }}
        />
      </Box>
      <Box sx={{ mt: 2, height: '1px', bgcolor: 'divider', position: 'relative' }}>
        <Box sx={{ position: 'absolute', left: 0, top: '-0.5px', height: '2px', width: 80, bgcolor: accent }} />
      </Box>
    </Box>
  )
}

// ── KPIBar ────────────────────────────────────────────────────────────────────

function KPIBar({ runResult, analysisResult, accent }) {
  const dqResults = runResult?.dq_results || []
  const charts    = analysisResult?.charts || []
  const anomalies = analysisResult?.sections?.anomalies || []
  const recs      = analysisResult?.sections?.recommendations || []
  const rowCount  = runResult?.row_count || analysisResult?.meta?.total_rows || 0

  const dqPassed = dqResults.filter((r) => r.passed).length
  const dqTotal  = dqResults.length
  const dqScore  = dqTotal > 0 ? Math.round((dqPassed / dqTotal) * 100) : null
  const penalty  = Math.min(anomalies.length * 8, 30)
  const health   = dqScore !== null ? Math.max(0, dqScore - penalty) : (anomalies.length === 0 ? 100 : Math.max(40, 100 - penalty * 2))

  const healthColor = health >= 85 ? '#6b8f71' : health >= 60 ? '#c9a84c' : '#b45050'
  const healthLabel = health >= 85 ? 'Healthy' : health >= 60 ? 'Needs Review' : 'At Risk'

  const kpis = [
    {
      label: 'People Records',
      value: rowCount ? rowCount.toLocaleString() : '—',
      sub: `${analysisResult?.meta?.total_columns || 0} data dimensions`,
      color: accent,
    },
    {
      label: 'Data Health',
      value: `${health}%`,
      sub: healthLabel,
      color: healthColor,
    },
    {
      label: 'Business Insights',
      value: String(charts.length || 0),
      sub: `${(analysisResult?.sections?.key_findings || []).length} key findings`,
      color: accent,
    },
    {
      label: 'Action Items',
      value: String(recs.length || 0),
      sub: anomalies.length ? `${anomalies.length} risk${anomalies.length !== 1 ? 's' : ''} flagged` : 'No risks flagged',
      color: recs.length > 0 ? '#c9a84c' : '#6b8f71',
    },
  ]

  return (
    <Grid container spacing={2} sx={{ mb: 3.5 }}>
      {kpis.map(({ label, value, sub, color }) => (
        <Grid item xs={6} sm={3} key={label}>
          <Card variant="outlined" sx={{
            bgcolor: 'background.paper', borderColor: 'divider',
            borderTop: `2px solid ${color}`, height: '100%',
          }}>
            <CardContent sx={{ p: '16px 20px', '&:last-child': { pb: '16px' } }}>
              <Typography sx={{
                fontSize: '0.52rem', letterSpacing: '0.2em', textTransform: 'uppercase',
                color: 'text.disabled', fontFamily: '"Raleway", sans-serif', mb: 0.75,
              }}>
                {label}
              </Typography>
              <Typography sx={{
                fontFamily: '"Cormorant Garamond", serif',
                fontSize: '1.9rem', fontWeight: 700, color, lineHeight: 1, mb: 0.4,
              }}>
                {value}
              </Typography>
              <Typography sx={{ fontSize: '0.64rem', color: 'text.disabled', fontFamily: '"Raleway", sans-serif' }}>
                {sub}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  )
}

// ── ExecutiveSummary ──────────────────────────────────────────────────────────

function ExecutiveSummary({ analysisResult, accent }) {
  const text = analysisResult?.sections?.executive_summary || analysisResult?.summary || ''
  if (!text) return null
  return (
    <Card variant="outlined" sx={{
      bgcolor: 'background.paper',
      borderColor: `${accent}30`,
      borderLeft: `3px solid ${accent}`,
      mb: 3,
    }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <AutoAwesomeIcon sx={{ fontSize: 13, color: accent }} />
          <Typography sx={{
            fontFamily: '"Raleway", sans-serif', fontWeight: 700,
            fontSize: '0.58rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: accent,
          }}>
            Executive Summary
          </Typography>
        </Box>
        <Typography sx={{
          fontSize: '0.95rem', color: 'text.primary', lineHeight: 1.9,
          fontFamily: '"Raleway", sans-serif',
        }}>
          {text}
        </Typography>
      </CardContent>
    </Card>
  )
}

// ── FindingsAndRecommendations ────────────────────────────────────────────────

function FindingsAndRecommendations({ analysisResult, accent }) {
  const findings = analysisResult?.sections?.key_findings || []
  const recs     = analysisResult?.sections?.recommendations || []
  if (!findings.length && !recs.length) return null

  return (
    <Grid container spacing={2.5} sx={{ mb: 3 }}>
      {findings.length > 0 && (
        <Grid item xs={12} md={recs.length > 0 ? 6 : 12}>
          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <TipsAndUpdatesIcon sx={{ fontSize: 14, color: accent }} />
                <Typography sx={{
                  fontFamily: '"Raleway", sans-serif', fontWeight: 700,
                  fontSize: '0.58rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'text.secondary',
                }}>
                  Key Business Findings
                </Typography>
              </Box>
              {findings.map((f, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
                  <Typography sx={{
                    fontSize: '0.58rem', fontFamily: '"JetBrains Mono", monospace',
                    color: accent, flexShrink: 0, fontWeight: 700, mt: 0.12,
                  }}>
                    {String(i + 1).padStart(2, '0')}
                  </Typography>
                  <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.72, fontFamily: '"Raleway", sans-serif' }}>
                    {f}
                  </Typography>
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>
      )}

      {recs.length > 0 && (
        <Grid item xs={12} md={findings.length > 0 ? 6 : 12}>
          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <TaskAltIcon sx={{ fontSize: 14, color: '#6b8f71' }} />
                <Typography sx={{
                  fontFamily: '"Raleway", sans-serif', fontWeight: 700,
                  fontSize: '0.58rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'text.secondary',
                }}>
                  Strategic Recommendations
                </Typography>
              </Box>
              {recs.map((r, i) => (
                <Box key={i} sx={{
                  display: 'flex', gap: 1.5, mb: 1.5,
                  pb: i < recs.length - 1 ? 1.5 : 0,
                  borderBottom: i < recs.length - 1 ? '1px solid' : 'none',
                  borderColor: 'divider',
                }}>
                  <Box sx={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0, mt: 0.1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: 'rgba(107,143,113,0.12)',
                  }}>
                    <Typography sx={{ fontSize: '0.52rem', fontFamily: '"JetBrains Mono", monospace', color: '#6b8f71', fontWeight: 700 }}>
                      {i + 1}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.72, fontFamily: '"Raleway", sans-serif' }}>
                    {r}
                  </Typography>
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>
      )}
    </Grid>
  )
}

// ── RiskAlerts ────────────────────────────────────────────────────────────────

function RiskAlerts({ anomalies }) {
  if (!anomalies?.length) return null
  return (
    <Card variant="outlined" sx={{ borderColor: 'rgba(201,168,76,0.35)', bgcolor: 'rgba(201,168,76,0.03)', mb: 3 }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <WarningAmberIcon sx={{ fontSize: 14, color: '#c9a84c' }} />
          <Typography sx={{
            fontFamily: '"Raleway", sans-serif', fontWeight: 700,
            fontSize: '0.58rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: '#c9a84c',
          }}>
            Risk Indicators & Attention Areas
          </Typography>
          <Chip
            label={`${anomalies.length} flagged`} size="small"
            sx={{ bgcolor: 'rgba(201,168,76,0.15)', color: '#c9a84c', fontSize: '0.54rem', height: 16, ml: 0.5 }}
          />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {anomalies.map((a, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: '#c9a84c', flexShrink: 0, mt: 0.82 }} />
              <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.7, fontFamily: '"Raleway", sans-serif' }}>
                {a}
              </Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  )
}

// ── BusinessAnalyticsSection ──────────────────────────────────────────────────

function BusinessAnalyticsSection({ charts, accent }) {
  return (
    <Box sx={{ mb: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        <Box sx={{ width: '3px', height: 20, bgcolor: accent, opacity: 0.7, flexShrink: 0, borderRadius: '2px' }} />
        <BarChartIcon sx={{ fontSize: 16, color: accent }} />
        <Typography sx={{
          fontFamily: '"Cormorant Garamond", serif',
          fontWeight: 600, fontSize: '1.1rem', letterSpacing: '0.04em', color: 'text.primary',
        }}>
          Business Analytics
        </Typography>
        <Typography sx={{ fontSize: '0.62rem', fontFamily: '"Raleway", sans-serif', color: 'text.disabled', ml: 0.5 }}>
          {charts.length} visualisation{charts.length !== 1 ? 's' : ''}
        </Typography>
      </Box>
      <Grid container spacing={2.5}>
        {charts.map((spec) => (
          <Grid item xs={12} md={6} key={spec.id || spec.title}>
            <ChartCard spec={spec} />
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}

// ── DataHealthPanel ───────────────────────────────────────────────────────────

function DataHealthPanel({ dqResults, accent }) {
  const passed = dqResults.filter((r) => r.passed).length
  const score  = dqResults.length > 0 ? Math.round((passed / dqResults.length) * 100) : 100
  const scoreColor = score >= 90 ? '#6b8f71' : score >= 70 ? '#c9a84c' : '#b45050'
  const statusLabel = score >= 90 ? 'Compliant' : score >= 70 ? 'Partially Compliant' : 'Non-Compliant'

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Box sx={{ width: '3px', height: 20, bgcolor: accent, opacity: 0.7, flexShrink: 0, borderRadius: '2px' }} />
        <VerifiedIcon sx={{ fontSize: 16, color: accent }} />
        <Typography sx={{
          fontFamily: '"Cormorant Garamond", serif',
          fontWeight: 600, fontSize: '1.1rem', letterSpacing: '0.04em', color: 'text.primary',
        }}>
          Data Compliance & Health
        </Typography>
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.55rem', fontWeight: 700, color: scoreColor }}>
            {score}%
          </Typography>
          <Chip label={statusLabel} size="small" sx={{ bgcolor: `${scoreColor}18`, color: scoreColor, fontSize: '0.58rem', fontWeight: 700 }} />
        </Box>
      </Box>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '2px', overflow: 'hidden' }}>
        {dqResults.map((rule, i) => (
          <Box key={i} sx={{
            display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
            px: 2.5, py: 1.5,
            borderBottom: i < dqResults.length - 1 ? '1px solid' : 'none',
            borderColor: 'divider',
            bgcolor: !rule.passed ? 'rgba(180,80,80,0.03)' : 'transparent',
          }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: rule.passed ? '#6b8f71' : '#b45050' }} />
            <Typography sx={{ flex: 1, fontFamily: '"Raleway", sans-serif', fontSize: '0.8rem', color: 'text.primary', minWidth: 140 }}>
              {rule.rule_name}
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif', maxWidth: 300 }}>
              {rule.message}
            </Typography>
            <Chip
              label={rule.passed ? 'Pass' : 'Fail'} size="small"
              sx={{
                bgcolor: rule.passed ? 'rgba(107,143,113,0.12)' : 'rgba(180,80,80,0.12)',
                color: rule.passed ? '#6b8f71' : '#b45050',
                fontSize: '0.6rem', fontWeight: 700, height: 20, flexShrink: 0,
              }}
            />
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// ── ResultsView ───────────────────────────────────────────────────────────────

function ResultsView({ runResult, analysisResult, accent }) {
  const meta           = analysisResult?.meta    || {}
  const sections       = analysisResult?.sections || {}
  const charts         = analysisResult?.charts   || []
  const dqResults      = runResult?.dq_results    || []
  const rows           = runResult?.rows           || []
  const columns        = runResult?.columns        || []
  const isMultiSection = runResult?.report_type === 'multi_section'
  const hasDataset     = isMultiSection ? (runResult?.sections?.length > 0) : rows.length > 0

  return (
    <Box sx={{
      '@keyframes fadeUp': {
        from: { opacity: 0, transform: 'translateY(14px)' },
        to:   { opacity: 1, transform: 'translateY(0)' },
      },
      animation: 'fadeUp 0.45s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <ExecutiveReportHeader runResult={runResult} analysisResult={analysisResult} accent={accent} />

      <KPIBar runResult={runResult} analysisResult={analysisResult} accent={accent} />

      {meta.pii_protected && (
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1, mb: 3,
          px: 2, py: 1,
          border: '1px solid', borderColor: `${accent}22`,
          borderRadius: '2px', bgcolor: `${accent}06`,
        }}>
          <LockIcon sx={{ fontSize: 13, color: accent }} />
          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', fontFamily: '"Raleway", sans-serif' }}>
            PII protection active — {meta.pii_masked_count} sensitive value{meta.pii_masked_count !== 1 ? 's' : ''} masked before AI analysis
          </Typography>
        </Box>
      )}

      <ExecutiveSummary analysisResult={analysisResult} accent={accent} />

      <FindingsAndRecommendations analysisResult={analysisResult} accent={accent} />

      <RiskAlerts anomalies={sections.anomalies} />

      {charts.length > 0 && (
        <>
          <Divider sx={{ my: 4 }} />
          <BusinessAnalyticsSection charts={charts} accent={accent} />
        </>
      )}

      {dqResults.length > 0 && (
        <>
          <Divider sx={{ my: 4 }} />
          <DataHealthPanel dqResults={dqResults} accent={accent} />
        </>
      )}

      {hasDataset && (
        <>
          <Divider sx={{ my: 4 }} />
          <SectionHeader
            Icon={StorageIcon}
            label="Full Dataset"
            accent={accent}
            sub={isMultiSection
              ? `${runResult.sections.filter((s) => s.type === 'table').length} tables`
              : `${rows.length.toLocaleString()} rows · ${columns.length} columns`
            }
          />
          {isMultiSection
            ? <MultiSectionReport sections={runResult.sections} />
            : <DataTable rows={rows} columns={columns} />
          }
        </>
      )}
    </Box>
  )
}

// ── History helpers ───────────────────────────────────────────────────────────

function _bucketLabel(isoStr) {
  if (!isoStr) return 'Older'
  const d    = new Date(isoStr)
  const now  = new Date()
  const diff = now - d
  const day  = 86_400_000
  if (diff < day && d.getDate() === now.getDate()) return 'Today'
  if (diff < 2 * day) return 'Yesterday'
  if (diff < 7 * day) return 'This Week'
  if (diff < 30 * day) return 'This Month'
  return 'Older'
}

function _bucketOrder(label) {
  return { Today: 0, Yesterday: 1, 'This Week': 2, 'This Month': 3, Older: 4 }[label] ?? 5
}

function _groupByDate(items) {
  const groups = {}
  for (const item of items) {
    const label = _bucketLabel(item.created_at)
    if (!groups[label]) groups[label] = []
    groups[label].push(item)
  }
  return Object.entries(groups).sort(([a], [b]) => _bucketOrder(a) - _bucketOrder(b))
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── HistoryPanel ──────────────────────────────────────────────────────────────

function HistoryPanel({ accent, onSelect, onClose }) {
  const { token }              = useAuth()
  const [items, setItems]      = useState([])
  const [loading, setLoading]  = useState(true)
  const [loadingId, setLoadingId] = useState(null)
  const [error, setError]      = useState(null)

  useEffect(() => {
    if (!token) return
    listAnalysisResults(token, { limit: 100 })
      .then(({ data }) => setItems(data.items || []))
      .catch(() => setError('Failed to load history'))
      .finally(() => setLoading(false))
  }, [token])

  const handleSelect = async (item) => {
    setLoadingId(item.id)
    try {
      const promises = [getAnalysisResult(item.id, token)]
      if (item.run_output_id) promises.push(reconstructRunOutput(item.run_output_id, token))
      const [{ data: ar }, runRes] = await Promise.all(promises)
      onSelect({
        analysisResult: ar.response_json,
        runResult:      runRes?.data ?? null,
      })
    } catch {
      setError('Failed to load this analysis. Please try another.')
    } finally {
      setLoadingId(null)
    }
  }

  const groups = _groupByDate(items)

  return (
    <Box sx={{
      '@keyframes fadeUp': { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      animation: 'fadeUp 0.3s ease both',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: '3px', height: 20, bgcolor: accent, opacity: 0.7, flexShrink: 0, borderRadius: '2px' }} />
          <HistoryIcon sx={{ fontSize: 16, color: accent }} />
          <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontWeight: 600, fontSize: '1.1rem', color: 'text.primary' }}>
            Analysis History
          </Typography>
          {!loading && (
            <Typography sx={{ fontSize: '0.62rem', color: 'text.disabled', fontFamily: '"Raleway", sans-serif' }}>
              {items.length} {items.length === 1 ? 'result' : 'results'}
            </Typography>
          )}
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={24} sx={{ color: accent }} />
        </Box>
      ) : items.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <HistoryIcon sx={{ fontSize: 36, color: 'text.disabled', mb: 1.5, opacity: 0.4 }} />
          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem', color: 'text.disabled' }}>
            No analysis history yet. Run & Analyse a config to get started.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {groups.map(([label, groupItems]) => (
            <Box key={label}>
              <Typography sx={{
                fontSize: '0.58rem', letterSpacing: '0.2em', textTransform: 'uppercase',
                color: 'text.disabled', fontFamily: '"Raleway", sans-serif',
                mb: 1.25, pl: 0.5,
              }}>
                {label}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {groupItems.map((item) => (
                  <Card
                    key={item.id}
                    variant="outlined"
                    onClick={() => loadingId === null && handleSelect(item)}
                    sx={{
                      bgcolor: 'background.paper',
                      borderColor: 'divider',
                      cursor: loadingId === item.id ? 'wait' : 'pointer',
                      transition: 'all 0.18s ease',
                      '&:hover': loadingId === null ? {
                        borderColor: `${accent}55`,
                        bgcolor: `${accent}05`,
                      } : {},
                    }}
                  >
                    <CardContent sx={{ p: '12px 16px !important', display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{
                          fontFamily: '"Raleway", sans-serif', fontWeight: 600,
                          fontSize: '0.78rem', color: 'text.primary',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {item.filename}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.4, flexWrap: 'wrap' }}>
                          <Typography sx={{ fontSize: '0.62rem', color: 'text.disabled', fontFamily: '"Raleway", sans-serif' }}>
                            {fmtDate(item.created_at)}
                          </Typography>
                          {item.model_id_str && (
                            <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', fontFamily: '"JetBrains Mono", monospace' }}>
                              {item.model_id_str}
                            </Typography>
                          )}
                          {item.chart_count > 0 && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <BarChartIcon sx={{ fontSize: 10, color: 'text.disabled' }} />
                              <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', fontFamily: '"Raleway", sans-serif' }}>
                                {item.chart_count} charts
                              </Typography>
                            </Box>
                          )}
                          {item.total_rows > 0 && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <StorageIcon sx={{ fontSize: 10, color: 'text.disabled' }} />
                              <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', fontFamily: '"Raleway", sans-serif' }}>
                                {item.total_rows.toLocaleString()} rows
                              </Typography>
                            </Box>
                          )}
                          {item.provider && (
                            <Chip
                              label={item.provider}
                              size="small"
                              sx={{ bgcolor: `${accent}12`, color: accent, fontSize: '0.52rem', height: 14 }}
                            />
                          )}
                        </Box>
                      </Box>
                      {loadingId === item.id ? (
                        <CircularProgress size={16} sx={{ color: accent, flexShrink: 0 }} />
                      ) : (
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: `${accent}44`, flexShrink: 0 }} />
                      )}
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

// ── RunAnalyseDashboard ───────────────────────────────────────────────────────

export default function RunAnalyseDashboard() {
  const { token }        = useAuth()
  const { accent, mode } = useThemeContext()

  const [phase,           setPhase]           = useState('idle')
  const [activeStep,      setActiveStep]      = useState(0)
  const [completedSteps,  setCompletedSteps]  = useState(new Set())
  const [runResult,       setRunResult]       = useState(null)
  const [analysisResult,  setAnalysisResult]  = useState(null)
  const [error,           setError]           = useState(null)
  const [elapsed,         setElapsed]         = useState(0)
  const [configs,         setConfigs]         = useState([])
  const [activeConfigId,  setActiveConfigId]  = useState(null)
  const [models,          setModels]          = useState([])
  const [selectedModelId, setSelectedModelId] = useState(null)
  const [initLoading,     setInitLoading]     = useState(true)
  // 'list' | 'result' — null means we're in the normal Run & Analyse mode
  const [historyView,     setHistoryView]     = useState(null)
  const [historyMeta,     setHistoryMeta]     = useState(null) // {filename, created_at}

  const pollRef    = useRef(null)
  const timerRef   = useRef(null)
  const startTsRef = useRef(null)

  useEffect(() => {
    if (!token) return
    Promise.all([listConfigs(token), listInsightModels()])
      .then(([{ data: cfgs }, { data: mdlData }]) => {
        const cfgList = Array.isArray(cfgs) ? cfgs : []
        const mdlList = mdlData.items ?? []
        setConfigs(cfgList)
        if (cfgList.length) setActiveConfigId(cfgList[0].id)
        setModels(mdlList)
        const def = mdlList.find((m) => m.is_default) || mdlList[0]
        if (def) setSelectedModelId(def.id)
      })
      .catch(() => {})
      .finally(() => setInitLoading(false))
  }, [token])

  useEffect(() => () => {
    clearInterval(pollRef.current)
    clearInterval(timerRef.current)
  }, [])

  const handleRun = useCallback(async () => {
    if (!activeConfigId || phase === 'running' || phase === 'analysing') return

    setPhase('running')
    setActiveStep(0)
    setCompletedSteps(new Set())
    setRunResult(null)
    setAnalysisResult(null)
    setError(null)
    setElapsed(0)

    startTsRef.current = Date.now()

    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTsRef.current) / 1000))
    }, 1000)

    let lastInstanceId = ''
    let lastReportId   = ''

    pollRef.current = setInterval(async () => {
      try {
        const { data } = await listRuns(token, { limit: 10 })
        const items  = data.items || []
        const cutoff = startTsRef.current - 15_000
        const run    = items.find(
          (r) => r.config_id === activeConfigId && new Date(r.started_at).getTime() >= cutoff
        )
        if (!run) return

        if (run.status === 'success') {
          setCompletedSteps(new Set([0, 1, 2]))
          setActiveStep(2)
        } else if (run.report_id && run.report_id !== lastReportId) {
          lastReportId = run.report_id
          setCompletedSteps((prev) => { const s = new Set(prev); s.add(0); s.add(1); return s })
          setActiveStep(2)
        } else if (run.instance_id && run.instance_id !== lastInstanceId) {
          lastInstanceId = run.instance_id
          setCompletedSteps((prev) => { const s = new Set(prev); s.add(0); return s })
          setActiveStep(1)
        }
      } catch { /* non-fatal */ }
    }, 2000)

    try {
      const { data: runData } = await runConfig(activeConfigId, token)
      clearInterval(pollRef.current)

      if (runData.success_count === 0) {
        const detail = runData.runs?.[0]?.error || 'All engines failed'
        throw new Error(detail)
      }

      setRunResult(runData)
      setCompletedSteps(new Set([0, 1, 2]))
      setActiveStep(3)
      setPhase('analysing')

      const runOutputId = runData.run_output_id
      if (!runOutputId) {
        throw new Error('No run output available for analysis — FTP download may have been skipped.')
      }

      const { data: analysis } = await analyzeRunOutput(runOutputId, selectedModelId, token)

      clearInterval(timerRef.current)
      setAnalysisResult(analysis)
      setCompletedSteps(new Set([0, 1, 2, 3]))
      setPhase('done')

    } catch (err) {
      clearInterval(pollRef.current)
      clearInterval(timerRef.current)
      setPhase('error')
      setError(formatApiError(err, 'Run failed. Please check your configuration and try again.'))
    }
  }, [activeConfigId, selectedModelId, token, phase])

  const handleHistorySelect = useCallback(({ analysisResult: ar, runResult: rr }) => {
    setAnalysisResult(ar)
    setRunResult(rr)
    setHistoryView('result')
  }, [])

  const inProgress = phase === 'running' || phase === 'analysing'
  const selectedModel = models.find((m) => m.id === selectedModelId)

  const _urlMatch = error ? error.match(/\(url:\s*(https?:\/\/[^)]+)\)/) : null
  const errorUrl  = _urlMatch?.[1] || null
  const errorMsg  = errorUrl ? error.replace(/\s*\(url:\s*https?:\/\/[^)]+\)/, '').trim() : (error || '')

  return (
    <Box>
      {/* Toolbar */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, mb: 4,
        flexWrap: 'wrap',
      }}>
        {/* History: back button when viewing a result */}
        {historyView === 'result' && (
          <Button
            startIcon={<ArrowBackIcon sx={{ fontSize: 15 }} />}
            onClick={() => { setHistoryView('list'); setRunResult(null); setAnalysisResult(null) }}
            size="small"
            sx={{
              color: 'text.secondary',
              fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem',
              textTransform: 'none', mr: 0.5,
              '&:hover': { color: accent },
            }}
          >
            Back to History
          </Button>
        )}

        {historyView === null && !initLoading && (
          <>
            <Select
              value={activeConfigId || ''}
              onChange={(e) => setActiveConfigId(e.target.value)}
              disabled={inProgress}
              displayEmpty
              size="small"
              sx={{
                minWidth: 210,
                fontFamily: '"Raleway", sans-serif',
                fontSize: '0.8rem',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                '& .MuiSelect-select': { py: 1.15 },
              }}
            >
              {!configs.length && <MenuItem value="" disabled>No configurations</MenuItem>}
              {configs.map((c) => (
                <MenuItem key={c.id} value={c.id} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.8rem' }}>
                  {c.name}
                </MenuItem>
              ))}
            </Select>

            {models.length > 0 && (
              <Select
                value={selectedModelId || ''}
                onChange={(e) => setSelectedModelId(e.target.value)}
                disabled={inProgress}
                size="small"
                sx={{
                  minWidth: 175,
                  fontFamily: '"Raleway", sans-serif',
                  fontSize: '0.8rem',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                  '& .MuiSelect-select': { py: 1.15 },
                }}
              >
                {models.map((m) => (
                  <MenuItem key={m.id} value={m.id} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.8rem' }}>
                    {m.name || m.model_id}
                  </MenuItem>
                ))}
              </Select>
            )}

            <Button
              startIcon={inProgress
                ? <CircularProgress size={13} sx={{ color: 'background.default' }} />
                : <AutoAwesomeIcon sx={{ fontSize: 16 }} />
              }
              onClick={handleRun}
              disabled={inProgress || !activeConfigId}
              sx={{
                bgcolor: 'primary.main',
                color: 'background.default',
                fontFamily: '"Raleway", sans-serif',
                fontWeight: 700,
                fontSize: '0.72rem',
                letterSpacing: '0.14em',
                px: 3,
                py: 1.2,
                borderRadius: '2px',
                boxShadow: `0 2px 20px ${accent}35`,
                '&:hover': { bgcolor: 'primary.light', boxShadow: `0 4px 28px ${accent}55` },
                '&.Mui-disabled': { opacity: 0.45 },
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                textTransform: 'none',
              }}
            >
              {inProgress ? 'Running…' : 'Run & Analyse'}
            </Button>

            {(phase === 'done' || phase === 'error') && (
              <Tooltip title="Start a new run" placement="right">
                <IconButton
                  size="small"
                  onClick={() => { setPhase('idle'); setError(null) }}
                  sx={{ color: 'text.secondary', '&:hover': { color: accent } }}
                >
                  <ReplayIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
          </>
        )}

        {initLoading && historyView === null && (
          <CircularProgress size={20} sx={{ color: accent }} />
        )}

        {/* History toggle — always visible unless a run is in progress */}
        {!inProgress && (
          <Box sx={{ ml: 'auto' }}>
            {historyView === null ? (
              <Button
                startIcon={<HistoryIcon sx={{ fontSize: 15 }} />}
                onClick={() => setHistoryView('list')}
                size="small"
                variant="outlined"
                sx={{
                  color: 'text.secondary',
                  borderColor: 'divider',
                  fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem',
                  textTransform: 'none',
                  '&:hover': { borderColor: accent, color: accent },
                }}
              >
                History
              </Button>
            ) : (
              <Button
                startIcon={<AutoAwesomeIcon sx={{ fontSize: 15 }} />}
                onClick={() => { setHistoryView(null); setRunResult(null); setAnalysisResult(null); setPhase('idle') }}
                size="small"
                variant="outlined"
                sx={{
                  color: 'text.secondary',
                  borderColor: 'divider',
                  fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem',
                  textTransform: 'none',
                  '&:hover': { borderColor: accent, color: accent },
                }}
              >
                New Run
              </Button>
            )}
          </Box>
        )}
      </Box>

      {/* History views */}
      {historyView === 'list' && (
        <HistoryPanel accent={accent} onSelect={handleHistorySelect} />
      )}

      {historyView === 'result' && runResult && analysisResult && (
        <ResultsView runResult={runResult} analysisResult={analysisResult} accent={accent} />
      )}

      {historyView === 'result' && !runResult && analysisResult && (
        <Box>
          <Alert severity="info" sx={{ mb: 3, fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' }}>
            Run data is not available for this analysis — showing AI insights only.
          </Alert>
          <Box>
            <SectionHeader Icon={AutoAwesomeIcon} label="AI Insights" accent={accent} mt={0} />
            <AIInsightsPanel analysisResult={analysisResult} accent={accent} />
            {(analysisResult?.meta?.column_profiles?.length > 0) && (
              <>
                <Divider sx={{ my: 4 }} />
                <ColumnDeepDive profiles={analysisResult.meta.column_profiles} accent={accent} />
              </>
            )}
          </Box>
        </Box>
      )}

      {/* Normal run mode below — only shown when not in history */}
      {historyView === null && (
        <>

      {/* Error */}
      {phase === 'error' && error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>
          <Typography sx={{ fontSize: '0.88rem', mb: errorUrl ? 1 : 0 }}>{errorMsg}</Typography>
          {errorUrl && (
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1,
              mt: 0.75, px: 1.5, py: 0.75,
              bgcolor: 'rgba(180,80,80,0.08)',
              border: '1px solid rgba(180,80,80,0.2)',
              borderRadius: '3px', overflow: 'hidden',
            }}>
              <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6rem', fontWeight: 700, color: '#c98f8f', flexShrink: 0 }}>
                URL
              </Typography>
              <Typography
                title={errorUrl}
                sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.65rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
              >
                {errorUrl}
              </Typography>
            </Box>
          )}
        </Alert>
      )}

      {/* Loading */}
      {inProgress && (
        <LoadingView
          activeStep={activeStep}
          completedSteps={completedSteps}
          phase={phase}
          elapsed={elapsed}
          accent={accent}
          modelName={selectedModel?.name || selectedModel?.model_id || null}
        />
      )}

      {/* Results */}
      {phase === 'done' && runResult && analysisResult && (
        <ResultsView runResult={runResult} analysisResult={analysisResult} accent={accent} />
      )}

      {/* Idle */}
      {phase === 'idle' && (
        <Box sx={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: 440, gap: 3,
          '@keyframes idleFade': { from: { opacity: 0 }, to: { opacity: 1 } },
          animation: 'idleFade 0.4s ease both',
        }}>
          <Box sx={{ opacity: 0.35 }}>
            <AnimatedRings accent={accent} size={100} />
          </Box>
          <Box sx={{ textAlign: 'center', maxWidth: 380 }}>
            <Typography sx={{
              fontFamily: '"Cormorant Garamond", serif',
              fontSize: '1.35rem', fontWeight: 600, color: 'text.secondary', mb: 1,
            }}>
              Run & Analyse
            </Typography>
            <Typography sx={{
              fontFamily: '"Raleway", sans-serif',
              fontSize: '0.82rem', color: 'text.disabled', lineHeight: 1.7,
            }}>
              Triggers a PeopleSoft run, downloads the report via FTP,
              then passes it to the AI model for instant insights.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
            {['Trigger · poll · download in one step', 'AI-generated executive summary & findings', 'Column profiles, anomalies, and DQ checks'].map((t) => (
              <Box key={t} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: accent, opacity: 0.45, flexShrink: 0 }} />
                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', color: 'text.disabled' }}>
                  {t}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}
        </>
      )}
    </Box>
  )
}
