# Functional & Operational Dashboards — Design Spec
**Date:** 2026-05-26  
**Status:** Approved

---

## Overview

Add two new sub-tabs to the existing Dashboard page: **Functional** and **Operational**. The existing run UI becomes a third sub-tab called **Run**. Navigation is via MUI Tabs inside the Dashboard page, consistent with how the Admin page uses sub-tabs.

---

## Architecture

### Routing
- No new top-level routes. `#dashboard` stays the only route.
- Sub-tab state: controlled by a `dashTab` useState (0=Run, 1=Functional, 2=Operational), persisted to `localStorage` key `dashboard_tab`.

### New files
- `frontend/src/pages/FunctionalDashboard.jsx` — CoreHR Discovery viewer
- `frontend/src/pages/OperationalDashboard.jsx` — system health + run stats
- `backend/routers/insights.py` — new API router with two endpoints

### Modified files
- `frontend/src/pages/Dashboard.jsx` — wrap existing content in Tab 0, add Tab 1 + Tab 2
- `frontend/src/api.js` — add `getCoreHRFiles`, `getCoreHRFile`, `checkHealth`
- `backend/main.py` — register new insights router

---

## Tab 0 — Run (unchanged)
Existing Dashboard content moved verbatim into tab panel 0. No functional changes.

---

## Tab 1 — Functional Dashboard (CoreHR Discovery Viewer)

### Data source
CoreHR Discovery files live in `backend/Output Files/`. The backend reads them directly from disk.

### Backend: `GET /api/v2/insights/corehr/files`
Returns list of available files:
```json
[{ "filename": "CoreHR_Discovery_04132026.csv", "modified_at": "2026-04-13T03:55:57" }]
```

### Backend: `GET /api/v2/insights/corehr/file?filename=...`
Parses the selected file and returns structured data:
```json
{
  "run_date": "Apr-13-2026,03:55:57",
  "company": "SHD",
  "countries": { "USA": true, "CANADA": false, ... },
  "modules": { "Benefits Administration": true, "Global Payroll Core": false, ... },
  "parameters": { "Standard Work Period": "W", "To Currency": "USD", ... },
  "business_units": [{ "code": "SHAND", "description": "UF Health", "active": true }]
}
```

**Parser logic:** The file has four sections separated by `----` and `****` delimiters. Parse line by line:
- Lines after `**Countries**` block: `KEY : ,VALUE` → `countries`
- Lines between the two `----` separators: `KEY,VALUE` → split into `modules` (Y/N values) and `parameters` (other values)
- Lines after second `----`: CSV columns → `business_units`

### Frontend components
- **File picker** — `Select` dropdown listing available files, defaulting to most recent
- **KPI row** — Modules ON count / Modules OFF count / Active Countries / Business Units
- **Module grid** — searchable + filter toggle (All / ON / OFF), green/red per row
- **Countries panel** — active country chips highlighted, inactive dimmed
- **Key Parameters panel** — mono key-value pairs for non-boolean settings
- **Business Units table** — DataGrid with code, description, active columns

---

## Tab 2 — Operational Dashboard

### Backend: `GET /api/v2/insights/health`
Checks connectivity of the calling user's active config:
- PeopleSoft: HTTP GET to `ps_base_url` with 5s timeout, returns latency ms
- Windows Server: attempts WinRM/SMB handshake with 5s timeout, returns ok/error

Returns:
```json
{
  "peoplesoft": { "status": "ok", "latency_ms": 142 },
  "windows": { "status": "ok", "latency_ms": 88 }
}
```

Uses existing run stats from `GET /api/v2/runs/` (user-scoped) — no new DB queries needed beyond what already exists.

### Frontend components
- **Live Health card** — PeopleSoft + Windows Server rows with coloured dot + latency. **Check Now** button triggers `GET /api/v2/insights/health` and updates on response. Starts unchecked (no auto-ping on mount).
- **KPI row** — Success Rate / Avg Duration / Total Runs / Errors This Week (computed client-side from `listRuns` data)
- **30-day run health chart** — AreaChart (Recharts, matching existing Admin chart style) — success vs error per day, derived from run history
- **Failures by step** — horizontal bar chart showing count per `failed_step` value
- **Recent error log** — last 10 error runs, showing config name, failed_step, error_detail, time ago

---

## Data flow

```
Dashboard.jsx
  ├── Tab 0: existing run + recent-runs logic (unchanged)
  ├── Tab 1: FunctionalDashboard
  │     ├── GET /api/v2/insights/corehr/files  (on mount)
  │     └── GET /api/v2/insights/corehr/file   (on file select)
  └── Tab 2: OperationalDashboard
        ├── GET /api/v2/runs/ (limit 200)       (on mount)
        └── GET /api/v2/insights/health         (on "Check Now" click)
```

---

## Error handling
- File list empty: show "No CoreHR files found — run a Discovery config to generate one"
- File parse error: show alert with raw error message
- Health check timeout: show red dot + "Unreachable" after 5s
- Runs fetch failure: show inline Alert, retry button

---

## Styling
- Follows existing app conventions: Cormorant Garamond section titles, Raleway body, JetBrains Mono for values
- Accent colour from `useThemeContext()`
- Charts styled with existing `gridStroke` / `tickFill` pattern from Admin.jsx
- No new dependencies required
