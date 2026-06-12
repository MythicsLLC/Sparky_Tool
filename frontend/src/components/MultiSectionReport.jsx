import { useState, useMemo } from 'react'
import {
  Box, Typography, Chip, Grid,
  Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import TableChartIcon from '@mui/icons-material/TableChart'
import TuneIcon      from '@mui/icons-material/Tune'
import { DataGrid }  from '@mui/x-data-grid'
import { useThemeContext } from '../ThemeContext'
import { getDataGridSx }  from '../utils/dataGridSx'

// ── KV section ────────────────────────────────────────────────────────────────
function KVSection({ data }) {
  const { accent } = useThemeContext()
  const entries = Object.entries(data)
  if (!entries.length) return null
  return (
    <Grid container spacing={1} sx={{ pt: 2 }}>
      {entries.map(([key, val]) => (
        <Grid item xs={12} sm={6} md={4} lg={3} key={key}>
          <Box sx={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            px: 1.5, py: 0.75, border: '1px solid', borderColor: 'divider',
            borderRadius: '2px', bgcolor: 'background.default',
          }}>
            <Typography sx={{
              fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem',
              fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'text.disabled', mr: 1, flexShrink: 0,
            }}>
              {key}
            </Typography>
            <Typography sx={{
              fontFamily: '"JetBrains Mono", monospace', fontSize: '0.76rem', fontWeight: 600,
              color: val === 'Y' ? '#6b8f71' : val === 'N' ? '#b45050' : `${accent}cc`,
            }}>
              {val || '—'}
            </Typography>
          </Box>
        </Grid>
      ))}
    </Grid>
  )
}

// ── Table section ─────────────────────────────────────────────────────────────
function TableSection({ columns, rows }) {
  const { accent, mode } = useThemeContext()

  const colDefs = useMemo(() => columns.map((col) => ({
    field:      col,
    headerName: col,
    flex:       1,
    minWidth:   100,
    renderCell: (p) => (
      <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem', color: 'text.secondary' }}>
        {String(p.value ?? '')}
      </Typography>
    ),
  })), [columns])

  const rowsWithId = useMemo(() => rows.map((r, i) => ({ ...r, _idx: i })), [rows])

  return (
    <Box sx={{ pt: 2, border: '1px solid', borderColor: 'divider', borderRadius: '2px', overflow: 'hidden' }}>
      <DataGrid
        rows={rowsWithId}
        columns={colDefs}
        getRowId={(r) => r._idx}
        autoHeight
        disableRowSelectionOnClick
        pageSizeOptions={[10, 25, 50]}
        initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
        sx={{ ...getDataGridSx(accent, mode), border: 'none', borderRadius: 0 }}
      />
    </Box>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MultiSectionReport({ sections = [] }) {
  const { accent } = useThemeContext()

  // All sections start expanded
  const [expanded, setExpanded] = useState(() => new Set(sections.map((_, i) => i)))

  const toggle = (i) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    return next
  })

  const tableCount = sections.filter((s) => s.type === 'table').length
  const kvCount    = sections.filter((s) => s.type === 'kv').length
  const totalRows  = sections.reduce((n, s) => n + (s.type === 'table' ? s.rows.length : 0), 0)

  if (!sections.length) return null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Summary */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        {[
          { label: `${sections.length} sections` },
          { label: `${tableCount} table${tableCount !== 1 ? 's' : ''}` },
          { label: `${kvCount} config block${kvCount !== 1 ? 's' : ''}` },
          { label: `${totalRows.toLocaleString()} total rows` },
        ].map(({ label }) => (
          <Chip
            key={label} label={label} size="small" variant="outlined"
            sx={{
              fontFamily: '"JetBrains Mono", monospace', fontSize: '0.65rem',
              borderColor: `${accent}33`, color: accent,
            }}
          />
        ))}
      </Box>

      {/* Sections */}
      {sections.map((section, i) => (
        <Accordion
          key={i}
          expanded={expanded.has(i)}
          onChange={() => toggle(i)}
          disableGutters
          elevation={0}
          sx={{
            border: '1px solid', borderColor: 'divider',
            borderRadius: '2px !important', bgcolor: 'background.paper',
            '&:before': { display: 'none' },
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon sx={{ fontSize: 16, color: 'text.disabled' }} />}
            sx={{
              px: 2.5,
              minHeight: '42px !important',
              '& .MuiAccordionSummary-content': {
                my: '10px !important', display: 'flex', alignItems: 'center', gap: 1.5,
              },
            }}
          >
            {section.type === 'kv' ? (
              <TuneIcon sx={{ fontSize: 13, color: accent, opacity: 0.7 }} />
            ) : (
              <TableChartIcon sx={{ fontSize: 13, color: '#6b8f71', opacity: 0.8 }} />
            )}
            <Chip
              label={section.type === 'kv' ? 'CONFIG' : 'TABLE'}
              size="small"
              sx={{
                height: 16, fontSize: '0.5rem', fontWeight: 700,
                fontFamily: '"Raleway", sans-serif', letterSpacing: '0.12em',
                bgcolor: section.type === 'kv' ? `${accent}14` : 'rgba(107,143,113,0.14)',
                color:   section.type === 'kv' ? accent : '#6b8f71',
              }}
            />
            <Typography sx={{
              fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem',
              fontWeight: 700, color: 'text.primary',
            }}>
              {section.title}
            </Typography>
            <Typography sx={{
              fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6rem', color: 'text.disabled',
            }}>
              {section.type === 'table'
                ? `${section.rows.length} rows · ${section.columns.length} cols`
                : `${Object.keys(section.data).length} keys`
              }
            </Typography>
          </AccordionSummary>

          <AccordionDetails sx={{ px: 2.5, pb: 2.5, pt: 0, borderTop: '1px solid', borderColor: 'divider' }}>
            {section.type === 'kv'
              ? <KVSection data={section.data} />
              : <TableSection columns={section.columns} rows={section.rows} />
            }
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  )
}
