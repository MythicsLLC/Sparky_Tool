# PeopleSoft CSV Analytics Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web app that triggers a PeopleSoft engine via REST API, downloads the resulting CSV from SFTP, and displays KPIs, charts, and a filterable table in a React dashboard.

**Architecture:** FastAPI backend (port 8000) handles PeopleSoft auth, synchronous engine trigger, SFTP CSV download, and parsing. React frontend (port 3000, Vite) calls the backend and renders the dashboard. Credentials stored in `.env`.

**Tech Stack:** Python 3.11+, FastAPI, httpx, paramiko, pandas, pydantic-settings, pytest · React 18, Vite, Recharts, TanStack Table v8, Axios, Vitest, React Testing Library

---

## File Map

```
Sparky_Tool/
├── backend/
│   ├── config.py              # typed settings from .env (pydantic-settings)
│   ├── peoplesoft.py          # PeopleSoft REST client — trigger engine, return response
│   ├── sftp_client.py         # SFTP download — connect and fetch CSV bytes
│   ├── csv_parser.py          # parse CSV bytes → KPIs + rows JSON
│   ├── main.py                # FastAPI app: /api/run, /api/results, /api/health
│   ├── requirements.txt
│   ├── .env.example
│   ├── pytest.ini
│   └── tests/
│       ├── conftest.py
│       ├── test_config.py
│       ├── test_csv_parser.py
│       ├── test_peoplesoft.py
│       ├── test_sftp_client.py
│       └── test_main.py
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── App.css
│       ├── api.js
│       ├── setupTests.js
│       ├── App.test.jsx
│       └── components/
│           ├── KPICards.jsx
│           ├── KPICards.test.jsx
│           ├── Charts.jsx
│           ├── Charts.test.jsx
│           ├── DataTable.jsx
│           └── DataTable.test.jsx
├── docker-compose.yml
├── backend/Dockerfile
├── frontend/Dockerfile
└── .env.example
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `backend/pytest.ini`
- Create: `frontend/package.json`
- Create: `frontend/index.html`
- Create: `.env.example`

- [ ] **Step 1: Create backend directory and requirements**

```
backend/requirements.txt
```
```
fastapi==0.115.0
uvicorn[standard]==0.30.6
httpx==0.27.2
paramiko==3.4.0
pandas==2.2.3
pydantic-settings==2.4.0
pytest==8.3.3
pytest-asyncio==0.24.0
```

- [ ] **Step 2: Create backend pytest config**

```
backend/pytest.ini
```
```ini
[pytest]
pythonpath = .
testpaths = tests
```

- [ ] **Step 3: Create root .env.example**

```
.env.example
```
```bash
# PeopleSoft Integration Broker
PS_BASE_URL=https://your-ps-host/PSIGW
PS_AUTH_TYPE=basic
PS_USERNAME=your_username
PS_PASSWORD=your_password
PS_ENDPOINT=/RESTListeningConnector/your-query-endpoint

# SFTP
SFTP_HOST=sftp.example.com
SFTP_PORT=22
SFTP_USERNAME=sftp_user
SFTP_PASSWORD=sftp_pass
SFTP_REMOTE_PATH=/output/report.csv

# App
CORS_ORIGINS=http://localhost:3000
```

- [ ] **Step 4: Create frontend package.json**

```
frontend/package.json
```
```json
{
  "name": "sparky-tool-frontend",
  "version": "0.1.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "axios": "^1.7.7",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^2.13.0",
    "@tanstack/react-table": "^8.20.5"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.2",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@vitejs/plugin-react": "^4.3.2",
    "jsdom": "^25.0.1",
    "vite": "^5.4.8",
    "vitest": "^2.1.3"
  }
}
```

- [ ] **Step 5: Create frontend/index.html**

```
frontend/index.html
```
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sparky Tool</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Install backend dependencies**

Run from `backend/` directory:
```bash
pip install -r requirements.txt
```
Expected: all packages install without error.

- [ ] **Step 7: Install frontend dependencies**

Run from `frontend/` directory:
```bash
npm install
```
Expected: `node_modules/` created, no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/requirements.txt backend/pytest.ini backend/.env.example frontend/package.json frontend/index.html .env.example
git commit -m "feat: project scaffolding — deps and config files"
```

---

## Task 2: Backend config module

**Files:**
- Create: `backend/config.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_config.py`

- [ ] **Step 1: Write the failing test**

```
backend/tests/conftest.py
```
```python
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
```

```
backend/tests/test_config.py
```
```python
import os
from unittest.mock import patch

def test_settings_load_required_fields():
    env = {
        "PS_BASE_URL": "https://ps.example.com",
        "PS_AUTH_TYPE": "basic",
        "PS_USERNAME": "user",
        "PS_PASSWORD": "pass",
        "PS_ENDPOINT": "/api/query",
        "SFTP_HOST": "sftp.example.com",
        "SFTP_PORT": "22",
        "SFTP_USERNAME": "sftpuser",
        "SFTP_PASSWORD": "sftppass",
        "SFTP_REMOTE_PATH": "/output.csv",
    }
    with patch.dict(os.environ, env, clear=True):
        from config import Settings
        s = Settings()
        assert s.ps_base_url == "https://ps.example.com"
        assert s.sftp_host == "sftp.example.com"
        assert s.sftp_port == 22

def test_settings_defaults():
    env = {
        "PS_BASE_URL": "https://ps.example.com",
        "PS_USERNAME": "user",
        "PS_PASSWORD": "pass",
        "PS_ENDPOINT": "/api/query",
        "SFTP_HOST": "sftp.example.com",
        "SFTP_USERNAME": "sftpuser",
        "SFTP_PASSWORD": "sftppass",
        "SFTP_REMOTE_PATH": "/output.csv",
    }
    with patch.dict(os.environ, env, clear=True):
        from config import Settings
        s = Settings()
        assert s.ps_auth_type == "basic"
        assert s.sftp_port == 22
        assert s.cors_origins == "http://localhost:3000"
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`:
```bash
pytest tests/test_config.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'config'`

- [ ] **Step 3: Implement config.py**

```
backend/config.py
```
```python
from functools import lru_cache
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    ps_base_url: str
    ps_auth_type: str = "basic"
    ps_username: str = ""
    ps_password: str = ""
    ps_endpoint: str

    sftp_host: str
    sftp_port: int = 22
    sftp_username: str
    sftp_password: str
    sftp_remote_path: str

    cors_origins: str = "http://localhost:3000"

    model_config = {"env_file": ".env", "case_sensitive": False}

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_config.py -v
```
Expected: 2 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/config.py backend/tests/conftest.py backend/tests/test_config.py
git commit -m "feat: backend config module with pydantic-settings"
```

---

## Task 3: CSV parser

**Files:**
- Create: `backend/csv_parser.py`
- Create: `backend/tests/test_csv_parser.py`

- [ ] **Step 1: Write the failing test**

```
backend/tests/test_csv_parser.py
```
```python
from csv_parser import parse_and_compute

CSV_BYTES = b"name,age,salary\nAlice,30,50000\nBob,25,45000\nCharlie,35,60000"

def test_row_count_and_columns():
    result = parse_and_compute(CSV_BYTES)
    assert result["row_count"] == 3
    assert result["columns"] == ["name", "age", "salary"]
    assert len(result["rows"]) == 3

def test_numeric_kpis():
    result = parse_and_compute(CSV_BYTES)
    age = result["kpis"]["age"]
    assert age["type"] == "numeric"
    assert age["count"] == 3
    assert age["sum"] == 90.0
    assert age["mean"] == 30.0
    assert age["min"] == 25.0
    assert age["max"] == 35.0

def test_categorical_kpis():
    result = parse_and_compute(CSV_BYTES)
    name = result["kpis"]["name"]
    assert name["type"] == "categorical"
    assert name["count"] == 3
    assert name["unique_count"] == 3
    assert "Alice" in name["value_counts"]

def test_rows_contain_all_fields():
    result = parse_and_compute(CSV_BYTES)
    first = result["rows"][0]
    assert "name" in first
    assert "age" in first
    assert "salary" in first
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_csv_parser.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'csv_parser'`

- [ ] **Step 3: Implement csv_parser.py**

```
backend/csv_parser.py
```
```python
import io
from typing import Any
import pandas as pd


def parse_and_compute(csv_bytes: bytes) -> dict[str, Any]:
    df = pd.read_csv(io.BytesIO(csv_bytes))

    kpis: dict[str, Any] = {}
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            kpis[col] = {
                "type": "numeric",
                "count": int(df[col].count()),
                "sum": float(df[col].sum()),
                "mean": float(df[col].mean()),
                "min": float(df[col].min()),
                "max": float(df[col].max()),
            }
        else:
            kpis[col] = {
                "type": "categorical",
                "count": int(df[col].count()),
                "unique_count": int(df[col].nunique()),
                "value_counts": {
                    str(k): int(v)
                    for k, v in df[col].value_counts().head(10).items()
                },
            }

    return {
        "kpis": kpis,
        "rows": df.to_dict(orient="records"),
        "columns": list(df.columns),
        "row_count": len(df),
    }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_csv_parser.py -v
```
Expected: 4 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/csv_parser.py backend/tests/test_csv_parser.py
git commit -m "feat: CSV parser with KPI computation"
```

---

## Task 4: PeopleSoft REST client

**Files:**
- Create: `backend/peoplesoft.py`
- Create: `backend/tests/test_peoplesoft.py`

- [ ] **Step 1: Write the failing test**

```
backend/tests/test_peoplesoft.py
```
```python
import pytest
import httpx
from unittest.mock import patch, MagicMock


@pytest.fixture(autouse=True)
def mock_settings(monkeypatch):
    mock = MagicMock()
    mock.ps_base_url = "https://ps.test.com"
    mock.ps_auth_type = "basic"
    mock.ps_username = "user"
    mock.ps_password = "pass"
    mock.ps_endpoint = "/api/query"
    monkeypatch.setattr("peoplesoft.settings", mock)
    return mock


def test_trigger_engine_basic_auth_success():
    mock_response = MagicMock()
    mock_response.json.return_value = {"status": "success"}
    mock_response.raise_for_status.return_value = None

    with patch("httpx.Client") as mock_client_cls:
        mock_client_cls.return_value.__enter__.return_value.post.return_value = mock_response
        from peoplesoft import trigger_engine
        result = trigger_engine()
        assert result == {"status": "success"}


def test_trigger_engine_raises_on_http_error():
    with patch("httpx.Client") as mock_client_cls:
        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Server error", request=MagicMock(), response=MagicMock()
        )
        mock_client_cls.return_value.__enter__.return_value.post.return_value = mock_response
        from peoplesoft import trigger_engine
        with pytest.raises(httpx.HTTPStatusError):
            trigger_engine()


def test_trigger_engine_bearer_auth(mock_settings):
    mock_settings.ps_auth_type = "bearer"
    mock_response = MagicMock()
    mock_response.json.return_value = {"status": "ok"}
    mock_response.raise_for_status.return_value = None

    with patch("httpx.Client") as mock_client_cls:
        mock_post = mock_client_cls.return_value.__enter__.return_value.post
        mock_post.return_value = mock_response
        from peoplesoft import trigger_engine
        trigger_engine()
        _, kwargs = mock_post.call_args
        assert "Authorization" in kwargs.get("headers", {})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_peoplesoft.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'peoplesoft'`

- [ ] **Step 3: Implement peoplesoft.py**

```
backend/peoplesoft.py
```
```python
import httpx
from config import get_settings

settings = get_settings()


def _auth() -> httpx.BasicAuth | None:
    if settings.ps_auth_type == "basic":
        return httpx.BasicAuth(settings.ps_username, settings.ps_password)
    return None


def _headers() -> dict:
    if settings.ps_auth_type == "bearer":
        return {"Authorization": f"Bearer {settings.ps_password}"}
    return {}


def trigger_engine() -> dict:
    url = settings.ps_base_url + settings.ps_endpoint
    with httpx.Client(timeout=300) as client:
        response = client.post(url, auth=_auth(), headers=_headers())
        response.raise_for_status()
        return response.json()
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_peoplesoft.py -v
```
Expected: 3 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/peoplesoft.py backend/tests/test_peoplesoft.py
git commit -m "feat: PeopleSoft REST client with pluggable auth"
```

---

## Task 5: SFTP client

**Files:**
- Create: `backend/sftp_client.py`
- Create: `backend/tests/test_sftp_client.py`

- [ ] **Step 1: Write the failing test**

```
backend/tests/test_sftp_client.py
```
```python
import pytest
from unittest.mock import patch, MagicMock


@pytest.fixture(autouse=True)
def mock_settings(monkeypatch):
    mock = MagicMock()
    mock.sftp_host = "sftp.test.com"
    mock.sftp_port = 22
    mock.sftp_username = "user"
    mock.sftp_password = "pass"
    mock.sftp_remote_path = "/output.csv"
    monkeypatch.setattr("sftp_client.settings", mock)


TEST_CSV = b"name,age\nAlice,30\nBob,25"


def test_download_csv_returns_bytes():
    with patch("paramiko.SSHClient") as mock_ssh_cls:
        mock_ssh = MagicMock()
        mock_ssh_cls.return_value = mock_ssh

        mock_sftp = MagicMock()
        mock_ssh.open_sftp.return_value = mock_sftp

        def fake_getfo(path, buf):
            buf.write(TEST_CSV)

        mock_sftp.getfo.side_effect = fake_getfo

        from sftp_client import download_csv
        result = download_csv()
        assert result == TEST_CSV


def test_download_csv_closes_connection_on_success():
    with patch("paramiko.SSHClient") as mock_ssh_cls:
        mock_ssh = MagicMock()
        mock_ssh_cls.return_value = mock_ssh
        mock_ssh.open_sftp.return_value.getfo = lambda p, b: b.write(TEST_CSV)

        from sftp_client import download_csv
        download_csv()
        mock_ssh.close.assert_called_once()


def test_download_csv_closes_connection_on_error():
    with patch("paramiko.SSHClient") as mock_ssh_cls:
        mock_ssh = MagicMock()
        mock_ssh_cls.return_value = mock_ssh
        mock_ssh.connect.side_effect = Exception("connection refused")

        from sftp_client import download_csv
        with pytest.raises(Exception, match="connection refused"):
            download_csv()
        mock_ssh.close.assert_called_once()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_sftp_client.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'sftp_client'`

- [ ] **Step 3: Implement sftp_client.py**

```
backend/sftp_client.py
```
```python
import io
import paramiko
from config import get_settings

settings = get_settings()


def download_csv() -> bytes:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            hostname=settings.sftp_host,
            port=settings.sftp_port,
            username=settings.sftp_username,
            password=settings.sftp_password,
        )
        sftp = client.open_sftp()
        buf = io.BytesIO()
        sftp.getfo(settings.sftp_remote_path, buf)
        buf.seek(0)
        return buf.read()
    finally:
        client.close()
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_sftp_client.py -v
```
Expected: 3 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/sftp_client.py backend/tests/test_sftp_client.py
git commit -m "feat: SFTP client for CSV download"
```

---

## Task 6: FastAPI app

**Files:**
- Create: `backend/main.py`
- Create: `backend/tests/test_main.py`

- [ ] **Step 1: Write the failing test**

```
backend/tests/test_main.py
```
```python
import pytest
import httpx
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

CSV_BYTES = b"name,age\nAlice,30\nBob,25"


@pytest.fixture()
def client():
    with patch("main.settings") as mock_settings:
        mock_settings.cors_origins = "http://localhost:3000"
        from main import app
        return TestClient(app)


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_results_empty_before_run(client):
    with patch.dict("main._cache", {}, clear=True):
        response = client.get("/api/results")
    assert response.status_code == 404


def test_run_success(client):
    with patch("main.trigger_engine", return_value={"status": "ok"}), \
         patch("main.download_csv", return_value=CSV_BYTES), \
         patch.dict("main._cache", {}, clear=True):
        response = client.post("/api/run")
    assert response.status_code == 200
    data = response.json()
    assert data["row_count"] == 2
    assert "kpis" in data
    assert "rows" in data
    assert "columns" in data


def test_run_caches_result(client):
    with patch("main.trigger_engine", return_value={"status": "ok"}), \
         patch("main.download_csv", return_value=CSV_BYTES), \
         patch.dict("main._cache", {}, clear=True):
        client.post("/api/run")
        response = client.get("/api/results")
    assert response.status_code == 200
    assert response.json()["row_count"] == 2


def test_run_peoplesoft_502(client):
    with patch("main.trigger_engine", side_effect=httpx.HTTPStatusError(
        "Error", request=MagicMock(), response=MagicMock()
    )):
        response = client.post("/api/run")
    assert response.status_code == 502


def test_run_peoplesoft_timeout(client):
    with patch("main.trigger_engine", side_effect=httpx.TimeoutException("timeout")):
        response = client.post("/api/run")
    assert response.status_code == 504


def test_run_sftp_503(client):
    with patch("main.trigger_engine", return_value={"status": "ok"}), \
         patch("main.download_csv", side_effect=Exception("SFTP unreachable")):
        response = client.post("/api/run")
    assert response.status_code == 503
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_main.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'main'`

- [ ] **Step 3: Implement main.py**

```
backend/main.py
```
```python
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from peoplesoft import trigger_engine
from sftp_client import download_csv
from csv_parser import parse_and_compute

settings = get_settings()
app = FastAPI(title="Sparky Tool")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

_cache: dict = {}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/run")
def run():
    try:
        trigger_engine()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"PeopleSoft error: {exc}")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="PeopleSoft engine timed out")

    try:
        csv_bytes = download_csv()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"SFTP error: {exc}")

    try:
        result = parse_and_compute(csv_bytes)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"CSV parse error: {exc}")

    _cache["last"] = result
    return result


@app.get("/api/results")
def results():
    if "last" not in _cache:
        raise HTTPException(status_code=404, detail="No results yet — run the engine first.")
    return _cache["last"]
```

- [ ] **Step 4: Run all backend tests**

```bash
pytest -v
```
Expected: all tests PASSED (12+)

- [ ] **Step 5: Verify the server starts**

```bash
uvicorn main:app --port 8000
```
Expected: `Application startup complete.` — then Ctrl+C to stop.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/tests/test_main.py
git commit -m "feat: FastAPI endpoints — /api/run, /api/results, /api/health"
```

---

## Task 7: React scaffolding

**Files:**
- Create: `frontend/vite.config.js`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/setupTests.js`
- Create: `frontend/src/api.js`
- Create: `frontend/src/index.css`

- [ ] **Step 1: Create vite.config.js**

```
frontend/vite.config.js
```
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000'
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js'
  }
})
```

- [ ] **Step 2: Create src/main.jsx**

```
frontend/src/main.jsx
```
```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 3: Create setupTests.js**

```
frontend/src/setupTests.js
```
```javascript
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Create api.js**

```
frontend/src/api.js
```
```javascript
import axios from 'axios'

export const runEngine = () => axios.post('/api/run')
export const getResults = () => axios.get('/api/results')
```

- [ ] **Step 5: Create index.css with base styles**

```
frontend/src/index.css
```
```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; background: #f5f5f5; color: #333; }
```

- [ ] **Step 6: Verify Vite starts**

Run from `frontend/`:
```bash
npm run dev
```
Expected: `Local: http://localhost:3000/` (blank page is fine at this stage) — then Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add frontend/vite.config.js frontend/src/main.jsx frontend/src/setupTests.js frontend/src/api.js frontend/src/index.css
git commit -m "feat: React app scaffolding and Vite config"
```

---

## Task 8: KPICards component

**Files:**
- Create: `frontend/src/components/KPICards.jsx`
- Create: `frontend/src/components/KPICards.test.jsx`

- [ ] **Step 1: Write the failing test**

```
frontend/src/components/KPICards.test.jsx
```
```javascript
import { render, screen } from '@testing-library/react'
import KPICards from './KPICards'

const kpis = {
  age: { type: 'numeric', count: 3, sum: 90, mean: 30, min: 25, max: 35 },
  name: { type: 'categorical', count: 3, unique_count: 3, value_counts: { Alice: 1 } }
}

test('renders a card for each numeric column', () => {
  render(<KPICards kpis={kpis} />)
  expect(screen.getByText('age')).toBeInTheDocument()
})

test('shows count, sum, avg, min, max for numeric columns', () => {
  render(<KPICards kpis={kpis} />)
  expect(screen.getByText('Count: 3')).toBeInTheDocument()
  expect(screen.getByText('Sum: 90.00')).toBeInTheDocument()
  expect(screen.getByText('Avg: 30.00')).toBeInTheDocument()
  expect(screen.getByText('Min: 25.00')).toBeInTheDocument()
  expect(screen.getByText('Max: 35.00')).toBeInTheDocument()
})

test('does not render categorical columns as KPI cards', () => {
  render(<KPICards kpis={kpis} />)
  expect(screen.queryByText('name')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run from `frontend/`:
```bash
npm test
```
Expected: FAIL — `Cannot find module './KPICards'`

- [ ] **Step 3: Implement KPICards.jsx**

```
frontend/src/components/KPICards.jsx
```
```jsx
export default function KPICards({ kpis }) {
  const numeric = Object.entries(kpis).filter(([, v]) => v.type === 'numeric')

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
      {numeric.map(([col, stats]) => (
        <div key={col} style={{ background: '#fff', borderRadius: 8, padding: '1rem', minWidth: 160, boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
          <h3 style={{ marginBottom: '0.5rem', color: '#0055aa' }}>{col}</h3>
          <p>Count: {stats.count}</p>
          <p>Sum: {stats.sum.toFixed(2)}</p>
          <p>Avg: {stats.mean.toFixed(2)}</p>
          <p>Min: {stats.min.toFixed(2)}</p>
          <p>Max: {stats.max.toFixed(2)}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test
```
Expected: 3 PASSED (KPICards tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/KPICards.jsx frontend/src/components/KPICards.test.jsx
git commit -m "feat: KPICards component with numeric column stats"
```

---

## Task 9: Charts component

**Files:**
- Create: `frontend/src/components/Charts.jsx`
- Create: `frontend/src/components/Charts.test.jsx`

- [ ] **Step 1: Write the failing test**

```
frontend/src/components/Charts.test.jsx
```
```javascript
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('recharts', () => ({
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}))

import Charts from './Charts'

const kpis = {
  age: { type: 'numeric', count: 3, sum: 90, mean: 30, min: 25, max: 35 },
  dept: { type: 'categorical', count: 3, unique_count: 2, value_counts: { HR: 2, IT: 1 } }
}

test('renders bar chart for numeric columns', () => {
  render(<Charts kpis={kpis} />)
  expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
})

test('renders pie chart for categorical columns', () => {
  render(<Charts kpis={kpis} />)
  expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
})

test('shows categorical column name as section heading', () => {
  render(<Charts kpis={kpis} />)
  expect(screen.getByText('dept Distribution')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL — `Cannot find module './Charts'`

- [ ] **Step 3: Implement Charts.jsx**

```
frontend/src/components/Charts.jsx
```
```jsx
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts'

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

export default function Charts({ kpis }) {
  const numeric = Object.entries(kpis).filter(([, v]) => v.type === 'numeric')
  const categorical = Object.entries(kpis).filter(([, v]) => v.type === 'categorical')

  const barData = numeric.map(([col, s]) => ({
    name: col,
    mean: parseFloat(s.mean.toFixed(2)),
    min: parseFloat(s.min.toFixed(2)),
    max: parseFloat(s.max.toFixed(2)),
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {barData.length > 0 && (
        <div>
          <h3>Numeric Summary</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="mean" fill="#0088FE" />
              <Bar dataKey="min" fill="#00C49F" />
              <Bar dataKey="max" fill="#FFBB28" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {categorical.map(([col, stats]) => {
        const pieData = Object.entries(stats.value_counts).map(([name, value]) => ({ name, value }))
        return (
          <div key={col}>
            <h3>{col} Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" label>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test
```
Expected: all tests PASSED

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Charts.jsx frontend/src/components/Charts.test.jsx
git commit -m "feat: Charts component — bar chart for numeric, pie for categorical"
```

---

## Task 10: DataTable component

**Files:**
- Create: `frontend/src/components/DataTable.jsx`
- Create: `frontend/src/components/DataTable.test.jsx`

- [ ] **Step 1: Write the failing test**

```
frontend/src/components/DataTable.test.jsx
```
```javascript
import { render, screen, fireEvent } from '@testing-library/react'
import DataTable from './DataTable'

const rows = [
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 },
  { name: 'Charlie', age: 35 },
]
const columns = ['name', 'age']

test('renders all rows', () => {
  render(<DataTable rows={rows} columns={columns} />)
  expect(screen.getByText('Alice')).toBeInTheDocument()
  expect(screen.getByText('Bob')).toBeInTheDocument()
  expect(screen.getByText('Charlie')).toBeInTheDocument()
})

test('renders column headers', () => {
  render(<DataTable rows={rows} columns={columns} />)
  expect(screen.getByText('name')).toBeInTheDocument()
  expect(screen.getByText('age')).toBeInTheDocument()
})

test('filters rows on search input', () => {
  render(<DataTable rows={rows} columns={columns} />)
  const search = screen.getByPlaceholderText('Search...')
  fireEvent.change(search, { target: { value: 'Alice' } })
  expect(screen.getByText('Alice')).toBeInTheDocument()
  expect(screen.queryByText('Bob')).not.toBeInTheDocument()
})

test('shows row count', () => {
  render(<DataTable rows={rows} columns={columns} />)
  expect(screen.getByText(/3 rows/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL — `Cannot find module './DataTable'`

- [ ] **Step 3: Implement DataTable.jsx**

```
frontend/src/components/DataTable.jsx
```
```jsx
import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table'

export default function DataTable({ rows, columns }) {
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState([])

  const columnDefs = useMemo(
    () => columns.map(col => ({ accessorKey: col, header: col })),
    [columns]
  )

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    state: { globalFilter, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <input
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
          placeholder="Search..."
          style={{ padding: '0.4rem', borderRadius: 4, border: '1px solid #ccc', width: 240 }}
        />
        <span style={{ color: '#666' }}>{table.getFilteredRowModel().rows.length} rows</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '2px solid #ddd', cursor: 'pointer', userSelect: 'none' }}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === 'asc' ? ' ↑' : h.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid #eee' }}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} style={{ padding: '0.5rem' }}>
                    {String(cell.getValue() ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
        <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>←</button>
        <span>Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</span>
        <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>→</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test
```
Expected: all tests PASSED

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DataTable.jsx frontend/src/components/DataTable.test.jsx
git commit -m "feat: DataTable with search, sort, and pagination"
```

---

## Task 11: App.jsx — wire everything together

**Files:**
- Create: `frontend/src/App.jsx`
- Create: `frontend/src/App.css`
- Create: `frontend/src/App.test.jsx`

- [ ] **Step 1: Write the failing test**

```
frontend/src/App.test.jsx
```
```javascript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import App from './App'
import * as api from './api'

// recharts uses ResizeObserver which jsdom doesn't support — mock the whole module
vi.mock('recharts', () => ({
  BarChart: ({ children }) => <div>{children}</div>,
  Bar: () => null, XAxis: () => null, YAxis: () => null,
  Tooltip: () => null, Legend: () => null,
  PieChart: ({ children }) => <div>{children}</div>,
  Pie: () => null, Cell: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}))

test('renders Run Engine button', () => {
  render(<App />)
  expect(screen.getByText('Run Engine')).toBeInTheDocument()
})

test('disables button and shows loading text while running', async () => {
  vi.spyOn(api, 'runEngine').mockImplementation(() => new Promise(() => {}))
  render(<App />)
  fireEvent.click(screen.getByText('Run Engine'))
  expect(screen.getByText('Running...')).toBeInTheDocument()
  expect(screen.getByRole('button')).toBeDisabled()
})

test('shows error banner on failure', async () => {
  vi.spyOn(api, 'runEngine').mockRejectedValue({
    response: { data: { detail: 'PeopleSoft error: 502' } }
  })
  render(<App />)
  fireEvent.click(screen.getByText('Run Engine'))
  await waitFor(() => expect(screen.getByText('PeopleSoft error: 502')).toBeInTheDocument())
})

test('renders dashboard sections on success', async () => {
  vi.spyOn(api, 'runEngine').mockResolvedValue({
    data: {
      row_count: 1,
      columns: ['name', 'age'],
      rows: [{ name: 'Alice', age: 30 }],
      kpis: {
        age: { type: 'numeric', count: 1, sum: 30, mean: 30, min: 30, max: 30 },
        name: { type: 'categorical', count: 1, unique_count: 1, value_counts: { Alice: 1 } }
      }
    }
  })
  render(<App />)
  fireEvent.click(screen.getByText('Run Engine'))
  await waitFor(() => expect(screen.getByText('KPIs')).toBeInTheDocument())
  expect(screen.getByText('Charts')).toBeInTheDocument()
  expect(screen.getByText(/Data \(1 rows\)/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL — `Cannot find module './App'`

- [ ] **Step 3: Implement App.css**

```
frontend/src/App.css
```
```css
.app { max-width: 1200px; margin: 0 auto; padding: 1.5rem; }
header { display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; }
header h1 { font-size: 1.8rem; color: #0055aa; }
.run-button { padding: 0.6rem 1.4rem; background: #0055aa; color: #fff; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; }
.run-button:disabled { background: #aaa; cursor: not-allowed; }
.spinner { padding: 1rem; color: #666; font-style: italic; }
.error-banner { background: #ffeaea; border: 1px solid #f88; padding: 1rem; border-radius: 6px; color: #c00; margin-bottom: 1rem; }
section { background: #fff; border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
section h2 { margin-bottom: 1rem; color: #333; }
```

- [ ] **Step 4: Implement App.jsx**

```
frontend/src/App.jsx
```
```jsx
import { useState } from 'react'
import { runEngine } from './api'
import KPICards from './components/KPICards'
import Charts from './components/Charts'
import DataTable from './components/DataTable'
import './App.css'

export default function App() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleRun = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await runEngine()
      setData(res.data)
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Unexpected error — check the console.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Sparky Tool</h1>
        <button className="run-button" onClick={handleRun} disabled={loading}>
          {loading ? 'Running...' : 'Run Engine'}
        </button>
      </header>

      {loading && <div className="spinner">Waiting for PeopleSoft engine to complete...</div>}
      {error && <div className="error-banner">{error}</div>}

      {data && (
        <>
          <section>
            <h2>KPIs</h2>
            <KPICards kpis={data.kpis} />
          </section>
          <section>
            <h2>Charts</h2>
            <Charts kpis={data.kpis} />
          </section>
          <section>
            <h2>Data ({data.row_count} rows)</h2>
            <DataTable rows={data.rows} columns={data.columns} />
          </section>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run all frontend tests**

```bash
npm test
```
Expected: all tests PASSED (12+)

- [ ] **Step 6: Smoke-test in the browser**

Start both services:
```bash
# Terminal 1 — from backend/
uvicorn main:app --reload --port 8000

# Terminal 2 — from frontend/
npm run dev
```
Open `http://localhost:3000` — confirm the page loads, the Run Engine button is visible, and clicking it shows the spinner.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.css frontend/src/App.test.jsx
git commit -m "feat: App.jsx wires KPICards, Charts, DataTable with run/error/loading states"
```

---

## Task 12: Docker and Railway deployment

**Files:**
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `docker-compose.yml`
- Create: `Procfile`

- [ ] **Step 1: Create backend Dockerfile**

```
backend/Dockerfile
```
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Create frontend Dockerfile**

```
frontend/Dockerfile
```
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
RUN npm install -g serve
WORKDIR /app
COPY --from=build /app/dist ./dist
CMD ["serve", "-s", "dist", "-l", "3000"]
```

- [ ] **Step 3: Create docker-compose.yml**

```
docker-compose.yml
```
```yaml
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file: .env

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
```

- [ ] **Step 4: Create Procfile for Railway**

Railway deploys backend and frontend as separate services. Create one Procfile per service root — but the simplest single-service approach is to serve the built frontend from FastAPI.

Add static file serving to `backend/main.py` (add these lines after the existing imports and before `@app.get("/api/health")`):

```python
from fastapi.staticfiles import StaticFiles
import os

_frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(_frontend_dist):
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="static")
```

Add `aiofiles` to `backend/requirements.txt`:
```
aiofiles==24.1.0
```

Create `Procfile` at repo root:
```
Procfile
```
```
web: cd frontend && npm ci && npm run build && cd ../backend && pip install -r requirements.txt && uvicorn main:app --host 0.0.0.0 --port $PORT
```

- [ ] **Step 5: Test Docker locally**

```bash
docker compose up --build
```
Expected: both containers start, `http://localhost:3000` loads the dashboard.

- [ ] **Step 6: Commit**

```bash
git add backend/Dockerfile frontend/Dockerfile docker-compose.yml Procfile backend/main.py backend/requirements.txt
git commit -m "feat: Docker and Railway deployment configuration"
```

---

## Done

At this point:
- All backend tests pass (`pytest -v` from `backend/`)
- All frontend tests pass (`npm test` from `frontend/`)
- `docker compose up` runs the full app locally
- The app is Railway-deployable via the `Procfile`
