# TODO: Phase II Roadmap — Advanced Ticker Analytics & Market Microstructure

This document outlines the planned architectural and functional enhancements for **Phase II** of the FYERS Live Price Streaming & Analysis Engine.

---

## 1. Level 2 (L2) Market Depth & Order Book Dynamics
- [ ] **5-Level Bid/Ask Stream**:
  - Capture top 5 bid prices, quantities, and order counts.
  - Capture top 5 ask prices, quantities, and order counts.
- [ ] **Order Book Imbalance (OBI)**:
  - Compute real-time ratio: `Total Buy Quantity / Total Sell Quantity`.
  - Flag institutional liquidity absorption and bid/ask wall shifts.
- [ ] **Spread Tracking**:
  - Log Bid-Ask Spread and spread percentage over time to measure liquidity friction.

---

## 2. Derivatives & Open Interest (OI) Analytics
- [ ] **F&O Open Interest Stream**:
  - Ingest `oi` (Current Open Interest) and `pdoi` (Previous Day Open Interest) for Futures & Options contracts.
  - Calculate intraday OI delta (`ΔOI`) and `% ΔOI`.
- [ ] **Build-up Classifier**:
  - Classify ticks into:
    - **Long Build-up**: Price ↑ + OI ↑
    - **Short Covering**: Price ↑ + OI ↓
    - **Short Build-up**: Price ↓ + OI ↑
    - **Long Unwinding**: Price ↓ + OI ↓
- [ ] **Put-Call Ratio (PCR)**:
  - Real-time volume & OI PCR calculation across active strike chains.

---

## 3. Market Microstructure & Flow Analytics
- [ ] **Trade Aggressor Classification (Tick Rule)**:
  - Classify each tick as:
    - **Buyer-initiated (Market Buy)**: `LTP >= Ask`
    - **Seller-initiated (Market Sell)**: `LTP <= Bid`
- [ ] **Cumulative Volume Delta (CVD)**:
  - Track `Cumulative (Buyer Volume - Seller Volume)` to spot hidden institutional accumulation/distribution.
- [ ] **Tick Intensity / HFT Velocity**:
  - Number of trades per second to detect algorithmic burst activity.

---

## 4. Exchange Bands & Extremes
- [ ] **Upper & Lower Circuit Limits (UC / LC)**:
  - Record exchange circuit bands and compute distance to circuit (`% from Upper/Lower limit`).
- [ ] **52-Week High / Low**:
  - Capture historical extremes and trigger proximity alerts when within `0.25%` of new highs/lows.

---

## 5. Resampling Engine & Technical Indicators
- [ ] **1-Second & 1-Minute Resampling Engine**:
  - Generate clean 1s / 1m / 5m OHLCV bars directly from raw SQLite ticks.
  - Forward-fill quiet periods for consistent time-series backtesting.
- [ ] **Intraday VWAP (Volume Weighted Average Price)**:
  - Real-time VWAP: `Σ(Price × Volume) / Σ(Volume)`.
  - Standard deviation bands (VWAP Upper Band +1σ/+2σ, Lower Band -1σ/-2σ).
- [ ] **Resampled Excel Exports**:
  - Export option: *"Download 1-Minute OHLCV Summary (.xlsx)"* alongside raw tick export.

---

## 6. Visual & UI Enhancements
- [ ] **TradingView Lightweight Charts**:
  - Embed responsive 1-minute candlestick charts directly in modal / card views.
- [ ] **Audio & Visual Breakout Alerts**:
  - Customizable price, volume, and Day High/Low breach notifications.
- [ ] **Historical SQLite Browser Tab**:
  - Query and inspect ticks by symbol and past dates without downloading Excel.

---

*Logged on: 2026-09-03 | Status: Scheduled for Phase II Implementation*
