FROM node:22-bullseye

RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-venv && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Frontend
COPY frontend/package*.json ./frontend/
WORKDIR /app/frontend
RUN npm install
COPY frontend .

# Backend
WORKDIR /app
COPY backend/requirements.txt ./backend/
RUN pip3 install --no-cache-dir -r ./backend/requirements.txt
COPY backend ./backend

# Startup
COPY start.sh .
RUN chmod +x start.sh

EXPOSE 8080
EXPOSE 8001

CMD ["./start.sh"]