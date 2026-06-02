import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, Button, IconButton, Chip, Alert,
  Table, TableHead, TableBody, TableRow, TableCell,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Select, MenuItem, FormControl, InputLabel,
  Switch, FormControlLabel, CircularProgress, Tooltip,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import AddIcon      from '@mui/icons-material/Add'
import EditIcon     from '@mui/icons-material/Edit'
import DeleteIcon   from '@mui/icons-material/DeleteOutline'
import VerifiedIcon from '@mui/icons-material/VerifiedUser'
import { useAuth } from '../AuthContext'
import { listDqRules, createDqRule, updateDqRule, deleteDqRule, formatApiError } from '../api'

const RULE_TYPE_META = {
  row_count_gt:      { label: 'Row count >', params: [{ key: 'threshold', label: 'Min rows',    type: 'number' }] },
  row_count_lt:      { label: 'Row count <', params: [{ key: 'threshold', label: 'Max rows',    type: 'number' }] },
  row_count_between: { label: 'Row count between', params: [{ key: 'min', label: 'Min', type: 'number' }, { key: 'max', label: 'Max', type: 'number' }] },
  column_not_null:   { label: 'Column not null', params: [{ key: 'column', label: 'Column name', type: 'text' }] },
  value_must_exist:  { label: 'Value must exist', params: [{ key: 'column', label: 'Column name', type: 'text' }, { key: 'value', label: 'Required value', type: 'text' }] },
  column_unique:     { label: 'Column unique', params: [{ key: 'column', label: 'Column name', type: 'text' }] },
}

function ruleDescription(rule) {
  const p = rule.parameters || {}
  switch (rule.rule_type) {
    case 'row_count_gt':      return `Row count > ${p.threshold ?? '?'}`
    case 'row_count_lt':      return `Row count < ${p.threshold ?? '?'}`
    case 'row_count_between': return `Row count between ${p.min ?? '?'} and ${p.max ?? '?'}`
    case 'column_not_null':   return `"${p.column ?? '?'}" must not be null`
    case 'value_must_exist':  return `"${p.column ?? '?'}" must contain "${p.value ?? '?'}"`
    case 'column_unique':     return `"${p.column ?? '?'}" must be unique`
    default: return rule.rule_type
  }
}

const EMPTY_FORM = { name: '', rule_type: 'row_count_gt', parameters: {}, is_active: true }

export default function DataQualityPanel({ configId }) {
  const { token } = useAuth()
  const theme  = useTheme()
  const accent = theme.palette.primary.main

  const [rules,     setRules]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId,  setEditingId]  = useState(null)
  const [form,       setForm]       = useState(EMPTY_FORM)

  const refresh = useCallback(() => {
    if (!token || !configId) return
    listDqRules(token, configId)
      .then((r) => setRules(r.data))
      .catch((e) => setError(formatApiError(e)))
      .finally(() => setLoading(false))
  }, [token, configId])

  useEffect(() => { refresh() }, [refresh])

  const meta = RULE_TYPE_META[form.rule_type] || { params: [] }

  const openNew = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setDialogOpen(true)
  }

  const openEdit = (r) => {
    setForm({ name: r.name, rule_type: r.rule_type, parameters: { ...r.parameters }, is_active: r.is_active })
    setEditingId(r.id)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const payload = { config_id: configId, name: form.name, rule_type: form.rule_type, parameters: form.parameters, is_active: form.is_active }
      if (editingId) await updateDqRule(editingId, payload, token)
      else           await createDqRule(payload, token)
      setDialogOpen(false)
      refresh()
    } catch (e) {
      setError(formatApiError(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this rule?')) return
    try {
      await deleteDqRule(id, token)
      refresh()
    } catch (e) {
      setError(formatApiError(e))
    }
  }

  const setParam = (key, val) => setForm((p) => ({ ...p, parameters: { ...p.parameters, [key]: val } }))

  const cellSx = { fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', py: 1, borderColor: 'divider' }
  const headSx = { ...cellSx, fontWeight: 700, fontSize: '0.55rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.secondary', bgcolor: 'background.default' }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, mt: 1 }}>
        <VerifiedIcon sx={{ fontSize: 15, color: accent }} />
        <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'text.secondary', flex: 1 }}>
          Data Quality Rules
        </Typography>
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 13 }} />} onClick={openNew}
          sx={{ fontSize: '0.65rem', fontFamily: '"Raleway", sans-serif', color: accent, borderColor: `${accent}44`, minWidth: 0 }}
          variant="outlined">
          Add Rule
        </Button>
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && rules.length === 0 && (
        <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', color: 'text.disabled', py: 1 }}>
          No rules yet. Add assertions to validate each extract automatically.
        </Typography>
      )}

      {rules.length > 0 && (
        <Table size="small" sx={{ mb: 1 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={headSx}>Rule</TableCell>
              <TableCell sx={headSx}>Condition</TableCell>
              <TableCell sx={headSx} align="center">Active</TableCell>
              <TableCell sx={headSx} width={64} />
            </TableRow>
          </TableHead>
          <TableBody>
            {rules.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell sx={cellSx}>{r.name}</TableCell>
                <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>{ruleDescription(r)}</TableCell>
                <TableCell sx={cellSx} align="center">
                  <Chip
                    label={r.is_active ? 'On' : 'Off'}
                    size="small"
                    sx={{ height: 16, fontSize: '0.55rem',
                      bgcolor: r.is_active ? 'rgba(107,143,113,0.12)' : 'rgba(90,80,64,0.10)',
                      color: r.is_active ? '#6b8f71' : '#5a5040',
                      fontFamily: '"Raleway", sans-serif' }}
                  />
                </TableCell>
                <TableCell sx={cellSx}>
                  <Box sx={{ display: 'flex', gap: 0.25 }}>
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(r)} sx={{ color: 'text.disabled', '&:hover': { color: accent } }}><EditIcon sx={{ fontSize: 13 }} /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" onClick={() => handleDelete(r.id)} sx={{ color: 'text.disabled', '&:hover': { color: '#b45050' } }}><DeleteIcon sx={{ fontSize: 13 }} /></IconButton></Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { bgcolor: 'background.paper', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.4rem', fontWeight: 700 }}>
          {editingId ? 'Edit Rule' : 'Add Rule'}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

          <TextField
            label="Rule name" size="small" fullWidth
            value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Minimum headcount"
            InputProps={{ sx: { fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' } }}
            InputLabelProps={{ sx: { fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' } }}
          />

          <FormControl size="small" fullWidth>
            <InputLabel sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>Rule type</InputLabel>
            <Select value={form.rule_type} label="Rule type"
              onChange={(e) => setForm((p) => ({ ...p, rule_type: e.target.value, parameters: {} }))}
              sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' }}>
              {Object.entries(RULE_TYPE_META).map(([k, v]) => (
                <MenuItem key={k} value={k} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' }}>{v.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {meta.params.map(({ key, label, type }) => (
            <TextField
              key={key} label={label} size="small" fullWidth
              type={type} value={form.parameters[key] ?? ''}
              onChange={(e) => setParam(key, type === 'number' ? Number(e.target.value) : e.target.value)}
              InputProps={{ sx: { fontFamily: '"Raleway", sans-serif', fontSize: '0.82rem' } }}
              InputLabelProps={{ sx: { fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' } }}
            />
          ))}

          <FormControlLabel
            control={<Switch checked={form.is_active} size="small"
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />}
            label={<Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' }}>Active</Typography>}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', color: 'text.secondary' }}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name || !form.rule_type}
            sx={{ bgcolor: accent, color: 'background.default', fontFamily: '"Raleway", sans-serif', fontWeight: 700, fontSize: '0.72rem', px: 2.5, '&:hover': { bgcolor: 'primary.light' } }}>
            {saving ? <CircularProgress size={13} sx={{ color: 'background.default' }} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
