#!/bin/bash
set -e

echo "→ Starting FastAPI on internal port 8001..."
cd /app/backend
uvicorn main:app --host 0.0.0.0 --port 8001 &

echo "→ Starting React on PORT=${PORT:-8080}"
cd /app/frontend

HOST=0.0.0.0 PORT=${PORT:-8080} npm run dev