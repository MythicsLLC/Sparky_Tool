import { useState, useMemo } from 'react'
import {
  Box, Typography, Tabs, Tab, Tooltip, IconButton,
} from '@mui/material'
import HistoryIcon            from '@mui/icons-material/History'
import ChevronLeftIcon        from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon       from '@mui/icons-material/ChevronRight'
import FolderIcon             from '@mui/icons-material/Folder'
import FolderOpenIcon         from '@mui/icons-material/FolderOpen'
import KeyboardArrowDownIcon  from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight'

const DATE_PERIODS = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older']

function getPeriod(dateStr) {
  if (!dateStr) return 'Older'
  const days = (Date.now() - new Date(dateStr).getTime()) / 86400000
  if (days < 1)  return 'Today'
  if (days < 2)  return 'Yesterday'
  if (days < 7)  return 'This Week'
  if (days < 30) return 'This Month'
  return 'Older'
}

function timeAgo(ts) {
  if (!ts) return '—'
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function groupItems(items, dateKey, configKey) {
  const map = {}
  for (const item of items) {
    const p = getPeriod(item[dateKey])
    const c = item[configKey] || 'Unknown'
    if (!map[p]) map[p] = {}
    if (!map[p][c]) map[p][c] = []
    map[p][c].push(item)
  }
  return DATE_PERIODS
    .filter((p) => map[p])
    .map((p) => ({
      period: p,
      configs: Object.entries(map[p]).map(([name, its]) => ({ name, items: its })),
    }))
}

export default function HistorySidebar({ runs = [], runOutputs = [], accent }) {
  const [collapsed,   setCollapsed]   = useState(true)
  const [tab,         setTab]         = useState(0)
  const [openPeriods, setOpenPeriods] = useState(
    () => new Set(['Today', 'Yesterday', 'This Week', 'out:Today', 'out:Yesterday', 'out:This Week'])
  )
  const [openConfigs, setOpenConfigs] = useState(() => new Set())

  const runGroups    = useMemo(() => groupItems(runs,       'started_at', 'config_name'), [runs])
  const outputGroups = useMemo(() => groupItems(runOutputs, 'created_at', 'config_name'), [runOutputs])

  const togglePeriod = (key) =>
    setOpenPeriods((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  const toggleConfig = (key) =>
    setOpenConfigs((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })

  const fmtBytes = (b) =>
    !b ? null : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(1)} KB`

  const renderGroups = (groups, isOutputs) => {
    if (!groups.length) {
      return (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.64rem', color: 'text.disabled' }}>
            {isOutputs ? 'No outputs yet' : 'No runs yet'}
          </Typography>
        </Box>
      )
    }

    return groups.map(({ period, configs }) => {
      const pKey  = isOutputs ? `out:${period}` : period
      const pOpen = openPeriods.has(pKey)
      const total = configs.reduce((s, c) => s + c.items.length, 0)

      return (
        <Box key={pKey}>
          {/* ── Period header ─────────────────────── */}
          <Box
            onClick={() => togglePeriod(pKey)}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.75,
              px: 1.5, py: 0.75, cursor: 'pointer', userSelect: 'none',
              '&:hover': { bgcolor: `${accent}08` },
            }}
          >
            {pOpen
              ? <KeyboardArrowDownIcon  sx={{ fontSize: 12, color: accent, flexShrink: 0 }} />
              : <KeyboardArrowRightIcon sx={{ fontSize: 12, color: 'text.disabled', flexShrink: 0 }} />
            }
            <Typography sx={{
              fontFamily: '"Raleway", sans-serif', fontWeight: 700,
              fontSize: '0.56rem', letterSpacing: '0.18em', textTransform: 'uppercase',
              color: pOpen ? accent : 'text.disabled', flex: 1,
            }}>
              {period}
            </Typography>
            <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.54rem', color: 'text.disabled' }}>
              {total}
            </Typography>
          </Box>

          {/* ── Config folders ────────────────────── */}
          {pOpen && configs.map(({ name, items }) => {
            const cKey  = `${pKey}:${name}`
            const cOpen = openConfigs.has(cKey)

            return (
              <Box key={cKey}>
                <Box
                  onClick={() => toggleConfig(cKey)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 0.75,
                    pl: 2.5, pr: 1.5, py: 0.55,
                    cursor: 'pointer', userSelect: 'none',
                    '&:hover': { bgcolor: `${accent}06` },
                  }}
                >
                  {cOpen
                    ? <FolderOpenIcon sx={{ fontSize: 11, color: accent, opacity: 0.75, flexShrink: 0 }} />
                    : <FolderIcon     sx={{ fontSize: 11, color: 'text.disabled', flexShrink: 0 }} />
                  }
                  <Typography sx={{
                    fontFamily: '"Raleway", sans-serif', fontWeight: 600, fontSize: '0.62rem',
                    color: cOpen ? 'text.primary' : 'text.secondary',
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {name}
                  </Typography>
                  <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.52rem', color: 'text.disabled' }}>
                    {items.length}
                  </Typography>
                </Box>

                {/* ── Run items ───────────────────── */}
                {cOpen && !isOutputs && items.map((run) => {
                  const statusColor =
                    run.status === 'success' && run.sftp_skipped ? '#6495b4' :
                    run.status === 'success' ? '#6b8f71' :
                    run.status === 'error'   ? '#b45050' : accent
                  return (
                    <Box
                      key={run.id}
                      sx={{ pl: 4, pr: 1.5, py: 0.5, display: 'flex', alignItems: 'center', gap: 0.75, '&:hover': { bgcolor: `${accent}06` } }}
                    >
                      <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: statusColor, flexShrink: 0 }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.59rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {run.instance_id || `#${run.id}`}
                        </Typography>
                        <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.54rem', color: 'text.disabled' }}>
                          {timeAgo(run.started_at)}
                        </Typography>
                      </Box>
                    </Box>
                  )
                })}

                {/* ── Output items ────────────────── */}
                {cOpen && isOutputs && items.map((o) => (
                  <Box
                    key={o.id}
                    sx={{ pl: 4, pr: 1.5, py: 0.5, '&:hover': { bgcolor: `${accent}06` } }}
                  >
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.62rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.display_name}
                    </Typography>
                    {(o.row_count || o.file_size_bytes) && (
                      <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.54rem', color: 'text.disabled' }}>
                        {[o.row_count && `${o.row_count.toLocaleString()} rows`, fmtBytes(o.file_size_bytes)].filter(Boolean).join(' · ')}
                      </Typography>
                    )}
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.53rem', color: 'text.disabled' }}>
                      {timeAgo(o.created_at)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )
          })}
        </Box>
      )
    })
  }

  return (
    <Box
      sx={{
        width: collapsed ? 40 : 280,
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        height: '100vh',
        bgcolor: 'background.paper',
        borderLeft: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
      }}
    >
      {/* ── Header / toggle ──────────────────────────── */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          px: collapsed ? 0 : 1.5, py: 1.2,
          borderBottom: '1px solid', borderColor: 'divider',
          flexShrink: 0, minHeight: 40,
        }}
      >
        {!collapsed && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <HistoryIcon sx={{ fontSize: 13, color: accent }} />
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.57rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'text.secondary' }}>
              History
            </Typography>
          </Box>
        )}
        <Tooltip title={collapsed ? 'Open history' : 'Close history'} placement={collapsed ? 'right' : 'left'} arrow>
          <IconButton
            size="small"
            onClick={() => setCollapsed((v) => !v)}
            sx={{ p: 0.4, color: 'text.disabled', '&:hover': { color: accent, bgcolor: `${accent}12` } }}
          >
            {collapsed
              ? <ChevronLeftIcon  sx={{ fontSize: 16 }} />
              : <ChevronRightIcon sx={{ fontSize: 16 }} />
            }
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Collapsed vertical label ─────────────────── */}
      {collapsed && (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{
            fontFamily: '"Raleway", sans-serif', fontWeight: 700,
            fontSize: '0.55rem', letterSpacing: '0.22em', textTransform: 'uppercase',
            color: 'text.disabled', writingMode: 'vertical-rl', transform: 'rotate(180deg)',
          }}>
            History
          </Typography>
        </Box>
      )}

      {/* ── Expanded content ─────────────────────────── */}
      {!collapsed && (
        <>
          {/* Tabs: Runs | Outputs */}
          <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              variant="fullWidth"
              sx={{
                minHeight: 34,
                '& .MuiTab-root': {
                  minHeight: 34, py: 0,
                  fontFamily: '"Raleway", sans-serif', fontSize: '0.57rem',
                  letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.secondary',
                },
                '& .Mui-selected': { color: accent },
                '& .MuiTabs-indicator': { bgcolor: accent, height: '1.5px' },
              }}
            >
              <Tab label={`Runs${runs.length ? ` (${runs.length})` : ''}`} />
              <Tab label={`Outputs${runOutputs.length ? ` (${runOutputs.length})` : ''}`} />
            </Tabs>
          </Box>

          {/* Scrollable tree */}
          <Box
            sx={{
              flex: 1, overflowY: 'auto', py: 0.5,
              '&::-webkit-scrollbar': { width: 4 },
              '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
              '&::-webkit-scrollbar-thumb': { bgcolor: `${accent}30`, borderRadius: 2 },
            }}
          >
            {tab === 0 && renderGroups(runGroups,    false)}
            {tab === 1 && renderGroups(outputGroups, true)}
          </Box>
        </>
      )}
    </Box>
  )
}
