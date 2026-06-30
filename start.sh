#!/bin/bash
set -e

echo "→ Starting FastAPI on internal port 8001..."
cd /app/backend
uvicorn main:app --host 0.0.0.0 --port 8001 &
FASTAPI_PID=$!

echo "→ Starting React on PORT=${PORT:-8080}..."
cd /app/frontend

HOST=0.0.0.0 PORT=${PORT:-8080} npm run dev &
VITE_PID=$!

cleanup() {
    echo "→ Stopping services..."
    kill $FASTAPI_PID $VITE_PID 2>/dev/null || true
    wait
}

trap cleanup SIGINT SIGTERM

# Exit if either process exits
wait -n

EXIT_CODE=$?

cleanup

exit $EXIT_CODE