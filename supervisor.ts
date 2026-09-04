import express from "express";
import http from "http";
import path from "path";
import { spawn, ChildProcess } from "child_process";

const SUPERVISOR_PORT = Number(process.env.PORT) || 3000;
const WORKER_PORT = Number(process.env.WORKER_PORT) || 3001;

interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "system";
  text: string;
}

let workerProcess: ChildProcess | null = null;
let workerStartTime: number | null = null;
let supervisorServer: http.Server | null = null;
const logBuffer: LogEntry[] = [];
const sseClients = new Set<express.Response>();
const MAX_LOGS = 2000;

function nowIST(): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());
  } catch {
    return new Date().toLocaleTimeString();
  }
}

function appendLog(rawText: string, defaultLevel: "info" | "warn" | "error" | "system" = "info") {
  const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  for (const line of lines) {
    let level = defaultLevel;
    const lower = line.toLowerCase();
    if (lower.includes("error") || lower.includes("failed") || lower.includes("exception")) {
      level = "error";
    } else if (lower.includes("warn") || lower.includes("timeout")) {
      level = "warn";
    } else if (lower.includes("[supervisor]") || lower.includes("[system]")) {
      level = "system";
    }

    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: nowIST(),
      level,
      text: line,
    };

    logBuffer.push(entry);
    if (logBuffer.length > MAX_LOGS) {
      logBuffer.shift();
    }

    // Broadcast to SSE clients
    const payload = `event: log\ndata: ${JSON.stringify(entry)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(payload);
      } catch {}
    }
  }
}

function broadcastStatus() {
  const statusPayload = {
    running: Boolean(workerProcess),
    pid: workerProcess?.pid || null,
    uptime: workerStartTime ? Math.floor((Date.now() - workerStartTime) / 1000) : 0,
    workerPort: WORKER_PORT,
    totalLogs: logBuffer.length,
  };
  const payload = `event: status\ndata: ${JSON.stringify(statusPayload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {}
  }
}

function startWorker(): { success: boolean; pid?: number; message: string } {
  if (workerProcess) {
    return { success: false, pid: workerProcess.pid, message: "Backend server is already running." };
  }

  appendLog(`[SUPERVISOR] Starting backend server process on port ${WORKER_PORT}...`, "system");

  const serverTsPath = path.join(process.cwd(), "server.ts");
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

  const workerEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(WORKER_PORT),
    WORKER_PORT: String(WORKER_PORT),
  };

  try {
    workerProcess = spawn(process.execPath, [tsxCli, serverTsPath], {
      cwd: process.cwd(),
      env: workerEnv,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    workerStartTime = Date.now();
    const pid = workerProcess.pid;

    appendLog(`[SUPERVISOR] Spawned backend worker (PID: ${pid}).`, "system");
    broadcastStatus();

    workerProcess.stdout?.on("data", (chunk) => {
      appendLog(chunk.toString(), "info");
    });

    workerProcess.stderr?.on("data", (chunk) => {
      appendLog(chunk.toString(), "warn");
    });

    workerProcess.on("exit", (code, signal) => {
      appendLog(`[SUPERVISOR] Backend worker process exited (Code: ${code ?? "null"}, Signal: ${signal ?? "none"}).`, "warn");
      workerProcess = null;
      workerStartTime = null;
      broadcastStatus();
    });

    workerProcess.on("error", (err) => {
      appendLog(`[SUPERVISOR] Worker process error: ${err.message}`, "error");
      workerProcess = null;
      workerStartTime = null;
      broadcastStatus();
    });

    return { success: true, pid, message: `Started backend server (PID: ${pid}).` };
  } catch (err: any) {
    appendLog(`[SUPERVISOR] Failed to spawn worker: ${err.message}`, "error");
    return { success: false, message: `Failed to spawn worker: ${err.message}` };
  }
}

function killWorker(): { success: boolean; message: string } {
  if (!workerProcess) {
    return { success: false, message: "Backend server is not running." };
  }

  const pid = workerProcess.pid;
  appendLog(`[SUPERVISOR] Terminating backend worker (PID: ${pid})...`, "system");

  try {
    if (process.platform === "win32" && pid) {
      // Cleanly kill process tree on Windows
      spawn("taskkill", ["/PID", String(pid), "/T", "/F"]);
    } else {
      workerProcess.kill("SIGTERM");
    }
  } catch (err: any) {
    appendLog(`[SUPERVISOR] Error killing process: ${err.message}`, "error");
  }

  workerProcess = null;
  workerStartTime = null;
  broadcastStatus();

  return { success: true, message: `Terminated backend process (PID: ${pid}).` };
}

// ============================================================================
// SUPERVISOR GATEWAY APP
// ============================================================================
const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE, PUT");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

// JSON body parser for supervisor endpoints only
app.use("/api/server", express.json());

// Supervisor Lifecycle Endpoints
app.get("/api/server/status", (_req, res) => {
  res.json({
    running: Boolean(workerProcess),
    pid: workerProcess?.pid || null,
    uptime: workerStartTime ? Math.floor((Date.now() - workerStartTime) / 1000) : 0,
    workerPort: WORKER_PORT,
    totalLogs: logBuffer.length,
  });
});

app.post("/api/server/start", (_req, res) => {
  const result = startWorker();
  res.json(result);
});

app.post("/api/server/kill", (_req, res) => {
  appendLog("[SUPERVISOR] Received complete shutdown request from UI. Completely killing all processes...", "system");
  killWorker();
  res.json({ success: true, message: "Server completely killed and port 3000 released." });
  setTimeout(() => {
    appendLog("[SUPERVISOR] Process exit requested by UI. Shutting down port 3000...", "system");
    if (supervisorServer) {
      supervisorServer.close(() => {
        process.exit(0);
      });
    }
    setTimeout(() => process.exit(0), 400);
  }, 300);
});

app.post("/api/server/restart", async (_req, res) => {
  appendLog("[SUPERVISOR] Completely killing existing server process before restart...", "system");
  killWorker();
  setTimeout(() => {
    const result = startWorker();
    res.json({ success: true, message: "Server completely killed and restarted successfully", ...result });
  }, 1200);
});

app.post("/api/server/clear-logs", (_req, res) => {
  logBuffer.length = 0;
  appendLog("[SUPERVISOR] Logs cleared by user.", "system");
  res.json({ success: true, message: "Logs cleared." });
});

// Live SSE Log Stream
app.get("/api/server/logs", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send initial batch of existing logs
  res.write(`event: init\ndata: ${JSON.stringify(logBuffer)}\n\n`);

  // Send current status
  res.write(`event: status\ndata: ${JSON.stringify({
    running: Boolean(workerProcess),
    pid: workerProcess?.pid || null,
    uptime: workerStartTime ? Math.floor((Date.now() - workerStartTime) / 1000) : 0,
    workerPort: WORKER_PORT,
    totalLogs: logBuffer.length,
  })}\n\n`);

  sseClients.add(res);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

// ============================================================================
// PROXY FOR ALL OTHER /api/* CALLS TO WORKER
// ============================================================================
app.all("/api/*", (req, res) => {
  if (!workerProcess) {
    return res.status(503).json({
      error: "Backend server is currently stopped.",
      stopped: true,
      message: "Please start the server from the Logs tab to use live market APIs.",
    });
  }

  const options: http.RequestOptions = {
    hostname: "127.0.0.1",
    port: WORKER_PORT,
    path: req.originalUrl || req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${WORKER_PORT}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.status(502).json({
        error: "Failed to communicate with backend server.",
        detail: err.message,
      });
    }
  });

  req.pipe(proxyReq);
});

async function initSupervisor() {
  const isDev = process.env.NODE_ENV !== "production";

  if (isDev) {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      appendLog("[SUPERVISOR] Vite dev middleware attached (live UI updates & HMR active).", "system");
    } catch (err: any) {
      appendLog(`[SUPERVISOR] Vite dev server fallback to dist: ${err.message}`, "warn");
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Auto-start worker on boot
  startWorker();

  // Start supervisor HTTP listener
  supervisorServer = app.listen(SUPERVISOR_PORT, "0.0.0.0", () => {
    appendLog(`[SUPERVISOR] Gateway listening on http://0.0.0.0:${SUPERVISOR_PORT} (Worker proxy -> port ${WORKER_PORT})`, "system");
  });

  // Graceful supervisor shutdown
  const handleExit = () => {
    appendLog("[SUPERVISOR] Supervisor shutting down...", "system");
    killWorker();
    supervisorServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 1000);
  };

  process.on("SIGINT", handleExit);
  process.on("SIGTERM", handleExit);
}

initSupervisor();

