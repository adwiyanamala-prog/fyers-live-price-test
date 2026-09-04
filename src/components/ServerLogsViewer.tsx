import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Square,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  Search,
  Terminal,
  Activity,
  AlertTriangle,
  XCircle,
  Info,
  SlidersHorizontal,
  ArrowDown
} from 'lucide-react';

export interface ServerLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'system';
  text: string;
}

export interface ServerStatus {
  running: boolean;
  pid: number | null;
  uptime: number;
  workerPort: number;
  totalLogs: number;
}

export const ServerLogsViewer: React.FC = () => {
  const [logs, setLogs] = useState<ServerLogEntry[]>([]);
  const [status, setStatus] = useState<ServerStatus>({
    running: false,
    pid: null,
    uptime: 0,
    workerPort: 3001,
    totalLogs: 0,
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<'all' | 'info' | 'warn' | 'error' | 'system'>('all');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<'kill' | 'restart' | null>(null);
  const [isCompletelyKilled, setIsCompletelyKilled] = useState<boolean>(false);

  const terminalRef = useRef<HTMLDivElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Connect to SSE Log Stream
  useEffect(() => {
    const es = new EventSource('/api/server/logs');
    eventSourceRef.current = es;

    es.addEventListener('init', (e: MessageEvent) => {
      try {
        const initialLogs: ServerLogEntry[] = JSON.parse(e.data);
        setLogs(initialLogs);
      } catch (err) {
        console.error('Failed to parse init logs:', err);
      }
    });

    es.addEventListener('log', (e: MessageEvent) => {
      try {
        const entry: ServerLogEntry = JSON.parse(e.data);
        setLogs((prev) => [...prev.slice(-1999), entry]);
      } catch (err) {
        console.error('Failed to parse log entry:', err);
      }
    });

    es.addEventListener('status', (e: MessageEvent) => {
      try {
        const statusData: ServerStatus = JSON.parse(e.data);
        setStatus(statusData);
      } catch (err) {
        console.error('Failed to parse status event:', err);
      }
    });

    // Fallback status poller every 3s
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/server/status');
        if (res.ok) {
          const data: ServerStatus = await res.json();
          setStatus(data);
        }
      } catch {
        // Ignored
      }
    };

    const interval = setInterval(fetchStatus, 3000);

    return () => {
      es.close();
      clearInterval(interval);
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const scrollToBottom = () => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  };

  const handleScroll = () => {
    if (!terminalRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    } else if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    }
  };

  // Actions
  const handleKill = async () => {
    setActionLoading('kill');
    try {
      await fetch('/api/server/kill', { method: 'POST' });
      setIsCompletelyKilled(true);
      setStatus({ running: false, pid: null, uptime: 0, workerPort: 3001, totalLogs: logs.length });
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    } catch (err) {
      console.error('Failed to kill server:', err);
      setIsCompletelyKilled(true);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestart = async () => {
    setActionLoading('restart');
    setIsCompletelyKilled(false);
    try {
      await fetch('/api/server/restart', { method: 'POST' });
    } catch (err) {
      console.error('Failed to restart server:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleClear = async () => {
    try {
      await fetch('/api/server/clear-logs', { method: 'POST' });
      setLogs([]);
    } catch {
      setLogs([]);
    }
  };

  const handleCopy = () => {
    const text = filteredLogs.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.text}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    const matchesLevel = selectedLevel === 'all' || log.level === selectedLevel;
    const matchesQuery = searchQuery === '' || log.text.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLevel && matchesQuery;
  });

  const errorCount = logs.filter((l) => l.level === 'error').length;
  const warnCount = logs.filter((l) => l.level === 'warn').length;

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Top Controls Bar */}
      <div className="web2-card rounded-2xl sm:rounded-3xl p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white/95 border-sky-200/90 shadow-sm">
        {/* Left: Server Status Badge & Uptime */}
        <div className="flex items-center gap-3.5 flex-wrap">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono font-extrabold tracking-wide transition-all shadow-sm ${
                isCompletelyKilled
                  ? 'bg-rose-700 text-white shadow-rose-700/20'
                  : status.running
                  ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                  : 'bg-rose-500 text-white shadow-rose-500/20'
              }`}
            >
              <span className="relative flex h-2.5 w-2.5">
                {status.running && !isCompletelyKilled && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                )}
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
              </span>
              <span>
                {isCompletelyKilled
                  ? 'TERMINATED (PORT RELEASED)'
                  : status.running
                  ? `ONLINE (PID: ${status.pid ?? '—'})`
                  : 'OFFLINE / STOPPED'}
              </span>
            </span>

            <span className="text-xs font-mono text-slate-500 hidden sm:inline">
              Port: <strong className="text-slate-800">3000</strong> (Default)
            </span>
          </div>

          {!isCompletelyKilled && status.running && status.uptime > 0 && (
            <span className="text-[11px] font-mono px-2 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 font-bold">
              Uptime: {Math.floor(status.uptime / 60)}m {status.uptime % 60}s
            </span>
          )}
        </div>

        {/* Right: Kill Server & Restart Server Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Kill Server Button */}
          <button
            type="button"
            id="btn-server-kill"
            onClick={handleKill}
            disabled={isCompletelyKilled || actionLoading !== null}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
              isCompletelyKilled || actionLoading !== null
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                : 'glossy-btn-rose text-white hover:brightness-105 shadow-rose-500/20'
            }`}
            title="Completely kill server process and release port 3000"
          >
            {actionLoading === 'kill' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Square className="w-3.5 h-3.5 fill-current" />
            )}
            <span>Kill Server</span>
          </button>

          {/* Restart Server Button */}
          <button
            type="button"
            id="btn-server-restart"
            onClick={handleRestart}
            disabled={isCompletelyKilled || actionLoading !== null}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
              isCompletelyKilled || actionLoading !== null
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                : 'glossy-btn-emerald text-white hover:brightness-105 shadow-emerald-500/20'
            }`}
            title="Completely kill existing process and restart server"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-white ${actionLoading === 'restart' ? 'animate-spin' : ''}`} />
            <span>Restart Server</span>
          </button>
        </div>
      </div>

      {/* Complete Shutdown Notice Banner */}
      {isCompletelyKilled && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping shrink-0" />
            <span>
              <strong>Server Completely Terminated.</strong> Port 3000 and all backend worker processes have been stopped and released.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-rose-700">To start again, run in terminal:</span>
            <span className="font-mono text-[11px] bg-white px-2.5 py-1 rounded-lg border border-rose-200 font-bold text-slate-900 shadow-2xs">
              npm run dev
            </span>
          </div>
        </div>
      )}

      {/* Terminal Viewport */}
      <div className="web2-card rounded-2xl sm:rounded-3xl border border-sky-200/90 shadow-xl overflow-hidden bg-slate-950 flex flex-col">
        {/* Terminal Header & Filter Bar */}
        <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs font-mono text-slate-300">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-slate-200">Live Server Console</span>
              <span className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">
                {filteredLogs.length} / {logs.length} lines
              </span>
            </div>

            {/* Error / Warning count badges */}
            {errorCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-bold flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                {errorCount}
              </span>
            )}
            {warnCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 text-[10px] font-bold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {warnCount}
              </span>
            )}
          </div>

          {/* Search, Filter, Clear, Copy Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search server logs..."
                className="pl-7 pr-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 placeholder:text-slate-500 text-xs w-36 sm:w-44 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Level Filter */}
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value as any)}
              className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 text-xs focus:outline-none cursor-pointer"
            >
              <option value="all">All Levels</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
              <option value="system">System</option>
            </select>

            {/* Auto scroll toggle */}
            <button
              type="button"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 cursor-pointer transition-colors ${
                autoScroll
                  ? 'bg-sky-950 text-sky-300 border-sky-700'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
              title={autoScroll ? 'Auto-scroll is ON' : 'Auto-scroll is OFF'}
            >
              <ArrowDown className={`w-3.5 h-3.5 ${autoScroll ? 'text-sky-400' : ''}`} />
            </button>

            {/* Copy button */}
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer transition-colors"
              title="Copy filtered logs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            {/* Clear button */}
            <button
              type="button"
              onClick={handleClear}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-300 border border-slate-700 cursor-pointer transition-colors"
              title="Clear terminal log buffer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Terminal Output Scroll Container */}
        <div
          ref={terminalRef}
          onScroll={handleScroll}
          className="p-4 font-mono text-xs leading-relaxed overflow-y-auto max-h-[640px] min-h-[460px] text-slate-200 space-y-1 select-text scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
        >
          {filteredLogs.length === 0 ? (
            <div className="py-16 text-center text-slate-500 italic">
              {logs.length === 0
                ? 'No logs in buffer. Waiting for server output...'
                : 'No logs match the current search filter.'}
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isError = log.level === 'error';
              const isWarn = log.level === 'warn';
              const isSystem = log.level === 'system';

              return (
                <div
                  key={log.id}
                  className={`flex items-start gap-2.5 py-0.5 px-2 rounded-md hover:bg-slate-900/60 transition-colors font-mono ${
                    isError
                      ? 'bg-rose-950/20 text-rose-300'
                      : isWarn
                      ? 'bg-amber-950/15 text-amber-300'
                      : isSystem
                      ? 'text-sky-300'
                      : 'text-slate-300'
                  }`}
                >
                  <span className="text-slate-500 text-[11px] shrink-0 select-none">
                    {log.timestamp}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 rounded shrink-0 select-none ${
                      isError
                        ? 'bg-rose-900/60 text-rose-300 border border-rose-800'
                        : isWarn
                        ? 'bg-amber-900/60 text-amber-300 border border-amber-800'
                        : isSystem
                        ? 'bg-sky-900/60 text-sky-300 border border-sky-800'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {log.level.toUpperCase()}
                  </span>
                  <span className="whitespace-pre-wrap break-all flex-1">
                    {log.text}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Terminal Footer Strip */}
        <div className="px-4 py-2 bg-slate-900/90 border-t border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
          <span>
            Status: <strong className={status.running ? 'text-emerald-400' : 'text-rose-400'}>{status.running ? 'Active & Streaming' : 'Terminated'}</strong>
          </span>
          <span>
            Auto-Scroll: <strong className={autoScroll ? 'text-sky-400' : 'text-slate-500'}>{autoScroll ? 'ON' : 'OFF'}</strong>
          </span>
        </div>
      </div>
    </div>
  );
};
