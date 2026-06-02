import { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, CircularProgress, Alert,
  Chip, Select, MenuItem, FormControl, InputLabel,
  Table, TableHead, TableBody, TableRow, TableCell,
  Accordion, AccordionSummary, AccordionDetails,
  TextField,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import ExpandMoreIcon  from '@mui/icons-material/ExpandMore'
import CompareArrows   from '@mui/icons-material/CompareArrows'
import { diffRunOutputs, formatApiError } from '../api'
import { useAuth } from '../AuthContext'

const pillSx = (color) => ({
  display: 'inline-block', px: 1, py: 0.1,
  borderRadius: '3px', fontSize: '0.6rem',
  fontFamily: '"Raleway", sans-serif', fontWeight: 700, letterSpacing: '0.08em',
  bgcolor: `${color}18`, color,
})

function SummaryChip({ label, count, color }) {
  if (!count) return null
  return (
    <Chip
      label={`${label}: ${count.toLocaleString()}`}
      size="small"
      sx={{ bgcolor: `${color}14`, color, fontFamily: '"Raleway", sans-serif', fontSize: '0.62rem', height: 22 }}
    />
  )
}

function ChangedCell({ col, changes }) {
  const ch = changes[col]
  if (!ch) return <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: 'text.secondary' }}>{String(ch ?? '—')}</Typography>
  return (
    <Box>
      <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.62rem', color: '#b45050', textDecoration: 'line-through' }}>{ch.before}</Typography>
      <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.62rem', color: '#6b8f71' }}>{ch.after}</Typography>
    </Box>
  )
}

export default function RunDiffDialog({ open, onClose, runOutputs }) {
  const { token } = useAuth()
  const theme  = useTheme()
  const accent = theme.palette.primary.main

  const [baseId,   setBaseId]   = useState('')
  const [compId,   setCompId]   = useState('')
  const [keyCol,   setKeyCol]   = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [result,   setResult]   = useState(null)

  const canRun = baseId && compId && baseId !== compId

  const handleCompare = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await diffRunOutputs(baseId, compId, keyCol || null, token)
      setResult(res.data)
    } catch (e) {
      setError(formatApiError(e))
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setResult(null)
    setError(null)
    onClose()
  }

  const cellSx = { fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', py: 1, borderColor: 'divider' }
  const headSx = { ...cellSx, fontWeight: 700, fontSize: '0.57rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.secondary', bgcolor: 'background.default' }

  const summary = result?.summary
  const meta    = result?.meta

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth
      PaperProps={{ sx: { bgcolor: 'background.paper', backgroundImage: 'none', maxHeight: '90vh' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontFamily: '"Cormorant Garamond", serif', fontSize: '1.5rem', fontWeight: 700 }}>
        <CompareArrows sx={{ color: accent, fontSize: 22 }} />
        Compare Runs
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '8px !important' }}>
        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

        {/* Selectors */}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ flex: 1, minWidth: 200 }}>
            <InputLabel sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>Base run (older)</InputLabel>
            <Select value={baseId} label="Base run (older)" onChange={(e) => setBaseId(e.target.value)}
              sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>
              {(runOutputs || []).map((r) => (
                <MenuItem key={r.id} value={r.id} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>{r.display_name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ flex: 1, minWidth: 200 }}>
            <InputLabel sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>Comparison run (newer)</InputLabel>
            <Select value={compId} label="Comparison run (newer)" onChange={(e) => setCompId(e.target.value)}
              sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>
              {(runOutputs || []).filter((r) => r.id !== baseId).map((r) => (
                <MenuItem key={r.id} value={r.id} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>{r.display_name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Key column (optional)" size="small" sx={{ flex: 1, minWidth: 160 }}
            value={keyCol} onChange={(e) => setKeyCol(e.target.value)}
            placeholder="Auto-detect"
            InputProps={{ sx: { fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' } }}
            InputLabelProps={{ sx: { fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' } }}
          />
        </Box>

        <Button
          onClick={handleCompare} disabled={!canRun || loading}
          startIcon={loading ? <CircularProgress size={13} sx={{ color: 'background.default' }} /> : <CompareArrows />}
          sx={{ alignSelf: 'flex-start', bgcolor: accent, color: 'background.default',
            fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.72rem', px: 3, py: 1,
            borderRadius: '2px', '&:hover': { bgcolor: 'primary.light' }, '&:disabled': { opacity: 0.45 } }}>
          {loading ? 'Comparing…' : 'Compare'}
        </Button>

        {/* Summary */}
        {summary && (
          <Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <SummaryChip label="Added"     count={summary.added_count}   color="#6b8f71" />
              <SummaryChip label="Removed"   count={summary.removed_count} color="#b45050" />
              <SummaryChip label="Changed"   count={summary.changed_count} color="#c9a84c" />
              <SummaryChip label="Unchanged" count={summary.unchanged_count} color="text.secondary" />
            </Box>
            {meta?.key_column && (
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.65rem', color: 'text.disabled', mb: 1.5 }}>
                Key column: <strong>{meta.key_column}</strong>
              </Typography>
            )}

            {/* Added rows */}
            {result.added_rows?.length > 0 && (
              <Accordion defaultExpanded={result.added_rows.length <= 10}
                sx={{ bgcolor: 'rgba(107,143,113,0.05)', '&:before': { display: 'none' }, mb: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={pillSx('#6b8f71')}>ADDED</Box>
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.75rem', color: '#6b8f71' }}>
                      {result.added_rows.length} row{result.added_rows.length !== 1 ? 's' : ''}{summary.added_count > result.added_rows.length ? ` (showing ${result.added_rows.length} of ${summary.added_count})` : ''}
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <RowTable rows={result.added_rows} headSx={headSx} cellSx={cellSx} />
                </AccordionDetails>
              </Accordion>
            )}

            {/* Removed rows */}
            {result.removed_rows?.length > 0 && (
              <Accordion defaultExpanded={result.removed_rows.length <= 10}
                sx={{ bgcolor: 'rgba(180,80,80,0.05)', '&:before': { display: 'none' }, mb: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={pillSx('#b45050')}>REMOVED</Box>
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.75rem', color: '#b45050' }}>
                      {result.removed_rows.length} row{result.removed_rows.length !== 1 ? 's' : ''}{summary.removed_count > result.removed_rows.length ? ` (showing ${result.removed_rows.length} of ${summary.removed_count})` : ''}
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <RowTable rows={result.removed_rows} headSx={headSx} cellSx={cellSx} />
                </AccordionDetails>
              </Accordion>
            )}

            {/* Changed rows */}
            {result.changed_rows?.length > 0 && (
              <Accordion defaultExpanded={result.changed_rows.length <= 10}
                sx={{ bgcolor: 'rgba(201,168,76,0.04)', '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={pillSx('#c9a84c')}>CHANGED</Box>
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.75rem', color: '#c9a84c' }}>
                      {result.changed_rows.length} row{result.changed_rows.length !== 1 ? 's' : ''}{summary.changed_count > result.changed_rows.length ? ` (showing ${result.changed_rows.length} of ${summary.changed_count})` : ''}
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <ChangedRowTable rows={result.changed_rows} keyCol={meta?.key_column} headSx={headSx} cellSx={cellSx} />
                </AccordionDetails>
              </Accordion>
            )}

            {summary.added_count === 0 && summary.removed_count === 0 && summary.changed_count === 0 && (
              <Alert severity="success">No differences found — the two runs are identical.</Alert>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={handleClose} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', color: 'text.secondary' }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function RowTable({ rows, headSx, cellSx }) {
  if (!rows.length) return null
  const cols = Object.keys(rows[0]).slice(0, 12)
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>{cols.map((c) => <TableCell key={c} sx={headSx}>{c}</TableCell>)}</TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i} hover>
              {cols.map((c) => (
                <TableCell key={c} sx={cellSx}>
                  <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: 'text.secondary' }}>
                    {String(r[c] ?? '—')}
                  </Typography>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}

function ChangedRowTable({ rows, keyCol, headSx, cellSx }) {
  if (!rows.length) return null
  const allChangedCols = [...new Set(rows.flatMap((r) => Object.keys(r.changes || {})))]
  const idCol = keyCol || 'row_index'

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={headSx}>{idCol}</TableCell>
            {allChangedCols.map((c) => <TableCell key={c} sx={headSx}>{c}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i} hover>
              <TableCell sx={cellSx}>
                <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: 'text.primary' }}>
                  {String(r[idCol] ?? i)}
                </Typography>
              </TableCell>
              {allChangedCols.map((c) => (
                <TableCell key={c} sx={cellSx}>
                  <ChangedCell col={c} changes={r.changes || {}} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}
