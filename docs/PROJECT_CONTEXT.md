# Project Context — AdwiKetan Trading Desk & FYERS Live Market Engine

## 1. Product Purpose & Overview
**AdwiKetan Trading Desk** is an institutional-grade, real-time trading station, live price monitor, and quantitative stock analysis application for Indian Equities and Derivatives (NSE / BSE). It integrates directly with the **FYERS API v3** ecosystem to deliver sub-millisecond price streams, algorithmic smart money flow detection, pre-trade risk controls, paper/live order routing, automated bracket orders (SL/TP), statutory tax calculation, and cold-tier Parquet storage.

---

## 2. Technology Stack & Architecture

### Frontend Layer
- **Framework**: React 19 + TypeScript (ESNext, strict mode)
- **Bundler & Dev Server**: Vite 6.2 with Hot Module Replacement (HMR)
- **Styling**: Tailwind CSS v4, custom glassmorphism design system (`web2-card`, `glossy-orb`, `glossy-btn`), dynamic theme support (`sky` & `emerald`)
- **Charting**: TradingView Lightweight Charts v5.2 (Candlesticks, VWAP, Volume Histograms, EMA 9/21/50, RSI 14, MACD, interactive markers)
- **Audio Engine**: Synthesized Web Audio API Oscillator engine (`audioAlerts.ts`), zero external audio files
- **Icons**: Lucide React v0.546

### Backend Layer
- **Runtime**: Node.js 22 + TypeScript via `tsx`
- **Supervisor**: Dual-process supervisor (`supervisor.ts`) orchestrating worker (`server.ts`) with live SSE log streaming, process tree watchdog (`taskkill` on Windows), and zero-downtime worker reloads
- **API Framework**: Express 4.21 with Server-Sent Events (SSE) broadcasting for tick feeds, smart money alerts, and order fills
- **Market Data Bridge**: `fyers_bridge.py` running persistent FYERS API v3 WebSocket streaming with dynamic subscription and in-memory cache fallback (`globalLiveQuoteCache`)
- **Alert Dispatcher**: `telegramService.ts` utilizing `node-telegram-bot-api` with automatic reconnect, HTML formatting, and interactive inline commands (`/status`, `/export`, `/pnl`)

### Storage & Persistence Layer
- **Hot Storage**: SQLite 3 via `better-sqlite3` v13 in Write-Ahead Logging (`WAL`) mode (`fyers_prices.db`)
- **Resampling Tables**: Real-time tick ingestion with automated 1s (`bars_1s`) and 1m (`bars_1m`) resampled OHLCV bars
- **Cold Storage**: PyArrow / Parquet columnar storage (`scripts/export_parquet.py`) with Snappy compression, daily EOD automated archival, and Cloudflare R2 multi-region sync (`scripts/cloud_sync.py`)
- **Backups**: Timestamped Excel (`.xlsx`) and Parquet (`.parquet`) exports stored in `backups/` with automated JSON manifest

---

## 3. Core Functional Modules
1. **Live Prices Monitor**: Full-screen tick-by-tick streaming terminal, real-time snapshot cards, timeframe resampling (Live / 1s / 1m), CSV/Excel session export.
2. **Stock Screener**: Nifty 500, Bank Nifty, and Nifty Futures constituent screener with real-time metrics, volume spikes, 52-week extremes, and FYERS 1-year historical return analytics.
3. **Institutional Smart Money Radar**: Real-time order book aggressor tracking, institutional footprint classifier (Block Accumulation, Aggressive Sweep, Stealth Distribution), and audio-visual alert broadcasting.
4. **Trading Dashboard**: 
   - Paper Trading Engine: ₹10,00,000 simulated account with real FYERS live execution.
   - Live Broker Mode: Direct FYERS API order ticket.
   - Bracket Orders: Pre-configured Stop-Loss & Target Profit automated order placement with local trailing SL engine.
   - Statutory Tax & Brokerage Calculator: SEBI, STT, Stamp Duty, Exchange Turnover, GST 18%, and Breakeven price calculation.
   - Holdings Portfolio: Dematerialized portfolio valuation with real-time FYERS quote enrichment.
5. **Supervisor & Server Logs**: Real-time console log viewer, worker restart/kill controls, and memory/uptime diagnostics.
6. **Market Data Daemon Controller**: Background WebSocket collector with persistent cache and explicit UI toggle (`Feed: LIVE / PAUSED`).

---

## 4. Environment & Deployment Topology
- **Local Development**: `npm run dev` (spawns supervisor at `:3000` and worker at `:3001`)
- **Containerization**: Multi-stage Docker container (`Dockerfile`) based on `node:22-bookworm-slim` with Python 3, pip, SQLite3 native build tools, and healthcheck probe at `/api/server/status`
- **Orchestration**: `docker-compose.yml` with host volume persistence for `backups/` and `data/`
- **Cloud Storage**: Cloudflare R2 bucket with automated retry, exponential backoff, and upload manifest
