# Improvement Backlog — AdwiKetan Trading Desk

This document serves as the master backlog of identified production readiness, architectural, and feature enhancements.

---

- [x] **[SEC-001] API Rate Limiting & Origin Hardening**: Integrated `express-rate-limit` with 180 req/min threshold on public REST routes, exempted SSE/WebSocket streams, added standard security response headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`), and enabled configurable `ALLOWED_ORIGIN`.
- [x] **[CICD-001] GitHub Actions Automated CI/CD Pipeline**: Configured `.github/workflows/ci.yml` verifying linting (`tsc --noEmit`), unit tests (`npm test`), production bundling (`npm run build`), and Docker image build verification.
- [x] **[TST-001] Automated Testing Suite Setup**: Configured Vitest and added 22 passing unit tests covering pre-trade risk engine, Indian statutory tax calculations, bracket order trailing SL ratchet math, and security header exemption logic.
- [x] **[PWA-001] Progressive Web App (PWA) Manifest & Standalone Mobile Experience**: Created `manifest.webmanifest`, vector/maskable icons (`icon-512.svg`, `icon-192.svg`), Apple mobile tags, viewport notch fit, and `sw.js` offline shell caching.
- [x] **[PERF-001] Market Data In-Memory Quote Cache (`globalLiveQuoteCache`)**: Resolved Cloudflare HTTP 429 rate limit blocks by routing REST quote queries through background WebSocket stream.
- [x] **[SUP-001] Supervisor Dual-Process Architecture**: Hardened gateway/worker separation on port 3000/3001 with SSE live log streaming and Windows process tree killing.
- [x] **[UI-001] Market Data Daemon UI Controller**: Added explicit `Feed: LIVE / PAUSED` header toggle and monitor toolbar switch.
- [x] **[DOCK-001] Multi-Stage Dockerization & Compose**: Built production container with Python 3, pip, SQLite3 native binaries, volume mounts, and status health check.
- [x] **[STRG-001] Columnar Parquet Cold Storage & Cloudflare R2 Sync**: Implemented automated EOD export and cloud object storage tiering.
- [x] **[FIX-001] Holdings Schema Normalization**: Fixed undefined `toLocaleString` runtime crash on live FYERS holdings payload.

---

## High-Priority Items (Next Up)

All immediate production hardening quality gates (PWA, Tests, Security, CI/CD) are complete! Next phase focuses on Market Microstructure & Derivatives.

---

## Medium-Priority Items (Phase II Microstructure & Market Depth)

### [L2-001] Level-2 5-Depth Order Book & Imbalance Gauge (OBI)
- **Category**: Market Microstructure
- **Priority**: P2 (Medium)
- **Status**: Backlog (from Phase II Roadmap)
- **Complexity**: Medium
- **Description**: Stream 5-level Bid/Ask market depth from FYERS WebSocket and render interactive Order Book Depth ladder with real-time Order Book Imbalance ratio (`Total Bid Qty / Total Ask Qty`).
- **Affected Areas**: `fyers_bridge.py`, `server.ts`, `src/components/TradingDashboard.tsx`
- **Validation Criteria**: Order book reflects real-time 5-level bids and asks with instantaneous visual depth bars.

---

### [FNO-001] F&O Open Interest (OI) & Intraday Build-up Classifier
- **Category**: Derivatives Analytics
- **Priority**: P2 (Medium)
- **Status**: Backlog (from Phase II Roadmap)
- **Complexity**: Medium
- **Description**: Ingest `oi` and `pdoi` for Nifty/BankNifty futures contracts and classify ticks into Long Build-up, Short Covering, Short Build-up, and Long Unwinding with PCR (Put-Call Ratio).
- **Affected Areas**: `fyers_bridge.py`, `server.ts`, `src/components/StockScreener.tsx`
- **Validation Criteria**: Screener displays real-time OI delta (`ΔOI`) and highlights dominant institutional build-up direction.

---

### [DB-001] Automated SQLite VACUUM & Retention Policy Scheduler
- **Category**: Database Performance
- **Priority**: P2 (Medium)
- **Status**: Backlog
- **Complexity**: Low
- **Description**: Schedule weekly automatic `VACUUM` and SQLite index defragmentation during non-market hours (e.g. Saturday 02:00 IST) to keep `fyers_prices.db` compact after Parquet tiering.
- **Affected Areas**: `server.ts`, `scripts/export_parquet.py`
- **Validation Criteria**: DB file size reclaims unallocated pages automatically without locking live sessions.

---

## Completed Items

- [x] **[PERF-001] Market Data In-Memory Quote Cache (`globalLiveQuoteCache`)**: Resolved Cloudflare HTTP 429 rate limit blocks by routing REST quote queries through background WebSocket stream.
- [x] **[SUP-001] Supervisor Dual-Process Architecture**: Hardened gateway/worker separation on port 3000/3001 with SSE live log streaming and Windows process tree killing.
- [x] **[UI-001] Market Data Daemon UI Controller**: Added explicit `Feed: LIVE / PAUSED` header toggle and monitor toolbar switch.
- [x] **[DOCK-001] Multi-Stage Dockerization & Compose**: Built production container with Python 3, pip, SQLite3 native binaries, volume mounts, and status health check.
- [x] **[STRG-001] Columnar Parquet Cold Storage & Cloudflare R2 Sync**: Implemented automated EOD export and cloud object storage tiering.
- [x] **[FIX-001] Holdings Schema Normalization**: Fixed undefined `toLocaleString` runtime crash on live FYERS holdings payload.
