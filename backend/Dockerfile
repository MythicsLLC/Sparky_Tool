# ── Stage 1: build the React frontend ────────────────────────────────────────
# Docker context must be the repo root (set dockerContext: . in render.yaml)
# so both frontend/ and backend/ are accessible.
FROM node:20-alpine AS frontend-build
WORKDIR /build/frontend

# Install deps first (cached unless package.json changes)
COPY frontend/package*.json ./
RUN npm ci

# Copy source and build — .env file is included so Vite picks up VITE_* vars
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python backend ───────────────────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .

# FastAPI (main.py) serves the frontend from ../frontend/dist relative to
# its own location. main.py lives at /app/main.py, so the resolved path is
# /app/../frontend/dist = /frontend/dist.
COPY --from=frontend-build /build/frontend/dist /frontend/dist

# Render injects $PORT at runtime; use shell form so the variable is expanded.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
