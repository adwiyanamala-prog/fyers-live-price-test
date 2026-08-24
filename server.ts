import express from "express";
import path from "path";
import fs from "fs";
import { spawn, ChildProcess } from "child_process";
import { createInterface } from "readline";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), "fyers-price-test", ".env") });

const CSV_FILE_PATH = path.join(process.cwd(), "fyers_prices.csv");

// Determine if we should use mock mode
function shouldUseMockMode(): boolean {
  const mockMode = process.env.MOCK_MODE?.toLowerCase();
  if (mockMode === "true" || mockMode === "1") return true;

  // Also use mock if credentials are missing
  const hasClientId = Boolean(process.env.FYERS_CLIENT_ID && process.env.FYERS_CLIENT_ID !== "test_client_id");
  const hasToken = Boolean(process.env.FYERS_ACCESS_TOKEN && process.env.FYERS_ACCESS_TOKEN !== "test_access_token");
  return !(hasClientId && hasToken);
}

// Helper to append a row to CSV
function appendPriceToCsv(row: {
  date: string;
  time: string;
  timestamp: string;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  ltp: number;
  quantity: number;
  volume: number;
  average: number;
  bid: number;
  ask: number;
  change: number;
  pChange: number;
}) {
  try {
    const fileExists = fs.existsSync(CSV_FILE_PATH);
    if (!fileExists || fs.statSync(CSV_FILE_PATH).size === 0) {
      const header = "Date,Time,Symbol,Open,High,Low,Close,LTP,Quantity,Volume,Average,Bid,Ask,Change,PercentChange\n";
      fs.writeFileSync(CSV_FILE_PATH, header, "utf8");
    }
    const line = `"${row.date}","${row.time}","${row.symbol}",${row.open?.toFixed(2) ?? ""},${row.high?.toFixed(2) ?? ""},${row.low?.toFixed(2) ?? ""},${row.close?.toFixed(2) ?? ""},${row.ltp.toFixed(2)},${row.quantity ?? ""},${row.volume ?? ""},${row.average?.toFixed(2) ?? ""},${row.bid?.toFixed(2) ?? ""},${row.ask?.toFixed(2) ?? ""},${row.change?.toFixed(2) ?? ""},${row.pChange?.toFixed(2) ?? ""}\n`;
    fs.appendFileSync(CSV_FILE_PATH, line, "utf8");
  } catch (err) {
    console.error("Error writing to CSV file:", err);
  }
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
  sendEvent: (event: string, data: any) => void,
  onClose: () => void
) {
  const formatTime = () => new Date().toISOString().replace("T", " ").substring(0, 19);

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

  sendEvent("log", { type: "status", message: "[MOCK MODE] Connecting to simulated FYERS...", timestamp: formatTime() });

  const t1 = setTimeout(() => { if (isActive) sendEvent("log", { type: "status", message: "[MOCK] Connected successfully.", timestamp: formatTime() }); }, 400);
  const t2 = setTimeout(() => { if (isActive) sendEvent("log", { type: "status", message: `[MOCK] Subscribing to symbols: ${activeSymbols.join(", ")}...`, timestamp: formatTime() }); }, 800);
  const t3 = setTimeout(() => {
    if (!isActive) return;
    sendEvent("log", { type: "status", message: "[MOCK] Subscription successful.", timestamp: formatTime() });
    sendEvent("log", { type: "status", message: "CSV logging active -> writing prices to 'fyers_prices.csv'", timestamp: formatTime() });
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
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];
      const timeStr = now.toTimeString().split(" ")[0];
      const ts = `${dateStr} ${timeStr}`;

      appendPriceToCsv({
        date: dateStr, time: timeStr, timestamp: ts, symbol: sym,
        open: current.open, high: current.high, low: current.low, close: current.close,
        ltp: newLtp, quantity: lastQty, volume: current.vol, average: current.average,
        bid, ask, change: priceDiff, pChange,
      });
      recordedRows++;

      const formattedLine = `${dateStr} ${timeStr} | ${sym.padEnd(17)} | O:${current.open.toFixed(2).padStart(8)} H:${current.high.toFixed(2).padStart(8)} L:${current.low.toFixed(2).padStart(8)} C:${current.close.toFixed(2).padStart(8)} | LTP:${newLtp.toFixed(2).padStart(8)} | Qty:${lastQty.toString().padStart(4)} | Vol:${current.vol.toLocaleString().padStart(9)} | Avg:${current.average.toFixed(2).padStart(8)}`;

      sendEvent("tick", {
        line: formattedLine, symbol: sym, date: dateStr, time: timeStr, timestamp: ts,
        open: current.open, high: current.high, low: current.low, close: current.close,
        ltp: newLtp, quantity: lastQty, volume: current.vol, average: current.average,
        change: priceDiff, pChange, bid, ask,
        rawTs: Math.floor(Date.now() / 1000), recordedCsvRows: recordedRows,
      });
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
  sendEvent: (event: string, data: any) => void,
  onClose: () => void
): () => void {
  const formatTime = () => new Date().toISOString().replace("T", " ").substring(0, 19);
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
  sendEvent("log", { type: "status", message: `Mode: LIVE | Symbols: ${activeSymbols.join(", ")}`, timestamp: formatTime() });

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
        // Write to CSV
        appendPriceToCsv({
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

        // Format display line
        const formattedLine = `${data.date} ${data.time} | ${(data.symbol || "").padEnd(17)} | O:${(data.open ?? 0).toFixed(2).padStart(8)} H:${(data.high ?? 0).toFixed(2).padStart(8)} L:${(data.low ?? 0).toFixed(2).padStart(8)} C:${(data.close ?? 0).toFixed(2).padStart(8)} | LTP:${data.ltp.toFixed(2).padStart(8)} | Qty:${(data.quantity ?? 0).toString().padStart(4)} | Vol:${(data.volume ?? 0).toLocaleString().padStart(9)} | Avg:${(data.average ?? 0).toFixed(2).padStart(8)}`;

        sendEvent("tick", {
          line: formattedLine,
          symbol: data.symbol,
          date: data.date,
          time: data.time,
          timestamp: data.timestamp,
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          ltp: data.ltp,
          quantity: data.quantity,
          volume: data.volume,
          average: data.average,
          change: data.change,
          pChange: data.pChange,
          bid: data.bid,
          ask: data.ask,
          rawTs: Math.floor(Date.now() / 1000),
          recordedCsvRows: recordedRows,
        });
      }
    } catch (err) {
      // Non-JSON output from Python (e.g. SDK logs) - forward as status
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
  const PORT = process.env.PORT || 3001;
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

  // API: Download CSV
  app.get("/api/download-csv", (req, res) => {
    if (fs.existsSync(CSV_FILE_PATH)) {
      res.setHeader("Content-Disposition", 'attachment; filename="fyers_prices.csv"');
      res.setHeader("Content-Type", "text/csv");
      fs.createReadStream(CSV_FILE_PATH).pipe(res);
    } else {
      res.status(404).json({ error: "No recorded CSV found yet. Click Run to start recording." });
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

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Start appropriate stream mode
    let cleanup: () => void;

    if (useMock) {
      cleanup = startMockStream(requestedSymbols, sendEvent, () => res.end());
    } else {
      cleanup = startLiveStream(requestedSymbols, sendEvent, () => res.end());
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
