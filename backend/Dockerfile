FROM python:3.11-slim
WORKDIR /app

# VPN clients: openconnect (Cisco AnyConnect / GlobalProtect / Pulse),
# openvpn, wireguard-tools (wg-quick), openssh-client (SSH tunnel)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openconnect \
    openvpn \
    wireguard-tools \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
