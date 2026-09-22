# Implementation Plan — Production Readiness & Modernization Roadmap

## Phase 1 — Quality Gates & Multi-Device PWA (Completed)
- [x] **Task 1.1: Automated Unit Testing Suite ([TST-001])**
  - Installed `vitest` as development dependency.
  - Created `tests/taxCalculator.test.ts` to test all Indian statutory charges (STT, Stamp Duty, SEBI, GST 18%, Brokerage cap).
  - Created `tests/riskEngine.test.ts` to test pre-trade risk thresholds (Max order value, drawdown threshold, position size cap).
  - Created `tests/bracketOrders.test.ts` to test trailing stop-loss ratchet logic and TP/SL execution.
  - Added `npm test` script to `package.json` (19/19 tests passing).
- [x] **Task 1.2: PWA Web Manifest & Mobile Installation ([PWA-001])**
  - Created `public/manifest.webmanifest` with standalone display mode, theme colors, and shortcuts.
  - Created vector icons `icon-512.svg`, `icon-192.svg`, and `favicon.svg`.
  - Created `public/sw.js` lightweight service worker caching static assets while bypassing SSE/WebSocket streams.
  - Updated `index.html` with mobile viewport meta tags (`viewport-fit=cover`), Apple touch icons, and service worker registration.

---

## Phase 2 — Security & API Hardening (Completed)
- [x] **Task 2.1: API Rate Limiting ([SEC-001])**
  - Installed `express-rate-limit`.
  - Applied 180 req/min rate limiter on public REST endpoints across both `supervisor.ts` and `server.ts`.
  - Guaranteed SSE streams (`/api/server/logs`, `/api/stream`, and `text/event-stream` headers) are explicitly exempt from rate limiting.
- [x] **Task 2.2: CORS & Header Security**
  - Restricted CORS origin in production mode via `process.env.ALLOWED_ORIGIN` with automatic fallback.
  - Added standard security response headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`).
  - Added unit test suite `tests/securityHeaders.test.ts` (3 tests).
- [x] **Task 2.3: CI/CD Pipeline ([CICD-001])**
  - Created `.github/workflows/ci.yml` running lint (`tsc --noEmit`), automated tests (`npm test`), bundle compilation (`npm run build`), and Docker build verification.

---

## Phase 3 — Phase II Market Microstructure & Depth Analytics
- [ ] **Task 3.1: Level-2 (L2) 5-Level Market Depth ([L2-001])**
  - Extend `fyers_bridge.py` to stream 5-level bid/ask market depth for focused ticker.
  - Render dynamic Depth Ladder with visual Order Book Imbalance (OBI) bar in `TradingDashboard.tsx`.
- [ ] **Task 3.2: F&O Derivatives Open Interest (OI) Tracker ([FNO-001])**
  - Ingest `oi` / `pdoi` from FYERS derivatives data feed.
  - Compute intraday build-up direction (Long Build-up, Short Covering, Short Build-up, Long Unwinding).
  - Surface real-time Put-Call Ratio (PCR) in the Stock Screener.

---

## Phase 4 — Long-Term Database Maintenance & Cloud Scale
- [ ] **Task 4.1: Scheduled SQLite Maintenance ([DB-001])**
  - Automate weekly off-hours vacuum and page defragmentation.
- [ ] **Task 4.2: Healthcheck Telemetry & Prometheus Metrics**
  - Expose `/api/metrics` with tick ingestion rate, cache hit ratio, and active WebSocket connection count.
