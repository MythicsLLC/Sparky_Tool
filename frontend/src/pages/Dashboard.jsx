import { useState, useEffect, useMemo } from 'react'
import { Box, Typography, Button, Alert, CircularProgress, FormControl, InputLabel, Select, MenuItem, Chip, Grid, Card, CardContent } from '@mui/material'
import BoltIcon from '@mui/icons-material/Bolt'
import KPICards from '../components/KPICards'
import Charts from '../components/Charts'
import DataTable from '../components/DataTable'
import LoadingDialog from '../components/LoadingDialog'
import { useAuth } from '../AuthContext'
import { listConfigs, listRuns, runConfig } from '../api'

const STEP_CONTENT = [
  {
    title: 'Configure your settings',
    description: 'Create and save a PeopleSoft configuration, add a user profile, and complete onboarding so your workspace is ready for production.',
  },
  {
    title: 'Run the engine',
    description: 'Choose a saved configuration and trigger a secure engine run. Results are stored and logged for future review.',
  },
  {
    title: 'Review logs',
    description: 'Inspect recent run history and review latest results, including success, errors, and run duration.',
  },
]

function StepBadge({ index, label, active, completed }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
      <Box sx={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        bgcolor: active ? '#c9a84c' : completed ? '#6b8f71' : '#111316',
        color: active || completed ? '#0b0c0e' : '#7a7060',
        border: active ? '1px solid #e8c96a' : '1px solid rgba(201,168,76,0.12)',
      }}>
        {completed ? '✓' : index + 1}
      </Box>
      <Box>
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: active ? '#c9a84c' : '#7a7060' }}>{label}</Typography>
      </Box>
    </Box>
  )
}

export default function Dashboard() {
  const { user, token } = useAuth()
  const [configs, setConfigs] = useState([])
  const [runs, setRuns] = useState([])
  const [activeConfigId, setActiveConfigId] = useState(null)
  const [lastResult, setLastResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeStep, setActiveStep] = useState(0)

  const selectedConfig = useMemo(
    () => configs.find((item) => item.id === activeConfigId) || null,
    [configs, activeConfigId],
  )

  useEffect(() => {
    if (!token) return
    setLoading(true)
    Promise.all([listConfigs(token), listRuns(token)])
      .then(([configsRes, runsRes]) => {
        const savedConfigs = configsRes.data
        setConfigs(savedConfigs)
        if (savedConfigs.length && !activeConfigId) {
          setActiveConfigId(savedConfigs[0].id)
        }
        setRuns(runsRes.data.items)
      })
      .catch((err) => {
        setError(err.response?.data?.detail || 'Unable to load dashboard data')
      })
      .finally(() => setLoading(false))
  }, [token])

  const handleRun = async () => {
    if (!activeConfigId) {
      setError('Select a configuration first, or create one in Settings.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await runConfig(activeConfigId, token)
      setLastResult(response.data)
      setRuns((prev) => [response.data, ...prev])
      setActiveStep(2)
    } catch (err) {
      setError(err.response?.data?.detail || 'Run failed unexpectedly')
    } finally {
      setLoading(false)
    }
  }

  const handleStep = (index) => setActiveStep(index)

  const completionState = [
    Boolean(configs.length),
    Boolean(lastResult || runs.length),
    Boolean(runs.length),
  ]

  return (
    <Box sx={{ flex: 1, minHeight: '100vh', bgcolor: '#0b0c0e', px: 5, py: 5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', mb: 4, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.58rem', letterSpacing: '0.3em', color: '#3a3428', textTransform: 'uppercase', mb: 0.5 }}>Sparky Platform</Typography>
          <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '2rem', fontWeight: 700, color: '#ede8d0', letterSpacing: '0.04em', lineHeight: 1 }}>Operational Dashboard</Typography>
        </Box>
        <Button
          startIcon={loading ? <CircularProgress size={14} sx={{ color: '#0b0c0e' }} /> : <BoltIcon sx={{ fontSize: 16 }} />}
          onClick={handleRun}
          disabled={loading || !configs.length}
          sx={{ background: '#c9a84c', color: '#0b0c0e', fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.14em', px: 3, py: 1.2, borderRadius: '1px', boxShadow: '0 2px 16px rgba(201,168,76,0.25)', '&:hover': { background: '#e8c96a', boxShadow: '0 4px 24px rgba(201,168,76,0.4)' }, transition: 'all 0.2s ease' }}
        >
          {loading ? 'Running...' : 'Run selected config'}
        </Button>
      </Box>

      <Grid container spacing={2} sx={{ mb: 4 }}>
        {STEP_CONTENT.map((step, index) => (
          <Grid key={step.title} item xs={12} md={4}>
            <Card sx={{ bgcolor: activeStep === index ? '#171a1f' : '#111316', borderColor: activeStep === index ? '#c9a84c' : 'rgba(201,168,76,0.08)', cursor: 'pointer' }} onClick={() => handleStep(index)}>
              <CardContent>
                <Typography sx={{ fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c9a84c', mb: 1 }}>{`Step ${index + 1}`}</Typography>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: '#ede8d0', mb: 1 }}>{step.title}</Typography>
                <Typography sx={{ color: '#7a7060', fontSize: '0.88rem', lineHeight: 1.7 }}>{step.description}</Typography>
                {completionState[index] && <Chip label="Complete" size="small" sx={{ mt: 2, bgcolor: '#6b8f71', color: '#0b0c0e' }} />}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 4 }}>{error}</Alert>
      )}

      <Box sx={{ mb: 5, display: 'grid', gap: 4 }}>
        <Card sx={{ p: 4, bgcolor: '#111316', borderColor: 'rgba(201,168,76,0.08)' }}>
          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.88rem', fontWeight: 700, color: '#c9a84c', mb: 2 }}>{STEP_CONTENT[activeStep].title}</Typography>
          <Typography sx={{ color: '#7a7060', mb: 3 }}>{STEP_CONTENT[activeStep].description}</Typography>

          {activeStep === 0 && (
            <Box sx={{ display: 'grid', gap: 3 }}>
              {!configs.length ? (
                <Box sx={{ display: 'grid', gap: 2 }}>
                  <Typography sx={{ color: '#ede8d0' }}>No configurations found yet.</Typography>
                  <Button variant="contained" onClick={() => window.location.hash = 'settings'} sx={{ width: 'max-content', bgcolor: '#c9a84c', color: '#0b0c0e' }}>Go to Settings</Button>
                </Box>
              ) : (
                <Box sx={{ display: 'grid', gap: 2 }}>
                  <Typography sx={{ color: '#ede8d0' }}>Select a configuration in Settings to prepare your first run.</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {configs.map((config) => (
                      <Chip key={config.id} label={config.name} color={config.id === activeConfigId ? 'warning' : 'default'} onClick={() => setActiveConfigId(config.id)} />
                    ))}
                  </Box>
                </Box>
              )}
              {!user.onboarded && (
                <Alert severity="info" sx={{ bgcolor: 'rgba(66,100,162,0.08)', border: '1px solid rgba(201,168,76,0.16)' }}>
                  New user onboarding is not complete. Save your first configuration in Settings and run the engine to finish setup.
                </Alert>
              )}
            </Box>
          )}

          {activeStep === 1 && (
            <Box sx={{ display: 'grid', gap: 3 }}>
              <Typography sx={{ color: '#ede8d0' }}>Current configuration:</Typography>
              {selectedConfig ? (
                <Box>
                  <Typography sx={{ color: '#c9a84c', fontWeight: 700 }}>{selectedConfig.name}</Typography>
                  <Typography sx={{ color: '#7a7060' }}>{selectedConfig.ps_base_url || 'No base URL configured'}</Typography>
                </Box>
              ) : (
                <Typography sx={{ color: '#7a7060' }}>Pick a configuration in Settings before running the engine.</Typography>
              )}
              <Button
                variant="contained"
                onClick={handleRun}
                disabled={loading || !selectedConfig}
                sx={{ width: 'max-content', bgcolor: '#c9a84c', color: '#0b0c0e' }}
              >
                {loading ? 'Running...' : 'Run now'}
              </Button>
            </Box>
          )}

          {activeStep === 2 && (
            <Box sx={{ display: 'grid', gap: 3 }}>
              <Typography sx={{ color: '#ede8d0' }}>Recent runs</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {runs.slice(0, 4).map((run) => (
                  <Chip key={run.id} label={`${run.config_name} • ${run.status}`} color={run.status === 'success' ? 'success' : 'error'} />
                ))}
              </Box>
              {lastResult ? (
                <Box sx={{ display: 'grid', gap: 1 }}>
                  <Typography sx={{ color: '#c9a84c', fontWeight: 700 }}>Most recent run</Typography>
                  <Typography sx={{ color: '#7a7060' }}>{`Rows: ${lastResult.row_count || 'N/A'}, Duration: ${lastResult.duration_ms || 'N/A'} ms`}</Typography>
                </Box>
              ) : (
                <Typography sx={{ color: '#7a7060' }}>Run the engine to see results here.</Typography>
              )}
            </Box>
          )}
        </Card>
      </Box>

      {lastResult && (
        <Box sx={{ display: 'grid', gap: 6 }}>
          {/* PS tracking cards — always shown */}
          <Box>
            <Typography sx={{ color: '#c9a84c', fontSize: '0.88rem', fontWeight: 700, mb: 2 }}>
              PeopleSoft Process Tracking
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Card sx={{ p: 3, bgcolor: '#111316', borderColor: 'rgba(201,168,76,0.08)' }}>
                  <Typography sx={{ color: '#7a7060', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', mb: 1 }}>Instance ID</Typography>
                  <Typography sx={{ color: '#c9a84c', fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>
                    {lastResult.instance_id || <span style={{ color: '#3a3428' }}>—</span>}
                  </Typography>
                </Card>
              </Grid>
              <Grid item xs={12} md={4}>
                <Card sx={{ p: 3, bgcolor: '#111316', borderColor: 'rgba(201,168,76,0.08)' }}>
                  <Typography sx={{ color: '#7a7060', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', mb: 1 }}>Report ID</Typography>
                  <Typography sx={{ color: '#c9a84c', fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>
                    {lastResult.report_id || <span style={{ color: '#3a3428' }}>—</span>}
                  </Typography>
                </Card>
              </Grid>
              <Grid item xs={12} md={4}>
                <Card sx={{ p: 3, bgcolor: '#111316', borderColor: 'rgba(201,168,76,0.08)' }}>
                  <Typography sx={{ color: '#7a7060', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', mb: 1 }}>Rows Processed</Typography>
                  <Typography sx={{ color: '#ede8d0', fontWeight: 700 }}>
                    {lastResult.row_count != null ? lastResult.row_count.toLocaleString() : '—'}
                  </Typography>
                </Card>
              </Grid>
            </Grid>
          </Box>

          {/* SFTP-skipped notice — shown instead of charts/table */}
          {lastResult.sftp_skipped ? (
            <Alert
              severity="info"
              sx={{
                bgcolor: 'rgba(100,149,180,0.08)',
                border: '1px solid rgba(100,149,180,0.2)',
                color: '#8ab4cc',
                '& .MuiAlert-icon': { color: '#6495b4' },
              }}
            >
              <Typography sx={{ fontWeight: 700, mb: 0.5, fontSize: '0.88rem' }}>
                Process completed — no CSV data available
              </Typography>
              <Typography sx={{ fontSize: '0.82rem' }}>
                {lastResult.message}
              </Typography>
            </Alert>
          ) : (
            <>
              <section>
                <Typography sx={{ color: '#c9a84c', fontSize: '0.88rem', fontWeight: 700, mb: 2 }}>Visual summary</Typography>
                <KPICards kpis={lastResult.kpis} />
              </section>

              <section>
                <Typography sx={{ color: '#c9a84c', fontSize: '0.88rem', fontWeight: 700, mb: 2 }}>Trend charts</Typography>
                <Charts kpis={lastResult.kpis} />
              </section>

              <section>
                <Typography sx={{ color: '#c9a84c', fontSize: '0.88rem', fontWeight: 700, mb: 2 }}>Row data</Typography>
                <DataTable rows={lastResult.rows} columns={lastResult.columns} />
              </section>
            </>
          )}
        </Box>
      )}

      <LoadingDialog open={loading} />
    </Box>
  )
}
