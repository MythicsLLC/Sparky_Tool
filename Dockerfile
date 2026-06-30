# ---------- Frontend ----------
FROM node:22 AS frontend

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps

COPY frontend .

# ---------- Runtime ----------
FROM python:3.11-slim

# Install Node.js 22
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Verify versions
RUN python --version && node --version && npm --version

# Backend
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r ./backend/requirements.txt

COPY backend ./backend

# Frontend
COPY --from=frontend /app/frontend ./frontend

# Startup
COPY start.sh .
RUN chmod +x start.sh

EXPOSE 8080
EXPOSE 8001

CMD ["./start.sh"]