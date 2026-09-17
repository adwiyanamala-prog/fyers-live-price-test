# ☁️ Cloud VPS Deployment & Static IP Whitelisting Guide

This guide details how to deploy the **FYERS Live Market Station & Trading Terminal** to a 24/7 cloud virtual private server (VPS). 

Deploying to a cloud server provides two crucial advantages:
1. **Permanent Static IP for FYERS Order Placement**: Eliminates ISP dynamic IP rotation errors (`Orders are only allowed from whitelisted IP addresses: xxx.xxx.xxx.xxx`).
2. **Institutional Tiered Storage**: Automatic daily archival at 15:40 IST compressing 300+ MB of market ticks into ~15 MB Apache Parquet files with Zstandard compression, synced directly to Cloudflare R2 / AWS S3 with zero egress cost downloads.
3. **24/7 Telegram Remote Access**: Full control over orders, positions, screeners, and daemon streaming from your mobile device.

---

## Architecture Overview

```
                                  [FYERS API V3]
                                         │ (WebSocket + REST)
                                         ▼
                   ┌───────────────────────────────────────────┐
                   │  AWS Lightsail Mumbai / DO Droplet        │
                   │  Permanent Static IP (Whitelisted)        │
                   │                                           │
                   │  ┌──────────────────────────────────────┐ │
                   │  │ Docker: fyers-trading-station        │ │
                   │  │                                      │ │
                   │  │  [Supervisor Process (Port 3000)]    │ │
                   │  │            │ (Health & SSE Logs)     │ │
                   │  │            ▼                         │ │
                   │  │  [Node Backend (Port 3001)]          │ │
                   │  │     │                │               │ │
                   │  │     ▼                ▼               │ │
                   │  │ [SQLite DB]   [PyArrow Engine]       │ │
                   │  │ (Hot <100MB)  (Zstd Parquet)         │ │
                   │  └─────┬────────────────┬───────────────┘ │
                   └────────┼────────────────┼─────────────────┘
                            │                │
             (Market Hours) │                │ (15:40 IST EOD Archival)
                            ▼                ▼
                     [Telegram Bot]    [Cloudflare R2 / S3]
                     (Mobile Alerts    (Zero Egress Storage)
                      & Remote Orders)
```

---

## Part 1: Provision Cloud Instance with Static IP

### Recommended Provider: AWS Lightsail Mumbai (`ap-south-1`)
- **Latency**: ~3–8 ms to NSE and FYERS data centers.
- **Spec**: **2 GB RAM, 1 vCPU (20 GB SSD)** ($10/month) or **4 GB RAM** ($20/month).
- **OS**: Ubuntu 24.04 LTS.

### 1. Launch Instance
1. Log in to [AWS Lightsail Console](https://lightsail.aws.amazon.com/).
2. Select **Create instance**.
3. Choose location: **Mumbai (Zone A/B)** (`ap-south-1`).
4. Select platform: **Linux/Unix** -> Blueprint: **OS Only** -> **Ubuntu 24.04 LTS**.
5. Choose your plan ($10/mo or $20/mo).
6. Click **Create instance**.

### 2. Attach Permanent Static IP
1. In the Lightsail dashboard, navigate to the **Networking** tab.
2. Click **Create static IP**.
3. Select your newly created instance and name your static IP (e.g. `fyers-station-ip`).
4. Click **Create and attach**.
5. Copy your **Public Static IP** (e.g. `13.235.xxx.xxx`).

---

## Part 2: Whitelist Static IP in FYERS Portal

1. Log into your [FYERS API Dashboard](https://api.fyers.in/).
2. Click on your active App under **My Apps**.
3. Locate the **IP Whitelist** field.
4. Add your cloud server's **Public Static IP** (e.g. `13.235.xxx.xxx`).
5. Click **Save Changes**.
   > [!IMPORTANT]
   > Live order execution endpoints (`POST /api/v3/orders`) require requests to originate strictly from your whitelisted IP address. With a cloud static IP, orders placed via the web terminal or Telegram bot will never be rejected.

---

## Part 3: Server Setup & Docker Installation

SSH into your cloud server:
```bash
ssh -i your-key.pem ubuntu@13.235.xxx.xxx
```

Run the following command to update system packages and install Docker:
```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker and Docker Compose
sudo apt install -y docker.io docker-compose-plugin git curl

# Add ubuntu user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

---

## Part 4: Deploy FYERS Station

### 1. Clone Codebase
```bash
git clone https://github.com/adwiyanamala-prog/fyers-live-price-test.git /opt/fyers-station
cd /opt/fyers-station
```

### 2. Configure Environment (`.env`)
```bash
cp .env.example .env
nano .env
```

Populate the required keys:
```env
# FYERS Market & Trading App
FYERS_CLIENT_ID='your_client_id_here'
FYERS_SECRET_KEY='your_secret_key_here'
FYERS_ACCESS_TOKEN='your_generated_access_token'

# Telegram Integration
TELEGRAM_BOT_TOKEN='your_telegram_bot_token'
TELEGRAM_CHAT_ID='your_numeric_chat_id'
TELEGRAM_ALERTS_ENABLED=true
TELEGRAM_DEFAULT_MODE=paper

# Automated Daily Archival (15:40 IST = 10 mins after market close)
AUTO_ARCHIVE_TIME=15:40

# (Optional) Cloudflare R2 Storage (10 GB Free Tier, Zero Egress Fees)
R2_ACCOUNT_ID=''
R2_ACCESS_KEY_ID=''
R2_SECRET_ACCESS_KEY=''
R2_BUCKET_NAME=''
```

### 3. Build & Launch Container
```bash
docker compose up -d --build
```

Verify that the container is healthy and running:
```bash
docker compose ps
docker compose logs -f --tail=100
```

You will see:
```text
[SUPERVISOR] Starting backend server process on port 3001...
[TELEGRAM] Bot verified successfully: @YourBotName
[AUTO_ARCHIVE] Automated EOD scheduler initialized (Daily trigger at 15:40 IST).
FYERS Server running on http://0.0.0.0:3000
```

---

## Part 5: Zero-Hassle SSL with Cloudflare Tunnel (Recommended)

To securely access your web workstation over HTTPS without opening inbound firewall ports or configuring Nginx cert renewals:

1. In your Cloudflare Dashboard, go to **Zero Trust** -> **Networks** -> **Tunnels**.
2. Click **Add a Tunnel** -> Name it `fyers-station`.
3. Copy the installation command for Debian 64-bit and run it on your VPS:
   ```bash
   curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i cloudflared.deb
   sudo cloudflared service install <YOUR_TOKEN>
   ```
4. In the Cloudflare Tunnel UI, map a Public Hostname:
   - Subdomain: `trading.yourdomain.com`
   - Service: `HTTP`
   - URL: `localhost:3000`
5. Your trading station is now live with institutional HTTPS, DDoS protection, and Cloudflare Access authentication!

---

## Part 6: Tiered Data Storage & Cloud Sync

### Hot Layer (SQLite WAL)
- Stores intraday ticks and 1-second / 1-minute bars during market hours.
- Maximum memory footprint kept under 100 MB via indexing and memory limits.

### Cold Layer (Apache Parquet with Zstandard)
- At **15:40 IST** daily (or via `/export now` on Telegram):
  1. All intraday ticks are compressed into Apache Parquet (`.parquet`) using **Zstandard level 7** compression.
  2. Compresses 300+ MB down to **~15 MB** (95% reduction).
  3. Raw ticks table is truncated and SQLite is vacuumed.
  4. Parquet archive is uploaded to **Cloudflare R2 / AWS S3**.
  5. Completion notification with download link is sent to Telegram.

---

## Part 7: Useful Operational Commands

| Action | Command |
|---|---|
| Check live logs | `docker compose logs -f` |
| Restart server | `docker compose restart` |
| Stop server | `docker compose down` |
| Pull updates & rebuild | `git pull && docker compose up -d --build` |
| Trigger manual Parquet archive | `curl -X POST http://localhost:3000/api/archive/eod` |
| Check SQLite disk usage | `curl http://localhost:3000/api/db/stats` |
