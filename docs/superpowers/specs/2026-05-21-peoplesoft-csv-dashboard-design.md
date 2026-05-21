# PeopleSoft CSV Analytics Dashboard — Design Spec
**Date:** 2026-05-21  
**Project:** Sparky_Tool  
**Stack:** Python (FastAPI) + React (Vite)

---

## Overview

A web application that triggers a PeopleSoft engine via REST API, waits for completion, downloads the resulting CSV from an SFTP server, and displays an analytics dashboard (KPIs, charts, filterable table) in the browser.

---

## Architecture

```
React Dashboard (port 3000)
        │
        │  POST /api/run        GET /api/results
        ▼                             ▲
┌──────────────────────────────────────────┐
│           FastAPI Backend (port 8000)    │
│                                          │
│  1. POST ──────────► PeopleSoft REST API │
│     (synchronous, blocks until done)     │
│                                          │
│  2. On success → download CSV via SFTP   │
│                                          │
│  3. Parse CSV → compute KPIs → cache     │
│     → return JSON to React               │
└──────────────────────────────────────────┘
```

---

## Project Structure

```
Sparky_Tool/
├── backend/
│   ├── main.py            # FastAPI app + endpoints
│   ├── peoplesoft.py      # PeopleSoft REST client
│   ├── sftp_client.py     # SFTP download logic
│   ├── csv_parser.py      # CSV parsing + KPI computation
│   ├── config.py          # Reads .env via pydantic-settings
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js
│   │   └── components/
│   │       ├── KPICards.jsx
│   │       ├── Charts.jsx
│   │       └── DataTable.jsx
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml
├── Procfile
└── .env.example
```

---

## Backend

### Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/run` | POST | Trigger PS engine → wait → SFTP download → parse → return JSON |
| `/api/results` | GET | Return last in-memory cached result |
| `/api/health` | GET | Health check |

### Key Libraries
- `fastapi` + `uvicorn` — web framework
- `httpx` — async HTTP client for PeopleSoft REST call (timeout=300s)
- `paramiko` — SFTP client
- `pandas` — CSV parsing and KPI computation
- `pydantic-settings` — typed config from `.env`

### Authentication (Pluggable)
Configured via `PS_AUTH_TYPE` in `.env`:
- `basic` → `httpx.BasicAuth(username, password)`
- `bearer` → `Authorization: Bearer <token>` header
- `cookie` → session cookie jar

### PeopleSoft Call Sequence
1. Build auth from config
2. `httpx.post(PS_BASE_URL + PS_ENDPOINT, auth=..., timeout=300)`
3. Check response status — raise on error
4. Connect SFTP → download file at `SFTP_REMOTE_PATH` → in-memory bytes
5. `pandas.read_csv(BytesIO(data))` → compute KPIs → cache → return

### KPI Computation
For each numeric column: count, sum, mean, min, max.  
For each string column: unique value counts.  
Returned as structured JSON alongside raw row data.

---

## Frontend

### Components
- **KPICards** — summary tiles (count, sum, avg per column)
- **Charts** — Recharts bar + line + pie charts
- **DataTable** — TanStack Table with client-side filter, sort, pagination
- **Run Button** — triggers `POST /api/run`, shows loading spinner, populates dashboard on response

### Libraries
- `react` + `vite` — framework and bundler
- `recharts` — charts
- `@tanstack/react-table` — data table
- `axios` — HTTP calls to FastAPI

---

## Configuration (`.env`)

```bash
# PeopleSoft
PS_BASE_URL=https://your-ps-host/PSIGW
PS_AUTH_TYPE=basic          # basic | bearer | cookie
PS_USERNAME=
PS_PASSWORD=
PS_ENDPOINT=/RESTListeningConnector/your-query

# SFTP
SFTP_HOST=
SFTP_PORT=22
SFTP_USERNAME=
SFTP_PASSWORD=
SFTP_REMOTE_PATH=/path/to/output.csv

# App
CORS_ORIGINS=http://localhost:3000
```

---

## Local Development

```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm install
npm run dev
```

Or via Docker:
```bash
docker-compose up
```

---

## Railway Deployment

`Procfile` defines two processes:
```
backend: cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT
frontend: cd frontend && npm run build && npx serve -s dist -l $PORT
```

Environment variables set via Railway dashboard (same keys as `.env`).

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| PeopleSoft POST fails / timeout | 502 returned to React; error banner shown |
| SFTP connection fails | 503 returned; error banner shown |
| CSV parse error | 422 returned; error banner shown |
| No cached results | `GET /api/results` returns 404; React prompts user to run |
