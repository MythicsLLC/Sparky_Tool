# Functional & Operational Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Functional (CoreHR Discovery viewer) and Operational (system health + run stats) as sub-tabs inside the existing Dashboard page alongside the current Run tab.

**Architecture:** Three sub-tabs (Run | Functional | Operational) rendered inside `Dashboard.jsx` using MUI Tabs. Two new page components (`FunctionalDashboard.jsx`, `OperationalDashboard.jsx`) handle their own data fetching. A new backend router (`insights.py`) provides CoreHR file listing/parsing and live health-check endpoints.

**Tech Stack:** React 18, MUI v5, Recharts (already installed), FastAPI, SQLAlchemy, httpx, Python `os` + line-by-line file parser.

---

## File Map

| File | Change | Responsibility |
|---|---|---|
| `backend/routers/insights.py` | CREATE | CoreHR file list, CoreHR file parse, health check |
| `backend/main.py` | MODIFY | Register insights router inside the v2 try block |
| `frontend/src/api.js` | MODIFY | Add `getCoreHRFiles`, `getCoreHRFile`, `checkConnectivity` |
| `frontend/src/pages/FunctionalDashboard.jsx` | CREATE | CoreHR viewer: file picker, KPIs, module grid, countries, params, BUs |
| `frontend/src/pages/OperationalDashboard.jsx` | CREATE | Health check card, KPIs, run-history chart, failures by step, error log |
| `frontend/src/pages/Dashboard.jsx` | MODIFY | Wrap existing UI in Tab 0; add Tabs strip + Tab 1 + Tab 2 |

---

## Task 1: Backend insights router

**Files:**
- Create: `backend/routers/insights.py`

- [ ] **Step 1: Create `backend/routers/insights.py`**

```python
import os
import time
import httpx
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from encrypt import decrypt
from models import User, UserConfig
from logger import get_logger

log = get_logger("insights")
router = APIRouter(prefix="/api/v2/insights", tags=["insights"])

# Resolve Output Files directory relative to this file's location
# backend/routers/insights.py  →  ../Output Files
_OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "Output Files")


# ── helpers ───────────────────────────────────────────────────────────────────

def _list_corehr_files() -> list[dict]:
    """Return metadata for every .csv in Output Files/, newest first."""
    if not os.path.isdir(_OUTPUT_DIR):
        return []
    files = []
    for name in os.listdir(_OUTPUT_DIR):
        if not name.lower().endswith(".csv"):
            continue
        full = os.path.join(_OUTPUT_DIR, name)
        stat = os.stat(full)
        files.append({
            "filename": name,
            "modified_at": stat.st_mtime,          # unix timestamp
            "size_bytes": stat.st_size,
        })
    files.sort(key=lambda f: f["modified_at"], reverse=True)
    # Convert unix timestamp to ISO string for the frontend
    for f in files:
        import datetime
        f["modified_at"] = datetime.datetime.fromtimestamp(
            f["modified_at"], tz=datetime.timezone.utc
        ).isoformat()
    return files


def _parse_corehr_file(filename: str) -> dict:
    """
    Parse a CoreHR Discovery CSV into structured sections.

    File structure:
      Header block (asterisks)
      Run Date Time\t: <value>
      **Countries implemented**
        KEY : ,VALUE   (one per line)
      ----  (first separator)
        KEY,VALUE      (modules Y/N + parameters)
      ----  (second separator)
        BU header row
        BU data rows
    """
    safe_name = os.path.basename(filename)          # prevent path traversal
    full_path = os.path.join(_OUTPUT_DIR, safe_name)
    if not os.path.isfile(full_path):
        raise HTTPException(404, f"File not found: {safe_name}")

    with open(full_path, encoding="utf-8", errors="replace") as fh:
        lines = fh.read().splitlines()

    run_date = ""
    company = ""
    countries: dict[str, bool] = {}
    modules: dict[str, bool] = {}
    parameters: dict[str, str] = {}
    business_units: list[dict] = []

    STATE_HEADER = "header"
    STATE_COUNTRIES = "countries"
    STATE_MOD_PARAMS = "mod_params"
    STATE_BU_HEADER = "bu_header"
    STATE_BU_DATA = "bu_data"

    state = STATE_HEADER
    separator_count = 0

    for raw_line in lines:
        stripped = raw_line.strip()

        # Run Date Time — appears in header section
        if "Run Date Time" in raw_line and ":" in raw_line:
            run_date = raw_line.split(":", 1)[1].strip()
            continue

        # Countries section marker
        if "Countries implemented" in raw_line:
            state = STATE_COUNTRIES
            continue

        # Separator lines
        if stripped.startswith("---"):
            separator_count += 1
            if separator_count == 1:
                state = STATE_MOD_PARAMS
            elif separator_count == 2:
                state = STATE_BU_HEADER
            continue

        # Skip blank, asterisk-only, or whitespace-only lines
        if not stripped or all(c in "*= \t" for c in stripped):
            continue

        if state == STATE_COUNTRIES:
            # Format: " COMPANY : ,SHD" or " USA : ,Y"
            if " : ," in raw_line:
                key, val = raw_line.split(" : ,", 1)
                key = key.strip()
                val = val.strip()
                if key == "COMPANY":
                    company = val
                elif key != "COUNTRY":                  # skip the COUNTRY meta-line
                    countries[key] = (val.upper() == "Y")

        elif state == STATE_MOD_PARAMS:
            # Format: "Benefits Administration,Y"  or  "To Currency,USD"
            if "," in stripped:
                key, val = stripped.split(",", 1)
                key = key.strip()
                val = val.strip()
                if not key:
                    continue
                if val.upper() in ("Y", "N"):
                    modules[key] = (val.upper() == "Y")
                else:
                    parameters[key] = val

        elif state == STATE_BU_HEADER:
            # Skip the column header row, advance to data
            state = STATE_BU_DATA

        elif state == STATE_BU_DATA:
            # Format: "SHAND,,UF Health"
            parts = [p.strip() for p in stripped.split(",")]
            if parts and parts[0]:
                business_units.append({
                    "code":        parts[0],
                    "active":      parts[1] if len(parts) > 1 else "",
                    "description": parts[2] if len(parts) > 2 else "",
                })

    return {
        "run_date":       run_date,
        "company":        company,
        "countries":      countries,
        "modules":        modules,
        "parameters":     parameters,
        "business_units": business_units,
    }


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/corehr/files")
def list_corehr_files(user: User = Depends(get_current_user)):
    """List all CoreHR Discovery CSV files available for viewing."""
    files = _list_corehr_files()
    log.debug("list_corehr_files  user=%s  count=%d", user.id[:8], len(files))
    return {"files": files}


@router.get("/corehr/file")
def get_corehr_file(
    filename: str = Query(..., description="Filename from /corehr/files"),
    user: User = Depends(get_current_user),
):
    """Parse and return a single CoreHR Discovery file."""
    log.debug("get_corehr_file  user=%s  file=%s", user.id[:8], filename)
    return _parse_corehr_file(filename)


@router.get("/health")
def check_health(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Live connectivity check for the calling user's most-recently-updated config.
    Tests PeopleSoft (HTTP GET to ps_base_url) and Windows Server (connection test).
    """
    config: UserConfig | None = (
        db.query(UserConfig)
        .filter(UserConfig.user_id == user.id, UserConfig.is_active == True)  # noqa: E712
        .order_by(UserConfig.updated_at.desc())
        .first()
    )

    if not config:
        return {
            "peoplesoft": {"status": "no_config"},
            "windows":    {"status": "no_config"},
        }

    result = {}

    # ── PeopleSoft connectivity ───────────────────────────────────────────────
    ps_url = (config.ps_base_url or "").strip()
    if ps_url:
        t0 = time.time()
        try:
            with httpx.Client(timeout=5.0) as client:
                client.get(ps_url)
            result["peoplesoft"] = {
                "status": "ok",
                "latency_ms": round((time.time() - t0) * 1000),
            }
        except Exception as exc:
            result["peoplesoft"] = {"status": "error", "error": str(exc)[:120]}
    else:
        result["peoplesoft"] = {"status": "not_configured"}

    # ── Windows Server connectivity ───────────────────────────────────────────
    win_host = (config.win_host or "").strip()
    if win_host:
        win_pass = decrypt(config.win_password_enc) if config.win_password_enc else ""
        t0 = time.time()
        try:
            ctype = config.win_connection_type or "winrm"
            if ctype == "smb":
                import smb_client
                smb_client.test_connection(
                    win_host, config.win_username, win_pass,
                    share=config.win_share or "C$",
                    domain=config.win_domain or "",
                    port=config.win_port or 445,
                )
            elif ctype == "ssh":
                import win_ssh_client
                win_ssh_client.test_connection(
                    win_host, config.win_username, win_pass,
                    port=config.win_port or 22,
                )
            else:
                import windows_client
                windows_client.test_connection(
                    win_host, config.win_username, win_pass,
                    config.win_port or 5985,
                    config.win_use_ssl or False,
                    config.win_auth_type or "ntlm",
                )
            result["windows"] = {
                "status": "ok",
                "latency_ms": round((time.time() - t0) * 1000),
            }
        except Exception as exc:
            result["windows"] = {"status": "error", "error": str(exc)[:120]}
    else:
        result["windows"] = {"status": "not_configured"}

    log.debug("check_health  user=%s  ps=%s  win=%s",
              user.id[:8], result["peoplesoft"]["status"], result["windows"]["status"])
    return result
```

- [ ] **Step 2: Register insights router in `backend/main.py`**

Find the v2 router registration block (around line 52-61):
```python
    from routers import users as _u, configs as _c, runs as _r, admin as _a
    from database import get_db
    ...
    app.include_router(_u.router)
    app.include_router(_c.router)
    app.include_router(_r.router)
    app.include_router(_a.router)
```

Change it to:
```python
    from routers import users as _u, configs as _c, runs as _r, admin as _a, insights as _i
    from database import get_db
    ...
    app.include_router(_u.router)
    app.include_router(_c.router)
    app.include_router(_r.router)
    app.include_router(_a.router)
    app.include_router(_i.router)
```

- [ ] **Step 3: Smoke-test the endpoints manually**

Start the backend:
```bash
cd backend
uvicorn main:app --reload --port 8000
```

Verify (replace `<token>` with a real JWT from the running app):
```bash
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/v2/insights/corehr/files
# Expected: {"files": [{"filename": "CoreHR_Discovery_File_04132026035557 1.csv", ...}]}

curl -H "Authorization: Bearer <token>" "http://localhost:8000/api/v2/insights/corehr/file?filename=CoreHR_Discovery_File_04132026035557%201.csv"
# Expected: {"run_date": "Apr-13-2026,03:55:57", "company": "SHD", "countries": {"USA": true, ...}, ...}

curl -H "Authorization: Bearer <token>" http://localhost:8000/api/v2/insights/health
# Expected: {"peoplesoft": {"status": "ok"|"error"|"not_configured"}, "windows": {...}}
```

- [ ] **Step 4: Commit**

```bash
git add backend/routers/insights.py backend/main.py
git commit -m "feat: add insights router (CoreHR file list/parse + health check)"
```

---

## Task 2: Frontend API additions

**Files:**
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Add three new API calls to `frontend/src/api.js`**

Append after the existing admin exports (after line 57):
```js
// Insights (v2)
export const getCoreHRFiles    = (token)            => client.get('/v2/insights/corehr/files',          { headers: auth(token) })
export const getCoreHRFile     = (filename, token)  => client.get('/v2/insights/corehr/file',           { headers: auth(token), params: { filename } })
export const checkConnectivity = (token)            => client.get('/v2/insights/health',                { headers: auth(token) })
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: add insights API calls (getCoreHRFiles, getCoreHRFile, checkConnectivity)"
```

---

## Task 3: FunctionalDashboard page

**Files:**
- Create: `frontend/src/pages/FunctionalDashboard.jsx`

- [ ] **Step 1: Create `frontend/src/pages/FunctionalDashboard.jsx`**

```jsx
import { useState, useEffect, useMemo } from 'react'
import {
  Box, Typography, Alert, CircularProgress, Grid, Card, CardContent,
  Select, MenuItem, FormControl, InputLabel, TextField, InputAdornment,
  ToggleButtonGroup, ToggleButton, Chip,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { DataGrid } from '@mui/x-data-grid'
import SearchIcon from '@mui/icons-material/Search'
import StorageIcon from '@mui/icons-material/Storage'
import PublicIcon from '@mui/icons-material/Public'
import TuneIcon from '@mui/icons-material/Tune'
import BusinessIcon from '@mui/icons-material/Business'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import { getDataGridSx } from '../utils/dataGridSx'
import { useAuth } from '../AuthContext'
import { getCoreHRFiles, getCoreHRFile } from '../api'

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label, accent }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      <Icon sx={{ fontSize: 14, color: accent }} />
      <Typography sx={{
        fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700,
        letterSpacing: '0.18em', textTransform: 'uppercase', color: 'text.secondary',
      }}>
        {label}
      </Typography>
    </Box>
  )
}

// ── KpiCard ───────────────────────────────────────────────────────────────────
function KpiCard({ label, value, color }) {
  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, bgcolor: color, opacity: 0.6 }} />
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Typography sx={{ fontSize: '0.52rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'text.disabled', mb: 0.75 }}>
          {label}
        </Typography>
        <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '2rem', fontWeight: 700, color: 'text.primary', lineHeight: 1 }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FunctionalDashboard() {
  const { token } = useAuth()
  const theme  = useTheme()
  const accent = theme.palette.primary.main
  const mode   = theme.palette.mode

  const [files,          setFiles]          = useState([])
  const [selectedFile,   setSelectedFile]   = useState('')
  const [data,           setData]           = useState(null)
  const [loadingFiles,   setLoadingFiles]   = useState(true)
  const [loadingData,    setLoadingData]    = useState(false)
  const [error,          setError]          = useState(null)
  const [moduleSearch,   setModuleSearch]   = useState('')
  const [moduleFilter,   setModuleFilter]   = useState('all') // 'all' | 'on' | 'off'

  // Load file list on mount
  useEffect(() => {
    if (!token) return
    getCoreHRFiles(token)
      .then((res) => {
        const list = res.data.files || []
        setFiles(list)
        if (list.length) setSelectedFile(list[0].filename)
      })
      .catch(() => setError('Could not load CoreHR files'))
      .finally(() => setLoadingFiles(false))
  }, [token])

  // Load file data when selection changes
  useEffect(() => {
    if (!token || !selectedFile) return
    setLoadingData(true)
    setData(null)
    getCoreHRFile(selectedFile, token)
      .then((res) => setData(res.data))
      .catch(() => setError(`Could not parse ${selectedFile}`))
      .finally(() => setLoadingData(false))
  }, [token, selectedFile])

  // KPIs derived from parsed data
  const kpi = useMemo(() => {
    if (!data) return null
    const moduleEntries = Object.entries(data.modules || {})
    const on  = moduleEntries.filter(([, v]) => v).length
    const off = moduleEntries.filter(([, v]) => !v).length
    const activeCountries = Object.values(data.countries || {}).filter(Boolean).length
    return { on, off, activeCountries, buCount: (data.business_units || []).length }
  }, [data])

  // Filtered module list
  const filteredModules = useMemo(() => {
    if (!data) return []
    return Object.entries(data.modules || {})
      .filter(([key, val]) => {
        const matchesSearch = !moduleSearch || key.toLowerCase().includes(moduleSearch.toLowerCase())
        const matchesFilter = moduleFilter === 'all' || (moduleFilter === 'on' ? val : !val)
        return matchesSearch && matchesFilter
      })
      .map(([key, val], i) => ({ id: i, module: key, enabled: val }))
  }, [data, moduleSearch, moduleFilter])

  // Business Units for DataGrid
  const buRows = useMemo(
    () => (data?.business_units || []).map((bu, i) => ({ id: i, ...bu })),
    [data],
  )

  // ── render ────────────────────────────────────────────────────────────────
  if (loadingFiles) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress size={24} sx={{ color: 'primary.main' }} />
      </Box>
    )
  }

  if (!files.length) {
    return (
      <Box sx={{ py: 8, textAlign: 'center' }}>
        <FolderOpenIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 2 }} />
        <Typography sx={{ fontFamily: '"Raleway", sans-serif', color: 'text.secondary', fontSize: '0.88rem' }}>
          No CoreHR Discovery files found
        </Typography>
        <Typography sx={{ fontFamily: '"Raleway", sans-serif', color: 'text.disabled', fontSize: '0.76rem', mt: 0.5 }}>
          Run a Discovery configuration to generate one
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'grid', gap: 4 }}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* File picker */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 340 }}>
          <InputLabel sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.8rem' }}>
            CoreHR Discovery File
          </InputLabel>
          <Select
            value={selectedFile}
            label="CoreHR Discovery File"
            onChange={(e) => setSelectedFile(e.target.value)}
            sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.76rem' }}
          >
            {files.map((f) => (
              <MenuItem key={f.filename} value={f.filename}
                sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.74rem' }}>
                {f.filename}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {data && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {data.run_date && (
              <Chip label={`Run: ${data.run_date}`} size="small"
                sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', bgcolor: `${accent}12`, color: 'text.secondary' }} />
            )}
            {data.company && (
              <Chip label={`Company: ${data.company}`} size="small"
                sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', bgcolor: `${accent}12`, color: 'primary.main' }} />
            )}
          </Box>
        )}
        {loadingData && <CircularProgress size={18} sx={{ color: 'primary.main' }} />}
      </Box>

      {data && kpi && (
        <>
          {/* KPI strip */}
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <KpiCard label="Modules ON"       value={kpi.on}              color="#6b8f71" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <KpiCard label="Modules OFF"      value={kpi.off}             color="#b45050" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <KpiCard label="Countries Active" value={kpi.activeCountries} color="#6495b4" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <KpiCard label="Business Units"   value={kpi.buCount}         color={accent}  />
            </Grid>
          </Grid>

          <Grid container spacing={3}>
            {/* Module grid (left, 2/3 width) */}
            <Grid item xs={12} md={8}>
              <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
                <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                  <SectionHeader icon={StorageIcon} label="PS Module Status" accent={accent} />
                  <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <TextField
                      size="small"
                      placeholder="Search modules…"
                      value={moduleSearch}
                      onChange={(e) => setModuleSearch(e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                          </InputAdornment>
                        ),
                        sx: { fontFamily: '"Raleway", sans-serif', fontSize: '0.78rem' },
                      }}
                      sx={{
                        width: 200,
                        '& .MuiOutlinedInput-root': {
                          borderRadius: '2px',
                          '& fieldset': { borderColor: 'divider' },
                          '&.Mui-focused fieldset': { borderColor: accent },
                        },
                      }}
                    />
                    <ToggleButtonGroup
                      value={moduleFilter}
                      exclusive
                      onChange={(_, v) => v && setModuleFilter(v)}
                      size="small"
                      sx={{
                        '& .MuiToggleButton-root': {
                          px: 1.2, py: 0.4, fontFamily: '"Raleway", sans-serif',
                          fontSize: '0.58rem', letterSpacing: '0.1em', textTransform: 'uppercase',
                          border: '1px solid', borderColor: 'divider', color: 'text.disabled',
                          borderRadius: '2px !important',
                          '&.Mui-selected': { bgcolor: `${accent}18`, color: accent, borderColor: `${accent}40` },
                        },
                      }}
                    >
                      <ToggleButton value="all">All</ToggleButton>
                      <ToggleButton value="on">ON</ToggleButton>
                      <ToggleButton value="off">OFF</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                </Box>
                <DataGrid
                  rows={filteredModules}
                  autoHeight
                  disableRowSelectionOnClick
                  pageSizeOptions={[25, 50, 100]}
                  initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                  sx={{ ...getDataGridSx(accent, mode), border: 'none', borderRadius: 0 }}
                  columns={[
                    {
                      field: 'module', headerName: 'Module', flex: 1, minWidth: 200,
                      renderCell: (p) => (
                        <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.74rem', color: 'text.primary' }}>
                          {p.value}
                        </Typography>
                      ),
                    },
                    {
                      field: 'enabled', headerName: 'Status', width: 100,
                      renderCell: (p) => (
                        <Chip
                          label={p.value ? 'ON' : 'OFF'}
                          size="small"
                          sx={{
                            bgcolor: p.value ? 'rgba(107,143,113,0.14)' : 'rgba(180,80,80,0.12)',
                            color:   p.value ? '#6b8f71' : '#b45050',
                            fontFamily: '"Raleway", sans-serif',
                            fontSize: '0.58rem', fontWeight: 700,
                            letterSpacing: '0.08em', height: 20,
                          }}
                        />
                      ),
                    },
                  ]}
                />
              </Card>
            </Grid>

            {/* Right column: countries + params */}
            <Grid item xs={12} md={4} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Countries */}
              <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
                <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <SectionHeader icon={PublicIcon} label="Countries Implemented" accent={accent} />
                </Box>
                <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {Object.entries(data.countries || {}).map(([country, active]) => (
                    <Box key={country} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, py: 0.75, borderRadius: '2px', bgcolor: active ? 'rgba(107,143,113,0.06)' : 'transparent' }}>
                      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.74rem', color: active ? 'text.primary' : 'text.disabled' }}>
                        {country}
                      </Typography>
                      <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.65rem', color: active ? '#6b8f71' : 'text.disabled', fontWeight: active ? 700 : 400 }}>
                        {active ? '✓' : '—'}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Card>

              {/* Key Parameters */}
              <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
                <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <SectionHeader icon={TuneIcon} label="Key Parameters" accent={accent} />
                </Box>
                <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {Object.entries(data.parameters || {}).map(([key, val]) => (
                    <Box key={key} sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.68rem', color: 'text.secondary', flexShrink: 0, maxWidth: '55%' }}>
                        {key}
                      </Typography>
                      <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: accent, textAlign: 'right', wordBreak: 'break-all' }}>
                        {val}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Card>
            </Grid>
          </Grid>

          {/* Business Units */}
          {buRows.length > 0 && (
            <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
              <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <SectionHeader icon={BusinessIcon} label="Business Units" accent={accent} />
              </Box>
              <DataGrid
                rows={buRows}
                autoHeight
                disableRowSelectionOnClick
                hideFooter={buRows.length <= 10}
                sx={{ ...getDataGridSx(accent, mode), border: 'none', borderRadius: 0 }}
                columns={[
                  { field: 'code',        headerName: 'BU Code',     width: 130,
                    renderCell: (p) => <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.74rem', color: 'primary.main' }}>{p.value}</Typography> },
                  { field: 'description', headerName: 'Description',  flex: 1, minWidth: 160,
                    renderCell: (p) => <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.74rem', color: 'text.primary' }}>{p.value || '—'}</Typography> },
                  { field: 'active',      headerName: 'Active',       width: 100,
                    renderCell: (p) => p.value
                      ? <Chip label="Active" size="small" sx={{ bgcolor: 'rgba(107,143,113,0.14)', color: '#6b8f71', fontFamily: '"Raleway", sans-serif', fontSize: '0.58rem', height: 20 }} />
                      : <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled' }}>—</Typography> },
                ]}
              />
            </Card>
          )}
        </>
      )}
    </Box>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/FunctionalDashboard.jsx
git commit -m "feat: add FunctionalDashboard (CoreHR Discovery viewer)"
```

---

## Task 4: OperationalDashboard page

**Files:**
- Create: `frontend/src/pages/OperationalDashboard.jsx`

- [ ] **Step 1: Create `frontend/src/pages/OperationalDashboard.jsx`**

```jsx
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Box, Typography, Alert, CircularProgress, Grid, Card, CardContent,
  Button, Chip,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer, Legend,
} from 'recharts'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import ErrorOutlineIcon       from '@mui/icons-material/ErrorOutline'
import RefreshIcon            from '@mui/icons-material/Refresh'
import WifiOffIcon            from '@mui/icons-material/WifiOff'
import TrendingUpIcon         from '@mui/icons-material/TrendingUp'
import SpeedIcon              from '@mui/icons-material/Speed'
import BarChartIcon           from '@mui/icons-material/BarChart'
import { useAuth } from '../AuthContext'
import { listRuns, checkConnectivity } from '../api'

// ── formatters ────────────────────────────────────────────────────────────────

function fmtMs(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function fmtDay(str) {
  if (!str) return ''
  return new Date(str).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function timeAgo(ts) {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── KpiCard ───────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, Icon, color }) {
  const c = color || '#c9a84c'
  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, bgcolor: c, opacity: 0.55 }} />
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography sx={{ fontSize: '0.52rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'text.disabled', mb: 0.75 }}>
              {label}
            </Typography>
            <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '2rem', fontWeight: 700, color: 'text.primary', lineHeight: 1 }}>
              {value}
            </Typography>
            {sub && <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', mt: 0.75, fontFamily: '"Raleway", sans-serif' }}>{sub}</Typography>}
          </Box>
          {Icon && (
            <Box sx={{ width: 32, height: 32, borderRadius: '4px', bgcolor: `${c}14`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon sx={{ fontSize: 16, color: c }} />
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  )
}

// ── HealthRow: one service row in the connectivity card ───────────────────────

function HealthRow({ label, result }) {
  const status = result?.status
  const isOk   = status === 'ok'
  const isErr  = status === 'error'
  const isNone = status === 'not_configured' || status === 'no_config'
  const dotColor = isOk ? '#6b8f71' : isErr ? '#b45050' : '#888'

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1.2, borderRadius: '3px', bgcolor: isOk ? 'rgba(107,143,113,0.06)' : isErr ? 'rgba(180,80,80,0.06)' : 'rgba(128,128,128,0.04)' }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dotColor, flexShrink: 0,
        ...(isOk ? { boxShadow: `0 0 6px ${dotColor}88` } : {}),
      }} />
      <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.74rem', color: 'text.primary', flex: 1 }}>
        {label}
      </Typography>
      <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.64rem', color: dotColor }}>
        {isOk   ? `OK · ${result.latency_ms}ms` :
         isErr  ? 'Unreachable' :
         isNone ? 'Not configured' : '—'}
      </Typography>
    </Box>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OperationalDashboard() {
  const { token } = useAuth()
  const theme  = useTheme()
  const accent = theme.palette.primary.main
  const dark   = theme.palette.mode === 'dark'

  const [runs,          setRuns]          = useState([])
  const [loadingRuns,   setLoadingRuns]   = useState(true)
  const [health,        setHealth]        = useState(null)
  const [checking,      setChecking]      = useState(false)
  const [error,         setError]         = useState(null)

  const gridStroke = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'
  const tickFill   = theme.palette.text.secondary

  const loadRuns = useCallback(() => {
    if (!token) return
    return listRuns(token, { limit: 200 })
      .then((res) => setRuns(res.data.items || []))
      .catch(() => setError('Could not load run history'))
  }, [token])

  useEffect(() => {
    loadRuns()?.finally(() => setLoadingRuns(false))
  }, [loadRuns])

  const handleCheck = () => {
    setChecking(true)
    checkConnectivity(token)
      .then((res) => setHealth(res.data))
      .catch(() => setHealth({ peoplesoft: { status: 'error', error: 'Request failed' }, windows: { status: 'error', error: 'Request failed' } }))
      .finally(() => setChecking(false))
  }

  // ── Derived metrics ───────────────────────────────────────────────────────

  const kpi = useMemo(() => {
    if (!runs.length) return null
    const completed  = runs.filter((r) => r.status === 'success' || r.status === 'error')
    const successful = runs.filter((r) => r.status === 'success')
    const withDur    = successful.filter((r) => r.duration_ms != null)
    const avgMs      = withDur.length ? Math.round(withDur.reduce((s, r) => s + r.duration_ms, 0) / withDur.length) : null
    const rate       = completed.length ? Math.round(successful.length / completed.length * 100) : null
    const weekAgo    = Date.now() - 7 * 24 * 60 * 60 * 1000
    const errorsWeek = runs.filter((r) => r.status === 'error' && new Date(r.started_at).getTime() > weekAgo).length
    return { total: runs.length, rate, avgMs, errorsWeek, errorCnt: runs.filter(r => r.status === 'error').length }
  }, [runs])

  const runsByDay = useMemo(() => {
    const map = {}
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    runs.forEach((r) => {
      if (!r.started_at) return
      const dt = new Date(r.started_at)
      if (dt.getTime() < cutoff) return
      const day = r.started_at.slice(0, 10)
      if (!map[day]) map[day] = { day, success: 0, errors: 0 }
      if (r.status === 'success') map[day].success++
      if (r.status === 'error')   map[day].errors++
    })
    return Object.values(map).sort((a, b) => a.day.localeCompare(b.day))
  }, [runs])

  const failuresByStep = useMemo(() => {
    const map = {}
    runs.filter((r) => r.status === 'error' && r.failed_step).forEach((r) => {
      map[r.failed_step] = (map[r.failed_step] || 0) + 1
    })
    return Object.entries(map)
      .map(([step, count]) => ({ step, count }))
      .sort((a, b) => b.count - a.count)
  }, [runs])

  const recentErrors = useMemo(
    () => runs.filter((r) => r.status === 'error').slice(0, 10),
    [runs],
  )

  // ── render ────────────────────────────────────────────────────────────────
  if (loadingRuns) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress size={24} sx={{ color: 'primary.main' }} />
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'grid', gap: 4 }}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* KPI strip */}
      {kpi && (
        <Grid container spacing={2}>
          <Grid item xs={6} sm={3}>
            <KpiCard label="Total Runs"     value={kpi.total}                               Icon={BarChartIcon}   color={accent} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <KpiCard label="Success Rate"   value={kpi.rate != null ? `${kpi.rate}%` : '—'} Icon={TrendingUpIcon} color="#6b8f71"
              sub={`${runs.filter(r=>r.status==='success').length} ok · ${kpi.errorCnt} err`} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <KpiCard label="Avg Duration"   value={fmtMs(kpi.avgMs)}                        Icon={SpeedIcon}      color="#6495b4" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <KpiCard label="Errors This Week" value={kpi.errorsWeek}                        Icon={ErrorOutlineIcon} color="#b45050" />
          </Grid>
        </Grid>
      )}

      <Grid container spacing={3}>
        {/* Live health card */}
        <Grid item xs={12} md={4}>
          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%' }}>
            <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'text.secondary' }}>
                🔌 Connection Health
              </Typography>
              <Button
                size="small"
                startIcon={checking ? <CircularProgress size={12} /> : <RefreshIcon sx={{ fontSize: 14 }} />}
                onClick={handleCheck}
                disabled={checking}
                sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.65rem', letterSpacing: '0.08em', color: accent, '&:hover': { bgcolor: `${accent}12` } }}
              >
                {checking ? 'Checking…' : 'Check Now'}
              </Button>
            </Box>
            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {health ? (
                <>
                  <HealthRow label="PeopleSoft"     result={health.peoplesoft} />
                  <HealthRow label="Windows Server" result={health.windows} />
                </>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1.2, borderRadius: '3px', bgcolor: 'rgba(128,128,128,0.04)' }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#555', flexShrink: 0 }} />
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.74rem', color: 'text.disabled' }}>PeopleSoft</Typography>
                    <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.64rem', color: 'text.disabled', ml: 'auto' }}>Not checked</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1.2, borderRadius: '3px', bgcolor: 'rgba(128,128,128,0.04)' }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#555', flexShrink: 0 }} />
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.74rem', color: 'text.disabled' }}>Windows Server</Typography>
                    <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.64rem', color: 'text.disabled', ml: 'auto' }}>Not checked</Typography>
                  </Box>
                </Box>
              )}
            </Box>
          </Card>
        </Grid>

        {/* Failure by step */}
        <Grid item xs={12} md={4}>
          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%' }}>
            <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'text.secondary' }}>
                ⚠ Failures by Step
              </Typography>
            </Box>
            <Box sx={{ p: 2.5 }}>
              {failuresByStep.length ? (
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={failuresByStep} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: tickFill }} />
                    <YAxis type="category" dataKey="step" tick={{ fontSize: 11, fill: tickFill, fontFamily: '"JetBrains Mono", monospace' }} width={70} />
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <ChartTooltip contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, fontFamily: '"Raleway", sans-serif', fontSize: 12 }} />
                    <Bar dataKey="count" name="Failures" fill="#b45050" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 3 }}>
                  <CheckCircleOutlineIcon sx={{ fontSize: 18, color: '#6b8f71' }} />
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.82rem', fontFamily: '"Raleway", sans-serif' }}>
                    No step failures recorded
                  </Typography>
                </Box>
              )}
            </Box>
          </Card>
        </Grid>

        {/* Recent error log */}
        <Grid item xs={12} md={4}>
          <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%' }}>
            <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'text.secondary' }}>
                📋 Recent Errors
              </Typography>
            </Box>
            <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {recentErrors.length ? recentErrors.map((r) => (
                <Box key={r.id} sx={{ px: 1.5, py: 1, borderRadius: '3px', bgcolor: 'rgba(180,80,80,0.04)', border: '1px solid rgba(180,80,80,0.1)' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', color: 'text.primary', fontWeight: 600 }}>
                      {r.config_name || '—'}
                    </Typography>
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', color: 'text.disabled' }}>
                      {timeAgo(r.started_at)}
                    </Typography>
                  </Box>
                  {r.failed_step && (
                    <Chip label={r.failed_step} size="small" sx={{ height: 16, fontSize: '0.52rem', bgcolor: 'rgba(180,80,80,0.12)', color: '#b45050', fontFamily: '"JetBrains Mono", monospace', mr: 0.5 }} />
                  )}
                  {r.error_detail && (
                    <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.58rem', color: 'text.disabled', mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.error_detail}
                    </Typography>
                  )}
                </Box>
              )) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 3, px: 1.5 }}>
                  <CheckCircleOutlineIcon sx={{ fontSize: 18, color: '#6b8f71' }} />
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.82rem', fontFamily: '"Raleway", sans-serif' }}>No errors</Typography>
                </Box>
              )}
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* 30-day run health chart */}
      {runsByDay.length > 0 && (
        <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'divider', p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
            <BarChartIcon sx={{ fontSize: 16, color: accent }} />
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'text.primary' }}>
              Run Health — Last 30 Days
            </Typography>
          </Box>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={runsByDay} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="opGradSuccess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6b8f71" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6b8f71" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="opGradErrors" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#b45050" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#b45050" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 10, fill: tickFill }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: tickFill }} />
              <ChartTooltip
                contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 4, fontFamily: '"Raleway", sans-serif', fontSize: 12 }}
                labelFormatter={fmtDay}
              />
              <Legend wrapperStyle={{ fontFamily: '"Raleway", sans-serif', fontSize: 11 }} />
              <Area type="monotone" dataKey="success" name="Success" stroke="#6b8f71" fill="url(#opGradSuccess)" strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="errors"  name="Errors"  stroke="#b45050" fill="url(#opGradErrors)"  strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}
    </Box>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/OperationalDashboard.jsx
git commit -m "feat: add OperationalDashboard (health check, run stats, error log)"
```

---

## Task 5: Wire sub-tabs into Dashboard.jsx

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`

- [ ] **Step 1: Add Tabs import and new page imports**

At the top of `Dashboard.jsx`, add `Tabs` and `Tab` to the existing MUI import:
```js
import {
  Box, Typography, Button, Alert, CircularProgress,
  Select, MenuItem, Chip, Grid, Card, CardContent,
  Tooltip, IconButton, Tabs, Tab,           // ← add Tabs, Tab
} from '@mui/material'
```

Add the two new page imports after the existing `import LoadingDialog` line:
```js
import FunctionalDashboard  from './FunctionalDashboard'
import OperationalDashboard from './OperationalDashboard'
```

- [ ] **Step 2: Add `dashTab` state**

Inside the `Dashboard()` function, after the existing `runsView` state, add:
```js
const [dashTab, setDashTab] = useState(
  () => parseInt(localStorage.getItem('dashboard_tab') || '0', 10)
)

const handleDashTabChange = (_, v) => {
  setDashTab(v)
  localStorage.setItem('dashboard_tab', String(v))
}
```

- [ ] **Step 3: Replace the page title and add the sub-tab bar**

Find the existing page title section in `Dashboard.jsx`:
```jsx
        {/* ── header ────────────────────────────────────────────────────────── */}
        <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', mb: 4, flexWrap: 'wrap', gap: 2.5 }}>
          <Box>
            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.54rem', letterSpacing: '0.32em', color: 'text.disabled', textTransform: 'uppercase', mb: 0.5 }}>
              Sparky Platform
            </Typography>
            <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '2.4rem', fontWeight: 700, color: 'text.primary', letterSpacing: '0.02em', lineHeight: 1 }}>
              Operational Dashboard
            </Typography>
          </Box>
```

Replace **only** the `"Operational Dashboard"` title text value with `"Dashboard"`:
```jsx
            <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '2.4rem', fontWeight: 700, color: 'text.primary', letterSpacing: '0.02em', lineHeight: 1 }}>
              Dashboard
            </Typography>
```

Then, after the **closing** `</Box>` of the entire header section (after the run button / config selector Box), add the sub-tab bar. Insert this immediately **after** the `</Box>` that closes the header and **before** the error Alert:

```jsx
        {/* ── Sub-tabs: Run | Functional | Operational ───────────────────── */}
        <Tabs
          value={dashTab}
          onChange={handleDashTabChange}
          sx={{
            mb: 4,
            borderBottom: '1px solid',
            borderColor: 'divider',
            '& .MuiTab-root': {
              fontFamily: '"Raleway", sans-serif',
              fontSize: '0.63rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'text.secondary',
              minHeight: 40,
            },
            '& .Mui-selected':         { color: accent },
            '& .MuiTabs-indicator':    { bgcolor: accent },
          }}
        >
          <Tab label="Run"         />
          <Tab label="Functional"  />
          <Tab label="Operational" />
        </Tabs>
```

- [ ] **Step 4: Wrap existing content in Tab 0 panel, add Tab 1 + Tab 2**

Find the error Alert and everything after it (down to the closing `</Box>` before `<LoadingDialog>`). Wrap all of that existing content:

```jsx
        {/* ── Tab panels ────────────────────────────────────────────────────── */}
        {dashTab === 0 && (
          <>
            {/* ... ALL existing content from the error Alert down to the LoadingDialog ... */}
          </>
        )}

        {dashTab === 1 && <FunctionalDashboard />}

        {dashTab === 2 && <OperationalDashboard />}
```

Specifically: the `{error && <Alert...>}` block through the `{lastResult && (...)}` block should all be inside `{dashTab === 0 && (<>...</>)}`. The `<LoadingDialog open={running} />` stays **outside** all tab panels (it should always be reachable).

- [ ] **Step 5: Verify the final structure looks correct**

The bottom of `Dashboard.jsx` render return should look like:
```jsx
      <Box sx={{ px: { xs: 3, sm: 5 }, pt: 4, pb: 6 }}>

        {/* header (title + config selector + run button) */}
        <Box sx={{ ... mb: 4 ... }}>
          ...
        </Box>

        {/* sub-tabs */}
        <Tabs value={dashTab} onChange={handleDashTabChange} ...>
          <Tab label="Run" />
          <Tab label="Functional" />
          <Tab label="Operational" />
        </Tabs>

        {dashTab === 0 && (
          <>
            {error && <Alert ...>}
            {kpi && <Grid container ...>}  {/* KPI strip */}
            {pageLoading && ...}
            {!pageLoading && user && !user.onboarded && ...}
            {!pageLoading && !configs.length && ...}
            {runs.length > 0 && <Card ...>}  {/* recent runs */}
            {lastResult && ...}
          </>
        )}

        {dashTab === 1 && <FunctionalDashboard />}
        {dashTab === 2 && <OperationalDashboard />}

      </Box>

      <LoadingDialog open={running} />
    </Box>
  )
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx
git commit -m "feat: add Run/Functional/Operational sub-tabs to Dashboard"
```

---

## Task 6: Final integration check

- [ ] **Step 1: Start backend and frontend, open the app**

```bash
# Terminal 1
cd backend && uvicorn main:app --reload --port 8000

# Terminal 2
cd frontend && npm run dev
```

Open `http://localhost:5173/#dashboard`

- [ ] **Step 2: Verify Tab 0 (Run) works exactly as before**

- Config selector and Run button visible
- KPI strip shows if runs exist
- Recent Runs DataGrid shows
- Running a config still works end-to-end

- [ ] **Step 3: Verify Tab 1 (Functional) works**

- File picker shows `CoreHR_Discovery_File_04132026035557 1.csv`
- Selecting it shows: KPI strip (Modules ON/OFF, Countries, BUs), Module grid, Countries panel, Parameters panel, Business Units DataGrid

- [ ] **Step 4: Verify Tab 2 (Operational) works**

- KPI strip shows total runs, success rate, avg duration, errors this week
- "Check Now" button triggers health check — dots update to green/red
- Run health area chart renders if runs exist
- Failure by step bar chart renders if any errors exist
- Recent errors list shows last 10 error runs

- [ ] **Step 5: Verify tab selection persists**

- Switch to Functional, refresh the page — app opens on Functional tab

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: functional + operational dashboards complete

- Backend: insights router with CoreHR file list/parse + health check
- Frontend: FunctionalDashboard (module grid, countries, params, BUs)
- Frontend: OperationalDashboard (health, charts, error log)
- Dashboard: 3 sub-tabs (Run | Functional | Operational) with localStorage persistence"
```
