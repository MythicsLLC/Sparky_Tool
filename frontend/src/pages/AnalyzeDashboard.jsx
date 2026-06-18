import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Box, Typography, Alert, CircularProgress, Grid, Card, CardContent,
  Button, Chip, Select, MenuItem, FormControl, Tooltip, TextField,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { DynamicChart, ChartCard, PALETTE } from '../components/DynamicChart'
import UploadFileIcon    from '@mui/icons-material/UploadFile'
import AutoAwesomeIcon   from '@mui/icons-material/AutoAwesome'
import TableChartIcon    from '@mui/icons-material/TableChart'
import PictureAsPdfIcon  from '@mui/icons-material/PictureAsPdf'
import HistoryIcon       from '@mui/icons-material/History'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import StorageIcon       from '@mui/icons-material/Storage'
import ViewColumnIcon    from '@mui/icons-material/ViewColumn'
import BarChartIcon      from '@mui/icons-material/BarChart'
import FlashOnIcon       from '@mui/icons-material/FlashOn'
import LockIcon          from '@mui/icons-material/Lock'
import ThumbUpAltIcon    from '@mui/icons-material/ThumbUpAlt'
import ThumbDownAltIcon  from '@mui/icons-material/ThumbDownAlt'
import CheckCircleIcon   from '@mui/icons-material/CheckCircle'
import RefreshIcon       from '@mui/icons-material/Refresh'
import { analyzeFileWs, analyzeRunOutput, listRunOutputs, deleteRunOutput, listInsightModels, downloadAnalysisPdf, formatApiError, submitAnalysisReview, getAnalysisResult } from '../api'
import { useAuth } from '../AuthContext'
import MythicsLoader from '../components/MythicsLoader'
import SuccessCheck from '../components/SuccessCheck'

const PROVIDER_COLORS = { gemini: '#4285f4', openai: '#10a37f', anthropic: '#d4a84b', grok: '#1da1f2', generic: '#888' }

// Apply per-card chart type overrides (from localStorage) to a charts array
// before sending to the PDF generator, so the PDF matches what the user sees.
const CHART_OVERRIDES_KEY = 'sparky_chart_type_overrides'
function applyTypeOverrides(charts) {
  try {
    const overrides = JSON.parse(localStorage.getItem(CHART_OVERRIDES_KEY) || '{}')
    return charts.map((spec) => {
      const id = spec.id || spec.title
      return overrides[id] ? { ...spec, type: overrides[id] } : spec
    })
  } catch {
    return charts
  }
}

// Compact number formatter: 1,234,567 → "1.2M", 15300 → "15.3K"
const fmtCompact = (n) => {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}


// ── StatCard ───────────────────────────────────────────────────────────────────
// Single metric tile: top accent stripe, large value, icon badge.
// Used in the dashboard summary row above the charts.

function StatCard({ label, value, sub, Icon, color }) {
  const theme  = useTheme()
  const accent = color || theme.palette.primary.main
  return (
    <Card variant="outlined" sx={{
      bgcolor: 'background.paper', borderColor: 'divider',
      height: '100%', position: 'relative', overflow: 'hidden',
    }}>
      {/* coloured accent stripe at top — each card gets a distinct colour so
          users can scan the row at a glance without reading the labels */}
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, bgcolor: accent, opacity: 0.55 }} />
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography sx={{
              fontFamily: '"Raleway", sans-serif', fontSize: '0.52rem',
              letterSpacing: '0.22em', textTransform: 'uppercase',
              color: 'text.disabled', mb: 0.75,
            }}>
              {label}
            </Typography>
            <Typography sx={{
              fontFamily: '"Cormorant Garamond", serif',
              fontSize: '2rem', fontWeight: 700,
              color: 'text.primary', lineHeight: 1,
            }}>
              {value}
            </Typography>
            {sub && (
              <Typography sx={{
                fontSize: '0.62rem', color: 'text.secondary',
                mt: 0.75, fontFamily: '"Raleway", sans-serif',
              }}>
                {sub}
              </Typography>
            )}
          </Box>
          {Icon && (
            <Box sx={{
              width: 32, height: 32, borderRadius: '4px',
              bgcolor: `${accent}14`, display: 'grid',
              placeItems: 'center', flexShrink: 0,
            }}>
              <Icon sx={{ fontSize: 16, color: accent }} />
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  )
}

// ── StatsRow ───────────────────────────────────────────────────────────────────
// Reads from the result object and renders 4–5 StatCards in a responsive row.
// Cards are conditional: token and PII cards only appear when those values exist.

function StatsRow({ result }) {
  const totalRows  = result.meta?.total_rows    ?? result.row_count
  const totalCols  = result.meta?.total_columns ?? result.col_count
  const chartCount = (result.charts || []).length
  const tokens     = result.meta?.token_usage   ?? {}
  const piiActive  = result.meta?.pii_protected
  const piiCount   = result.meta?.pii_masked_count ?? 0
  const sheetCount = result.meta?.sheet_count   ?? 1

  const cards = [
    {
      label: 'Total Rows',
      value: fmtCompact(totalRows),
      sub:   'data records',
      Icon:  StorageIcon,
      color: '#6b8f71',
    },
    {
      label: 'Columns',
      value: fmtCompact(totalCols),
      sub:   sheetCount > 1 ? `across ${sheetCount} sheets` : 'fields analysed',
      Icon:  ViewColumnIcon,
      color: '#6495b4',
    },
    {
      label: 'Charts',
      value: String(chartCount),
      sub:   'AI-generated views',
      Icon:  BarChartIcon,
      color: '#c9a84c',
    },
    // Only shown when the model reports token usage (Gemini / OpenAI / Anthropic)
    ...(tokens.total > 0 ? [{
      label: 'AI Tokens',
      value: fmtCompact(tokens.total),
      sub:   `${fmtCompact(tokens.prompt)} prompt · ${fmtCompact(tokens.completion)} output`,
      Icon:  FlashOnIcon,
      color: '#9b59b6',
    }] : []),
    // Only shown when PII was detected and masked
    ...(piiActive ? [{
      label: 'PII Shielded',
      value: String(piiCount),
      sub:   'values masked before AI',
      Icon:  LockIcon,
      color: '#6b8f71',
    }] : []),
  ]

  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {cards.map((card) => (
        // md prop without a value expands each card equally in the row
        <Grid item xs={6} sm={4} md key={card.label}>
          <StatCard {...card} />
        </Grid>
      ))}
    </Grid>
  )
}

// ── InsightsPanel ──────────────────────────────────────────────────────────────
// The main narrative card. Shows: AI summary, every column name as a chip,
// and a token-usage breakdown footer. Replaces the old SummaryBar which only
// showed the summary as italic text inside a small coloured card.

function InsightsPanel({ result, filename }) {
  const theme  = useTheme()
  const accent = theme.palette.primary.main
  const dark   = theme.palette.mode === 'dark'

  const columns    = result.meta?.columns       ?? []
  const tokens     = result.meta?.token_usage   ?? {}
  const piiActive  = result.meta?.pii_protected
  const piiCount   = result.meta?.pii_masked_count ?? 0
  const spacyUsed  = result.meta?.pii_spacy
  const sheetCount = result.meta?.sheet_count   ?? 1
  // sheets_meta is populated only for multi-sheet workbooks:
  // { SheetName: { rows: number, columns: string[] } }
  const sheetsMeta = result.meta?.sheets_meta   ?? null

  return (
    <Card variant="outlined" sx={{
      bgcolor: dark ? `${accent}08` : `${accent}04`,
      borderColor: `${accent}28`, mb: 3,
    }}>
      <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>

        {/* ── card header: icon + "AI Insight" label + filename + badges ─────── */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5, flexWrap: 'wrap' }}>
          <AutoAwesomeIcon sx={{ fontSize: 14, color: accent, opacity: 0.85 }} />
          <Typography sx={{
            fontFamily: '"Raleway", sans-serif', fontWeight: 700,
            fontSize: '0.6rem', letterSpacing: '0.24em',
            textTransform: 'uppercase', color: accent, opacity: 0.9,
          }}>
            AI Insight
          </Typography>

          {/* thin separator between label and filename */}
          <Box sx={{ height: 10, width: '1px', bgcolor: `${accent}35`, mx: 0.25 }} />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
            <TableChartIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
            <Typography sx={{
              fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem',
              color: 'text.secondary', fontWeight: 600,
            }}>
              {filename}
            </Typography>
          </Box>

          {sheetCount > 1 && (
            <Chip
              label={`${sheetCount} sheets`}
              size="small"
              sx={{
                bgcolor: `${accent}14`, color: accent,
                fontFamily: '"Raleway", sans-serif', fontSize: '0.58rem', height: 17,
              }}
            />
          )}

          {piiActive && (
            <Tooltip
              title={`${piiCount} sensitive value${piiCount !== 1 ? 's' : ''} were masked before the AI saw the data${spacyUsed ? ' (regex + spaCy NER)' : ' (regex patterns)'} and restored afterward. The AI never saw raw personal information.`}
              arrow
              placement="top"
            >
              <Chip
                icon={<LockIcon sx={{ fontSize: '11px !important', ml: '6px !important', color: '#6b8f71 !important' }} />}
                label={`PII · ${piiCount} values masked`}
                size="small"
                sx={{
                  bgcolor: 'rgba(107,143,113,0.12)', color: '#6b8f71',
                  border: '1px solid rgba(107,143,113,0.25)',
                  fontFamily: '"Raleway", sans-serif', fontSize: '0.58rem',
                  height: 17, cursor: 'help',
                }}
              />
            </Tooltip>
          )}
        </Box>

        {/* ── AI narrative — the main summary text ─────────────────────────────
            We give this more breathing room and a slightly larger font than the
            old SummaryBar so it reads as a proper paragraph, not a caption.    */}
        <Typography sx={{
          fontFamily: '"Raleway", sans-serif', fontSize: '0.97rem',
          color: 'text.primary', lineHeight: 1.9,
          fontStyle: 'italic', mb: 3,
        }}>
          {result.summary}
        </Typography>

        {/* ── column list ───────────────────────────────────────────────────────
            Multi-sheet: one collapsible block per sheet showing its row count
            and columns, so every tab is accounted for in the dashboard.
            Single-sheet: flat chip list as before.                           */}
        {sheetsMeta ? (
          <Box sx={{ mb: tokens.total > 0 ? 3 : 0 }}>
            <Typography sx={{
              fontFamily: '"Raleway", sans-serif', fontSize: '0.52rem',
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'text.disabled', mb: 1.75,
            }}>
              {sheetCount} sheets · {columns.length} total columns
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {Object.entries(sheetsMeta).map(([sheetName, sheetData], idx) => (
                <Box key={sheetName}>
                  {/* sheet name row */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.85 }}>
                    <Box sx={{
                      width: 18, height: 18, borderRadius: '3px',
                      bgcolor: `${PALETTE[idx % PALETTE.length]}22`,
                      border: `1px solid ${PALETTE[idx % PALETTE.length]}44`,
                      display: 'grid', placeItems: 'center', flexShrink: 0,
                    }}>
                      <Typography sx={{
                        fontFamily: '"Raleway", sans-serif', fontSize: '0.48rem',
                        fontWeight: 700, color: PALETTE[idx % PALETTE.length],
                        lineHeight: 1,
                      }}>
                        {idx + 1}
                      </Typography>
                    </Box>
                    <Typography sx={{
                      fontFamily: '"Raleway", sans-serif', fontWeight: 700,
                      fontSize: '0.72rem', color: 'text.primary',
                    }}>
                      {sheetName}
                    </Typography>
                    <Typography sx={{
                      fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem',
                      color: 'text.disabled',
                    }}>
                      {fmtCompact(sheetData.rows)} rows · {sheetData.columns.length} columns
                    </Typography>
                  </Box>

                  {/* column chips for this sheet */}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6, pl: 3.5 }}>
                    {sheetData.columns.map((col) => (
                      <Chip
                        key={col}
                        label={col}
                        size="small"
                        sx={{
                          bgcolor: `${PALETTE[idx % PALETTE.length]}0d`,
                          color: 'text.secondary',
                          border: `1px solid ${PALETTE[idx % PALETTE.length]}22`,
                          fontFamily: '"Raleway", sans-serif',
                          fontSize: '0.62rem', height: 20,
                          '& .MuiChip-label': { px: 1.1 },
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        ) : columns.length > 0 ? (
          <Box sx={{ mb: tokens.total > 0 ? 3 : 0 }}>
            <Typography sx={{
              fontFamily: '"Raleway", sans-serif', fontSize: '0.52rem',
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'text.disabled', mb: 1.25,
            }}>
              {columns.length} column{columns.length !== 1 ? 's' : ''} analysed
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {columns.map((col) => (
                <Chip
                  key={col}
                  label={col}
                  size="small"
                  sx={{
                    bgcolor: `${accent}0c`,
                    color: 'text.secondary',
                    border: `1px solid ${accent}1c`,
                    fontFamily: '"Raleway", sans-serif',
                    fontSize: '0.63rem', height: 21,
                    '& .MuiChip-label': { px: 1.25 },
                  }}
                />
              ))}
            </Box>
          </Box>
        ) : null}

        {/* ── token usage footer ────────────────────────────────────────────────
            Providers that report usage (Gemini / OpenAI / Anthropic) populate
            meta.token_usage.  We show prompt / completion / total so users can
            estimate cost or compare models.  Hidden when total is 0.           */}
        {tokens.total > 0 && (
          <Box sx={{
            pt: 2.5,
            borderTop: `1px solid ${accent}1a`,
            display: 'flex', gap: 3.5, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
              <FlashOnIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
              <Typography sx={{
                fontFamily: '"Raleway", sans-serif', fontSize: '0.52rem',
                letterSpacing: '0.16em', textTransform: 'uppercase', color: 'text.disabled',
              }}>
                Token usage
              </Typography>
            </Box>

            {[
              ['Prompt',     tokens.prompt],
              ['Completion', tokens.completion],
              ['Total',      tokens.total],
            ].filter(([, v]) => v).map(([label, val]) => (
              <Box key={label}>
                <Typography sx={{
                  fontFamily: '"Raleway", sans-serif', fontSize: '0.5rem',
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: 'text.disabled', mb: 0.2,
                }}>
                  {label}
                </Typography>
                <Typography sx={{
                  fontFamily: '"Cormorant Garamond", serif',
                  fontSize: '1.1rem', fontWeight: 700,
                  color: 'text.secondary', lineHeight: 1,
                }}>
                  {val?.toLocaleString()}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

// ── SectionDivider ─────────────────────────────────────────────────────────────
// Thin ruled line with a centred label — used to separate the Insights panel
// from the charts grid, mirroring the "Run History" divider in RunOutputHistory.

function SectionDivider({ label }) {
  const theme  = useTheme()
  const accent = theme.palette.primary.main
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, my: 3 }}>
      <Box sx={{ flex: 1, height: '1px', bgcolor: `${accent}1c` }} />
      <Typography sx={{
        fontFamily: '"Raleway", sans-serif', fontWeight: 700,
        fontSize: '0.52rem', letterSpacing: '0.28em',
        textTransform: 'uppercase', color: 'text.disabled',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, height: '1px', bgcolor: `${accent}1c` }} />
    </Box>
  )
}

// ── ReviewPanel ────────────────────────────────────────────────────────────────
// Appears at the bottom of the results section, below the chart grid.
// Three-step state machine:
//   idle       → "Was this analysis helpful?" + Approve / Reject buttons
//   commenting → chosen status chip + optional note textarea + Submit button
//   done       → confirmation message (auto-collapses after 4 s)
//
// When the user approves, the backend creates a PromptReference row — this
// analysis joins the "good prompt" library and can be referenced in future runs.

function ReviewPanel({ analysisResultId, getToken }) {
  const theme  = useTheme()
  const accent = theme.palette.primary.main
  const dark   = theme.palette.mode === 'dark'

  const [step,        setStep]        = useState('idle')       // idle | commenting | done
  const [chosen,      setChosen]      = useState(null)         // 'approved' | 'rejected'
  const [comment,     setComment]     = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // Don't render if the backend didn't return a result ID (save failure, etc.)
  if (!analysisResultId) return null

  const chooseStatus = (status) => {
    setChosen(status)
    setStep('commenting')
    setSubmitError(null)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const token = await getToken()
      await submitAnalysisReview(analysisResultId, chosen, comment.trim(), token)
      setStep('done')
    } catch (err) {
      setSubmitError(
        err?.response?.data?.detail || 'Could not save your review — please try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  const approveColor  = '#6b8f71'
  const rejectColor   = '#b45050'
  const chosenColor   = chosen === 'approved' ? approveColor : rejectColor

  // ── done state ───────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1.5,
        px: 2.5, py: 1.75,
        border: `1px solid ${chosenColor}30`,
        borderRadius: 1.5,
        bgcolor: `${chosenColor}08`,
        '@keyframes reviewDone': { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
        animation: 'reviewDone 0.28s ease both',
      }}>
        <CheckCircleIcon sx={{ fontSize: 18, color: chosenColor, flexShrink: 0 }} />
        <Box>
          <Typography sx={{
            fontFamily: '"Raleway", sans-serif', fontWeight: 700,
            fontSize: '0.78rem', color: chosenColor,
          }}>
            {chosen === 'approved'
              ? 'Analysis approved — added to your reference library'
              : 'Feedback noted — this analysis was flagged for review'}
          </Typography>
          {comment.trim() && (
            <Typography sx={{
              fontFamily: '"Raleway", sans-serif', fontSize: '0.65rem',
              color: 'text.secondary', mt: 0.25, fontStyle: 'italic',
            }}>
              "{comment.trim()}"
            </Typography>
          )}
        </Box>
      </Box>
    )
  }

  // ── commenting state ─────────────────────────────────────────────────────────
  if (step === 'commenting') {
    return (
      <Card variant="outlined" sx={{
        borderColor: `${chosenColor}35`,
        bgcolor: dark ? `${chosenColor}08` : `${chosenColor}04`,
        '@keyframes reviewSlide': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        animation: 'reviewSlide 0.25s ease both',
      }}>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          {/* chosen status chip */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            {chosen === 'approved'
              ? <ThumbUpAltIcon  sx={{ fontSize: 15, color: chosenColor }} />
              : <ThumbDownAltIcon sx={{ fontSize: 15, color: chosenColor }} />}
            <Typography sx={{
              fontFamily: '"Raleway", sans-serif', fontWeight: 700,
              fontSize: '0.7rem', color: chosenColor, letterSpacing: '0.06em',
            }}>
              {chosen === 'approved' ? 'Marking as a good reference' : 'Flagging for review'}
            </Typography>
            <Button
              size="small"
              onClick={() => setStep('idle')}
              sx={{
                ml: 'auto', fontSize: '0.58rem', color: 'text.disabled',
                fontFamily: '"Raleway", sans-serif', letterSpacing: '0.06em',
                minWidth: 0, px: 1,
                '&:hover': { color: 'text.secondary' },
              }}
            >
              Change
            </Button>
          </Box>

          {/* optional comment ── users explain WHY this was good/bad, which
              makes the reference library more useful for future analyses      */}
          <TextField
            multiline
            minRows={2}
            maxRows={5}
            fullWidth
            placeholder={chosen === 'approved'
              ? 'Why was this a good analysis? (optional — e.g. "Clear breakdown of regional trends")'
              : 'What was wrong? (optional — e.g. "Charts were too generic for this payroll data")'}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            size="small"
            sx={{
              mb: 2,
              '& .MuiOutlinedInput-root': {
                fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem',
                '& fieldset': { borderColor: `${chosenColor}30` },
                '&:hover fieldset': { borderColor: `${chosenColor}60` },
                '&.Mui-focused fieldset': { borderColor: chosenColor },
              },
              '& .MuiInputBase-input::placeholder': {
                fontSize: '0.72rem', color: 'text.disabled',
              },
            }}
          />

          {submitError && (
            <Alert severity="error" sx={{ mb: 1.5, fontSize: '0.72rem' }}>{submitError}</Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button
              size="small"
              onClick={() => setStep('idle')}
              sx={{
                color: 'text.disabled', fontFamily: '"Raleway", sans-serif',
                fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase',
              }}
            >
              Cancel
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={handleSubmit}
              disabled={submitting}
              startIcon={submitting ? <CircularProgress size={11} /> : null}
              sx={{
                borderColor: `${chosenColor}55`, color: chosenColor,
                fontFamily: '"Raleway", sans-serif', fontSize: '0.62rem',
                letterSpacing: '0.1em', textTransform: 'uppercase',
                '&:hover': { borderColor: chosenColor, bgcolor: `${chosenColor}0e` },
              }}
            >
              {submitting ? 'Saving…' : 'Submit feedback'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    )
  }

  // ── idle state ───────────────────────────────────────────────────────────────
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
      px: 2.5, py: 1.75,
      border: `1px solid ${accent}18`,
      borderRadius: 1.5,
      bgcolor: dark ? `${accent}06` : `${accent}03`,
    }}>
      <Typography sx={{
        fontFamily: '"Raleway", sans-serif', fontWeight: 700,
        fontSize: '0.7rem', color: 'text.secondary',
        letterSpacing: '0.04em', flex: 1,
      }}>
        Was this analysis helpful?
      </Typography>

      <Button
        size="small"
        variant="outlined"
        startIcon={<ThumbUpAltIcon sx={{ fontSize: 14 }} />}
        onClick={() => chooseStatus('approved')}
        sx={{
          borderColor: `${approveColor}50`, color: approveColor,
          fontFamily: '"Raleway", sans-serif', fontSize: '0.62rem',
          letterSpacing: '0.08em', textTransform: 'uppercase',
          '&:hover': { borderColor: approveColor, bgcolor: `${approveColor}0e` },
        }}
      >
        Approve — add to reference library
      </Button>

      <Button
        size="small"
        variant="outlined"
        startIcon={<ThumbDownAltIcon sx={{ fontSize: 14 }} />}
        onClick={() => chooseStatus('rejected')}
        sx={{
          borderColor: `${rejectColor}40`, color: rejectColor,
          fontFamily: '"Raleway", sans-serif', fontSize: '0.62rem',
          letterSpacing: '0.08em', textTransform: 'uppercase',
          '&:hover': { borderColor: rejectColor, bgcolor: `${rejectColor}0e` },
        }}
      >
        Flag for review
      </Button>
    </Box>
  )
}

// ── StreamingTerminal ──────────────────────────────────────────────────────────
// Replaces the spinner while the AI streams its response.

function StreamingTerminal({ text, status }) {
  const theme  = useTheme()
  const accent = theme.palette.primary.main
  const bodyRef = useRef(null)

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [text])

  return (
    <Box sx={{
      bgcolor: '#0d1117',
      border: `1px solid ${accent}30`,
      borderRadius: '8px',
      overflow: 'hidden',
      fontFamily: '"JetBrains Mono", monospace',
    }}>
      {/* window chrome */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, borderBottom: '1px solid rgba(255,255,255,0.07)', bgcolor: 'rgba(255,255,255,0.03)' }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#ff5f57' }} />
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#febc2e' }} />
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#28c840' }} />
        <Typography sx={{ ml: 1.5, fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.06em' }}>
          {status || 'AI analysing…'}
        </Typography>
      </Box>

      {/* streaming body */}
      <Box ref={bodyRef} sx={{ px: 2.5, py: 2, maxHeight: '52vh', overflowY: 'auto', overflowX: 'hidden',
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
        '&::-webkit-scrollbar-thumb': { bgcolor: `${accent}40`, borderRadius: 2 },
      }}>
        <Box component="pre" sx={{
          m: 0, fontSize: '0.72rem', lineHeight: 1.75, color: '#c9d1d9',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          '@keyframes blink': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0 } },
        }}>
          {text || ' '}
          <Box component="span" sx={{
            display: 'inline-block', width: '0.55em', height: '1em',
            bgcolor: accent, ml: '2px', verticalAlign: 'text-bottom',
            animation: 'blink 1s step-end infinite',
          }} />
        </Box>
      </Box>
    </Box>
  )
}


// ── DropZone ───────────────────────────────────────────────────────────────────

function DropZone({ onFile, loading, streamingText, streamingStatus, browseRef }) {
  const theme   = useTheme()
  const accent  = theme.palette.primary.main
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  if (browseRef) browseRef.current = () => inputRef.current?.click()

  const pick = useCallback((f) => {
    if (f) onFile(f)
  }, [onFile])

  return (
    <Box
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer?.files?.[0]) }}
      onClick={() => !loading && inputRef.current?.click()}
      sx={{
        border: `1px solid ${dragging ? accent : `${accent}30`}`,
        borderRadius: 2,
        py: 8, px: 5,
        textAlign: 'center',
        cursor: loading ? 'default' : 'pointer',
        transition: 'all 0.22s ease',
        bgcolor: dragging ? `${accent}0a` : `${accent}04`,
        '&:hover': loading ? {} : { borderColor: `${accent}70`, bgcolor: `${accent}08` },
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        style={{ display: 'none' }}
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {loading ? (
        <Box sx={{ width: '100%', textAlign: 'left' }}>
          <StreamingTerminal text={streamingText} status={streamingStatus} />
        </Box>
      ) : (
        <Box>
          <UploadFileIcon sx={{ fontSize: 52, color: accent, opacity: 0.4, mb: 2 }} />
          <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontWeight: 700, fontSize: '1.75rem', color: 'text.primary', mb: 0.85, letterSpacing: '0.01em', lineHeight: 1.1 }}>
            Drop a file to analyse
          </Typography>
          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.84rem', color: 'text.secondary', mb: 3, lineHeight: 1.7 }}>
            CSV · Excel (.xlsx / .xls) — AI auto-generates the most insightful charts for your data
          </Typography>
          <Button
            variant="outlined"
            size="small"
            sx={{
              borderColor: `${accent}55`, color: accent,
              fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', fontWeight: 700,
              letterSpacing: '0.14em', textTransform: 'uppercase', px: 3.5, py: 1,
              '&:hover': { borderColor: accent, bgcolor: `${accent}12` },
            }}
          >
            Browse file
          </Button>
        </Box>
      )}
    </Box>
  )
}

// ── RunOutputHistory ───────────────────────────────────────────────────────────

function RunOutputHistory({ onAnalyze, onReanalyze, analysing }) {
  const theme  = useTheme()
  const accent = theme.palette.primary.main
  const { getToken } = useAuth()
  const [outputs,  setOutputs]  = useState([])
  const [fetched,  setFetched]  = useState(false)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => {
    getToken().then((token) =>
      listRunOutputs(token)
        .then(({ data }) => setOutputs(data.items ?? []))
        .catch(() => {})
        .finally(() => setFetched(true))
    )
  }, []) // eslint-disable-line

  const handleDelete = async (id) => {
    setDeleting(id)
    try {
      const token = await getToken()
      await deleteRunOutput(id, token)
      setOutputs((prev) => prev.filter((o) => o.id !== id))
    } catch {
      // silent — item stays in list
    } finally {
      setDeleting(null)
    }
  }

  if (!fetched || outputs.length === 0) return null

  const fmtSize = (b) => b >= 1024 * 1024
    ? `${(b / (1024 * 1024)).toFixed(1)} MB`
    : `${(b / 1024).toFixed(1)} KB`

  const fmtDate = (iso) => iso
    ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <Box sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Box sx={{ width: 22, height: '1px', bgcolor: `${accent}40` }} />
        <HistoryIcon sx={{ fontSize: 13, color: accent, opacity: 0.65 }} />
        <Typography sx={{
          fontFamily: '"Raleway", sans-serif', fontWeight: 700,
          fontSize: '0.6rem', letterSpacing: '0.22em',
          textTransform: 'uppercase', color: 'text.secondary',
        }}>
          Run History
        </Typography>
        <Box sx={{ flex: 1, height: '1px', bgcolor: `${accent}20` }} />
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {outputs.map((o) => (
          <Card key={o.id} variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: `${accent}18`, transition: 'border-color 0.18s ease', '&:hover': { borderColor: `${accent}45` } }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 }, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {/* info */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{
                  fontFamily: '"Raleway", sans-serif', fontWeight: 700,
                  fontSize: '0.84rem', mb: 0.35, color: 'text.primary',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {o.display_name}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
                  {[
                    o.config_name && `Config: ${o.config_name}`,
                    o.engine_name && `Engine: ${o.engine_name}`,
                    o.row_count   && `${o.row_count.toLocaleString()} rows`,
                    o.file_size_bytes && fmtSize(o.file_size_bytes),
                    fmtDate(o.created_at),
                  ].filter(Boolean).map((label) => (
                    <Typography key={label} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', color: 'text.secondary' }}>
                      {label}
                    </Typography>
                  ))}
                </Box>
              </Box>

              {/* actions */}
              <Box sx={{ display: 'flex', gap: 0.75, flexShrink: 0 }}>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!!analysing}
                  onClick={() => onAnalyze(o)}
                  startIcon={
                    analysing === o.id ? <CircularProgress size={11} /> :
                    o.analysis_result_id ? <CheckCircleIcon sx={{ fontSize: 13 }} /> :
                    <AutoAwesomeIcon sx={{ fontSize: 13 }} />
                  }
                  sx={{
                    borderColor: o.analysis_result_id ? 'rgba(107,143,113,0.45)' : `${accent}44`,
                    color: o.analysis_result_id ? '#6b8f71' : accent,
                    fontFamily: '"Raleway", sans-serif', fontSize: '0.62rem',
                    letterSpacing: '0.08em', textTransform: 'uppercase', height: 28,
                    '&:hover': {
                      borderColor: o.analysis_result_id ? '#6b8f71' : accent,
                      bgcolor: o.analysis_result_id ? 'rgba(107,143,113,0.08)' : `${accent}08`,
                    },
                  }}
                >
                  {analysing === o.id ? 'Loading…' : o.analysis_result_id ? 'View Analysis' : 'Analyse'}
                </Button>

                {/* Re-analyze — only shown when a cached result exists */}
                {o.analysis_result_id && (
                  <Tooltip title="Re-run AI analysis" placement="top" arrow>
                    <span>
                      <Button
                        size="small"
                        disabled={!!analysing}
                        onClick={() => onReanalyze(o)}
                        sx={{
                          minWidth: 0, width: 28, height: 28, p: 0,
                          color: 'text.disabled',
                          '&:hover': { color: accent },
                        }}
                      >
                        <RefreshIcon sx={{ fontSize: 14 }} />
                      </Button>
                    </span>
                  </Tooltip>
                )}

                <Button
                  size="small"
                  disabled={deleting === o.id}
                  onClick={() => handleDelete(o.id)}
                  sx={{
                    minWidth: 0, width: 28, height: 28, p: 0,
                    color: 'text.disabled',
                    '&:hover': { color: '#b45050' },
                  }}
                >
                  {deleting === o.id
                    ? <CircularProgress size={11} />
                    : <DeleteOutlineIcon sx={{ fontSize: 15 }} />}
                </Button>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  )
}

// ── AnalyzeDashboard ───────────────────────────────────────────────────────────

export default function AnalyzeDashboard() {
  const theme   = useTheme()
  const accent  = theme.palette.primary.main
  const { getToken } = useAuth()
  const chartsRef = useRef(null)
  const browseRef = useRef(null)
  const [loading,         setLoading]         = useState(false)
  const [pdfLoading,      setPdfLoading]      = useState(false)
  const [showSuccess,     setShowSuccess]     = useState(false)
  const [pdfSuccess,      setPdfSuccess]      = useState(false)
  const [error,           setError]           = useState(null)
  const [retrying,        setRetrying]        = useState(false)
  const [result,          setResult]          = useState(null)
  const [filename,        setFilename]        = useState('')
  const [pendingFile,     setPendingFile]     = useState(null)
  const [models,          setModels]          = useState([])
  const [selectedModelId, setSelectedModelId] = useState(null)
  const [modelsLoading,   setModelsLoading]   = useState(true)
  const [modelsError,     setModelsError]     = useState(null)
  const [analysingOutput, setAnalysingOutput] = useState(null)
  const [streamingText,   setStreamingText]   = useState('')
  const [streamingStatus, setStreamingStatus] = useState('')

  useEffect(() => {
    setModelsLoading(true)
    setModelsError(null)
    listInsightModels()
      .then(({ data }) => {
        const items = data.items ?? []
        setModels(items)
        const def = items.find((m) => m.is_default)
        if (def) setSelectedModelId(def.id)
      })
      .catch((err) => {
        setModelsError(formatApiError(err, 'Unable to load models from the server.'))
      })
      .finally(() => setModelsLoading(false))
  }, [])

  const _runAnalysis = useCallback((file, modelId) => {
    setError(null)
    setRetrying(false)
    setStreamingText('')
    setStreamingStatus('')
    setLoading(true)

    analyzeFileWs(file, modelId, {
      onStatus: (msg) => setStreamingStatus(msg),
      onChunk:  (text) => setStreamingText((prev) => prev + text),
      onResult: (data) => {
        setResult(data)
        setStreamingText('')
        setStreamingStatus('')
        setLoading(false)
        setShowSuccess(true)
        setTimeout(() => setShowSuccess(false), 1600)
      },
      onError: (err) => {
        const isNetwork = !err.response && (
          err.message?.includes('WebSocket') ||
          err.message === 'Network Error' ||
          err.code === 'ERR_NETWORK'
        )
        if (isNetwork) {
          setRetrying(true)
          setError('The AI server is waking up — retrying in 8 seconds…')
          setStreamingText('')
          setTimeout(() => {
            setError(null)
            setRetrying(false)
            setStreamingText('')
            setStreamingStatus('')
            analyzeFileWs(file, modelId, {
              onStatus: (msg) => setStreamingStatus(msg),
              onChunk:  (text) => setStreamingText((prev) => prev + text),
              onResult: (data) => {
                setResult(data)
                setStreamingText('')
                setStreamingStatus('')
                setLoading(false)
                setShowSuccess(true)
                setTimeout(() => setShowSuccess(false), 1600)
              },
              onError: (retryErr) => {
                setError(formatApiError(retryErr, 'Server still starting — please try again in a moment.'))
                setStreamingText('')
                setLoading(false)
              },
            })
          }, 8000)
        } else {
          setError(formatApiError(err, 'Analysis failed — check the server logs.'))
          setStreamingText('')
          setLoading(false)
        }
      },
    })
  }, []) // eslint-disable-line

  const handleFile = useCallback(async (file) => {
    setResult(null)
    setFilename(file.name)
    setPendingFile(file)
    await _runAnalysis(file, selectedModelId)
  }, [selectedModelId, _runAnalysis])

  const handleOutputAnalyze = useCallback(async (output) => {
    setResult(null)
    setError(null)
    setFilename(output.display_name)
    setAnalysingOutput(output.id)
    setLoading(true)
    try {
      const token = await getToken()
      if (output.analysis_result_id) {
        // Stored result exists — fetch from DB, skip LLM entirely
        const { data } = await getAnalysisResult(output.analysis_result_id, token)
        const stored = data.response_json || {}
        setResult({ ...stored, meta: { ...(stored.meta || {}), analysis_result_id: data.id } })
      } else {
        const { data } = await analyzeRunOutput(output.id, selectedModelId, token)
        setResult(data)
      }
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 1600)
    } catch (err) {
      setError(formatApiError(err, 'Analysis failed — check the server logs.'))
    } finally {
      setLoading(false)
      setAnalysingOutput(null)
    }
  }, [selectedModelId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleOutputReanalyze = useCallback(async (output) => {
    setResult(null)
    setError(null)
    setFilename(output.display_name)
    setAnalysingOutput(output.id)
    setLoading(true)
    try {
      const token = await getToken()
      const { data } = await analyzeRunOutput(output.id, selectedModelId, token)
      setResult(data)
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 1600)
    } catch (err) {
      setError(formatApiError(err, 'Analysis failed — check the server logs.'))
    } finally {
      setLoading(false)
      setAnalysingOutput(null)
    }
  }, [selectedModelId]) // eslint-disable-line react-hooks/exhaustive-deps

  const downloadPdf = useCallback(async () => {
    if (!result) return
    setPdfLoading(true)
    try {
      const blob = await downloadAnalysisPdf({
        filename: filename || 'report',
        summary:  result.summary || '',
        charts:   applyTypeOverrides(result.charts || []),
        meta:     result.meta    || {},
      })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${(filename || 'report').replace(/\.[^.]+$/, '')}_analysis.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setPdfSuccess(true)
      setTimeout(() => setPdfSuccess(false), 2200)
    } catch (err) {
      console.error('PDF download failed', err)
    } finally {
      setPdfLoading(false)
    }
  }, [result, filename])

  // ── keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName ?? ''
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 'o') { e.preventDefault(); if (!loading) browseRef.current?.(); return }
      if (e.key === 'Escape' && result) { setResult(null); setFilename(''); setError(null); return }
      if (mod && e.key === 'd' && result && !pdfLoading) { e.preventDefault(); downloadPdf(); return }
      if (mod && e.key === 'Enter' && pendingFile && !loading) { e.preventDefault(); handleFile(pendingFile); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [result, loading, pdfLoading, pendingFile, downloadPdf, handleFile])

  if (modelsLoading && !result) {
    return <MythicsLoader sx={{ flex: 1, bgcolor: 'background.default' }} />
  }

  return (
    <Box>
      {/* ── section header ────────────────────────────────────────────────── */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.75, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.85 }}>
            <AutoAwesomeIcon sx={{ color: accent, fontSize: 14, opacity: 0.8 }} />
            <Typography sx={{
              fontFamily: '"Raleway", sans-serif', fontWeight: 700,
              fontSize: '0.57rem', letterSpacing: '0.28em',
              textTransform: 'uppercase', color: accent, opacity: 0.8,
            }}>
              AI Chart Analyser
            </Typography>
          </Box>

          {modelsLoading ? (
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={18} />
              <Typography sx={{ fontSize: '0.66rem', color: 'text.disabled' }}>Loading models…</Typography>
            </Box>
          ) : models.length > 0 ? (
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{
                fontSize: '0.55rem', letterSpacing: '0.16em', textTransform: 'uppercase',
                color: 'text.disabled', fontFamily: '"Raleway", sans-serif',
              }}>
                Model
              </Typography>
              <FormControl size="small">
                <Select
                  value={selectedModelId ?? ''}
                  onChange={(e) => setSelectedModelId(e.target.value === '' ? null : e.target.value)}
                  displayEmpty
                  sx={{
                    fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', height: 28, minWidth: 180,
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: `${accent}30` },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: `${accent}70` },
                    '& .MuiSelect-icon': { fontSize: 16 },
                  }}
                >
                  <MenuItem value="" sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', color: 'text.disabled' }}>
                    Default
                  </MenuItem>
                  {models.map((m) => (
                    <MenuItem key={m.id} value={m.id} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Box sx={{
                          width: 7, height: 7, borderRadius: '50%',
                          bgcolor: PROVIDER_COLORS[m.provider] || '#888', flexShrink: 0,
                        }} />
                        {m.name}
                        {m.is_default && (
                          <Typography component="span" sx={{ fontSize: '0.55rem', color: 'text.disabled', fontFamily: '"Raleway", sans-serif' }}>
                            (default)
                          </Typography>
                        )}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          ) : null}
        </Box>

        <Typography sx={{
          fontFamily: '"Cormorant Garamond", serif', fontWeight: 700,
          fontSize: '2.4rem', color: 'text.primary', letterSpacing: '0.01em',
          lineHeight: 1.05, mb: 1.25,
        }}>
          Intelligent Data Visualisation
        </Typography>
        <Typography sx={{
          fontFamily: '"Raleway", sans-serif', fontSize: '0.9rem',
          color: 'text.secondary', lineHeight: 1.75, maxWidth: 600,
        }}>
          Upload any CSV or Excel file — AI reads your data and automatically generates the most
          insightful charts, with a plain-language summary
        </Typography>
      </Box>

      {/* ── drop zone (hidden once results arrive) ──────────────────────── */}
      {!result && (
        modelsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <Typography sx={{ color: 'text.disabled' }}>Loading models…</Typography>
          </Box>
        ) : modelsError ? (
          <Alert severity="error" sx={{ mt: 2 }}>{modelsError}</Alert>
        ) : (
          <DropZone onFile={handleFile} loading={loading} streamingText={streamingText} streamingStatus={streamingStatus} browseRef={browseRef} />
        )
      )}

      {/* ── run history ─────────────────────────────────────────────────── */}
      {!result && !loading && !modelsLoading && !modelsError && (
        <RunOutputHistory
          onAnalyze={handleOutputAnalyze}
          onReanalyze={handleOutputReanalyze}
          analysing={analysingOutput}
        />
      )}

      {/* ── error ─────────────────────────────────────────────────────────── */}
      {error && (
        <Alert
          severity={retrying ? 'info' : 'error'}
          onClose={retrying ? undefined : () => setError(null)}
          sx={{ mt: 2 }}
        >
          {error}
          {retrying && (
            <CircularProgress size={12} sx={{ ml: 1.5, verticalAlign: 'middle' }} />
          )}
        </Alert>
      )}

      {/* ── success splash ────────────────────────────────────────────────── */}
      {result && showSuccess && (
        <Box sx={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', py: 8, gap: 2.5,
          '@keyframes splashIn': { from: { opacity: 0, transform: 'scale(0.92)' }, to: { opacity: 1, transform: 'scale(1)' } },
          animation: 'splashIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
        }}>
          <SuccessCheck size={96} />
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{
              fontFamily: '"Cormorant Garamond", serif', fontSize: '1.55rem',
              fontWeight: 700, color: 'text.primary', letterSpacing: '0.02em', mb: 0.5,
            }}>
              Analysis complete
            </Typography>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', color: 'text.secondary' }}>
              {(result.charts || []).length} chart{(result.charts || []).length !== 1 ? 's' : ''} generated from{' '}
              <Box component="span" sx={{ color: accent }}>{filename}</Box>
            </Typography>
          </Box>
        </Box>
      )}

      {/* ── results ───────────────────────────────────────────────────────── */}
      {result && !showSuccess && (
        <Box sx={{
          '@keyframes chartsIn': { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'none' } },
          animation: 'chartsIn 0.35s ease both',
        }}>
          {/* PDF download toolbar */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.5, mb: 3 }}>
            {pdfSuccess && (
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 0.75,
                px: 1, py: 0.3,
                border: `1px solid ${accent}59`,
                borderRadius: '3px',
                bgcolor: `${accent}0f`,
                '@keyframes pdfBadgeIn': { from: { opacity: 0, transform: 'scale(0.85)' }, to: { opacity: 1, transform: 'scale(1)' } },
                animation: 'pdfBadgeIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both',
              }}>
                <SuccessCheck size={28} />
                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.65rem', color: accent, letterSpacing: '0.06em' }}>
                  Downloaded
                </Typography>
              </Box>
            )}
            <Button
              variant="outlined"
              size="small"
              onClick={downloadPdf}
              disabled={pdfLoading}
              startIcon={pdfLoading ? <CircularProgress size={14} /> : <PictureAsPdfIcon sx={{ fontSize: 16 }} />}
              sx={{
                borderColor: `${accent}44`, color: accent,
                fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem',
                letterSpacing: '0.1em', textTransform: 'uppercase',
                '&:hover': { borderColor: accent, bgcolor: `${accent}08` },
              }}
            >
              {pdfLoading ? 'Generating…' : 'Download PDF'}
            </Button>
          </Box>

          {/* ── KPI stat row ─────────────────────────────────────────────────
              Four to five cards depending on what data is available.
              Each card gets a distinct colour stripe so the row is scannable
              at a glance. The grid uses md (auto) so cards grow equally.     */}
          <StatsRow result={result} />

          {/* ── AI insights panel ────────────────────────────────────────────
              Shows the full AI narrative, every analysed column as a chip,
              and (when available) the prompt / completion / total token count
              so users can track AI cost per analysis run.                    */}
          <InsightsPanel result={result} filename={filename} />

          {/* ── Charts section ───────────────────────────────────────────────
              Ruled divider with chart count, then the 2-column chart grid.
              Only the grid is captured for the PDF (chartsRef), not the
              panels above — header + summary are added natively in the PDF.  */}
          <SectionDivider label={`Visualisations · ${(result.charts || []).length} charts`} />

          <Box ref={chartsRef}>
            <Grid container spacing={2.5} alignItems="stretch">
              {(result.charts || []).map((spec, i) => (
                <Grid item xs={12} md={6} key={spec.id || spec.title} sx={{ display: 'flex' }}>
                  <ChartCard spec={spec} index={i} />
                </Grid>
              ))}
            </Grid>
          </Box>

          {/* ── review panel ────────────────────────────────────────────────
              Shown when the backend returned an analysis_result_id.
              Lets the user approve (→ PromptReference) or flag the result. */}
          {result.meta?.analysis_result_id && (
            <Box sx={{ mt: 3 }}>
              <ReviewPanel
                analysisResultId={result.meta.analysis_result_id}
                getToken={getToken}
              />
            </Box>
          )}

          {/* upload another */}
          <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
            <Button
              onClick={() => { setResult(null); setFilename(''); setError(null) }}
              startIcon={<UploadFileIcon sx={{ fontSize: 14 }} />}
              sx={{
                fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem',
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'text.secondary',
                '&:hover': { color: accent },
              }}
            >
              Upload another file
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  )
}
