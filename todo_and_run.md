# FYERS Live Price Test - Setup & Run Guide

## Prerequisites

- **Node.js** v18+ (tested with v24)
- **Python** 3.10+ (tested with 3.13)
- **npm** (comes with Node.js)

---

## Quick Start (Mock Mode - No Credentials Needed)

```bash
# 1. Install Node dependencies
npm install

# 2. Build the frontend
npm run build

# 3. Run the server
npm run dev
```

Open http://localhost:3000 in your browser. Click **Run** to see simulated market data.

---

## Production Run (Real FYERS WebSocket Data)

### Step 1: Get FYERS API Credentials

1. Create an account at https://myapi.fyers.in/
2. Create an app to get your **Client ID** (format: `XXXXXXXXXX-100`)
3. Generate an **Access Token** using FYERS login flow (OAuth2)
   - The access token is valid for one trading day
   - You'll need to regenerate it each day before market opens

### Step 2: Install Python Dependencies

```bash
pip install fyers-apiv3 python-dotenv
```

### Step 3: Update `.env` File

Change these values in the `.env` file at the project root:

```env
# Replace with your actual credentials
FYERS_CLIENT_ID=YOUR_ACTUAL_CLIENT_ID
FYERS_ACCESS_TOKEN=YOUR_ACTUAL_ACCESS_TOKEN

# Switch to live mode
MOCK_MODE=false
```

### Step 4: Build & Run

```bash
npm run build
npm run dev
```

The server will print:
```
Mode: LIVE (real FYERS WebSocket)
FYERS Server running on http://0.0.0.0:3000
```

Open http://localhost:3000 and click **Run** to start receiving real market data.

---

## What Changes for Production

| Setting | Mock Value | Production Value |
|---------|-----------|-----------------|
| `FYERS_CLIENT_ID` | `test_client_id` | Your actual client ID |
| `FYERS_ACCESS_TOKEN` | `test_access_token` | Your actual access token |
| `MOCK_MODE` | `true` | `false` |

That's it. Everything else works as-is.

---

## How It Works

```
Browser (React) <--SSE--> Express Server (server.ts)
                               |
                    [MOCK_MODE=true]  [MOCK_MODE=false]
                         |                    |
                  Random price         Python bridge
                  simulation           (fyers_bridge.py)
                         |                    |
                         v                    v
                    CSV file            FYERS WebSocket API
                                              |
                                              v
                                         CSV file
```

- **Mock mode**: Server generates simulated ticks using random walk algorithm
- **Live mode**: Server spawns `fyers_bridge.py` which connects to FYERS V3 WebSocket and pipes real tick data back

In both modes, every tick is written to `fyers_prices.csv` for local analysis.

---

## File Structure

```
.env                  <- Credentials & config (edit this for prod)
server.ts             <- Express server (SSE streaming, CSV writing)
fyers_bridge.py       <- Python script that connects to real FYERS WebSocket
src/App.tsx           <- React frontend UI
src/types.ts          <- TypeScript type definitions
index.html            <- HTML entry point
package.json          <- Node.js dependencies
vite.config.ts        <- Vite build config
fyers-price-test/     <- Standalone Python client (alternative, runs independently)
```

---

## Commands Reference

| Command | Purpose |
|---------|---------|
| `npm install` | Install Node.js dependencies |
| `npm run build` | Build frontend for production |
| `npm run dev` | Start development server (with hot reload for server.ts) |
| `npm start` | Start production server (from built dist/) |

---

## Output

All market data is saved to `fyers_prices.csv` with columns:

```
Date, Time, Symbol, Open, High, Low, Close, LTP, Quantity, Volume, Average, Bid, Ask, Change, PercentChange
```

---

## Troubleshooting

### "Mode: MOCK" even after setting credentials
- Ensure `MOCK_MODE=false` in `.env`
- Ensure `FYERS_CLIENT_ID` is not `test_client_id`
- Ensure `FYERS_ACCESS_TOKEN` is not `test_access_token`

### Python bridge errors
- Run `pip install fyers-apiv3 python-dotenv` to install dependencies
- Check that `python` command works in your terminal
- Check FYERS access token hasn't expired (they expire daily)

### Port already in use
- Set a different port: add `PORT=3002` to `.env`
- Or kill existing processes: `taskkill /F /IM node.exe` (Windows)

### No data during market hours
- NSE market hours: 9:15 AM - 3:30 PM IST (Mon-Fri)
- FYERS WebSocket only sends ticks during market hours
- Outside market hours, the connection stays open but no ticks arrive

---

## Daily Workflow (Production)

1. Before 9:15 AM IST: Generate new FYERS access token
2. Update `FYERS_ACCESS_TOKEN` in `.env`
3. Run `npm run dev`
4. Open browser, click **Run**
5. Data streams in real-time and saves to CSV
6. After 3:30 PM: Stop the server, analyze `fyers_prices.csv`
