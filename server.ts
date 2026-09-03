import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { spawn, ChildProcess } from "child_process";
import { createInterface } from "readline";
import dotenv from "dotenv";
import * as XLSX from "xlsx";
import Database from "better-sqlite3";

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), "fyers-price-test", ".env") });

// SHA-256 helper for FYERS auth
function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// Reliable .env updater
function updateEnvFile(updates: Record<string, string>) {
  const envPath = path.join(process.cwd(), ".env");
  let content = "";
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, "utf-8");
  }

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    const formattedVal = `'${value.replace(/'/g, "\\'")}'`;
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${formattedVal}`);
    } else {
      content += `\n${key}=${formattedVal}`;
    }
    process.env[key] = value;
  }

  fs.writeFileSync(envPath, content, "utf-8");
}

// In-memory map for pending OAuth requests
interface PendingAuth {
  appId: string;
  secretKey: string;
  redirectUri: string;
  createdAt: number;
}
const pendingAuthMap = new Map<string, PendingAuth>();

// IST time helper
function nowIST(): { dateStr: string; timeStr: string; label: string } {
  const fmt = (part: Intl.DateTimeFormatPartTypes, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...opts }).format(new Date());
  const dateStr = fmt("year", { year: "numeric", month: "2-digit", day: "2-digit" })
    .split("/").reverse().join("-"); // DD/MM/YYYY → YYYY-MM-DD
  const timeStr = fmt("hour", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return { dateStr, timeStr, label: `${dateStr} ${timeStr}` };
}

// ============================================================================
// SQLite — persistent tick storage
// ============================================================================
const DB_PATH = path.join(process.cwd(), "fyers_prices.db");
const db = new Database(DB_PATH);

// WAL mode: concurrent reads don't block writes
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS ticks (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    date      TEXT    NOT NULL,
    time      TEXT    NOT NULL,
    symbol    TEXT    NOT NULL,
    open      REAL,
    high      REAL,
    low       REAL,
    close     REAL,
    ltp       REAL,
    quantity  INTEGER,
    volume    INTEGER,
    average   REAL,
    bid       REAL,
    ask       REAL,
    chng      REAL,
    pchange   REAL,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_symbol_date ON ticks (symbol, date);
  CREATE INDEX IF NOT EXISTS idx_date        ON ticks (date);

  -- Real-Time 1-Second Aggregated Bars (Live 1s OHLCV)
  CREATE TABLE IF NOT EXISTS bars_1s (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT    NOT NULL,
    time       TEXT    NOT NULL,
    symbol     TEXT    NOT NULL,
    open       REAL    NOT NULL,
    high       REAL    NOT NULL,
    low        REAL    NOT NULL,
    close      REAL    NOT NULL,
    volume     INTEGER NOT NULL,
    trades     INTEGER NOT NULL,
    chng       REAL,
    pchange    REAL,
    day_volume INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_bars_sym_dt ON bars_1s (symbol, date, time);

  -- Real-Time 1-Minute Aggregated Bars (Live 1m OHLCV)
  CREATE TABLE IF NOT EXISTS bars_1m (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT    NOT NULL,
    time       TEXT    NOT NULL,
    symbol     TEXT    NOT NULL,
    open       REAL    NOT NULL,
    high       REAL    NOT NULL,
    low        REAL    NOT NULL,
    close      REAL    NOT NULL,
    volume     INTEGER NOT NULL,
    trades     INTEGER NOT NULL,
    chng       REAL,
    pchange    REAL,
    day_volume INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_bars_1m_sym_dt ON bars_1m (symbol, date, time);
`);

const insertTick = db.prepare(`
  INSERT INTO ticks (date, time, symbol, open, high, low, close, ltp, quantity, volume, average, bid, ask, chng, pchange)
  VALUES (@date, @time, @symbol, @open, @high, @low, @close, @ltp, @quantity, @volume, @average, @bid, @ask, @chng, @pchange)
`);

const insertBar1s = db.prepare(`
  INSERT INTO bars_1s (date, time, symbol, open, high, low, close, volume, trades, chng, pchange, day_volume)
  VALUES (@date, @time, @symbol, @open, @high, @low, @close, @volume, @trades, @chng, @pchange, @day_volume)
`);

const insertBar1m = db.prepare(`
  INSERT INTO bars_1m (date, time, symbol, open, high, low, close, volume, trades, chng, pchange, day_volume)
  VALUES (@date, @time, @symbol, @open, @high, @low, @close, @volume, @trades, @chng, @pchange, @day_volume)
`);

// 1-Second Bar In-Memory Aggregator
export interface BarOHLCV {
  date: string;
  time: string;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // Volume strictly within interval
  trades: number; // Number of trades in interval
  chng: number;
  pchange: number;
  dayVolume?: number;
}

const active1sBars: Map<string, BarOHLCV> = new Map();
const active1mBars: Map<string, BarOHLCV> = new Map();
const lastKnownDayVolume: Map<string, number> = new Map();

function recordAndAggregate1sBar(tick: {
  date: string;
  time: string;
  symbol: string;
  ltp: number;
  tradeVol: number;
  volume?: number;
  change?: number;
  pChange?: number;
}): BarOHLCV {
  const symbol = tick.symbol;
  const ltp = tick.ltp;
  const date = tick.date;
  const time = tick.time;
  const tradeVol = tick.tradeVol;

  const existing = active1sBars.get(symbol);

  if (!existing) {
    const newBar: BarOHLCV = {
      date, time, symbol,
      open: ltp, high: ltp, low: ltp, close: ltp,
      volume: tradeVol, trades: 1,
      chng: tick.change ?? 0, pchange: tick.pChange ?? 0,
      dayVolume: tick.volume,
    };
    active1sBars.set(symbol, newBar);
    return newBar;
  }

  if (existing.date === date && existing.time === time) {
    existing.high = Math.max(existing.high, ltp);
    existing.low = Math.min(existing.low, ltp);
    existing.close = ltp;
    existing.volume += tradeVol;
    existing.trades += 1;
    if (tick.change != null) existing.chng = tick.change;
    if (tick.pChange != null) existing.pchange = tick.pChange;
    if (tick.volume != null) existing.dayVolume = tick.volume;
    return existing;
  } else {
    try {
      insertBar1s.run({
        date: existing.date, time: existing.time, symbol: existing.symbol,
        open: existing.open, high: existing.high, low: existing.low, close: existing.close,
        volume: existing.volume, trades: existing.trades,
        chng: existing.chng ?? 0, pchange: existing.pchange ?? 0,
        day_volume: existing.dayVolume ?? null,
      });
    } catch (e) {
      console.error("[DB] insertBar1s error:", e);
    }

    const newBar: BarOHLCV = {
      date, time, symbol,
      open: ltp, high: ltp, low: ltp, close: ltp,
      volume: tradeVol, trades: 1,
      chng: tick.change ?? 0, pchange: tick.pChange ?? 0,
      dayVolume: tick.volume,
    };
    active1sBars.set(symbol, newBar);
    return newBar;
  }
}

function recordAndAggregate1mBar(tick: {
  date: string;
  time: string;
  symbol: string;
  ltp: number;
  tradeVol: number;
  volume?: number;
  change?: number;
  pChange?: number;
}): BarOHLCV {
  const symbol = tick.symbol;
  const ltp = tick.ltp;
  const date = tick.date;
  const minuteTime = `${tick.time.substring(0, 5)}:00`;
  const tradeVol = tick.tradeVol;

  const existing = active1mBars.get(symbol);

  if (!existing) {
    const newBar: BarOHLCV = {
      date, time: minuteTime, symbol,
      open: ltp, high: ltp, low: ltp, close: ltp,
      volume: tradeVol, trades: 1,
      chng: tick.change ?? 0, pchange: tick.pChange ?? 0,
      dayVolume: tick.volume,
    };
    active1mBars.set(symbol, newBar);
    return newBar;
  }

  if (existing.date === date && existing.time === minuteTime) {
    existing.high = Math.max(existing.high, ltp);
    existing.low = Math.min(existing.low, ltp);
    existing.close = ltp;
    existing.volume += tradeVol;
    existing.trades += 1;
    if (tick.change != null) existing.chng = tick.change;
    if (tick.pChange != null) existing.pchange = tick.pChange;
    if (tick.volume != null) existing.dayVolume = tick.volume;
    return existing;
  } else {
    try {
      insertBar1m.run({
        date: existing.date, time: existing.time, symbol: existing.symbol,
        open: existing.open, high: existing.high, low: existing.low, close: existing.close,
        volume: existing.volume, trades: existing.trades,
        chng: existing.chng ?? 0, pchange: existing.pchange ?? 0,
        day_volume: existing.dayVolume ?? null,
      });
    } catch (e) {
      console.error("[DB] insertBar1m error:", e);
    }

    const newBar: BarOHLCV = {
      date, time: minuteTime, symbol,
      open: ltp, high: ltp, low: ltp, close: ltp,
      volume: tradeVol, trades: 1,
      chng: tick.change ?? 0, pchange: tick.pChange ?? 0,
      dayVolume: tick.volume,
    };
    active1mBars.set(symbol, newBar);
    return newBar;
  }
}

function flushActiveBars() {
  for (const bar of active1sBars.values()) {
    try {
      insertBar1s.run({
        date: bar.date, time: bar.time, symbol: bar.symbol,
        open: bar.open, high: bar.high, low: bar.low, close: bar.close,
        volume: bar.volume, trades: bar.trades,
        chng: bar.chng ?? 0, pchange: bar.pchange ?? 0,
        day_volume: bar.dayVolume ?? null,
      });
    } catch {}
  }
  for (const bar of active1mBars.values()) {
    try {
      insertBar1m.run({
        date: bar.date, time: bar.time, symbol: bar.symbol,
        open: bar.open, high: bar.high, low: bar.low, close: bar.close,
        volume: bar.volume, trades: bar.trades,
        chng: bar.chng ?? 0, pchange: bar.pchange ?? 0,
        day_volume: bar.dayVolume ?? null,
      });
    } catch {}
  }
  active1sBars.clear();
  active1mBars.clear();
}

function appendPriceToDb(row: {
  date: string; time: string; timestamp: string; symbol: string;
  open: number; high: number; low: number; close: number; ltp: number;
  quantity: number; volume: number; average: number;
  bid: number; ask: number; change: number; pChange: number;
}) {
  try {
    insertTick.run({
      date: row.date, time: row.time, symbol: row.symbol,
      open:     row.open     ?? null,
      high:     row.high     ?? null,
      low:      row.low      ?? null,
      close:    row.close    ?? null,
      ltp:      row.ltp      ?? null,
      quantity: row.quantity ?? null,
      volume:   row.volume   ?? null,
      average:  row.average  ?? null,
      bid:      row.bid      ?? null,
      ask:      row.ask      ?? null,
      chng:     row.change   ?? null,
      pchange:  row.pChange  ?? null,
    });
  } catch (err) {
    console.error("[DB] Insert error:", err);
  }
}

// Generate XLSX buffer matching chosen granularity (live, 1s, 1m)
function generateXlsxFromDb(granularity: "live" | "1s" | "1m" = "live", symbol?: string, date?: string): Buffer {
  flushActiveBars();
  const conditions: string[] = [];
  const params: any = {};
  if (symbol) { conditions.push("symbol = @symbol"); params.symbol = symbol; }
  if (date)   { conditions.push("date = @date");     params.date   = date;   }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const wb = XLSX.utils.book_new();

  if (granularity === "1s") {
    const rows = db.prepare(`SELECT date, time, symbol, open, high, low, close, volume, trades, chng, pchange FROM bars_1s ${where} ORDER BY date DESC, time DESC`).all(params);
    const header = ["Date", "Time", "Symbol", "Open (1s)", "High (1s)", "Low (1s)", "Close (1s)", "Volume (1s)", "Trades", "Change", "% Change"];
    const data = [header, ...rows.map((r: any) => [r.date, r.time, r.symbol, r.open, r.high, r.low, r.close, r.volume, r.trades, r.chng, r.pchange])];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "1-Second Bars");
  } else if (granularity === "1m") {
    const rows = db.prepare(`SELECT date, time, symbol, open, high, low, close, volume, trades, chng, pchange FROM bars_1m ${where} ORDER BY date DESC, time DESC`).all(params);
    const header = ["Date", "Time", "Symbol", "Open (1m)", "High (1m)", "Low (1m)", "Close (1m)", "Volume (1m)", "Trades", "Change", "% Change"];
    const data = [header, ...rows.map((r: any) => [r.date, r.time, r.symbol, r.open, r.high, r.low, r.close, r.volume, r.trades, r.chng, r.pchange])];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "1-Minute Bars");
  } else {
    const rows = db.prepare(`SELECT date, time, symbol, ltp, quantity, bid, ask, chng, pchange FROM ticks ${where} ORDER BY id DESC`).all(params);
    const header = ["Date", "Time", "Symbol", "Trade Price (LTP)", "Trade Quantity / Volume", "Trade Value (₹)", "Bid", "Ask", "Spread", "Change", "% Change"];
    const data = [header, ...rows.map((r: any) => [
      r.date,
      r.time,
      r.symbol,
      r.ltp,
      r.quantity,
      r.ltp != null && r.quantity != null ? Number((r.ltp * r.quantity).toFixed(2)) : "",
      r.bid,
      r.ask,
      r.ask != null && r.bid != null ? Number((r.ask - r.bid).toFixed(2)) : "",
      r.chng,
      r.pchange
    ])];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Live Trades");
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// Determine if we should use mock mode
function shouldUseMockMode(): boolean {
  const mockMode = process.env.MOCK_MODE?.toLowerCase();
  if (mockMode === "true" || mockMode === "1") return true;
  const hasClientId = Boolean(process.env.FYERS_CLIENT_ID && process.env.FYERS_CLIENT_ID !== "test_client_id");
  const hasToken = Boolean(process.env.FYERS_ACCESS_TOKEN && process.env.FYERS_ACCESS_TOKEN !== "test_access_token");
  return !(hasClientId && hasToken);
}

// ============================================================================
// MOCK MODE: Simulated tick generation (no real FYERS connection)
// ============================================================================
const basePrices: Record<string, { price: number; name: string }> = {
  "NSE:RELIANCE-EQ": { price: 2984.50, name: "Reliance Industries" },
  "NSE:TCS-EQ": { price: 4120.30, name: "Tata Consultancy Services" },
  "NSE:INFY-EQ": { price: 1874.15, name: "Infosys Ltd" },
  "NSE:HDFCBANK-EQ": { price: 1642.80, name: "HDFC Bank" },
  "NSE:ICICIBANK-EQ": { price: 1215.40, name: "ICICI Bank" },
  "NSE:SBIN-EQ": { price: 812.60, name: "State Bank of India" },
  "NSE:TATAMOTORS-EQ": { price: 1045.20, name: "Tata Motors" },
};

function startMockStream(
  activeSymbols: string[],
  granularity: "live" | "1s" | "1m" = "live",
  sendEvent: (event: string, data: any) => void,
  onClose: () => void
): () => void {
  const formatTime = () => nowIST().label;
  const stockState: Record<string, { ltp: number; open: number; high: number; low: number; close: number; vol: number; qty: number; average: number }> = {};

  for (const sym of activeSymbols) {
    const base = basePrices[sym];
    let price = base?.price;
    if (!price) {
      let hash = 0;
      for (let i = 0; i < sym.length; i++) hash = (hash << 5) - hash + sym.charCodeAt(i);
      price = Number((100 + Math.abs(hash % 2400)).toFixed(2));
    }
    const openVal = Number((price * (1 + (Math.random() * 0.008 - 0.004))).toFixed(2));
    stockState[sym] = {
      ltp: price, open: openVal, high: Math.max(openVal, price),
      low: Math.min(openVal, price), close: price,
      vol: Math.floor(200000 + Math.random() * 1800000),
      qty: Math.floor(10 + Math.random() * 150),
      average: Number(((openVal + price) / 2).toFixed(2)),
    };
  }

  let isActive = true;
  let recordedRows = 0;

  sendEvent("log", { type: "status", message: `[MOCK MODE] Connecting to simulated FYERS (${granularity.toUpperCase()})...`, timestamp: formatTime() });

  const t1 = setTimeout(() => { if (isActive) sendEvent("log", { type: "status", message: "[MOCK] Connected successfully.", timestamp: formatTime() }); }, 400);
  const t2 = setTimeout(() => { if (isActive) sendEvent("log", { type: "status", message: `[MOCK] Subscribing to symbols: ${activeSymbols.join(", ")}...`, timestamp: formatTime() }); }, 800);
  const t3 = setTimeout(() => {
    if (!isActive) return;
    sendEvent("log", { type: "status", message: "[MOCK] Subscription successful.", timestamp: formatTime() });
    sendEvent("log", { type: "status", message: `Granularity: ${granularity.toUpperCase()} | SQLite logging active`, timestamp: formatTime() });
    sendEvent("log", { type: "status", message: "Waiting for market data...\n", timestamp: formatTime() });
  }, 1200);

  let tickInterval: NodeJS.Timeout | null = null;
  const t4 = setTimeout(() => {
    if (!isActive) return;
    tickInterval = setInterval(() => {
      if (!isActive) return;
      const sym = activeSymbols[Math.floor(Math.random() * activeSymbols.length)];
      const current = stockState[sym];
      if (!current) return;

      const delta = (Math.random() - 0.49) * (current.ltp * 0.0015);
      const newLtp = Number((current.ltp + delta).toFixed(2));
      const priceDiff = Number((newLtp - current.close).toFixed(2));
      const pChange = Number(((priceDiff / current.close) * 100).toFixed(2));
      const lastQty = Math.floor(5 + Math.random() * 200);

      current.ltp = newLtp;
      current.high = Math.max(current.high, newLtp);
      current.low = Math.min(current.low, newLtp);
      current.vol += lastQty;
      current.qty = lastQty;
      current.average = Number(((current.open + current.high + current.low + newLtp) / 4).toFixed(2));

      const bid = Number((newLtp - 0.10).toFixed(2));
      const ask = Number((newLtp + 0.15).toFixed(2));
      const { dateStr, timeStr } = nowIST();
      const ts = `${dateStr} ${timeStr}`;

      appendPriceToDb({
        date: dateStr, time: timeStr, timestamp: ts, symbol: sym,
        open: current.open, high: current.high, low: current.low, close: current.close,
        ltp: newLtp, quantity: lastQty, volume: current.vol, average: current.average,
        bid, ask, change: priceDiff, pChange,
      });
      recordedRows++;

      const bar1s = recordAndAggregate1sBar({
        date: dateStr, time: timeStr, symbol: sym,
        ltp: newLtp, tradeVol: lastQty, volume: current.vol,
        change: priceDiff, pChange,
      });

      const bar1m = recordAndAggregate1mBar({
        date: dateStr, time: timeStr, symbol: sym,
        ltp: newLtp, tradeVol: lastQty, volume: current.vol,
        change: priceDiff, pChange,
      });

      if (granularity === "1s") {
        const formattedLine = `${dateStr} ${timeStr} | ${sym.padEnd(17)} | 1s O:${bar1s.open.toFixed(2).padStart(8)} H:${bar1s.high.toFixed(2).padStart(8)} L:${bar1s.low.toFixed(2).padStart(8)} C:${bar1s.close.toFixed(2).padStart(8)} | LTP:${newLtp.toFixed(2).padStart(8)} | Vol(1s):${bar1s.volume.toString().padStart(6)} | Trades:${bar1s.trades.toString().padStart(3)}`;
        sendEvent("tick", {
          line: formattedLine, symbol: sym, date: dateStr, time: timeStr, timestamp: ts,
          open: bar1s.open, high: bar1s.high, low: bar1s.low, close: bar1s.close,
          ltp: newLtp, quantity: bar1s.trades, volume: bar1s.volume, average: current.average,
          dayVolume: current.vol, change: priceDiff, pChange, bid, ask,
          rawTs: Math.floor(Date.now() / 1000), recordedCsvRows: recordedRows,
        });
      } else if (granularity === "1m") {
        const formattedLine = `${bar1m.date} ${bar1m.time} | ${sym.padEnd(17)} | 1m O:${bar1m.open.toFixed(2).padStart(8)} H:${bar1m.high.toFixed(2).padStart(8)} L:${bar1m.low.toFixed(2).padStart(8)} C:${bar1m.close.toFixed(2).padStart(8)} | LTP:${newLtp.toFixed(2).padStart(8)} | Vol(1m):${bar1m.volume.toString().padStart(7)} | Trades:${bar1m.trades.toString().padStart(4)}`;
        sendEvent("tick", {
          line: formattedLine, symbol: sym, date: bar1m.date, time: bar1m.time, timestamp: `${bar1m.date} ${bar1m.time}`,
          open: bar1m.open, high: bar1m.high, low: bar1m.low, close: bar1m.close,
          ltp: newLtp, quantity: bar1m.trades, volume: bar1m.volume, average: current.average,
          dayVolume: current.vol, change: priceDiff, pChange, bid, ask,
          rawTs: Math.floor(Date.now() / 1000), recordedCsvRows: recordedRows,
        });
      } else {
        const tradeVal = Number((newLtp * lastQty).toFixed(2));
        const spreadVal = Number((ask - bid).toFixed(2));
        const formattedLine = `${dateStr} ${timeStr} | ${sym.padEnd(17)} | LTP:${newLtp.toFixed(2).padStart(8)} | Qty:${lastQty.toString().padStart(4)} | Value:₹${tradeVal.toLocaleString().padStart(9)} | Bid:${bid.toFixed(2).padStart(7)} | Ask:${ask.toFixed(2).padStart(7)}`;
        sendEvent("tick", {
          line: formattedLine, symbol: sym, date: dateStr, time: timeStr, timestamp: ts,
          ltp: newLtp, quantity: lastQty, tradeValue: tradeVal, spread: spreadVal,
          change: priceDiff, pChange, bid, ask,
          rawTs: Math.floor(Date.now() / 1000), recordedCsvRows: recordedRows,
        });
      }
    }, 450);
  }, 1500);

  return () => {
    isActive = false;
    clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4);
    if (tickInterval) clearInterval(tickInterval);
  };
}

// ============================================================================
// LIVE MODE: Spawn Python bridge for real FYERS WebSocket data
// ============================================================================
function startLiveStream(
  activeSymbols: string[],
  granularity: "live" | "1s" | "1m" = "live",
  sendEvent: (event: string, data: any) => void,
  onClose: () => void
): () => void {
  const formatTime = () => nowIST().label;
  let recordedRows = 0;
  let pythonProcess: ChildProcess | null = null;

  const bridgePath = path.join(process.cwd(), "fyers_bridge.py");
  const symbolsArg = activeSymbols.join(",");

  // Spawn the Python bridge
  pythonProcess = spawn("python", [bridgePath, symbolsArg], {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (!pythonProcess.stdout || !pythonProcess.stderr) {
    sendEvent("log", { type: "status", message: "Failed to start FYERS bridge process.", timestamp: formatTime() });
    return () => {};
  }

  sendEvent("log", { type: "status", message: "Starting FYERS WebSocket bridge...", timestamp: formatTime() });
  sendEvent("log", { type: "status", message: `Mode: LIVE | Granularity: ${granularity.toUpperCase()} | Symbols: ${activeSymbols.join(", ")}`, timestamp: formatTime() });

  // Read JSON lines from Python stdout
  const rl = createInterface({ input: pythonProcess.stdout });

  rl.on("line", (line: string) => {
    try {
      const data = JSON.parse(line);

      if (data.type === "status") {
        sendEvent("log", { type: "status", message: data.message, timestamp: formatTime() });
      } else if (data.type === "error") {
        sendEvent("log", { type: "status", message: `ERROR: ${data.message}`, timestamp: formatTime() });
      } else if (data.type === "tick") {
        // Compute delta volume for this trade
        let tradeVol = 0;
        const prevDayVol = lastKnownDayVolume.get(data.symbol);
        if (data.volume != null && prevDayVol != null && data.volume >= prevDayVol) {
          tradeVol = data.volume - prevDayVol;
        } else if (data.quantity != null && data.quantity > 0) {
          tradeVol = data.quantity;
        }
        if (data.volume != null && data.volume > 0) {
          lastKnownDayVolume.set(data.symbol, data.volume);
        }

        // Always record raw tick to SQLite
        appendPriceToDb({
          date: data.date || "",
          time: data.time || "",
          timestamp: data.timestamp || `${data.date} ${data.time}`,
          symbol: data.symbol,
          open: data.open ?? 0,
          high: data.high ?? 0,
          low: data.low ?? 0,
          close: data.close ?? 0,
          ltp: data.ltp,
          quantity: data.quantity ?? 0,
          volume: data.volume ?? 0,
          average: data.average ?? 0,
          bid: data.bid ?? 0,
          ask: data.ask ?? 0,
          change: data.change ?? 0,
          pChange: data.pChange ?? 0,
        });
        recordedRows++;

        // Always aggregate 1s and 1m bars in SQLite
        const bar1s = recordAndAggregate1sBar({
          date: data.date || "",
          time: data.time || "",
          symbol: data.symbol,
          ltp: data.ltp,
          tradeVol,
          volume: data.volume ?? 0,
          change: data.change,
          pChange: data.pChange,
        });

        const bar1m = recordAndAggregate1mBar({
          date: data.date || "",
          time: data.time || "",
          symbol: data.symbol,
          ltp: data.ltp,
          tradeVol,
          volume: data.volume ?? 0,
          change: data.change,
          pChange: data.pChange,
        });

        // Emit formatted event based on selected granularity
        if (granularity === "1s") {
          const formattedLine = `${data.date} ${data.time} | ${(data.symbol || "").padEnd(17)} | 1s O:${bar1s.open.toFixed(2).padStart(8)} H:${bar1s.high.toFixed(2).padStart(8)} L:${bar1s.low.toFixed(2).padStart(8)} C:${bar1s.close.toFixed(2).padStart(8)} | LTP:${data.ltp.toFixed(2).padStart(8)} | Vol(1s):${bar1s.volume.toString().padStart(6)} | Trades:${bar1s.trades.toString().padStart(3)}`;
          sendEvent("tick", {
            line: formattedLine,
            symbol: data.symbol,
            date: data.date,
            time: data.time,
            timestamp: data.timestamp,
            open: bar1s.open,
            high: bar1s.high,
            low: bar1s.low,
            close: bar1s.close,
            ltp: data.ltp,
            quantity: bar1s.trades,
            volume: bar1s.volume,
            average: data.average,
            dayVolume: data.volume,
            change: data.change,
            pChange: data.pChange,
            bid: data.bid,
            ask: data.ask,
            rawTs: Math.floor(Date.now() / 1000),
            recordedCsvRows: recordedRows,
          });
        } else if (granularity === "1m") {
          const formattedLine = `${bar1m.date} ${bar1m.time} | ${(data.symbol || "").padEnd(17)} | 1m O:${bar1m.open.toFixed(2).padStart(8)} H:${bar1m.high.toFixed(2).padStart(8)} L:${bar1m.low.toFixed(2).padStart(8)} C:${bar1m.close.toFixed(2).padStart(8)} | LTP:${data.ltp.toFixed(2).padStart(8)} | Vol(1m):${bar1m.volume.toString().padStart(7)} | Trades:${bar1m.trades.toString().padStart(4)}`;
          sendEvent("tick", {
            line: formattedLine,
            symbol: data.symbol,
            date: bar1m.date,
            time: bar1m.time,
            timestamp: `${bar1m.date} ${bar1m.time}`,
            open: bar1m.open,
            high: bar1m.high,
            low: bar1m.low,
            close: bar1m.close,
            ltp: data.ltp,
            quantity: bar1m.trades,
            volume: bar1m.volume,
            average: data.average,
            dayVolume: data.volume,
            change: data.change,
            pChange: data.pChange,
            bid: data.bid,
            ask: data.ask,
            rawTs: Math.floor(Date.now() / 1000),
            recordedCsvRows: recordedRows,
          });
        } else {
          // Live Tick-by-Tick (Pure Non-Cumulative)
          const tradeQty = data.quantity ?? 0;
          const tradeVal = Number(((data.ltp ?? 0) * tradeQty).toFixed(2));
          const bidVal = data.bid ?? 0;
          const askVal = data.ask ?? 0;
          const spreadVal = Number((askVal - bidVal).toFixed(2));
          const formattedLine = `${data.date} ${data.time} | ${(data.symbol || "").padEnd(17)} | LTP:${data.ltp.toFixed(2).padStart(8)} | Qty:${tradeQty.toString().padStart(4)} | Value:₹${tradeVal.toLocaleString().padStart(9)} | Bid:${bidVal.toFixed(2).padStart(7)} | Ask:${askVal.toFixed(2).padStart(7)}`;
          sendEvent("tick", {
            line: formattedLine,
            symbol: data.symbol,
            date: data.date,
            time: data.time,
            timestamp: data.timestamp,
            ltp: data.ltp,
            quantity: tradeQty,
            tradeValue: tradeVal,
            spread: spreadVal,
            change: data.change,
            pChange: data.pChange,
            bid: bidVal,
            ask: askVal,
            rawTs: Math.floor(Date.now() / 1000),
            recordedCsvRows: recordedRows,
          });
        }
      }
    } catch (err) {
      if (line.trim()) {
        sendEvent("log", { type: "status", message: `[bridge] ${line}`, timestamp: formatTime() });
      }
    }
  });

  // Capture stderr for error reporting
  const stderrRl = createInterface({ input: pythonProcess.stderr! });
  stderrRl.on("line", (line: string) => {
    if (line.trim()) {
      sendEvent("log", { type: "status", message: `[bridge-err] ${line}`, timestamp: formatTime() });
    }
  });

  pythonProcess.on("exit", (code) => {
    sendEvent("log", { type: "status", message: `FYERS bridge process exited (code: ${code})`, timestamp: formatTime() });
  });

  // Return cleanup function
  return () => {
    if (pythonProcess && !pythonProcess.killed) {
      pythonProcess.kill("SIGTERM");
      // Force kill after 3 seconds if still alive
      setTimeout(() => {
        if (pythonProcess && !pythonProcess.killed) {
          pythonProcess.kill("SIGKILL");
        }
      }, 3000);
    }
  };
}

// ============================================================================
// EXPRESS SERVER
// ============================================================================
async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  const useMock = shouldUseMockMode();

  console.log(`Mode: ${useMock ? "MOCK (simulated data)" : "LIVE (real FYERS WebSocket)"}`);

  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    next();
  });

  app.use(express.json());

  // API: Config status
  app.get("/api/config", (req, res) => {
    const hasClientId = Boolean(process.env.FYERS_CLIENT_ID && process.env.FYERS_CLIENT_ID !== "test_client_id");
    const hasToken = Boolean(process.env.FYERS_ACCESS_TOKEN && process.env.FYERS_ACCESS_TOKEN !== "test_access_token");
    res.json({
      configured: hasClientId && hasToken,
      hasClientId,
      hasToken,
      mode: useMock ? "mock" : "live",
      defaultSymbols: ["NSE:RELIANCE-EQ", "NSE:TCS-EQ", "NSE:INFY-EQ"],
    });
  });

  // API: FYERS Auth Config & Status
  app.get("/api/fyers/auth-config", (req, res) => {
    const rawClientId = (process.env.FYERS_CLIENT_ID || "").replace(/'/g, "").trim();
    const hasClientId = Boolean(rawClientId && rawClientId !== "test_client_id");
    const rawToken = (process.env.FYERS_ACCESS_TOKEN || "").replace(/'/g, "").trim();
    const hasToken = Boolean(rawToken && rawToken !== "test_access_token");
    const rawSecret = (process.env.FYERS_SECRET_KEY || "").replace(/'/g, "").trim();
    res.json({
      appId: hasClientId ? rawClientId : "",
      hasSecretKey: Boolean(rawSecret),
      hasToken,
      hasClientId,
      tokenPreview: hasToken ? `${rawToken.slice(0, 15)}...` : null,
      defaultRedirectUri: "http://localhost:3000/api/fyers/callback",
    });
  });

  // API: Generate FYERS OAuth Login URL
  app.post("/api/fyers/auth-url", (req, res) => {
    try {
      const { appId, secretKey, redirectUri } = req.body;
      if (!appId) {
        return res.status(400).json({ error: "App ID is required" });
      }
      const effectiveRedirect = (redirectUri || "http://localhost:3000/api/fyers/callback").trim();
      const state = crypto.randomBytes(8).toString("hex");

      pendingAuthMap.set(state, {
        appId: appId.trim(),
        secretKey: (secretKey || (process.env.FYERS_SECRET_KEY || "")).replace(/'/g, "").trim(),
        redirectUri: effectiveRedirect,
        createdAt: Date.now(),
      });

      // Cleanup expired states after 15 mins
      for (const [s, data] of pendingAuthMap.entries()) {
        if (Date.now() - data.createdAt > 15 * 60 * 1000) {
          pendingAuthMap.delete(s);
        }
      }

      const encodedRedirect = encodeURIComponent(effectiveRedirect);
      const authUrl = `https://api-t1.fyers.in/api/v3/generate-authcode?client_id=${appId.trim()}&redirect_uri=${encodedRedirect}&response_type=code&state=${state}`;

      res.json({ authUrl, state });
    } catch (err) {
      res.status(500).json({ error: "Failed to generate auth URL", detail: String(err) });
    }
  });

  // API: FYERS OAuth Callback (Automatic 1-Click Redirect)
  app.get("/api/fyers/callback", async (req, res) => {
    try {
      const authCode = (req.query.auth_code as string) || (req.query.code as string);
      const state = req.query.state as string;

      if (!authCode) {
        return res.status(400).send(`
          <!DOCTYPE html><html><head><title>Auth Failed</title></head>
          <body style="margin:0;font-family:sans-serif;background:#0f172a;color:#f87171;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;">
            <div style="background:#1e293b;padding:2rem;border-radius:1rem;border:1px solid #ef4444;text-align:center;">
              <h2 style="margin:0 0 0.5rem 0;">Authentication Code Missing</h2>
              <p style="color:#94a3b8;font-size:0.9rem;">No auth_code parameter received in FYERS callback.</p>
            </div>
          </body></html>
        `);
      }

      const pending = state ? pendingAuthMap.get(state) : undefined;
      const appId = pending?.appId || (process.env.FYERS_CLIENT_ID || "").replace(/'/g, "").trim();
      const secretKey = pending?.secretKey || (process.env.FYERS_SECRET_KEY || "").replace(/'/g, "").trim();

      if (!appId || !secretKey) {
        return res.status(400).send(`
          <!DOCTYPE html><html><head><title>Credentials Missing</title></head>
          <body style="margin:0;font-family:sans-serif;background:#0f172a;color:#f87171;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;">
            <div style="background:#1e293b;padding:2rem;border-radius:1rem;border:1px solid #ef4444;text-align:center;">
              <h2 style="margin:0 0 0.5rem 0;">Secret Key Required</h2>
              <p style="color:#94a3b8;font-size:0.9rem;">Please provide your Fyers Secret Key in the token modal to complete token exchange.</p>
            </div>
          </body></html>
        `);
      }

      const appIdHash = sha256(`${appId}:${secretKey}`);
      const fyersRes = await fetch("https://api-t1.fyers.in/api/v3/validate-authcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          appIdHash,
          code: authCode,
        }),
      });

      const fyersData = (await fyersRes.json()) as any;

      if (fyersData.s === "error" || !fyersData.access_token) {
        const errMsg = fyersData.message || JSON.stringify(fyersData);
        return res.status(400).send(`
          <!DOCTYPE html><html><head><title>Exchange Failed</title></head>
          <body style="margin:0;font-family:sans-serif;background:#0f172a;color:#f87171;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;">
            <div style="background:#1e293b;padding:2rem;border-radius:1rem;border:1px solid #ef4444;text-align:center;">
              <h2 style="margin:0 0 0.5rem 0;">FYERS Token Validation Failed</h2>
              <p style="color:#cbd5e1;font-size:0.9rem;">${errMsg}</p>
            </div>
          </body></html>
        `);
      }

      const accessToken = fyersData.access_token;

      // Save to .env and runtime process.env
      updateEnvFile({
        FYERS_CLIENT_ID: appId,
        FYERS_ACCESS_TOKEN: accessToken,
        FYERS_SECRET_KEY: secretKey,
        MOCK_MODE: "false",
      });

      if (state) pendingAuthMap.delete(state);

      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>FYERS Authentication Success</title></head>
          <body style="margin:0; font-family:system-ui, -apple-system, sans-serif; background:#0b1329; color:#f8fafc; display:flex; align-items:center; justify-content:center; height:100vh; flex-direction:column; text-align:center;">
            <div style="background:#1e293b; padding:2.5rem 3rem; border-radius:1.25rem; border:1px solid #38bdf8; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
              <div style="font-size:3rem; margin-bottom:0.5rem;">🎉</div>
              <h2 style="color:#38bdf8; margin:0 0 0.5rem 0; font-size:1.5rem;">Token Generated Successfully!</h2>
              <p style="color:#94a3b8; font-size:0.95rem; margin-bottom:1.5rem;">Your FYERS Access Token is now active and saved to .env.</p>
              <div style="font-size:0.85rem; color:#10b981; font-weight:bold;">Closing this window in 1 second...</div>
            </div>
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: "FYERS_AUTH_SUCCESS", token: "${accessToken.slice(0, 15)}..." }, "*");
                  setTimeout(() => window.close(), 1200);
                } else {
                  setTimeout(() => window.location.href = "/", 1500);
                }
              } catch(e) {
                setTimeout(() => window.close(), 1500);
              }
            </script>
          </body>
        </html>
      `);
    } catch (err) {
      res.status(500).send(`Authentication error: ${String(err)}`);
    }
  });

  // API: Manual / Fallback Exchange (for https://127.0.0.1 redirect URI)
  app.post("/api/fyers/exchange-token", async (req, res) => {
    try {
      let { appId, secretKey, authCodeOrUrl, saveSecret } = req.body;
      if (!appId) appId = (process.env.FYERS_CLIENT_ID || "").replace(/'/g, "").trim();
      if (!secretKey) secretKey = (process.env.FYERS_SECRET_KEY || "").replace(/'/g, "").trim();

      if (!appId || !secretKey) {
        return res.status(400).json({ error: "Both App ID and Secret Key are required" });
      }

      let authCode = (authCodeOrUrl || "").trim();
      if (authCode.startsWith("http")) {
        try {
          const parsed = new URL(authCode);
          authCode = parsed.searchParams.get("auth_code") || parsed.searchParams.get("code") || authCode;
        } catch {}
      }

      if (!authCode) {
        return res.status(400).json({ error: "Auth code or redirect URL is required" });
      }

      const appIdHash = sha256(`${appId}:${secretKey}`);
      const fyersRes = await fetch("https://api-t1.fyers.in/api/v3/validate-authcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          appIdHash,
          code: authCode,
        }),
      });

      const fyersData = (await fyersRes.json()) as any;
      if (fyersData.s === "error" || !fyersData.access_token) {
        return res.status(400).json({ error: fyersData.message || "Failed to validate auth code with FYERS", detail: fyersData });
      }

      const accessToken = fyersData.access_token;
      const updates: Record<string, string> = {
        FYERS_CLIENT_ID: appId,
        FYERS_ACCESS_TOKEN: accessToken,
        MOCK_MODE: "false",
      };
      if (saveSecret) {
        updates.FYERS_SECRET_KEY = secretKey;
      }
      updateEnvFile(updates);

      res.json({
        success: true,
        message: "Token validated and saved to .env successfully!",
        tokenPreview: `${accessToken.slice(0, 15)}...`,
      });
    } catch (err) {
      res.status(500).json({ error: "Token exchange failed", detail: String(err) });
    }
  });

  // API: Download XLSX — generated on-demand from SQLite
  // Optional query params: ?granularity=live|1s|1m  ?symbol=NSE:RELIANCE-EQ  ?date=2026-09-03
  app.get("/api/download-csv", (req, res) => {
    try {
      const symbol = req.query.symbol as string | undefined;
      const date   = req.query.date   as string | undefined;
      const granularity = ((req.query.granularity as string) || "live") as "live" | "1s" | "1m";
      const buf = generateXlsxFromDb(granularity, symbol, date);
      const tag = symbol ? symbol.replace(/[^a-zA-Z0-9]/g, "_") : "all";
      const filename = `fyers_prices_${tag}_${granularity}_${date || nowIST().dateStr}.xlsx`;
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buf);
    } catch (err) {
      res.status(500).json({ error: "Failed to generate XLSX.", detail: String(err) });
    }
  });

  // API: DB stats — row count, symbols, date range
  app.get("/api/csv-files", (req, res) => {
    try {
      const totalBars1s = (db.prepare("SELECT COUNT(*) as n FROM bars_1s").get() as any).n;
      const totalBars1m = (db.prepare("SELECT COUNT(*) as n FROM bars_1m").get() as any).n;
      const totalTicks = (db.prepare("SELECT COUNT(*) as n FROM ticks").get() as any).n;
      const symbols = (db.prepare("SELECT DISTINCT symbol FROM ticks ORDER BY symbol").all() as any[]).map(r => r.symbol);
      const dates = db.prepare("SELECT MIN(date) as first, MAX(date) as last FROM ticks").get() as any;
      const dbSize = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
      res.json({ totalRows: totalTicks, totalTicks, totalBars1s, totalBars1m, symbols, firstDate: dates?.first, lastDate: dates?.last, dbSizeBytes: dbSize });
    } catch (err) {
      res.status(500).json({ error: "Could not read DB stats." });
    }
  });

  // API: SSE Stream endpoint
  app.get("/api/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const requestedSymbols = ((req.query.symbols as string) || "NSE:RELIANCE-EQ,NSE:TCS-EQ,NSE:INFY-EQ")
      .split(",").map(s => s.trim()).filter(Boolean);
    const granularity = ((req.query.granularity as string) || "live") as "live" | "1s" | "1m";

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Start appropriate stream mode
    let cleanup: () => void;

    if (useMock) {
      cleanup = startMockStream(requestedSymbols, granularity, sendEvent, () => res.end());
    } else {
      cleanup = startLiveStream(requestedSymbols, granularity, sendEvent, () => res.end());
    }

    // Client disconnect - kill stream
    req.on("close", () => {
      cleanup();
      res.end();
    });
  });

  // Serve static frontend
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`FYERS Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
