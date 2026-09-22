# Changelog — AdwiKetan Trading Desk

All notable changes to the AdwiKetan Trading Desk project are documented here following the [Keep a Changelog](https://keepachangelog.com/) convention.

---

## [2.3.0] - 2026-09-22
### Added
- **API Rate Limiting ([SEC-001])**: Integrated `express-rate-limit` with 180 req/min sliding window protection on public REST endpoints across both `supervisor.ts` and `server.ts`.
- **Stream Exemption**: Explicitly exempt real-time SSE log streams (`/api/server/logs`), live price SSE feeds (`/api/stream`), and streaming requests with `text/event-stream` accept header from rate limiting.
- **Security Response Headers**: Configured `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and `Referrer-Policy: strict-origin-when-cross-origin`.
- **CORS Origin Hardening**: Configured dynamic origin checking via `ALLOWED_ORIGIN` environment variable with safe development fallbacks.
- **GitHub Actions CI/CD Pipeline ([CICD-001])**: Created `.github/workflows/ci.yml` running TypeScript typecheck (`tsc --noEmit`), Vitest automated tests (22 tests), Vite + esbuild bundling, and multi-stage Docker build check.
- **Security Test Suite**: Created `tests/securityHeaders.test.ts` covering header injection, stream exemption rules, and rate limiter configuration.

---

## [2.2.0] - 2026-09-22
### Added
- **Automated Testing Suite ([TST-001])**: Configured Vitest test runner with 19 passing unit tests covering pre-trade risk engine, Indian statutory tax calculations, and bracket order trailing SL ratchet math.
- **Progressive Web App (PWA) ([PWA-001])**: Added `manifest.webmanifest`, standalone app mode, vector brand icons (`icon-512.svg`, `icon-192.svg`, `favicon.svg`), mobile viewport notch support (`viewport-fit=cover`), and `sw.js` offline caching.
- **Institutional Position Sizing**: Added `calculateMaxQty` formula in `src/utils/riskConfig.ts`.

---

## [2.1.0] - 2026-09-22
### Added
- **Tiered Storage Architecture**: Added `scripts/export_parquet.py` converting raw ticks into Snappy-compressed Parquet columnar format with automated EOD archival.
- **Cloudflare R2 Integration**: Added `scripts/cloud_sync.py` to mirror cold Parquet files to Cloudflare R2 bucket with automated retry and manifest tracking.
- **Production Containerization**: Created production multi-stage `Dockerfile` (Node 22, Python 3, SQLite native build tools) and `docker-compose.yml` with host volume mounting.
- **Telegram `/export` Command**: Added capability to generate and send immediate Parquet/Excel backups directly to authorized Telegram chat.
- **Market Data Daemon Controller**: Added `Feed: LIVE / PAUSED` toggle in top header and monitor toolbar to control the Python WebSocket daemon independently from terminal sessions.
- **Production Readiness Documentation**: Initialized structured `docs/` repository context (`PROJECT_CONTEXT.md`, `SESSION_STATE.md`, `IMPROVEMENT_BACKLOG.md`, `IMPLEMENTATION_PLAN.md`, `CHANGELOG.md`).

### Fixed
- **FYERS Holdings Schema Bug**: Normalized `fyersData.overall` keys to prevent `Cannot read properties of undefined (reading 'toLocaleString')` runtime crash.
- **Supervisor Windows Process Termination**: Replaced default signal termination with `taskkill /PID ... /T /F` to ensure child python processes are cleanly killed on server restart.

---

## [2.0.0] - 2026-09-08
### Added
- **Trading Dashboard**: Full paper-trading execution engine with simulated ₹10,00,000 capital and live FYERS quote updates.
- **Bracket Order System**: Automated Stop-Loss and Target Profit bracket order ticket with local trailing SL engine.
- **Indian Statutory Charges Calculator**: SEBI compliant itemized breakdown for STT, Stamp Duty, GST 18%, Exchange fees, and Breakeven price calculation.
- **TradingView Lightweight Charts**: Interactive 1-minute and historical candlestick charts with volume bars, VWAP, EMA 9/21/50, RSI 14, MACD, and order execution markers.
- **Smart Money Flow Radar**: Institutional footprint detection engine for block accumulations, aggressive market sweeps, and stealth distribution.
- **Synthesized Web Audio Engine**: Zero-network oscillator chimes for order fills, target hits, and institutional alerts.
- **Supervisor Watchdog**: Dual-process architecture (`supervisor.ts` and `server.ts`) with live SSE log viewer.

---

## [1.0.0] - 2026-09-03
### Added
- Initial FYERS API v3 WebSocket streaming proof-of-concept.
- SQLite hot tick storage with automated CSV session export.
- Nifty 500, Bank Nifty, and Nifty Futures constituent dropdown selector.
