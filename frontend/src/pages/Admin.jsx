import { useEffect, useState } from 'react'
import {
  Box, Typography, CircularProgress, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableHead, TableRow, Tabs, Tab,
  Chip, Alert, Tooltip, IconButton,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useAuth } from '../AuthContext'
import { listAdminStats, listAdminLogs, listAdminUsers, listAdminRuns, setUserRole } from '../api'

// ── helpers ───────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }) {
  return (
    <Card variant="outlined" sx={{ bgcolor: '#14161a', borderColor: 'rgba(201,168,76,0.12)', height: '100%' }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Typography sx={{ fontSize: '0.6rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#c9a84c', mb: 1 }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: '1.9rem', fontWeight: 700, color: '#ede8d0', lineHeight: 1 }}>{value}</Typography>
        {sub && (
          <Typography sx={{ fontSize: '0.65rem', color: '#5a5040', mt: 0.75 }}>{sub}</Typography>
        )}
      </CardContent>
    </Card>
  )
}

function StatusChip({ status, sftp_skipped }) {
  let label = status
  let bg = 'rgba(201,168,76,0.1)'
  let color = '#c9a84c'

  if (status === 'success' && sftp_skipped) {
    label = 'PS only'
    bg = 'rgba(100,149,180,0.15)'
    color = '#6495b4'
  } else if (status === 'success') {
    label = 'success'
    bg = 'rgba(107,143,113,0.15)'
    color = '#6b8f71'
  } else if (status === 'error') {
    label = 'error'
    bg = 'rgba(180,80,80,0.18)'
    color = '#b45050'
  } else if (status === 'running') {
    label = 'running'
    bg = 'rgba(201,168,76,0.1)'
    color = '#c9a84c'
  }

  const chip = (
    <Chip label={label} size="small"
      sx={{ bgcolor: bg, color, fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', letterSpacing: '0.06em', height: 20 }} />
  )

  if (status === 'success' && sftp_skipped) {
    return (
      <Tooltip title="PeopleSoft triggered successfully — SFTP not configured, no CSV downloaded" arrow>
        {chip}
      </Tooltip>
    )
  }
  return chip
}

function mono(val, fallback = '—') {
  if (!val) return <span style={{ color: '#3a3428' }}>{fallback}</span>
  return <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.7rem', color: '#c9a84c' }}>{val}</span>
}

function fmtMs(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const cellSx = { fontFamily: '"Raleway", sans-serif', fontSize: '0.75rem', color: '#ede8d0', borderColor: 'rgba(201,168,76,0.06)', py: 1.25 }
const headSx = { fontFamily: '"Raleway", sans-serif', fontSize: '0.58rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#4a4030', borderColor: 'rgba(201,168,76,0.1)', py: 1.25 }

// ── main component ────────────────────────────────────────────────────────────

export default function Admin() {
  const { token, user } = useAuth()
  const [tab, setTab]     = useState(0)
  const [stats, setStats] = useState(null)
  const [logs, setLogs]   = useState([])
  const [users, setUsers] = useState([])
  const [runs, setRuns]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const load = () => {
    if (!token) return
    setLoading(true)
    Promise.all([
      listAdminStats(token),
      listAdminLogs(token, { limit: 100 }),
      listAdminUsers(token, { limit: 100 }),
      listAdminRuns(token, { limit: 100 }),
    ])
      .then(([statsRes, logsRes, usersRes, runsRes]) => {
        setStats(statsRes.data)
        setLogs(logsRes.data.items ?? [])
        setUsers(usersRes.data.items ?? [])
        setRuns(runsRes.data.items ?? [])
        setError(null)
      })
      .catch((err) => setError(err.response?.data?.detail || 'Unable to load admin data'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [token])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleRoleToggle = async (userId, currentRole) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    try {
      await setUserRole(userId, newRole, token)
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u))
    } catch { /* ignore */ }
  }

  if (!user?.role || user.role !== 'admin') {
    return (
      <Box sx={{ p: 6 }}>
        <Typography sx={{ color: '#ede8d0', fontSize: '1.4rem', mb: 2 }}>Admin access required</Typography>
        <Typography sx={{ color: '#7a7060' }}>Only users with an admin role can view system statistics and audit logs.</Typography>
      </Box>
    )
  }

  if (loading) {
    return (
      <Box sx={{ p: 6, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={28} sx={{ color: '#c9a84c' }} />
      </Box>
    )
  }

  return (
    <Box sx={{ flex: 1, minHeight: '100vh', bgcolor: '#0b0c0e', px: 5, py: 5 }}>

      {/* header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 4 }}>
        <Box>
          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.58rem', letterSpacing: '0.3em', color: '#3a3428', textTransform: 'uppercase', mb: 0.5 }}>System</Typography>
          <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '2rem', fontWeight: 700, color: '#ede8d0' }}>Admin Dashboard</Typography>
        </Box>
        <IconButton onClick={load} size="small" sx={{ color: '#5a5040', mt: 1, '&:hover': { color: '#c9a84c' } }}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3, bgcolor: 'rgba(180,80,80,0.1)', color: '#e08080', border: '1px solid rgba(180,80,80,0.2)' }}>{error}</Alert>}

      {/* KPI row */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 5 }}>
          <Grid item xs={6} sm={3} md={2}>
            <StatCard label="Total users" value={stats.total_users ?? 0} />
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <StatCard label="Total runs" value={stats.total_runs ?? 0} sub={`${stats.running_runs ?? 0} in progress`} />
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <StatCard label="Success rate" value={`${stats.success_rate ?? 0}%`} sub={`${stats.success_runs} ok · ${stats.error_runs} failed`} />
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <StatCard label="Avg runtime" value={fmtMs(stats.avg_duration_ms)} />
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <StatCard label="Rows processed" value={(stats.total_rows_processed ?? 0).toLocaleString()} sub={`avg ${(stats.avg_rows_per_run ?? 0).toLocaleString()} / run`} />
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <StatCard label="PS-only runs" value={stats.sftp_skipped ?? 0} sub="SFTP not configured" />
          </Grid>
        </Grid>
      )}

      {/* tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 3,
          borderBottom: '1px solid rgba(201,168,76,0.1)',
          '& .MuiTab-root': { fontFamily: '"Raleway"', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4a4030', minHeight: 40 },
          '& .Mui-selected': { color: '#c9a84c' },
          '& .MuiTabs-indicator': { bgcolor: '#c9a84c' },
        }}
      >
        <Tab label="Reports & Runs" />
        <Tab label="Users" />
        <Tab label="Audit log" />
      </Tabs>

      {/* ── tab 0: Reports & Runs ─────────────────────────────────────────── */}
      {tab === 0 && (
        <Card variant="outlined" sx={{ bgcolor: '#14161a', borderColor: 'rgba(201,168,76,0.1)' }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: 'rgba(201,168,76,0.03)' }}>
                  <TableCell sx={headSx}>#</TableCell>
                  <TableCell sx={headSx}>User</TableCell>
                  <TableCell sx={headSx}>Config / Process</TableCell>
                  <TableCell sx={headSx}>Instance ID</TableCell>
                  <TableCell sx={headSx}>Report ID</TableCell>
                  <TableCell sx={headSx}>Status</TableCell>
                  <TableCell sx={headSx}>Rows</TableCell>
                  <TableCell sx={headSx}>Duration</TableCell>
                  <TableCell sx={headSx}>Started</TableCell>
                  <TableCell sx={headSx}>Detail</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id} hover sx={{ '&:hover': { bgcolor: 'rgba(201,168,76,0.025)' } }}>
                    <TableCell sx={{ ...cellSx, color: '#4a4030', fontSize: '0.68rem' }}>{r.id}</TableCell>
                    <TableCell sx={{ ...cellSx, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Tooltip title={r.user_email || r.user_id} arrow>
                        <span>{r.user_email || r.user_id || '—'}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Box>
                        <Typography sx={{ fontSize: '0.75rem', color: '#ede8d0', fontFamily: '"Raleway"' }}>{r.config_name || '—'}</Typography>
                        {r.ps_process_name && (
                          <Typography sx={{ fontSize: '0.62rem', color: '#5a5040', fontFamily: '"Raleway"', letterSpacing: '0.04em' }}>{r.ps_process_name}</Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell sx={cellSx}>{mono(r.instance_id)}</TableCell>
                    <TableCell sx={cellSx}>{mono(r.report_id)}</TableCell>
                    <TableCell sx={cellSx}>
                      <StatusChip status={r.status} sftp_skipped={r.sftp_skipped} />
                    </TableCell>
                    <TableCell sx={{ ...cellSx, textAlign: 'right' }}>{r.row_count != null ? r.row_count.toLocaleString() : '—'}</TableCell>
                    <TableCell sx={cellSx}>{fmtMs(r.duration_ms)}</TableCell>
                    <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap', fontSize: '0.68rem', color: '#7a7060' }}>{fmtDate(r.started_at)}</TableCell>
                    <TableCell sx={cellSx}>
                      {r.error_detail && (
                        <Tooltip title={r.error_detail} arrow>
                          <Typography sx={{ fontSize: '0.62rem', color: '#b45050', fontFamily: '"Raleway"', cursor: 'default', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.error_detail}
                          </Typography>
                        </Tooltip>
                      )}
                      {r.sftp_skipped && !r.error_detail && (
                        <Typography sx={{ fontSize: '0.62rem', color: '#5a7080', fontFamily: '"Raleway"' }}>
                          {r.skip_reason || 'SFTP skipped'}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!runs.length && (
                  <TableRow>
                    <TableCell colSpan={10} sx={{ ...cellSx, textAlign: 'center', color: '#3a3428', py: 4 }}>
                      No runs yet — trigger a run from the Dashboard to see tracking data here.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </Card>
      )}

      {/* ── tab 1: Users ─────────────────────────────────────────────────── */}
      {tab === 1 && (
        <Card variant="outlined" sx={{ bgcolor: '#14161a', borderColor: 'rgba(201,168,76,0.1)' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'rgba(201,168,76,0.03)' }}>
                <TableCell sx={headSx}>Email</TableCell>
                <TableCell sx={headSx}>Name</TableCell>
                <TableCell sx={headSx}>Role</TableCell>
                <TableCell sx={headSx}>Runs</TableCell>
                <TableCell sx={headSx}>Onboarded</TableCell>
                <TableCell sx={headSx}>Last seen</TableCell>
                <TableCell sx={headSx}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} hover sx={{ '&:hover': { bgcolor: 'rgba(201,168,76,0.025)' } }}>
                  <TableCell sx={cellSx}>{u.email}</TableCell>
                  <TableCell sx={{ ...cellSx, color: '#7a7060' }}>
                    {[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}
                  </TableCell>
                  <TableCell sx={cellSx}>
                    <Chip label={u.role} size="small"
                      sx={{ bgcolor: u.role === 'admin' ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.04)', color: u.role === 'admin' ? '#c9a84c' : '#5a5040', fontFamily: '"Raleway"', fontSize: '0.6rem', height: 20 }} />
                  </TableCell>
                  <TableCell sx={{ ...cellSx, textAlign: 'right' }}>{u.run_count ?? 0}</TableCell>
                  <TableCell sx={cellSx}>{u.onboarded ? <span style={{ color: '#6b8f71' }}>✓</span> : <span style={{ color: '#3a3428' }}>—</span>}</TableCell>
                  <TableCell sx={{ ...cellSx, fontSize: '0.68rem', color: '#7a7060' }}>
                    {u.last_seen_at ? new Date(u.last_seen_at).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell sx={cellSx}>
                    {u.id !== user.id && (
                      <Typography
                        onClick={() => handleRoleToggle(u.id, u.role)}
                        sx={{ cursor: 'pointer', fontSize: '0.65rem', color: '#5a5040', fontFamily: '"Raleway"', '&:hover': { color: '#c9a84c' } }}
                      >
                        {u.role === 'admin' ? 'Remove admin' : 'Make admin'}
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!users.length && (
                <TableRow>
                  <TableCell colSpan={7} sx={{ ...cellSx, textAlign: 'center', color: '#3a3428', py: 4 }}>No users yet</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ── tab 2: Audit log ─────────────────────────────────────────────── */}
      {tab === 2 && (
        <Card variant="outlined" sx={{ bgcolor: '#14161a', borderColor: 'rgba(201,168,76,0.1)' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'rgba(201,168,76,0.03)' }}>
                <TableCell sx={headSx}>User</TableCell>
                <TableCell sx={headSx}>Event</TableCell>
                <TableCell sx={headSx}>Detail</TableCell>
                <TableCell sx={headSx}>IP</TableCell>
                <TableCell sx={headSx}>When</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.map((entry) => (
                <TableRow key={entry.id} hover sx={{ '&:hover': { bgcolor: 'rgba(201,168,76,0.025)' } }}>
                  <TableCell sx={{ ...cellSx, color: '#7a7060' }}>{entry.user_name || entry.user_id || '—'}</TableCell>
                  <TableCell sx={cellSx}>
                    <Chip label={entry.event_type} size="small"
                      sx={{ bgcolor: entry.event_type.startsWith('run') ? 'rgba(100,149,180,0.1)' : 'rgba(201,168,76,0.07)', color: entry.event_type.startsWith('run') ? '#6495b4' : '#7a6040', fontFamily: '"Raleway"', fontSize: '0.58rem', height: 18 }} />
                  </TableCell>
                  <TableCell sx={{ ...cellSx, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: '#5a5040', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Tooltip title={JSON.stringify(entry.detail, null, 2)} arrow>
                      <span>{JSON.stringify(entry.detail)}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={{ ...cellSx, fontSize: '0.68rem', color: '#4a4030' }}>{entry.ip_address || '—'}</TableCell>
                  <TableCell sx={{ ...cellSx, fontSize: '0.68rem', color: '#7a7060', whiteSpace: 'nowrap' }}>
                    {entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {!logs.length && (
                <TableRow>
                  <TableCell colSpan={5} sx={{ ...cellSx, textAlign: 'center', color: '#3a3428', py: 4 }}>No audit events yet</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </Box>
  )
}
