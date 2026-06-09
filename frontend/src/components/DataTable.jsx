import { useMemo, useState } from 'react'
import { DataGrid, GridToolbarQuickFilter } from '@mui/x-data-grid'
import {
  Box, Typography, Grid, Card, CardContent,
  InputAdornment, TextField,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import { useThemeContext } from '../ThemeContext'
import ViewToggle from './ViewToggle'
import { getDataGridSx } from '../utils/dataGridSx'

// ── Toolbar injected into the DataGrid ────────────────────────────────────────
function Toolbar({ rowCount, filteredCount }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      px: 2, py: 1.5,
      borderBottom: '1px solid',
      borderColor: 'divider',
    }}>
      <GridToolbarQuickFilter
        debounceMs={200}
        sx={{
          '& .MuiInputBase-root': {
            fontFamily: '"Raleway", sans-serif',
            fontSize: '0.82rem',
            color: 'text.primary',
          },
          '& .MuiInputBase-input::placeholder': { color: 'text.disabled' },
        }}
        placeholder="Search records…"
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {filteredCount !== rowCount && (
          <Typography sx={{ fontSize: '0.68rem', color: 'primary.main', fontFamily: '"JetBrains Mono", monospace' }}>
            {filteredCount} match{filteredCount !== 1 ? 'es' : ''}
          </Typography>
        )}
        <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', fontFamily: '"Raleway", sans-serif', fontWeight: 700, letterSpacing: '0.18em' }}>
          {rowCount.toLocaleString()} RECORDS
        </Typography>
      </Box>
    </Box>
  )
}

// ── Card view ─────────────────────────────────────────────────────────────────
function CsvCardGrid({ rows = [], columns = [] }) {
  const { accent } = useThemeContext()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return rows
    const q = search.toLowerCase()
    return rows.filter((r) =>
      columns.some((c) => String(r[c] ?? '').toLowerCase().includes(q))
    )
  }, [rows, columns, search])

  return (
    <Box>
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <TextField
          size="small"
          placeholder="Search records…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 15, color: 'text.disabled' }} /></InputAdornment>,
            sx: { fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' },
          }}
          sx={{
            width: 260,
            '& .MuiOutlinedInput-root': {
              borderRadius: '2px',
              '& fieldset': { borderColor: 'divider' },
              '&:hover fieldset': { borderColor: `${accent}55` },
              '&.Mui-focused fieldset': { borderColor: accent },
            },
          }}
        />
        <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', fontFamily: '"Raleway", sans-serif', fontWeight: 700, letterSpacing: '0.18em' }}>
          {filtered.length.toLocaleString()} / {rows.length.toLocaleString()} RECORDS
        </Typography>
      </Box>
      <Box sx={{ p: 2 }}>
        <Grid container spacing={2}>
          {filtered.map((row, i) => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%' }}>
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  {columns.map((col) => (
                    <Box key={col} sx={{ display: 'flex', gap: 1, mb: 0.6, alignItems: 'flex-start' }}>
                      <Typography sx={{
                        fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.14em',
                        textTransform: 'uppercase', color: 'text.disabled',
                        fontFamily: '"Raleway", sans-serif', minWidth: 90, flexShrink: 0, pt: 0.1,
                      }}>
                        {col}
                      </Typography>
                      <Typography sx={{
                        fontFamily: '"JetBrains Mono", monospace', fontSize: '0.74rem',
                        color: 'text.primary', wordBreak: 'break-all',
                      }}>
                        {String(row[col] ?? '—')}
                      </Typography>
                    </Box>
                  ))}
                </CardContent>
              </Card>
            </Grid>
          ))}
          {!filtered.length && (
            <Grid item xs={12}>
              <Typography sx={{ color: 'text.disabled', textAlign: 'center', py: 6, fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' }}>
                No records match your search
              </Typography>
            </Grid>
          )}
        </Grid>
      </Box>
    </Box>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DataTable({ rows = [], columns = [] }) {
  const { accent, mode } = useThemeContext()
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('datatable_view') || 'table'
  )

  const handleViewChange = (v) => {
    setViewMode(v)
    localStorage.setItem('datatable_view', v)
  }

  // Add stable row id for DataGrid
  const rowsWithId = useMemo(
    () => rows.map((r, i) => ({ ...r, _idx: i })),
    [rows],
  )

  const colDefs = useMemo(
    () => columns.map((col) => ({
      field:      col,
      headerName: col,
      flex:       1,
      minWidth:   120,
      renderCell: (p) => (
        <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.76rem', color: 'text.secondary' }}>
          {String(p.value ?? '')}
        </Typography>
      ),
    })),
    [columns],
  )

  const [filterModel, setFilterModel] = useState({ items: [], quickFilterValues: [] })
  const filteredCount = useMemo(() => {
    const q = (filterModel.quickFilterValues ?? []).join(' ').toLowerCase()
    if (!q) return rows.length
    return rows.filter((r) => columns.some((c) => String(r[c] ?? '').toLowerCase().includes(q))).length
  }, [filterModel, rows, columns])

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '2px', overflow: 'hidden', bgcolor: 'background.paper' }}>
      {/* Header with toggle */}
      <Box sx={{ px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'text.disabled' }}>
          Row Data
        </Typography>
        <ViewToggle value={viewMode} onChange={handleViewChange} />
      </Box>

      {viewMode === 'table' ? (
        <DataGrid
          rows={rowsWithId}
          columns={colDefs}
          getRowId={(r) => r._idx}
          autoHeight
          disableRowSelectionOnClick
          filterModel={filterModel}
          onFilterModelChange={setFilterModel}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          slots={{ toolbar: () => <Toolbar rowCount={rows.length} filteredCount={filteredCount} /> }}
          sx={getDataGridSx(accent, mode)}
        />
      ) : (
        <CsvCardGrid rows={rows} columns={columns} />
      )}
    </Box>
  )
}
