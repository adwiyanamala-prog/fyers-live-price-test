import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Play,
  Square,
  Trash2,
  Copy,
  Check,
  Terminal,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Landmark,
  ChevronDown,
  ChevronUp,
  FileCode2,
  Download,
  FileSpreadsheet,
  Search,
  CheckSquare,
  X,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Key,
  ExternalLink,
  Eye,
  EyeOff,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  Activity,
  SlidersHorizontal,
  Zap,
  TrendingUp,
  Archive,
  Database,
  History,
  Volume2,
  VolumeX,
  Bell,
  BellRing
} from 'lucide-react';
import { soundAlerts, sendDesktopNotification, requestDesktopNotificationPermission } from './utils/audioAlerts';
import { LogEntry, SymbolSnapshot, CsvRecord } from './types';

export interface BackupRecord {
  id: string;
  timestamp: string;
  totalTicks: number;
  totalBars1s?: number;
  totalBars1m?: number;
  dbFile: string;
  xlsxFile: string;
  csvFile: string;
  dbSizeBytes?: number;
  xlsxSizeBytes?: number;
}
import { NIFTY_500_SYMBOLS, StockSymbol } from './data/nifty500';
import { BANK_NIFTY_SYMBOLS } from './data/banknifty';
import { NIFTY_FUTURES_SYMBOLS } from './data/niftyfutures';
import { StockScreener } from './components/StockScreener';
import { TradingDashboard } from './components/TradingDashboard';
import { ServerLogsViewer } from './components/ServerLogsViewer';
import { SmartMoneyRadar } from './components/SmartMoneyRadar';

export type AppTheme = 'sky' | 'emerald';

export default function App() {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'streaming' | 'stopped'>('idle');

  // All tickers unselected by default
  const [selectedNifty500Symbols, setSelectedNifty500Symbols] = useState<string[]>([]);
  const [selectedBankNiftySymbols, setSelectedBankNiftySymbols] = useState<string[]>([]);
  const [selectedNiftyFuturesSymbols, setSelectedNiftyFuturesSymbols] = useState<string[]>([]);

  // Combined symbols for streaming & API request
  const selectedSymbols = Array.from(new Set([...selectedNifty500Symbols, ...selectedBankNiftySymbols, ...selectedNiftyFuturesSymbols]));
  const [theme, setTheme] = useState<AppTheme>(() => {
    const saved = localStorage.getItem('fyers_app_theme');
    return saved === 'sky' ? 'sky' : 'emerald';
  });
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init-1',
      type: 'system',
      rawText: 'FYERS API V3 WebSocket Live Price Test ready.\nSelect symbols from Nifty 500 or Bank Nifty dropdowns & click [Run] to start streaming live market ticks.',
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
  const [snapshots, setSnapshots] = useState<Record<string, SymbolSnapshot>>({});
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);
  const [tickCount, setTickCount] = useState<number>(0);
  const [csvRecords, setCsvRecords] = useState<CsvRecord[]>([]);
  const [activeViewTab, setActiveViewTab] = useState<'terminal' | 'csvTable'>('terminal');
  const [csvSearch, setCsvSearch] = useState<string>('');
  const [downloadMenuOpen, setDownloadMenuOpen] = useState<boolean>(false);
  const [granularity, setGranularity] = useState<'live' | '1s' | '1m'>('live');
  const [dbStats, setDbStats] = useState<{ totalRows: number; symbols: string[]; firstDate: string; lastDate: string; dbSizeBytes: number } | null>(null);
  const [sqliteStats, setSqliteStats] = useState<{
    dbSizeBytes: number;
    dbSizeMB: number;
    totalTicks: number;
    totalBars1s: number;
    totalBars1m: number;
    totalSmartMoney: number;
    totalOrders: number;
    oldestTickDate: string | null;
    newestTickDate: string | null;
    retentionPolicy: string;
  } | null>(null);
  const [optimizingDb, setOptimizingDb] = useState<boolean>(false);
  const [optimizeSuccessMsg, setOptimizeSuccessMsg] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [showBackupsModal, setShowBackupsModal] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => soundAlerts.isEnabled());
  const [notificationsGranted, setNotificationsGranted] = useState<boolean>(() =>
    typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
  );

  // Fyers Token Generator Modal States
  const [isTokenModalOpen, setIsTokenModalOpen] = useState<boolean>(false);
  const [authConfig, setAuthConfig] = useState<{
    appId: string;
    hasSecretKey: boolean;
    hasToken: boolean;
    hasClientId: boolean;
    tokenPreview: string | null;
    defaultRedirectUri: string;
  } | null>(null);
  const [tokenAppId, setTokenAppId] = useState<string>('');
  const [tokenSecretKey, setTokenSecretKey] = useState<string>('');
  const [tokenRedirectUri, setTokenRedirectUri] = useState<string>('http://localhost:3000/api/fyers/callback');
  const [tokenAuthCode, setTokenAuthCode] = useState<string>('');
  const [showSecret, setShowSecret] = useState<boolean>(false);
  const [saveSecretKey, setSaveSecretKey] = useState<boolean>(true);
  const [tokenLoading, setTokenLoading] = useState<boolean>(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenSuccessMsg, setTokenSuccessMsg] = useState<string | null>(null);
  const [authTab, setAuthTab] = useState<'1click' | 'manual'>('1click');

  // Primary Platform Navigation Tab: 'monitor' | 'screener' | 'trading' | 'smart_money' | 'logs'
  const [platformTab, setPlatformTab] = useState<'monitor' | 'screener' | 'trading' | 'smart_money' | 'logs'>('monitor');
  const [tradeTargetSymbol, setTradeTargetSymbol] = useState<string>('NSE:RELIANCE-EQ');
  const [tradeTargetPrice, setTradeTargetPrice] = useState<number>(1310);
  const [globalSmartMoneyAlert, setGlobalSmartMoneyAlert] = useState<any | null>(null);
  const [radarSelectedSymbol, setRadarSelectedSymbol] = useState<string>('NSE:HFCL-EQ');

  // Screener Interactivity Handlers
  const handleAddFromScreener = (newSymbol: string) => {
    if (!selectedSymbols.includes(newSymbol)) {
      setSelectedNifty500Symbols(prev => [...prev, newSymbol]);
    }
  };

  const handleSelectForTrade = (sym: string, curPrice: number) => {
    setTradeTargetSymbol(sym);
    setTradeTargetPrice(curPrice);
    setPlatformTab('trading');
  };

  // Nifty 500 Dropdown States
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');

  // Bank Nifty Dropdown States
  const [isBankNiftyOpen, setIsBankNiftyOpen] = useState<boolean>(false);
  const [bankNiftyQuery, setBankNiftyQuery] = useState<string>('');
  const [bankNiftySector, setBankNiftySector] = useState<string>('ALL');

  // Nifty Futures Dropdown States
  const [isNiftyFuturesOpen, setIsNiftyFuturesOpen] = useState<boolean>(false);
  const [niftyFuturesQuery, setNiftyFuturesQuery] = useState<string>('');
  const [niftyFuturesSector, setNiftyFuturesSector] = useState<string>('ALL');

  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const bankNiftyRef = useRef<HTMLDivElement | null>(null);
  const niftyFuturesRef = useRef<HTMLDivElement | null>(null);
  const downloadMenuRef = useRef<HTMLDivElement | null>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (bankNiftyRef.current && !bankNiftyRef.current.contains(event.target as Node)) {
        setIsBankNiftyOpen(false);
      }
      if (niftyFuturesRef.current && !niftyFuturesRef.current.contains(event.target as Node)) {
        setIsNiftyFuturesOpen(false);
      }
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target as Node)) {
        setDownloadMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleThemeChange = (newTheme: AppTheme) => {
    setTheme(newTheme);
    localStorage.setItem('fyers_app_theme', newTheme);
  };

  interface TokenHealth {
    hasToken: boolean;
    valid: boolean;
    expired: boolean;
    expiringSoon: boolean;
    expiresAt: string | null;
    minutesRemaining: number | null;
    message: string;
  }

  const [tokenHealth, setTokenHealth] = useState<TokenHealth | null>(null);

  const fetchTokenHealth = async () => {
    try {
      const res = await fetch('/api/fyers/token-health');
      if (res.ok) {
        const data = await res.json();
        setTokenHealth(data);
      }
    } catch {}
  };

  // Fetch DB stats & auth config periodically
  const fetchAuthConfig = async () => {
    try {
      const res = await fetch('/api/fyers/auth-config');
      if (res.ok) {
        const data = await res.json();
        setAuthConfig(data);
        if (data.appId && !tokenAppId) setTokenAppId(data.appId);
        if (data.defaultRedirectUri && !tokenRedirectUri) setTokenRedirectUri(data.defaultRedirectUri);
      }
    } catch { }
  };

  useEffect(() => {
    fetchAuthConfig();
    fetchTokenHealth();
    const tokenInterval = setInterval(fetchTokenHealth, 60000);
    return () => clearInterval(tokenInterval);
  }, []);

  // Listen for FYERS popup callback success message
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'FYERS_AUTH_SUCCESS') {
        setTokenSuccessMsg('Access Token generated, saved to .env, and activated in live memory!');
        setTokenLoading(false);
        fetchAuthConfig();
        setTimeout(() => {
          setIsTokenModalOpen(false);
          setTokenSuccessMsg(null);
        }, 1800);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchDbStats = async () => {
    try {
      const res = await fetch('/api/csv-files');
      if (res.ok) setDbStats(await res.json());
    } catch { }
  };

  const fetchSqliteStats = async () => {
    try {
      const res = await fetch('/api/db/stats');
      if (res.ok) setSqliteStats(await res.json());
    } catch { }
  };

  const handleOptimizeDb = async (retentionDays: number = 7) => {
    setOptimizingDb(true);
    setOptimizeSuccessMsg(null);
    try {
      const res = await fetch('/api/db/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retentionDays, vacuum: true }),
      });
      if (res.ok) {
        const result = await res.json();
        setOptimizeSuccessMsg(result.message);
        soundAlerts.playOrderSuccessChime();
        await fetchSqliteStats();
        await fetchDbStats();
        setTimeout(() => setOptimizeSuccessMsg(null), 8000);
      }
    } catch (err: any) {
      alert('Optimization failed: ' + (err.message || 'Unknown error'));
    } finally {
      setOptimizingDb(false);
    }
  };

  const fetchBackups = async () => {
    try {
      const res = await fetch('/api/backups');
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups || []);
      }
    } catch { }
  };

  const handleDownloadBackupFile = (filename: string) => {
    const link = document.createElement('a');
    link.href = `/api/backups/download/${encodeURIComponent(filename)}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    fetchDbStats();
    fetchSqliteStats();
    fetchBackups();
    const interval = setInterval(() => {
      fetchDbStats();
      fetchSqliteStats();
      fetchBackups();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Auto scroll terminal
  useEffect(() => {
    if (autoScroll && terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Handle user manual scroll
  const handleScroll = () => {
    if (!terminalContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  // 1-Click Browser OAuth
  const handle1ClickLogin = async () => {
    if (!tokenAppId.trim()) {
      setTokenError('App ID is required');
      return;
    }
    if (!tokenSecretKey.trim() && !authConfig?.hasSecretKey) {
      setTokenError('Secret Key is required to exchange the token');
      return;
    }
    setTokenLoading(true);
    setTokenError(null);
    try {
      const res = await fetch('/api/fyers/auth-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: tokenAppId.trim(),
          secretKey: tokenSecretKey.trim(),
          redirectUri: tokenRedirectUri.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate auth URL');

      // Open OAuth login popup
      const width = 560;
      const height = 720;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      window.open(data.authUrl, 'fyers_oauth_login', `width=${width},height=${height},left=${left},top=${top},menubar=no,status=no,toolbar=no`);
    } catch (err: any) {
      setTokenError(err.message || String(err));
      setTokenLoading(false);
    }
  };

  // Manual Exchange for custom redirect URI (e.g. https://127.0.0.1)
  const handleManualExchange = async () => {
    if (!tokenAppId.trim()) {
      setTokenError('App ID is required');
      return;
    }
    if (!tokenSecretKey.trim() && !authConfig?.hasSecretKey) {
      setTokenError('Secret Key is required');
      return;
    }
    if (!tokenAuthCode.trim()) {
      setTokenError('Please paste the redirect URL or auth_code from your browser');
      return;
    }
    setTokenLoading(true);
    setTokenError(null);
    try {
      const res = await fetch('/api/fyers/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: tokenAppId.trim(),
          secretKey: tokenSecretKey.trim(),
          authCodeOrUrl: tokenAuthCode.trim(),
          saveSecret: saveSecretKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to exchange token');
      setTokenSuccessMsg(data.message || 'Token saved successfully!');
      setTokenAuthCode('');
      fetchAuthConfig();
      setTimeout(() => {
        setIsTokenModalOpen(false);
        setTokenSuccessMsg(null);
      }, 1800);
    } catch (err: any) {
      setTokenError(err.message || String(err));
    } finally {
      setTokenLoading(false);
    }
  };

  const handleStart = async () => {
    if (isRunning) return;

    if (selectedSymbols.length === 0) {
      setLogs(prev => [
        ...prev,
        {
          id: `warn-${Date.now()}`,
          type: 'error',
          rawText: `⚠️ No tickers selected. Please select at least one contract from the Nifty 500, Bank Nifty, or Nifty Futures dropdowns.`,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
      return;
    }

    // Close any previous stream
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsRunning(true);
    setStatus('connecting');
    setTickCount(0);
    setCsvRecords([]);
    setSnapshots({});

    const startTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // Call server to safely archive previous session data to backups/ and start fresh DB
    let backupNotice: string | null = null;
    try {
      const res = await fetch('/api/session/start', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.backup?.backedUp) {
          backupNotice = `[BACKUP] Safely archived previous session (${data.backup.totalTicks?.toLocaleString() ?? 0} ticks) to backups/${data.backup.files?.xlsx || ''}`;
        }
      }
      fetchDbStats();
      fetchBackups();
    } catch (err) {
      console.warn('Session archival error:', err);
    }

    // Initialize completely fresh terminal logs for the new session
    const initialLogs: LogEntry[] = [];
    if (backupNotice) {
      initialLogs.push({
        id: `backup-${Date.now()}`,
        type: 'status',
        rawText: backupNotice,
        timestamp: startTimestamp,
      });
    }
    initialLogs.push({
      id: `start-${Date.now()}`,
      type: 'system',
      rawText: `\n--- [${startTimestamp}] Starting fresh session (${selectedSymbols.length} symbols, ${granularity.toUpperCase()}) | SQLite logging enabled ---`,
      timestamp: startTimestamp,
    });

    setLogs(initialLogs);

    const symbolsParam = encodeURIComponent(selectedSymbols.join(','));
    const es = new EventSource(`/api/stream?symbols=${symbolsParam}&granularity=${granularity}`);
    eventSourceRef.current = es;

    es.addEventListener('log', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.message.includes('Connected successfully')) {
          setStatus('connected');
        } else if (data.message.includes('Waiting for market data')) {
          setStatus('streaming');
        }

        setLogs(prev => [
          ...prev,
          {
            id: `log-${Date.now()}-${Math.random()}`,
            type: 'status',
            rawText: data.message,
            timestamp: data.timestamp
          }
        ]);
      } catch (err) {
        console.error('Failed to parse log:', err);
      }
    });

    es.addEventListener('smart_money_alert', (e: MessageEvent) => {
      try {
        const alertData = JSON.parse(e.data);
        setGlobalSmartMoneyAlert(alertData);
        soundAlerts.playSmartMoneyChime();
        sendDesktopNotification(`🚨 Institutional Footprint: ${alertData.ticker}`, {
          body: `₹${alertData.ltp} | ${alertData.pattern_type.replace(/_/g, ' ')} (${alertData.volume_multiple}x Vol)\n${alertData.note}`,
        });
        setTimeout(() => setGlobalSmartMoneyAlert(null), 9000);
      } catch (err) {
        console.error('Failed to parse smart money alert:', err);
      }
    });

    es.addEventListener('order_update', (e: MessageEvent) => {
      try {
        const ordData = JSON.parse(e.data);
        if (ordData.type === 'TP_HIT') {
          soundAlerts.playOrderSuccessChime();
          sendDesktopNotification('🎯 Target Hit!', {
            body: ordData.message || `${ordData.symbol} Target reached. Closed at profit.`,
          });
        } else if (ordData.type === 'SL_HIT') {
          soundAlerts.playRsiPullbackChime();
          sendDesktopNotification('🛑 Stop-Loss Executed', {
            body: ordData.message || `${ordData.symbol} Stop-loss reached. Position closed.`,
          });
        } else if (ordData.type === 'ORDER_FILLED') {
          soundAlerts.playOrderSuccessChime();
          sendDesktopNotification('✅ Order Executed', {
            body: ordData.message || `${ordData.symbol} Order filled @ ₹${ordData.price}`,
          });
        }

        setLogs(prev => [
          ...prev,
          {
            id: `ord-${Date.now()}-${Math.random()}`,
            type: ordData.type === 'SL_HIT' ? 'error' : 'status',
            rawText: `[ORDER SYSTEM] ${ordData.message || JSON.stringify(ordData)}`,
            timestamp: new Date().toLocaleTimeString(),
          }
        ]);
      } catch (err) {
        console.error('Failed to parse order_update:', err);
      }
    });

    es.addEventListener('token_expired', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        soundAlerts.playRsiPullbackChime();
        sendDesktopNotification('🚨 FYERS Token Expired', {
          body: data.message || 'Please refresh your token to stream live data.',
        });
        fetchTokenHealth();
        setLogs(prev => [
          ...prev,
          {
            id: `token-exp-${Date.now()}`,
            type: 'error',
            rawText: `🚨 [AUTH EXPIRED] ${data.message}. Click "Token Expired" in top header to refresh.`,
            timestamp: new Date().toLocaleTimeString(),
          }
        ]);
      } catch {}
    });

    es.addEventListener('tick', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setStatus('streaming');
        setTickCount(prev => prev + 1);

        // Record to CSV state
        const newRecord: CsvRecord = {
          date: data.date || '',
          time: data.time || '',
          timestamp: data.timestamp,
          symbol: data.symbol,
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          ltp: data.ltp,
          quantity: data.quantity,
          volume: data.volume,
          tradeValue: data.tradeValue,
          spread: data.spread,
          average: data.average,
          bid: data.bid,
          ask: data.ask,
          change: data.change,
          pChange: data.pChange
        };
        setCsvRecords(prev => [...prev, newRecord]);

        setLogs(prev => [
          ...prev.slice(-400), // Keep last 400 entries in DOM for peak performance
          {
            id: `tick-${Date.now()}-${Math.random()}`,
            type: 'tick',
            rawText: data.line,
            timestamp: data.timestamp,
            date: data.date,
            time: data.time,
            symbol: data.symbol,
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
            ask: data.ask
          }
        ]);

        // Update Snapshot Card
        setSnapshots(prev => {
          const current = prev[data.symbol];
          return {
            ...prev,
            [data.symbol]: {
              symbol: data.symbol,
              ltp: data.ltp,
              prevLtp: current ? current.ltp : data.ltp,
              open: data.open,
              high: data.high,
              low: data.low,
              close: data.close,
              quantity: data.quantity,
              average: data.average,
              change: data.change,
              pChange: data.pChange,
              volume: data.volume,
              bid: data.bid,
              ask: data.ask,
              date: data.date,
              time: data.time,
              lastUpdated: data.time || (data.timestamp ? data.timestamp.split(' ')[1] : '')
            }
          };
        });
      } catch (err) {
        console.error('Failed to parse tick:', err);
      }
    });

    es.onerror = (err) => {
      console.warn('SSE EventSource error:', err);
      console.warn('EventSource readyState:', es.readyState);
      console.warn('EventSource URL:', es.url);

      // Add error log to UI
      setLogs(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          type: 'error',
          rawText: `SSE Connection Error: ${es.readyState === 2 ? 'Connection closed' : 'Failed to connect'}`,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);

      // Update status
      if (es.readyState === 2) {
        setStatus('stopped');
      } else {
        setStatus('idle');
      }
      setIsRunning(false);
    };
  };

  const handleStop = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsRunning(false);
    setStatus('stopped');

    const stopTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    setLogs(prev => [
      ...prev,
      {
        id: `csv-${Date.now()}`,
        type: 'status',
        rawText: `Prices recorded to 'fyers_prices.csv' (${csvRecords.length} rows saved).`,
        timestamp: stopTimestamp
      },
      {
        id: `stop-${Date.now()}`,
        type: 'status',
        rawText: `FYERS connection closed.\nApplication stopped.`,
        timestamp: stopTimestamp
      }
    ]);
  };

  const handleClear = () => {
    setLogs([]);
    setTickCount(0);
  };

  const handleCopyLogs = () => {
    const text = logs.map(l => l.rawText).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download current session as CSV (in-memory)
  const handleDownloadCsv = () => {
    if (csvRecords.length === 0) return;

    const isBars = granularity !== 'live';
    const headers = isBars
      ? ["Date", "Time", "Symbol", `Open (${granularity})`, `High (${granularity})`, `Low (${granularity})`, `Close (${granularity})`, "LTP", "Trades in Interval", `Volume (${granularity})`, "Average", "Bid", "Ask", "Change", "% Change"]
      : ["Date", "Time", "Symbol", "Trade Price (LTP)", "Trade Quantity / Volume", "Trade Value (₹)", "Bid", "Ask", "Spread", "Change", "% Change"];

    const rows = csvRecords.map(r => isBars ? [
      `"${r.date || ''}"`,
      `"${r.time || ''}"`,
      `"${r.symbol}"`,
      r.open != null ? r.open.toFixed(2) : "",
      r.high != null ? r.high.toFixed(2) : "",
      r.low != null ? r.low.toFixed(2) : "",
      r.close != null ? r.close.toFixed(2) : "",
      r.ltp != null ? r.ltp.toFixed(2) : "",
      r.quantity != null ? r.quantity : "",
      r.volume != null ? r.volume : "",
      r.average != null ? r.average.toFixed(2) : "",
      r.bid != null ? r.bid.toFixed(2) : "",
      r.ask != null ? r.ask.toFixed(2) : "",
      r.change != null ? r.change.toFixed(2) : "",
      r.pChange != null ? r.pChange.toFixed(2) : ""
    ] : [
      `"${r.date || ''}"`,
      `"${r.time || ''}"`,
      `"${r.symbol}"`,
      r.ltp != null ? r.ltp.toFixed(2) : "",
      r.quantity != null ? r.quantity : "",
      r.tradeValue != null ? r.tradeValue.toFixed(2) : (r.ltp != null && r.quantity != null ? (r.ltp * r.quantity).toFixed(2) : ""),
      r.bid != null ? r.bid.toFixed(2) : "",
      r.ask != null ? r.ask.toFixed(2) : "",
      r.spread != null ? r.spread.toFixed(2) : (r.ask != null && r.bid != null ? (r.ask - r.bid).toFixed(2) : ""),
      r.change != null ? r.change.toFixed(2) : "",
      r.pChange != null ? r.pChange.toFixed(2) : ""
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `fyers_prices_${granularity}_${ts}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloadSuccess(true);
    setDownloadMenuOpen(false);
    setTimeout(() => setDownloadSuccess(false), 2500);
  };

  // Download full SQLite DB as XLSX from server
  const handleDownloadFromDb = async (symbol?: string) => {
    try {
      const url = symbol ? `/api/download-csv?granularity=${granularity}&symbol=${encodeURIComponent(symbol)}` : `/api/download-csv?granularity=${granularity}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      a.download = match ? match[1] : `fyers_prices_${granularity}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      setDownloadSuccess(true);
      setDownloadMenuOpen(false);
      setTimeout(() => setDownloadSuccess(false), 2500);
    } catch (err) {
      console.error('DB download failed:', err);
    }
  };

  // Download current session as Excel (in-memory)
  const handleDownloadExcel = () => {
    if (csvRecords.length === 0) return;

    const isBars = granularity !== 'live';
    const headers = isBars
      ? ["Date", "Time", "Symbol", `Open (${granularity})`, `High (${granularity})`, `Low (${granularity})`, `Close (${granularity})`, "LTP", "Trades in Interval", `Volume (${granularity})`, "Average", "Bid", "Ask", "Change", "% Change"]
      : ["Date", "Time", "Symbol", "Trade Price (LTP)", "Trade Quantity / Volume", "Trade Value (₹)", "Bid", "Ask", "Spread", "Change", "Percent Change (%)"];

    const rows = csvRecords.map(r => isBars ? ({
      "Date": r.date || '',
      "Time": r.time || '',
      "Symbol": r.symbol,
      [`Open (${granularity})`]: r.open != null ? r.open : '',
      [`High (${granularity})`]: r.high != null ? r.high : '',
      [`Low (${granularity})`]: r.low != null ? r.low : '',
      [`Close (${granularity})`]: r.close != null ? r.close : '',
      "LTP": r.ltp,
      "Trades in Interval": r.quantity != null ? r.quantity : '',
      [`Volume (${granularity})`]: r.volume != null ? r.volume : '',
      "Average": r.average != null ? r.average : '',
      "Bid": r.bid != null ? r.bid : '',
      "Ask": r.ask != null ? r.ask : '',
      "Change": r.change != null ? r.change : '',
      "% Change": r.pChange != null ? r.pChange : ''
    }) : ({
      "Date": r.date || '',
      "Time": r.time || '',
      "Symbol": r.symbol,
      "Trade Price (LTP)": r.ltp,
      "Trade Quantity / Volume": r.quantity != null ? r.quantity : '',
      "Trade Value (₹)": r.tradeValue != null ? r.tradeValue : (r.ltp != null && r.quantity != null ? Number((r.ltp * r.quantity).toFixed(2)) : ''),
      "Bid": r.bid != null ? r.bid : '',
      "Ask": r.ask != null ? r.ask : '',
      "Spread": r.spread != null ? r.spread : (r.ask != null && r.bid != null ? Number((r.ask - r.bid).toFixed(2)) : ''),
      "Change": r.change != null ? r.change : '',
      "Percent Change (%)": r.pChange != null ? r.pChange : ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `FYERS ${granularity.toUpperCase()}`);

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    XLSX.writeFile(workbook, `fyers_prices_${granularity}_${ts}.xlsx`);

    setDownloadSuccess(true);
    setDownloadMenuOpen(false);
    setTimeout(() => setDownloadSuccess(false), 2500);
  };

  const selectedNifty500Count = selectedNifty500Symbols.length;
  const isAllNifty500Selected = selectedNifty500Count === NIFTY_500_SYMBOLS.length;

  const selectedBankNiftyCount = selectedBankNiftySymbols.length;
  const isAllBankNiftySelected = selectedBankNiftyCount === BANK_NIFTY_SYMBOLS.length;

  const toggleNifty500Symbol = (sym: string) => {
    if (isRunning) return;
    setSelectedNifty500Symbols(prev => {
      if (prev.includes(sym)) {
        return prev.filter(s => s !== sym);
      } else {
        return Array.from(new Set([...prev, sym]));
      }
    });
  };

  const toggleBankNiftySymbol = (sym: string) => {
    if (isRunning) return;
    setSelectedBankNiftySymbols(prev => {
      if (prev.includes(sym)) {
        return prev.filter(s => s !== sym);
      } else {
        return Array.from(new Set([...prev, sym]));
      }
    });
  };

  const handleSelectAllNifty500 = () => {
    if (isRunning) return;
    const targetSyms = filteredStockList.map(s => s.symbol);
    setSelectedNifty500Symbols(prev => Array.from(new Set([...prev, ...targetSyms])));
  };

  const handleUnselectAllNifty500 = () => {
    if (isRunning) return;
    const targetSet = new Set(filteredStockList.map(s => s.symbol));
    setSelectedNifty500Symbols(prev => prev.filter(s => !targetSet.has(s)));
  };

  const handleSelectAllBankNifty = () => {
    if (isRunning) return;
    const targetSyms = filteredBankNiftyList.map(s => s.symbol);
    setSelectedBankNiftySymbols(prev => Array.from(new Set([...prev, ...targetSyms])));
  };

  const handleUnselectAllBankNifty = () => {
    if (isRunning) return;
    const targetSet = new Set(filteredBankNiftyList.map(s => s.symbol));
    setSelectedBankNiftySymbols(prev => prev.filter(s => !targetSet.has(s)));
  };

  const handleSelectPreset = (preset: 'TOP_5' | 'TOP_10' | 'TOP_20' | 'NIFTY_50' | 'TOP_100' | 'BANKING' | 'IT' | 'AUTOMOBILE' | 'FMCG') => {
    if (isRunning) return;
    let targetSyms: string[] = [];
    if (preset === 'TOP_5') {
      targetSyms = NIFTY_500_SYMBOLS.slice(0, 5).map(s => s.symbol);
    } else if (preset === 'TOP_10') {
      targetSyms = NIFTY_500_SYMBOLS.slice(0, 10).map(s => s.symbol);
    } else if (preset === 'TOP_20') {
      targetSyms = NIFTY_500_SYMBOLS.slice(0, 20).map(s => s.symbol);
    } else if (preset === 'NIFTY_50') {
      targetSyms = NIFTY_500_SYMBOLS.slice(0, 50).map(s => s.symbol);
    } else if (preset === 'TOP_100') {
      targetSyms = NIFTY_500_SYMBOLS.slice(0, 100).map(s => s.symbol);
    } else if (preset === 'BANKING') {
      targetSyms = NIFTY_500_SYMBOLS.filter(s => s.sector === 'Financial Services' || s.sector === 'Banking').map(s => s.symbol);
    } else if (preset === 'IT') {
      targetSyms = NIFTY_500_SYMBOLS.filter(s => s.sector === 'Information Technology' || s.sector === 'IT').map(s => s.symbol);
    } else if (preset === 'AUTOMOBILE') {
      targetSyms = NIFTY_500_SYMBOLS.filter(s => s.sector === 'Automobile').map(s => s.symbol);
    } else if (preset === 'FMCG') {
      targetSyms = NIFTY_500_SYMBOLS.filter(s => s.sector === 'Consumer Goods' || s.sector === 'FMCG').map(s => s.symbol);
    }

    setSelectedNifty500Symbols(targetSyms);
  };

  // Filter Nifty 500 list by search query & sector
  const filteredStockList = NIFTY_500_SYMBOLS.filter(stock => {
    const matchesQuery = searchQuery === '' ||
      stock.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stock.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stock.symbol.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSector = selectedSector === 'ALL' || stock.sector === selectedSector;
    return matchesQuery && matchesSector;
  });

  const availableSectors = Array.from(new Set(NIFTY_500_SYMBOLS.map(s => s.sector).filter(Boolean))) as string[];

  // Filter Bank Nifty list by search query & sector
  const filteredBankNiftyList = BANK_NIFTY_SYMBOLS.filter(stock => {
    const matchesQuery = bankNiftyQuery === '' ||
      stock.ticker.toLowerCase().includes(bankNiftyQuery.toLowerCase()) ||
      stock.name.toLowerCase().includes(bankNiftyQuery.toLowerCase()) ||
      stock.symbol.toLowerCase().includes(bankNiftyQuery.toLowerCase());

    const matchesSector = bankNiftySector === 'ALL' || stock.sector === bankNiftySector;
    return matchesQuery && matchesSector;
  });

  const availableBankNiftySectors = Array.from(new Set(BANK_NIFTY_SYMBOLS.map(s => s.sector).filter(Boolean))) as string[];

  // Nifty Futures Selection Helpers
  const selectedNiftyFuturesCount = selectedNiftyFuturesSymbols.length;
  const isAllNiftyFuturesSelected = selectedNiftyFuturesCount === NIFTY_FUTURES_SYMBOLS.length;

  const toggleNiftyFuturesSymbol = (sym: string) => {
    if (isRunning) return;
    setSelectedNiftyFuturesSymbols(prev => {
      if (prev.includes(sym)) {
        return prev.filter(s => s !== sym);
      } else {
        return Array.from(new Set([...prev, sym]));
      }
    });
  };

  const handleSelectAllNiftyFutures = () => {
    if (isRunning) return;
    const targetSyms = filteredNiftyFuturesList.map(s => s.symbol);
    setSelectedNiftyFuturesSymbols(prev => Array.from(new Set([...prev, ...targetSyms])));
  };

  const handleUnselectAllNiftyFutures = () => {
    if (isRunning) return;
    const targetSet = new Set(filteredNiftyFuturesList.map(s => s.symbol));
    setSelectedNiftyFuturesSymbols(prev => prev.filter(s => !targetSet.has(s)));
  };

  const handleSelectFuturesPreset = (type: 'INDEX' | 'STOCK') => {
    if (isRunning) return;
    if (type === 'INDEX') {
      const idxSyms = NIFTY_FUTURES_SYMBOLS.filter(s => s.sector === 'Nifty Futures' || s.sector === 'Bank Nifty Futures' || s.sector === 'Index Futures' || s.sector === 'Index').map(s => s.symbol);
      setSelectedNiftyFuturesSymbols(idxSyms);
    } else {
      const stockSyms = NIFTY_FUTURES_SYMBOLS.filter(s => s.sector === 'Stock Futures').map(s => s.symbol);
      setSelectedNiftyFuturesSymbols(stockSyms);
    }
  };

  const filteredNiftyFuturesList = NIFTY_FUTURES_SYMBOLS.filter(stock => {
    const matchesQuery = niftyFuturesQuery === '' ||
      stock.ticker.toLowerCase().includes(niftyFuturesQuery.toLowerCase()) ||
      stock.name.toLowerCase().includes(niftyFuturesQuery.toLowerCase()) ||
      stock.symbol.toLowerCase().includes(niftyFuturesQuery.toLowerCase());

    const matchesSector = niftyFuturesSector === 'ALL' || stock.sector === niftyFuturesSector;
    return matchesQuery && matchesSector;
  });

  const availableNiftyFuturesSectors = Array.from(new Set(NIFTY_FUTURES_SYMBOLS.map(s => s.sector).filter(Boolean))) as string[];


  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const canvasClass =
    theme === 'emerald'
      ? 'min-h-screen bg-emerald-scientist-canvas text-slate-900 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-950'
      : 'min-h-screen bg-web2-canvas text-slate-800 flex flex-col font-sans selection:bg-sky-500/30 selection:text-sky-900';

  return (
    <div className={canvasClass}>

      {/* Top Header with Brand, Center Platform Tabs, and Right Actions (Token Active & Theme) */}
      <header className="border-b border-sky-200/80 bg-white/90 backdrop-blur-xl sticky top-0 z-30 px-3 sm:px-4 lg:px-6 py-2 flex items-center justify-between gap-2 lg:gap-4 flex-nowrap w-full shadow-xs shadow-sky-200/40">
        
        {/* Brand / Logo */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white shadow-lg shrink-0 ${theme === 'emerald' ? 'glossy-orb-emerald shadow-emerald-500/40' : 'glossy-orb shadow-sky-400/40'
            }`}>
            <Terminal className="w-4.5 h-4.5 text-white drop-shadow-sm" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-sky-950 text-sm sm:text-base tracking-tight leading-tight">
                AdwiKetan Trading Desk
              </h1>
            </div>
            <p className="text-[10px] sm:text-[11px] text-sky-700/90 font-medium leading-tight">
              All in One Trading Solution
            </p>
          </div>
        </div>

        {/* Center: Primary Platform Tabs with Fixed Dimensions and Unified Inactive Color */}
        <div className="p-1 rounded-2xl bg-slate-100/90 border border-slate-200/90 shadow-inner flex items-center gap-1 sm:gap-1.5 flex-nowrap overflow-x-auto scrollbar-none shrink mx-auto">
          {/* Tab 1: Live Monitor */}
          <button
            type="button"
            id="tab-live-monitor"
            onClick={() => setPlatformTab('monitor')}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              platformTab === 'monitor'
                ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-md shadow-sky-500/30 ring-1 ring-sky-400'
                : 'bg-white/90 hover:bg-white text-slate-700 hover:text-slate-950 border border-slate-200/90 shadow-2xs'
            }`}
          >
            <Activity className="w-3.5 h-3.5 shrink-0" />
            <span>Live Monitor</span>

            {/* Embedded Live Status Indicator (Fixed Width) */}
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono font-bold tracking-tight transition-all shadow-xs ${
                platformTab === 'monitor'
                  ? status === 'streaming'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-sky-900/60 text-sky-100 border border-sky-400/40'
                  : status === 'streaming'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-slate-100 text-slate-600 border border-slate-200/80'
              }`}
            >
              <span className="relative flex h-1.5 w-1.5">
                {isRunning && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
                )}
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current"></span>
              </span>
              <span className="uppercase">{status === 'streaming' ? 'LIVE' : status === 'connecting' ? 'SYNC' : 'READY'}</span>
            </span>
          </button>

          {/* Tab 2: Stock Screener */}
          <button
            type="button"
            id="tab-stock-screener"
            onClick={() => setPlatformTab('screener')}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              platformTab === 'screener'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/30 ring-1 ring-purple-400'
                : 'bg-white/90 hover:bg-white text-slate-700 hover:text-slate-950 border border-slate-200/90 shadow-2xs'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span>Stock Screener</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono font-bold ${
                platformTab === 'screener'
                  ? 'bg-purple-900/60 text-purple-100 border border-purple-400/40'
                  : 'bg-slate-100 text-slate-600 border border-slate-200/80'
              }`}
            >
              NIFTY 500
            </span>
          </button>

          {/* Tab 3: Trading Dashboard */}
          <button
            type="button"
            id="tab-trading"
            onClick={() => setPlatformTab('trading')}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              platformTab === 'trading'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/30 ring-1 ring-emerald-400'
                : 'bg-white/90 hover:bg-white text-slate-700 hover:text-slate-950 border border-slate-200/90 shadow-2xs'
            }`}
          >
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span>Trading</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono font-bold ${
                platformTab === 'trading'
                  ? 'bg-emerald-900/60 text-emerald-100 border border-emerald-400/40'
                  : 'bg-slate-100 text-slate-600 border border-slate-200/80'
              }`}
            >
              PAPER / LIVE
            </span>
          </button>

          {/* Tab 4: Smart Money Trail */}
          <button
            type="button"
            id="tab-smart-money"
            onClick={() => setPlatformTab('smart_money')}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              platformTab === 'smart_money'
                ? 'bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 text-slate-950 font-bold shadow-md shadow-amber-500/30 ring-1 ring-amber-300'
                : 'bg-white/90 hover:bg-white text-slate-700 hover:text-slate-950 border border-slate-200/90 shadow-2xs'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-500" />
            <span>Smart Money</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono font-bold ${
                platformTab === 'smart_money'
                  ? 'bg-slate-950 text-amber-300 border border-amber-400/50'
                  : 'bg-slate-100 text-slate-600 border border-slate-200/80'
              }`}
            >
              RADAR
            </span>
          </button>

          {/* Tab 5: Server Logs */}
          <button
            type="button"
            id="tab-server-logs"
            onClick={() => setPlatformTab('logs')}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              platformTab === 'logs'
                ? 'bg-gradient-to-r from-slate-800 to-slate-950 text-amber-300 shadow-md shadow-slate-900/35 ring-1 ring-amber-500/50'
                : 'bg-white/90 hover:bg-white text-slate-700 hover:text-slate-950 border border-slate-200/90 shadow-2xs'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 shrink-0" />
            <span>Logs</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono font-bold ${
                platformTab === 'logs'
                  ? 'bg-amber-400/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-100 text-slate-600 border border-slate-200/80'
              }`}
            >
              SERVER
            </span>
          </button>
        </div>

        {/* Header Right: Audio Chimes, Push Notifications, Token Active Button & Theme Toggle */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 ml-auto xl:ml-0">
          {/* Audio Chimes Toggle */}
          <button
            type="button"
            id="btn-toggle-sound"
            onClick={() => {
              const next = soundAlerts.toggle();
              setSoundEnabled(next);
            }}
            className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center shrink-0 ${
              soundEnabled
                ? 'bg-amber-50 border-amber-300/80 text-amber-800 hover:bg-amber-100 shadow-2xs'
                : 'bg-slate-100 border-slate-300 text-slate-400 hover:text-slate-600'
            }`}
            title={soundEnabled ? 'Synthesized Audio Chimes: Enabled (Click to Mute)' : 'Audio Muted (Click to Unmute)'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-amber-600" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          {/* Desktop Push Notification Permission */}
          <button
            type="button"
            id="btn-toggle-notifications"
            onClick={async () => {
              const ok = await requestDesktopNotificationPermission();
              setNotificationsGranted(ok);
              if (ok) {
                sendDesktopNotification('AdwiKetan Trading Desk Alerts', {
                  body: 'Desktop notifications active for institutional footprints & high-win swing setups.',
                });
                soundAlerts.playOrderSuccessChime();
              }
            }}
            className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center shrink-0 ${
              notificationsGranted
                ? 'bg-sky-50 border-sky-300/80 text-sky-800 hover:bg-sky-100 shadow-2xs'
                : 'bg-slate-100 border-slate-300 text-slate-400 hover:text-slate-600'
            }`}
            title={notificationsGranted ? 'Desktop Push Notifications: Active' : 'Click to Enable Desktop Push Notifications'}
          >
            {notificationsGranted ? <BellRing className="w-3.5 h-3.5 text-sky-600" /> : <Bell className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          {/* Fyers Auth / Token Button */}
          <button
            id="btn-fyers-auth"
            onClick={() => {
              fetchAuthConfig();
              fetchTokenHealth();
              setIsTokenModalOpen(true);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer shadow-xs ${
              tokenHealth?.expired
                ? 'bg-rose-50 text-rose-800 border border-rose-400 hover:bg-rose-100 animate-pulse'
                : tokenHealth?.expiringSoon
                ? 'bg-amber-50 text-amber-900 border border-amber-400 hover:bg-amber-100 animate-pulse'
                : authConfig?.hasToken
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 hover:border-emerald-400'
                : 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 animate-pulse'
            }`}
            title={tokenHealth?.message || 'Generate or update daily FYERS access token'}
          >
            <Key className={`w-3.5 h-3.5 ${tokenHealth?.expired ? 'text-rose-600' : 'text-current'}`} />
            <span className="text-[11px]">
              {tokenHealth?.expired
                ? 'Token Expired'
                : tokenHealth?.expiringSoon
                ? `Expires in ${tokenHealth.minutesRemaining}m`
                : authConfig?.hasToken
                ? 'Token Active'
                : 'Generate Token'}
            </span>
          </button>

          {/* 2-Way Theme Toggle Switch */}
          <div className="web2-badge p-1 rounded-xl flex items-center gap-1 bg-white/90 shadow-inner border border-sky-200/60">
            <button
              type="button"
              id="btn-theme-emerald"
              onClick={() => handleThemeChange('emerald')}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${theme === 'emerald'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              title="Emerald Theme"
              aria-label="Emerald Theme"
            >
              <span className="w-3 h-3 rounded-full bg-emerald-400 border border-white/50" />
            </button>
            <button
              type="button"
              id="btn-theme-sky"
              onClick={() => handleThemeChange('sky')}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${theme === 'sky'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              title="Sky Theme"
              aria-label="Sky Theme"
            >
              <span className="w-3 h-3 rounded-full bg-sky-400 border border-white/50" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area - Full Screen Layout */}
      <main className="flex-1 w-full max-w-none px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col gap-6">

        {platformTab === 'monitor' && (
          <>

            {/* Top Control Bar with Primary Run / Stop / CSV Download Buttons & Live Stats on Top Right */}
            <section className={`web2-card rounded-2xl md:rounded-3xl px-4 py-3 sm:px-5 sm:py-3.5 flex items-center gap-2.5 sm:gap-3 flex-wrap relative transition-all ${isDropdownOpen || isBankNiftyOpen || isNiftyFuturesOpen ? 'z-50' : 'z-20'
              }`}>

              {/* Granularity Dropdown (Left of Run) */}
              <div className="flex items-center gap-1.5 bg-white/90 border border-sky-200/80 rounded-xl px-3 py-2 shadow-xs">
                <Clock className="w-3.5 h-3.5 text-sky-600" />
                <span className="text-[10px] font-bold text-sky-900 uppercase font-mono tracking-wider">
                  Timeframe:
                </span>
                <select
                  id="select-granularity"
                  value={granularity}
                  onChange={(e) => setGranularity(e.target.value as 'live' | '1s' | '1m')}
                  disabled={isRunning}
                  className={`bg-transparent text-xs font-mono font-bold text-sky-950 focus:outline-none cursor-pointer ${isRunning ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                >
                  <option value="live">Live (Tick-by-Tick)</option>
                  <option value="1s">1-Second Bars</option>
                  <option value="1m">1-Minute Bars</option>
                </select>
              </div>

              {/* Run Button */}
              <button
                id="btn-run"
                onClick={handleStart}
                disabled={isRunning}
                className={`flex-none flex items-center justify-center gap-1.5 px-4 sm:px-5 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all ${isRunning
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                  : 'glossy-btn-emerald text-white cursor-pointer'
                  }`}
              >
                <Play className="w-4 h-4 fill-current drop-shadow-sm" />
                <span>Run</span>
              </button>

              {/* Stop Button */}
              <button
                id="btn-stop"
                onClick={handleStop}
                disabled={!isRunning}
                className={`flex-none flex items-center justify-center gap-1.5 px-4 sm:px-5 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all ${!isRunning
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                  : 'glossy-btn-rose text-white cursor-pointer'
                  }`}
              >
                <Square className="w-4 h-4 fill-current drop-shadow-sm" />
                <span>Stop</span>
              </button>

              {/* Download Dropdown Button */}
              <div className="relative" ref={downloadMenuRef}>
                <button
                  id="btn-download-menu"
                  onClick={() => setDownloadMenuOpen(!downloadMenuOpen)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs transition-all glossy-btn-cyan text-white cursor-pointer hover:brightness-105"
                  title="Download recorded prices as XLSX"
                >
                  {downloadSuccess ? (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      <span>Downloaded!</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Download</span>
                      {(dbStats?.totalRows ?? 0) > 0 && (
                        <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-white/30 text-white text-[10px] font-mono font-extrabold">
                          {dbStats!.totalRows.toLocaleString()}
                        </span>
                      )}
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${downloadMenuOpen ? 'rotate-180' : ''}`} />
                    </>
                  )}
                </button>

                {/* Download Format Popover Menu */}
                {downloadMenuOpen && (
                  <div className="absolute left-0 mt-2 z-50 w-80 web2-card p-2.5 rounded-2xl shadow-2xl border border-sky-300/90 bg-white/98 backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-3 py-1.5 text-[10px] uppercase font-mono tracking-wider font-bold text-sky-800 border-b border-sky-100 mb-1 flex items-center justify-between">
                      <span>Current Session Export</span>
                      {dbStats && (
                        <span className="text-[10px] font-mono text-sky-600 lowercase font-medium">
                          {dbStats.totalRows.toLocaleString()} rows
                        </span>
                      )}
                    </div>

                    {/* Full DB export */}
                    <button
                      onClick={() => handleDownloadFromDb()}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-emerald-50 text-emerald-950 transition-colors cursor-pointer group"
                    >
                      <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-xs">Active Session DB (.xlsx)</div>
                        <div className="text-[10px] text-emerald-700 font-mono">
                          {dbStats ? `${dbStats.totalRows.toLocaleString()} rows in SQLite` : 'All ticks from SQLite'}
                        </div>
                      </div>
                    </button>

                    {/* Session CSV */}
                    <button
                      onClick={handleDownloadCsv}
                      disabled={csvRecords.length === 0}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors group ${csvRecords.length === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-sky-50 text-sky-950 cursor-pointer'
                        }`}
                    >
                      <div className="p-2 rounded-lg bg-sky-100 text-sky-700 group-hover:bg-sky-600 group-hover:text-white transition-colors">
                        <FileCode2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-xs">Session CSV (.csv)</div>
                        <div className="text-[10px] text-sky-700 font-mono">{csvRecords.length} rows recorded</div>
                      </div>
                    </button>

                    {/* Session Excel */}
                    <button
                      onClick={handleDownloadExcel}
                      disabled={csvRecords.length === 0}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors group ${csvRecords.length === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-violet-50 text-violet-950 cursor-pointer'
                        }`}
                    >
                      <div className="p-2 rounded-lg bg-violet-100 text-violet-700 group-hover:bg-violet-600 group-hover:text-white transition-colors">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-xs">Session Excel (.xlsx)</div>
                        <div className="text-[10px] text-violet-700 font-mono">{csvRecords.length} rows recorded</div>
                      </div>
                    </button>

                    {/* Past Session Backups Section */}
                    <div className="border-t border-sky-100 mt-2 pt-2">
                      <div className="px-3 py-1 flex items-center justify-between text-[10px] uppercase font-mono tracking-wider font-bold text-amber-900 mb-1.5">
                        <span className="flex items-center gap-1.5">
                          <Archive className="w-3.5 h-3.5 text-amber-600" />
                          <span>Past Session Backups</span>
                        </span>
                        <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[10px] font-mono font-bold">
                          {backups.length}
                        </span>
                      </div>

                      {backups.length === 0 ? (
                        <div className="px-3 py-2 text-[11px] text-slate-400 italic">
                          No past session backups yet. Previous data is automatically backed up when a new session starts.
                        </div>
                      ) : (
                        <div className="max-h-52 overflow-y-auto space-y-1.5 p-1 font-sans">
                          {backups.slice(0, 4).map((b) => (
                            <div key={b.id} className="p-2 rounded-xl bg-amber-50/60 border border-amber-200/80 hover:bg-amber-100/50 transition-colors">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-amber-600" />
                                  <span>{b.timestamp}</span>
                                </span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-200/70 text-amber-900 font-extrabold">
                                  {b.totalTicks.toLocaleString()} ticks
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1.5">
                                {b.xlsxFile && (
                                  <button
                                    onClick={() => handleDownloadBackupFile(b.xlsxFile)}
                                    className="px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                    title={`Download ${b.xlsxFile}`}
                                  >
                                    <FileSpreadsheet className="w-3 h-3 text-emerald-700" />
                                    <span>XLSX</span>
                                  </button>
                                )}
                                {b.dbFile && (
                                  <button
                                    onClick={() => handleDownloadBackupFile(b.dbFile)}
                                    className="px-2 py-0.5 rounded bg-blue-100 hover:bg-blue-200 text-blue-800 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                    title={`Download ${b.dbFile}`}
                                  >
                                    <Database className="w-3 h-3 text-blue-700" />
                                    <span>DB</span>
                                  </button>
                                )}
                                {b.csvFile && (
                                  <button
                                    onClick={() => handleDownloadBackupFile(b.csvFile)}
                                    className="px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                    title={`Download ${b.csvFile}`}
                                  >
                                    <FileCode2 className="w-3 h-3 text-slate-700" />
                                    <span>CSV</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}

                          <div className="pt-2 border-t border-slate-100 mt-1 flex flex-col gap-1.5">
                            {backups.length > 3 && (
                              <button
                                onClick={() => {
                                  setDownloadMenuOpen(false);
                                  setShowBackupsModal(true);
                                }}
                                className="w-full py-1 text-center text-xs font-bold text-amber-700 hover:text-amber-800 hover:underline cursor-pointer flex items-center justify-center gap-1"
                              >
                                <span>View all {backups.length} archived sessions →</span>
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setDownloadMenuOpen(false);
                                fetchSqliteStats();
                                setShowBackupsModal(true);
                              }}
                              className="w-full py-1.5 px-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-between cursor-pointer transition-colors shadow-2xs"
                            >
                              <div className="flex items-center gap-1.5">
                                <Database className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Database Health & Auto-Pruner</span>
                              </div>
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-200/70 text-indigo-900 font-bold">
                                {sqliteStats ? `${sqliteStats.dbSizeMB} MB` : 'Manage'}
                              </span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Subtle Divider */}
              <div className="h-7 w-px bg-sky-200/80 hidden xl:block mx-1"></div>

              {/* Nifty 500 Dropdown & Controls */}
              <div className="flex flex-wrap items-center gap-2 text-xs relative z-50" ref={dropdownRef}>
                <span className="text-sky-950 font-bold flex items-center gap-1.5 mr-0.5">
                  <Layers className="w-4 h-4 text-sky-600" />
                  <span>Nifty 500:</span>
                </span>

                {/* Nifty 500 Toggle Button */}
                <button
                  type="button"
                  id="btn-nifty500-dropdown"
                  onClick={() => !isRunning && setIsDropdownOpen(!isDropdownOpen)}
                  disabled={isRunning}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all web2-badge shadow-sm hover:brightness-105 cursor-pointer ${isRunning ? 'opacity-70 cursor-not-allowed' : ''
                    }`}
                >
                  <span className="text-sky-950">
                    {selectedNifty500Count === NIFTY_500_SYMBOLS.length
                      ? 'All Nifty 500 Selected'
                      : selectedNifty500Count === 0
                        ? 'Select Nifty 500'
                        : `${selectedNifty500Count} / 500 Selected`}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full bg-sky-200/70 text-sky-950 text-[10px] font-mono">
                    {selectedNifty500Count}
                  </span>
                  {isDropdownOpen ? (
                    <ChevronUp className="w-3.5 h-3.5 text-sky-700" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-sky-700" />
                  )}
                </button>

                {/* Expanded Nifty 500 Dropdown Modal */}
                {isDropdownOpen && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) setIsDropdownOpen(false);
                    }}
                  >
                    <div
                      className="relative w-full sm:w-[560px] md:w-[640px] max-h-[85vh] flex flex-col web2-card p-5 sm:p-6 rounded-3xl shadow-2xl border border-sky-300/90 bg-white/98 backdrop-blur-2xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Modal Header */}
                      <div className="flex items-center justify-between pb-3 mb-3 border-b border-sky-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-2xl bg-sky-100 border border-sky-200 flex items-center justify-center text-sky-600 shadow-xs">
                            <Layers className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm text-sky-950 leading-tight">
                              Select Nifty 500 Equities
                            </h3>
                            <p className="text-[11px] text-slate-500">
                              Choose stocks across sectors to monitor live
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsDropdownOpen(false)}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Search Bar & Clear Search */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 text-sky-500 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search Nifty 500 (e.g., RELIANCE, TCS, Bank, Tata)..."
                            className="w-full pl-9 pr-8 py-2 rounded-xl bg-sky-50/80 border border-sky-200 text-xs font-medium text-sky-950 placeholder:text-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
                          />
                          {searchQuery && (
                            <button
                              onClick={() => setSearchQuery('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sky-400 hover:text-sky-700 p-0.5"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Sector Filter Dropdown */}
                        <select
                          value={selectedSector}
                          onChange={(e) => setSelectedSector(e.target.value)}
                          className="px-2.5 py-2 rounded-xl bg-sky-50/80 border border-sky-200 text-xs font-semibold text-sky-900 focus:outline-none focus:ring-2 focus:ring-sky-400 cursor-pointer"
                        >
                          <option value="ALL">All Sectors</option>
                          {availableSectors.map(sec => (
                            <option key={sec} value={sec}>{sec}</option>
                          ))}
                        </select>
                      </div>

                      {/* Quick Select All, Unselect All & Presets */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2 border-b border-sky-100 text-[11px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            id="btn-select-all-nifty500"
                            onClick={handleSelectAllNifty500}
                            disabled={isRunning}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold glossy-btn-cyan text-white shadow-xs cursor-pointer hover:opacity-95"
                            title="Select all Nifty 500 symbols"
                          >
                            <CheckSquare className="w-3.5 h-3.5 text-white" />
                            <span>Select All</span>
                          </button>

                          <button
                            type="button"
                            id="btn-unselect-all-nifty500"
                            onClick={handleUnselectAllNifty500}
                            disabled={isRunning}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 cursor-pointer"
                            title="Unselect all Nifty 500 symbols"
                          >
                            <XCircle className="w-3.5 h-3.5 text-rose-500" />
                            <span>Unselect All</span>
                          </button>

                          <div className="h-4 w-px bg-sky-200 mx-0.5"></div>

                          <span className="font-bold text-sky-900">Presets:</span>
                          <button
                            onClick={() => handleSelectPreset('TOP_5')}
                            className="px-2 py-0.5 rounded-lg bg-emerald-100/80 hover:bg-emerald-200 text-emerald-950 font-bold border border-emerald-300/80 cursor-pointer"
                          >
                            Top 5
                          </button>
                          <button
                            onClick={() => handleSelectPreset('TOP_10')}
                            className="px-2 py-0.5 rounded-lg bg-emerald-100/80 hover:bg-emerald-200 text-emerald-950 font-bold border border-emerald-300/80 cursor-pointer"
                          >
                            Top 10
                          </button>
                          <button
                            onClick={() => handleSelectPreset('TOP_20')}
                            className="px-2 py-0.5 rounded-lg bg-emerald-100/80 hover:bg-emerald-200 text-emerald-950 font-bold border border-emerald-300/80 cursor-pointer"
                          >
                            Top 20
                          </button>
                          <button
                            onClick={() => handleSelectPreset('NIFTY_50')}
                            className="px-2 py-0.5 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-900 font-semibold cursor-pointer"
                          >
                            Nifty 50
                          </button>
                          <button
                            onClick={() => handleSelectPreset('TOP_100')}
                            className="px-2 py-0.5 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-900 font-semibold cursor-pointer"
                          >
                            Top 100
                          </button>
                          <button
                            onClick={() => handleSelectPreset('BANKING')}
                            className="px-2 py-0.5 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-900 font-semibold cursor-pointer"
                          >
                            Banking
                          </button>
                          <button
                            onClick={() => handleSelectPreset('IT')}
                            className="px-2 py-0.5 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-900 font-semibold cursor-pointer"
                          >
                            IT
                          </button>
                        </div>

                        <span className="text-[11px] font-mono text-sky-700 font-semibold">
                          {filteredStockList.length} matches
                        </span>
                      </div>

                      {/* Scrollable Symbol List with Select Boxes */}
                      <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 text-xs">
                        {filteredStockList.length === 0 ? (
                          <div className="p-6 text-center text-sky-600 font-medium text-xs">
                            No symbols match "{searchQuery}"
                          </div>
                        ) : (
                          filteredStockList.map((stock, idx) => {
                            const isChecked = selectedNifty500Symbols.includes(stock.symbol);
                            return (
                              <div
                                key={`${stock.symbol}-${idx}`}
                                onClick={() => toggleNifty500Symbol(stock.symbol)}
                                className={`flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer select-none border ${isChecked
                                  ? 'bg-sky-100/80 border-sky-300/80 text-sky-950 font-semibold shadow-xs'
                                  : 'bg-white/60 hover:bg-sky-50/80 border-sky-100/60 text-slate-700'
                                  }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => { }} // handled by parent div onClick
                                    className="w-4 h-4 rounded border-sky-300 text-sky-600 focus:ring-sky-400 cursor-pointer accent-sky-600"
                                  />
                                  <span className="font-mono font-bold text-sky-950 text-xs w-28 shrink-0">
                                    {stock.ticker}
                                  </span>
                                  <span className="truncate text-sky-900 text-[11px]">
                                    {stock.name}
                                  </span>
                                </div>

                                {stock.sector && (
                                  <span className="text-[10px] font-medium text-sky-700 bg-sky-200/50 px-2 py-0.5 rounded-md shrink-0 ml-2">
                                    {stock.sector}
                                  </span>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Dropdown Footer */}
                      <div className="mt-4 pt-3 border-t border-sky-100 flex items-center justify-between text-xs">
                        <span className="font-semibold text-sky-950">
                          {selectedNifty500Count} of {NIFTY_500_SYMBOLS.length} Nifty 500 Selected
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsDropdownOpen(false)}
                          className="glossy-btn-cyan text-white px-5 py-2 rounded-xl font-bold text-xs cursor-pointer shadow-xs transition-all"
                        >
                          Done
                        </button>
                      </div>

                    </div>
                  </div>
                )}
              </div>

              {/* Bank Nifty Dropdown & Separate Controls */}
              <div className="flex flex-wrap items-center gap-2.5 text-xs relative z-50" ref={bankNiftyRef}>
                <span className="text-sky-950 font-bold flex items-center gap-1.5 mr-0.5">
                  <Landmark className="w-4 h-4 text-emerald-600" />
                  <span>Bank Nifty:</span>
                </span>

                {/* Bank Nifty Toggle Button */}
                <button
                  type="button"
                  id="btn-banknifty-dropdown"
                  onClick={() => !isRunning && setIsBankNiftyOpen(!isBankNiftyOpen)}
                  disabled={isRunning}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all web2-badge shadow-sm hover:brightness-105 cursor-pointer ${isRunning ? 'opacity-70 cursor-not-allowed' : ''
                    }`}
                >
                  <span className="text-sky-950">
                    {selectedBankNiftyCount === BANK_NIFTY_SYMBOLS.length
                      ? 'All Bank Nifty Selected'
                      : selectedBankNiftyCount === 0
                        ? 'Select Bank Nifty'
                        : `${selectedBankNiftyCount} / ${BANK_NIFTY_SYMBOLS.length} Selected`}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-950 text-[10px] font-mono border border-emerald-300/80">
                    {selectedBankNiftyCount}
                  </span>
                  {isBankNiftyOpen ? (
                    <ChevronUp className="w-3.5 h-3.5 text-sky-700" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-sky-700" />
                  )}
                </button>

                {/* Expanded Bank Nifty Dropdown Modal */}
                {isBankNiftyOpen && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) setIsBankNiftyOpen(false);
                    }}
                  >
                    <div
                      className="relative w-full sm:w-[560px] md:w-[640px] max-h-[85vh] flex flex-col web2-card p-5 sm:p-6 rounded-3xl shadow-2xl border border-emerald-300/90 bg-white/98 backdrop-blur-2xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Modal Header */}
                      <div className="flex items-center justify-between pb-3 mb-3 border-b border-emerald-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-2xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-xs">
                            <Landmark className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm text-emerald-950 leading-tight">
                              Select Bank Nifty Contracts
                            </h3>
                            <p className="text-[11px] text-slate-500">
                              Core banking constituents and index contracts
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsBankNiftyOpen(false)}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Search Bar & Clear Search */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={bankNiftyQuery}
                            onChange={(e) => setBankNiftyQuery(e.target.value)}
                            placeholder="Search Bank Nifty (e.g. NIFTYBANK, HDFCBANK, FUT, 50000CE)..."
                            className="w-full pl-9 pr-8 py-2 rounded-xl bg-emerald-50/60 border border-emerald-200 text-xs font-medium text-sky-950 placeholder:text-sky-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          />
                          {bankNiftyQuery && (
                            <button
                              onClick={() => setBankNiftyQuery('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sky-400 hover:text-sky-700 p-0.5"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Sector Filter Dropdown */}
                        <select
                          value={bankNiftySector}
                          onChange={(e) => setBankNiftySector(e.target.value)}
                          className="px-2.5 py-2 rounded-xl bg-emerald-50/60 border border-emerald-200 text-xs font-semibold text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
                        >
                          <option value="ALL">All Categories</option>
                          {availableBankNiftySectors.map(sec => (
                            <option key={sec} value={sec}>{sec}</option>
                          ))}
                        </select>
                      </div>

                      {/* Info & Dedicated Buttons Header */}
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-100 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            id="btn-select-all-banknifty"
                            onClick={handleSelectAllBankNifty}
                            disabled={isRunning}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer"
                            title="Select all Bank Nifty symbols"
                          >
                            <CheckSquare className="w-3.5 h-3.5 text-white" />
                            <span>Select All</span>
                          </button>

                          <button
                            type="button"
                            id="btn-unselect-all-banknifty"
                            onClick={handleUnselectAllBankNifty}
                            disabled={isRunning}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 cursor-pointer"
                            title="Unselect all Bank Nifty symbols"
                          >
                            <XCircle className="w-3.5 h-3.5 text-rose-500" />
                            <span>Unselect All</span>
                          </button>
                        </div>

                        <span className="font-mono text-emerald-800 font-bold">{filteredBankNiftyList.length} items</span>
                      </div>

                      {/* Scrollable List */}
                      <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 text-xs">
                        {filteredBankNiftyList.length === 0 ? (
                          <div className="p-6 text-center text-sky-600 font-medium text-xs">
                            No Bank Nifty symbols match "{bankNiftyQuery}"
                          </div>
                        ) : (
                          filteredBankNiftyList.map((stock, idx) => {
                            const isChecked = selectedBankNiftySymbols.includes(stock.symbol);
                            return (
                              <div
                                key={`${stock.symbol}-${idx}`}
                                onClick={() => toggleBankNiftySymbol(stock.symbol)}
                                className={`flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer select-none border ${isChecked
                                  ? 'bg-emerald-100/80 border-emerald-300/80 text-emerald-950 font-semibold shadow-xs'
                                  : 'bg-white/60 hover:bg-emerald-50/80 border-sky-100/60 text-slate-700'
                                  }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => { }}
                                    className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-400 cursor-pointer accent-emerald-600"
                                  />
                                  <span className="font-mono font-bold text-sky-950 text-xs w-36 shrink-0">
                                    {stock.ticker}
                                  </span>
                                  <span className="truncate text-sky-900 text-[11px]">
                                    {stock.name}
                                  </span>
                                </div>

                                {stock.sector && (
                                  <span className="text-[10px] font-medium text-emerald-800 bg-emerald-200/60 px-2 py-0.5 rounded-md shrink-0 ml-2">
                                    {stock.sector}
                                  </span>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Dropdown Footer */}
                      <div className="mt-4 pt-3 border-t border-emerald-100 flex items-center justify-between text-xs">
                        <span className="font-semibold text-sky-950">
                          {selectedBankNiftyCount} of {BANK_NIFTY_SYMBOLS.length} Bank Nifty Selected
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsBankNiftyOpen(false)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl font-bold text-xs cursor-pointer shadow-xs transition-all"
                        >
                          Done
                        </button>
                      </div>

                    </div>
                  </div>
                )}
              </div>

              {/* Nifty Futures Dropdown & Controls */}
              <div className="flex flex-wrap items-center gap-2 text-xs relative z-50" ref={niftyFuturesRef}>
                <span className="text-sky-950 font-bold flex items-center gap-1.5 mr-0.5">
                  <TrendingUp className="w-4 h-4 text-purple-600" />
                  <span>Futures:</span>
                </span>

                {/* Nifty Futures Toggle Button */}
                <button
                  type="button"
                  id="btn-niftyfutures-dropdown"
                  onClick={() => !isRunning && setIsNiftyFuturesOpen(!isNiftyFuturesOpen)}
                  disabled={isRunning}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all web2-badge shadow-sm hover:brightness-105 cursor-pointer border-purple-200/80 bg-purple-50/50 ${isRunning ? 'opacity-70 cursor-not-allowed' : ''
                    }`}
                >
                  <span className="text-purple-950">
                    {selectedNiftyFuturesCount === NIFTY_FUTURES_SYMBOLS.length
                      ? 'All Futures Selected'
                      : selectedNiftyFuturesCount === 0
                        ? 'Select Futures'
                        : `${selectedNiftyFuturesCount} / ${NIFTY_FUTURES_SYMBOLS.length} Selected`}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full bg-purple-200 text-purple-950 text-[10px] font-mono font-extrabold">
                    {selectedNiftyFuturesCount}
                  </span>
                  {isNiftyFuturesOpen ? (
                    <ChevronUp className="w-3.5 h-3.5 text-purple-700" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-purple-700" />
                  )}
                </button>

                {/* Expanded Nifty Futures Dropdown Modal */}
                {isNiftyFuturesOpen && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) setIsNiftyFuturesOpen(false);
                    }}
                  >
                    <div
                      className="relative w-full sm:w-[560px] md:w-[640px] max-h-[85vh] flex flex-col web2-card p-5 sm:p-6 rounded-3xl shadow-2xl border border-purple-300/90 bg-white/98 backdrop-blur-2xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Modal Header */}
                      <div className="flex items-center justify-between pb-3 mb-3 border-b border-purple-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-2xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-600 shadow-xs">
                            <TrendingUp className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm text-purple-950 leading-tight">
                              Select Nifty & Bank Nifty Futures
                            </h3>
                            <p className="text-[11px] text-slate-500">
                              Real-time index and stock derivative contracts
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsNiftyFuturesOpen(false)}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Search Bar & Clear Search */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 text-purple-600 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={niftyFuturesQuery}
                            onChange={(e) => setNiftyFuturesQuery(e.target.value)}
                            placeholder="Search Futures (e.g. NIFTY, SEP, BANKNIFTY, RELIANCE)..."
                            className="w-full pl-9 pr-8 py-2 rounded-xl bg-purple-50/60 border border-purple-200 text-xs font-medium text-sky-950 placeholder:text-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400"
                          />
                          {niftyFuturesQuery && (
                            <button
                              onClick={() => setNiftyFuturesQuery('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-purple-400 hover:text-purple-700 p-0.5"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Category Filter Dropdown */}
                        <select
                          value={niftyFuturesSector}
                          onChange={(e) => setNiftyFuturesSector(e.target.value)}
                          className="px-2.5 py-2 rounded-xl bg-purple-50/60 border border-purple-200 text-xs font-semibold text-purple-950 focus:outline-none focus:ring-2 focus:ring-purple-400 cursor-pointer"
                        >
                          <option value="ALL">All Categories</option>
                          {availableNiftyFuturesSectors.map(sec => (
                            <option key={sec} value={sec}>{sec}</option>
                          ))}
                        </select>
                      </div>

                      {/* Presets & Selection Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-purple-100 text-[11px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            id="btn-select-all-niftyfutures"
                            onClick={handleSelectAllNiftyFutures}
                            disabled={isRunning}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs cursor-pointer"
                            title="Select all futures symbols"
                          >
                            <CheckSquare className="w-3.5 h-3.5 text-white" />
                            <span>Select All</span>
                          </button>

                          <button
                            type="button"
                            id="btn-unselect-all-niftyfutures"
                            onClick={handleUnselectAllNiftyFutures}
                            disabled={isRunning}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 cursor-pointer"
                            title="Unselect all futures symbols"
                          >
                            <XCircle className="w-3.5 h-3.5 text-rose-500" />
                            <span>Unselect All</span>
                          </button>

                          <div className="h-4 w-px bg-purple-200 mx-0.5"></div>

                          <button
                            type="button"
                            onClick={() => handleSelectFuturesPreset('INDEX')}
                            className="px-2 py-0.5 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-950 font-bold border border-purple-300/80 cursor-pointer"
                          >
                            Index Futures
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectFuturesPreset('STOCK')}
                            className="px-2 py-0.5 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-950 font-bold border border-purple-300/80 cursor-pointer"
                          >
                            Stock Futures
                          </button>
                        </div>

                        <span className="font-mono text-purple-800 font-bold">{filteredNiftyFuturesList.length} items</span>
                      </div>

                      {/* Scrollable List */}
                      <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 text-xs">
                        {filteredNiftyFuturesList.length === 0 ? (
                          <div className="p-6 text-center text-purple-600 font-medium text-xs">
                            No futures contracts match "{niftyFuturesQuery}"
                          </div>
                        ) : (
                          filteredNiftyFuturesList.map((stock, idx) => {
                            const isChecked = selectedNiftyFuturesSymbols.includes(stock.symbol);
                            return (
                              <div
                                key={`${stock.symbol}-${idx}`}
                                onClick={() => toggleNiftyFuturesSymbol(stock.symbol)}
                                className={`flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer select-none border ${isChecked
                                  ? 'bg-purple-100/80 border-purple-300/80 text-purple-950 font-semibold shadow-xs'
                                  : 'bg-white/60 hover:bg-purple-50/80 border-purple-100/60 text-slate-700'
                                  }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => { }}
                                    className="w-4 h-4 rounded border-purple-300 text-purple-600 focus:ring-purple-400 cursor-pointer accent-purple-600"
                                  />
                                  <span className="font-mono font-bold text-sky-950 text-xs w-44 shrink-0">
                                    {stock.ticker}
                                  </span>
                                  <span className="truncate text-sky-900 text-[11px]">
                                    {stock.name}
                                  </span>
                                </div>

                                {stock.sector && (
                                  <span className="text-[10px] font-medium text-purple-800 bg-purple-200/60 px-2 py-0.5 rounded-md shrink-0 ml-2">
                                    {stock.sector}
                                  </span>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Dropdown Footer */}
                      <div className="mt-4 pt-3 border-t border-purple-100 flex items-center justify-between text-xs">
                        <span className="font-semibold text-sky-950">
                          {selectedNiftyFuturesCount} of {NIFTY_FUTURES_SYMBOLS.length} Futures Selected
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsNiftyFuturesOpen(false)}
                          className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-xl font-bold text-xs cursor-pointer shadow-xs transition-all"
                        >
                          Done
                        </button>
                      </div>

                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Live Market Snapshot Cards */}
            {Object.keys(snapshots).length > 0 && (
              <div className="space-y-2">
                {selectedSymbols.length > 24 && (
                  <div className="flex items-center justify-between px-3.5 py-2 rounded-xl web2-card text-xs text-sky-900 font-medium">
                    <span>Displaying top 24 snapshot cards out of <strong>{selectedSymbols.length}</strong> active symbols.</span>
                    <span className="text-[11px] font-mono text-sky-700">All {selectedSymbols.length} symbols streaming live & recording to CSV Logger</span>
                  </div>
                )}
                <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                  {selectedSymbols.slice(0, 24).map((sym, idx) => {
                    const snap = snapshots[sym];
                    if (!snap) return null;
                    const isPositive = snap.change >= 0;
                    const priceChanged = snap.prevLtp !== undefined && snap.ltp !== snap.prevLtp;
                    const isUp = snap.prevLtp !== undefined && snap.ltp > snap.prevLtp;

                    return (
                      <div
                        key={`${sym}-${idx}`}
                        className={`web2-card p-4 rounded-2xl transition-all duration-300 ${priceChanged
                          ? isUp
                            ? 'ring-2 ring-emerald-400/80 bg-emerald-50/50'
                            : 'ring-2 ring-rose-400/80 bg-rose-50/50'
                          : ''
                          }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-mono font-bold text-sky-950 text-xs tracking-tight">
                            {sym}
                          </span>
                          <span className="text-[10px] font-mono text-sky-700/80">
                            {snap.date ? `${snap.date} ${snap.time || snap.lastUpdated}` : snap.lastUpdated}
                          </span>
                        </div>

                        <div className="flex items-baseline justify-between mb-2">
                          <div className="text-2xl font-black font-mono text-sky-950 tracking-tight">
                            ₹{snap.ltp != null ? snap.ltp.toFixed(2) : '-'}
                          </div>
                          <div className={`flex items-center text-xs font-bold font-mono px-2 py-0.5 rounded-full ${isPositive
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-rose-100 text-rose-800 border border-rose-300'
                            }`}>
                            {isPositive ? <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> : <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />}
                            <span>{isPositive ? '+' : ''}{snap.change != null ? snap.change.toFixed(2) : '-'}</span>
                            <span className="ml-1 opacity-90">({isPositive ? '+' : ''}{snap.pChange != null ? snap.pChange.toFixed(2) : '-'}%)</span>
                          </div>
                        </div>

                        {/* OHLC Bar */}
                        <div className="grid grid-cols-4 gap-1 p-1.5 rounded-xl bg-sky-50/80 border border-sky-100 text-[10px] font-mono text-sky-950 text-center mb-2">
                          <div>
                            <span className="text-sky-500 font-sans block text-[9px]">OPEN</span>
                            <span className="font-bold">{snap.open != null ? snap.open.toFixed(2) : '-'}</span>
                          </div>
                          <div>
                            <span className="text-emerald-600 font-sans block text-[9px]">HIGH</span>
                            <span className="font-bold">{snap.high != null ? snap.high.toFixed(2) : '-'}</span>
                          </div>
                          <div>
                            <span className="text-rose-500 font-sans block text-[9px]">LOW</span>
                            <span className="font-bold">{snap.low != null ? snap.low.toFixed(2) : '-'}</span>
                          </div>
                          <div>
                            <span className="text-sky-600 font-sans block text-[9px]">CLOSE</span>
                            <span className="font-bold">{snap.close != null ? snap.close.toFixed(2) : '-'}</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-sky-100 flex items-center justify-between text-[11px] text-sky-900 font-mono">
                          <span>Qty: <strong className="text-sky-950">{snap.quantity || '-'}</strong></span>
                          <span>Vol: <strong className="text-sky-950">{snap.volume != null ? snap.volume.toLocaleString() : '-'}</strong></span>
                          <span>Avg: <strong className="text-sky-950">{snap.average != null ? snap.average.toFixed(2) : '-'}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </section>
              </div>
            )}


            {/* Terminal & Live CSV Logger Data Table Section */}
            <section className="flex-1 flex flex-col web2-terminal rounded-2xl md:rounded-3xl overflow-hidden border border-sky-300/40 shadow-2xl bg-slate-950/90 text-slate-100">

              {/* Section Header with View Tabs */}
              <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3 select-none">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 mr-1">
                    <span className="w-3 h-3 rounded-full bg-rose-500 inline-block shadow-sm"></span>
                    <span className="w-3 h-3 rounded-full bg-amber-400 inline-block shadow-sm"></span>
                    <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block shadow-sm"></span>
                  </div>

                  {/* Tab Switcher */}
                  <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setActiveViewTab('terminal')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${activeViewTab === 'terminal'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                        }`}
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>Terminal Console</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveViewTab('csvTable')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${activeViewTab === 'csvTable'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                        }`}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>
                        {granularity === 'live' ? 'Live Ticks Table' : granularity === '1s' ? '1-Sec Bars Table' : '1-Min Bars Table'} ({csvRecords.length})
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  {activeViewTab === 'terminal' ? (
                    <>
                      <label className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer text-[11px]">
                        <input
                          type="checkbox"
                          checked={autoScroll}
                          onChange={(e) => setAutoScroll(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-sky-400 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                        />
                        <span>Auto-scroll</span>
                      </label>
                      <span className="text-slate-600">|</span>
                      <span className="font-mono text-[11px] text-sky-300">
                        {logs.length} log lines
                      </span>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        id="btn-clear-terminal"
                        onClick={handleClear}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-950/80 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-500/50 transition-all text-[11px] font-semibold cursor-pointer"
                        title="Clear terminal console output"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        <span>Clear</span>
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={csvSearch}
                          onChange={(e) => setCsvSearch(e.target.value)}
                          placeholder="Filter CSV rows..."
                          className="pl-8 pr-3 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400 w-44"
                        />
                      </div>
                      <div className="relative">
                        <button
                          onClick={() => setDownloadMenuOpen(!downloadMenuOpen)}
                          disabled={csvRecords.length === 0}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Export Data</span>
                          <ChevronDown className={`w-3 h-3 transition-transform ${downloadMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {downloadMenuOpen && (
                          <div className="absolute right-0 mt-2 z-50 w-56 web2-card p-1.5 rounded-xl shadow-2xl border border-slate-700 bg-slate-900 text-slate-100 animate-in fade-in slide-in-from-top-2 duration-150">
                            <button
                              onClick={handleDownloadCsv}
                              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-slate-800 text-slate-200 transition-colors text-xs font-medium cursor-pointer"
                            >
                              <FileCode2 className="w-4 h-4 text-sky-400" />
                              <span>Export as CSV (.csv)</span>
                            </button>
                            <button
                              onClick={handleDownloadExcel}
                              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-slate-800 text-slate-200 transition-colors text-xs font-medium cursor-pointer"
                            >
                              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                              <span>Export as Excel (.xlsx)</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Tab 1: Terminal Body */}
              {activeViewTab === 'terminal' ? (
                <div
                  id="terminal-output"
                  ref={terminalContainerRef}
                  onScroll={handleScroll}
                  className="flex-1 p-4 sm:p-5 font-mono text-xs sm:text-[13px] leading-relaxed overflow-y-auto max-h-[600px] min-h-[400px] bg-slate-950/90 text-slate-100 space-y-1"
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
                >
                  {logs.map((log) => {
                    if (log.type === 'system') {
                      return (
                        <div key={log.id} className="text-sky-300 whitespace-pre-wrap py-1 font-medium">
                          {log.rawText}
                        </div>
                      );
                    }

                    if (log.type === 'status') {
                      const isSuccess = log.rawText.includes('successful') || log.rawText.includes('Connected') || log.rawText.includes('saved') || log.rawText.includes('recorded');
                      const isWaiting = log.rawText.includes('Waiting') || log.rawText.includes('CSV logging active');
                      return (
                        <div key={log.id} className={`whitespace-pre-wrap ${isSuccess ? 'text-emerald-400 font-medium' :
                          isWaiting ? 'text-cyan-300' : 'text-slate-300'
                          }`}>
                          {log.rawText}
                        </div>
                      );
                    }

                    if (log.type === 'error') {
                      return (
                        <div key={log.id} className="text-rose-400 font-semibold whitespace-pre-wrap">
                          {log.rawText}
                        </div>
                      );
                    }

                    // Render Live Tick with formatted styling - showing Date, Time, Symbol, Open, High, Low, Close, LTP, Qty, Vol, Avg, Bid/Ask
                    if (log.type === 'tick') {
                      const isPositive = (log.change ?? 0) >= 0;
                      return (
                        <div key={log.id} className="flex flex-wrap items-baseline gap-x-2.5 py-0.5 hover:bg-slate-900/80 rounded px-1.5 -mx-1 transition-colors text-[12px]">
                          <span className="text-slate-400 select-none font-medium">
                            {log.date ? `${log.date} ${log.time || ''}` : log.timestamp}
                          </span>
                          <span className="text-slate-700 select-none">|</span>
                          <span className="text-sky-300 font-bold min-w-[140px]">
                            {log.symbol}
                          </span>
                          <span className="text-slate-700 select-none">|</span>
                          <span className="text-slate-300">
                            O:<span className="text-white font-medium">{log.open?.toFixed(2) ?? '-'}</span> H:<span className="text-emerald-300 font-medium">{log.high?.toFixed(2) ?? '-'}</span> L:<span className="text-rose-300 font-medium">{log.low?.toFixed(2) ?? '-'}</span> C:<span className="text-white font-medium">{log.close?.toFixed(2) ?? '-'}</span>
                          </span>
                          <span className="text-slate-700 select-none">|</span>
                          <span className={`font-bold min-w-[100px] ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            LTP: {log.ltp?.toFixed(2)}
                          </span>
                          <span className="text-slate-700 select-none">|</span>
                          <span className="text-cyan-300">
                            Qty: {log.quantity ?? '-'}
                          </span>
                          <span className="text-slate-700 select-none">|</span>
                          <span className="text-amber-300/90">
                            Vol: {log.volume?.toLocaleString() ?? '-'}
                          </span>
                          <span className="text-slate-700 select-none">|</span>
                          <span className="text-emerald-300/90">
                            Avg: {log.average?.toFixed(2) ?? '-'}
                          </span>
                          {log.bid != null && log.ask != null && (
                            <>
                              <span className="text-slate-700 select-none">|</span>
                              <span className="text-slate-400">
                                Bid: <span className="text-slate-200">{log.bid?.toFixed(2)}</span> / Ask: <span className="text-slate-200">{log.ask?.toFixed(2)}</span>
                              </span>
                            </>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div key={log.id} className="text-slate-300 whitespace-pre-wrap">
                        {log.rawText}
                      </div>
                    );
                  })}

                  {/* Active blinking terminal prompt */}
                  {isRunning && (
                    <div className="flex items-center gap-2 text-emerald-400 font-mono pt-2">
                      <span className="animate-pulse">❯</span>
                      <span className="text-sky-300 text-xs">streaming live ticks & writing to CSV...</span>
                      <span className="inline-block w-2 h-4 bg-emerald-400 animate-pulse" />
                    </div>
                  )}

                  <div ref={terminalEndRef} />
                </div>
              ) : (
                /* Tab 2: Live CSV Logger Data Table (Full Screen Width Grid) */
                <div className="flex-1 overflow-x-auto p-2 bg-slate-950/95 min-h-[400px] max-h-[600px]">
                  {csvRecords.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 space-y-2">
                      <FileSpreadsheet className="w-10 h-10 text-slate-600 animate-pulse" />
                      <p className="font-bold text-sm text-slate-300">No CSV records captured yet.</p>
                      <p className="text-xs text-slate-500">Click <strong>[Run]</strong> to start streaming ticks and recording market data into CSV format in real-time.</p>
                    </div>
                  ) : (
                    <div className="min-w-full inline-block align-middle">
                      <table className="w-full text-left font-mono text-xs text-slate-200 border-collapse">
                        <thead>
                          {granularity === 'live' ? (
                            <tr className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-800 text-[11px] uppercase tracking-wider sticky top-0 z-10">
                              <th className="py-2.5 px-3">Date</th>
                              <th className="py-2.5 px-3">Time</th>
                              <th className="py-2.5 px-3 text-sky-400">Symbol</th>
                              <th className="py-2.5 px-3 text-white">LTP</th>
                              <th className="py-2.5 px-3 text-cyan-300">Trade Qty / Vol</th>
                              <th className="py-2.5 px-3 text-amber-300">Trade Value (₹)</th>
                              <th className="py-2.5 px-3 text-slate-400">Bid</th>
                              <th className="py-2.5 px-3 text-slate-400">Ask</th>
                              <th className="py-2.5 px-3 text-slate-300">Spread</th>
                              <th className="py-2.5 px-3 text-right">Change</th>
                              <th className="py-2.5 px-3 text-right">% Change</th>
                            </tr>
                          ) : (
                            <tr className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-800 text-[11px] uppercase tracking-wider sticky top-0 z-10">
                              <th className="py-2.5 px-3">Date</th>
                              <th className="py-2.5 px-3">Time</th>
                              <th className="py-2.5 px-3 text-sky-400">Symbol</th>
                              <th className="py-2.5 px-3 text-slate-300">{granularity} Open</th>
                              <th className="py-2.5 px-3 text-emerald-400">{granularity} High</th>
                              <th className="py-2.5 px-3 text-rose-400">{granularity} Low</th>
                              <th className="py-2.5 px-3 text-slate-300">{granularity} Close</th>
                              <th className="py-2.5 px-3 text-white">LTP</th>
                              <th className="py-2.5 px-3 text-cyan-300">Trades</th>
                              <th className="py-2.5 px-3 text-amber-300">{granularity} Vol</th>
                              <th className="py-2.5 px-3 text-slate-400">Bid</th>
                              <th className="py-2.5 px-3 text-slate-400">Ask</th>
                              <th className="py-2.5 px-3 text-right">Change</th>
                              <th className="py-2.5 px-3 text-right">% Change</th>
                            </tr>
                          )}
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[12px]">
                          {csvRecords
                            .slice()
                            .reverse()
                            .filter(r => !csvSearch || (r.symbol && r.symbol.toLowerCase().includes(csvSearch.toLowerCase())) || (r.date && r.date.includes(csvSearch)) || (r.time && r.time.includes(csvSearch)))
                            .map((rec, i) => {
                              const isPos = (rec.change ?? 0) >= 0;
                              return granularity === 'live' ? (
                                <tr key={`csv-row-${i}`} className="hover:bg-slate-900/80 transition-colors">
                                  <td className="py-2 px-3 text-slate-400">{rec.date || '-'}</td>
                                  <td className="py-2 px-3 text-slate-300">{rec.time || '-'}</td>
                                  <td className="py-2 px-3 font-bold text-sky-300">{rec.symbol}</td>
                                  <td className={`py-2 px-3 font-extrabold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {rec.ltp != null ? rec.ltp.toFixed(2) : '-'}
                                  </td>
                                  <td className="py-2 px-3 text-cyan-300 font-bold">{rec.quantity != null ? rec.quantity : '-'}</td>
                                  <td className="py-2 px-3 text-amber-300 font-bold">
                                    ₹{((rec.tradeValue ?? (rec.ltp * (rec.quantity ?? 0)))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="py-2 px-3 text-slate-400">{rec.bid != null ? rec.bid.toFixed(2) : '-'}</td>
                                  <td className="py-2 px-3 text-slate-400">{rec.ask != null ? rec.ask.toFixed(2) : '-'}</td>
                                  <td className="py-2 px-3 text-slate-300">
                                    {rec.spread != null ? rec.spread.toFixed(2) : (rec.ask != null && rec.bid != null ? (rec.ask - rec.bid).toFixed(2) : '-')}
                                  </td>
                                  <td className={`py-2 px-3 text-right font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {isPos ? '+' : ''}{rec.change != null ? rec.change.toFixed(2) : '-'}
                                  </td>
                                  <td className={`py-2 px-3 text-right font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {isPos ? '+' : ''}{rec.pChange != null ? rec.pChange.toFixed(2) : '-'}%
                                  </td>
                                </tr>
                              ) : (
                                <tr key={`csv-row-${i}`} className="hover:bg-slate-900/80 transition-colors">
                                  <td className="py-2 px-3 text-slate-400">{rec.date || '-'}</td>
                                  <td className="py-2 px-3 text-slate-300">{rec.time || '-'}</td>
                                  <td className="py-2 px-3 font-bold text-sky-300">{rec.symbol}</td>
                                  <td className="py-2 px-3 text-slate-300">{rec.open != null ? rec.open.toFixed(2) : '-'}</td>
                                  <td className="py-2 px-3 text-emerald-400 font-semibold">{rec.high != null ? rec.high.toFixed(2) : '-'}</td>
                                  <td className="py-2 px-3 text-rose-400 font-semibold">{rec.low != null ? rec.low.toFixed(2) : '-'}</td>
                                  <td className="py-2 px-3 text-slate-300">{rec.close != null ? rec.close.toFixed(2) : '-'}</td>
                                  <td className={`py-2 px-3 font-extrabold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {rec.ltp != null ? rec.ltp.toFixed(2) : '-'}
                                  </td>
                                  <td className="py-2 px-3 text-cyan-300 font-bold">{rec.quantity != null ? rec.quantity : '-'}</td>
                                  <td className="py-2 px-3 text-amber-300 font-bold">{rec.volume != null ? rec.volume.toLocaleString() : '-'}</td>
                                  <td className="py-2 px-3 text-slate-400">{rec.bid != null ? rec.bid.toFixed(2) : '-'}</td>
                                  <td className="py-2 px-3 text-slate-400">{rec.ask != null ? rec.ask.toFixed(2) : '-'}</td>
                                  <td className={`py-2 px-3 text-right font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {isPos ? '+' : ''}{rec.change != null ? rec.change.toFixed(2) : '-'}
                                  </td>
                                  <td className={`py-2 px-3 text-right font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {isPos ? '+' : ''}{rec.pChange != null ? rec.pChange.toFixed(2) : '-'}%
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {/* Tab 2: Stock Screener Component */}
        {platformTab === 'screener' && (
          <StockScreener
            onAddToMonitor={handleAddFromScreener}
            onSelectForTrade={handleSelectForTrade}
            onOpenSmartMoney={(sym) => {
              if (sym) setRadarSelectedSymbol(sym);
              setPlatformTab('smart_money');
            }}
            monitoredSymbols={selectedSymbols}
          />
        )}

        {/* Tab 3: Trading Dashboard Component */}
        {platformTab === 'trading' && (
          <TradingDashboard
            initialSymbol={tradeTargetSymbol}
            initialPrice={tradeTargetPrice}
            availableSymbols={selectedSymbols}
          />
        )}

        {/* Tab 4: Smart Money Trail Component */}
        {platformTab === 'smart_money' && (
          <SmartMoneyRadar
            onAddToMonitor={handleAddFromScreener}
            onSelectForTrade={handleSelectForTrade}
            monitoredSymbols={selectedSymbols}
            initialSymbol={radarSelectedSymbol}
          />
        )}

        {/* Tab 5: Live Server Logs Component */}
        {platformTab === 'logs' && (
          <ServerLogsViewer />
        )}

      </main>

      {/* Dynamic App Status Footer (Reflecting Current Tab & System State) */}
      <footer className="border-t border-sky-200/60 px-4 sm:px-6 lg:px-8 py-3 text-xs bg-white/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 w-full transition-all duration-200 shadow-2xs">
        {/* Tab 1: Live Monitor */}
        {platformTab === 'monitor' && (
          <>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${
                status === 'streaming'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : status === 'connecting'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-slate-100 text-slate-700 border border-slate-300'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status === 'streaming' ? 'bg-emerald-500 animate-pulse' : status === 'connecting' ? 'bg-amber-500 animate-ping' : 'bg-slate-400'}`}></span>
                {status === 'streaming' ? 'Live Streaming' : status === 'connecting' ? 'Connecting' : status === 'stopped' ? 'Stopped' : 'Ready'}
              </span>
              <span className="font-semibold text-slate-800">
                Live Monitor: <strong className="text-sky-900">{selectedSymbols.length}</strong> tickers active
              </span>
              <span className="text-slate-300 hidden sm:inline">•</span>
              <span className="text-slate-600 font-mono text-[11px] hidden sm:inline">
                Captured: <strong className="text-slate-800">{tickCount.toLocaleString()}</strong> session ticks
              </span>
              <span className="text-slate-300 hidden md:inline">•</span>
              <span className="text-slate-600 font-mono text-[11px] hidden md:inline">
                SQLite WAL: <strong className="text-slate-800">{dbStats?.totalTicks ? dbStats.totalTicks.toLocaleString() : 'Active'}</strong> ticks stored
              </span>
            </div>

            <div className="flex items-center gap-2 font-mono text-[11px] text-slate-600 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-800 font-bold">
                Granularity: {granularity.toUpperCase()}
              </span>
              <span className="text-slate-300 hidden sm:inline">•</span>
              <span className="text-slate-700">
                1s & 1m OHLCV Auto-Resampling Engine
              </span>
            </div>
          </>
        )}

        {/* Tab 2: Stock Screener */}
        {platformTab === 'screener' && (
          <>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-100 text-purple-900 border border-purple-300 uppercase tracking-wider">
                <SlidersHorizontal className="w-3 h-3 text-purple-600" />
                Nifty 500 Scanner
              </span>
              <span className="font-semibold text-slate-800">
                Real-time cloud quote scanner with 4s rolling cache
              </span>
              <span className="text-slate-300 hidden sm:inline">•</span>
              <span className="text-slate-600 text-[11px] hidden sm:inline">
                Auto-evaluating Volume Surges, 52W Proximity & Spreads
              </span>
            </div>

            <div className="flex items-center gap-2 font-mono text-[11px] text-purple-950 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-purple-900 font-semibold">
                RSI • VWAP • High/Low Extremes
              </span>
              <span className="text-slate-300 hidden sm:inline">•</span>
              <span className="text-amber-800 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                Smart Money Detection Active
              </span>
            </div>
          </>
        )}

        {/* Tab 3: Trading Dashboard */}
        {platformTab === 'trading' && (
          <>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 uppercase tracking-wider">
                <Zap className="w-3 h-3 text-emerald-600" />
                Execution Engine
              </span>
              <span className="font-semibold text-slate-800">
                Target Symbol: <strong className="font-mono text-emerald-900">{tradeTargetSymbol}</strong>
              </span>
              <span className="text-slate-300 hidden sm:inline">•</span>
              <span className="text-slate-600 text-[11px] hidden sm:inline">
                Mode: <strong className="text-slate-800">Hybrid Paper & Broker Order Placement</strong>
              </span>
            </div>

            <div className="flex items-center gap-2 font-mono text-[11px] text-slate-600 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold">
                Mark-to-Market P&L
              </span>
              <span className="text-slate-300 hidden sm:inline">•</span>
              <span className="text-slate-700">
                Instant Square-Off & Margin Shield Active
              </span>
            </div>
          </>
        )}

        {/* Tab 4: Smart Money Trail */}
        {platformTab === 'smart_money' && (
          <>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-950 border border-amber-300 uppercase tracking-wider">
                <Sparkles className="w-3 h-3 text-amber-600" />
                Smart Money Radar
              </span>
              <span className="font-semibold text-slate-800">
                Tracking continuous 6–8 month accumulation trails (HFCL, Tejas, Kaynes, Subex, CDSL)
              </span>
              <span className="text-slate-300 hidden sm:inline">•</span>
              <span className="text-amber-900 text-[11px] font-mono hidden sm:inline font-bold">
                Wyckoff Absorption & Block Order Footprints
              </span>
            </div>

            <div className="flex items-center gap-2 font-mono text-[11px] text-amber-950 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 font-semibold">
                1–2 Line Excerpt Stream
              </span>
              <span className="text-slate-300 hidden sm:inline">•</span>
              <span className="text-slate-700">
                Zero Tick Bloat • Multi-Sheet Excel Exports (.xlsx)
              </span>
            </div>
          </>
        )}

        {/* Tab 5: Server Logs */}
        {platformTab === 'logs' && (
          <>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-amber-300 border border-amber-500/40 uppercase tracking-wider">
                <Terminal className="w-3 h-3 text-amber-400" />
                Supervisor Gateway
              </span>
              <span className="font-semibold text-slate-800">
                Gateway: <strong className="font-mono text-sky-900">Port 3000</strong> → Worker Proxy: <strong className="font-mono text-sky-900">Port 3001</strong>
              </span>
              <span className="text-slate-300 hidden sm:inline">•</span>
              <span className="text-slate-600 font-mono text-[11px] hidden sm:inline">
                Live SSE Log Streaming Active
              </span>
            </div>

            <div className="flex items-center gap-2 font-mono text-[11px] text-slate-600 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-300 text-slate-800 font-semibold">
                Process Tree Watchdog
              </span>
              <span className="text-slate-300 hidden sm:inline">•</span>
              <span className="text-slate-700">
                Auto Restart & Windows taskkill Lifecycle Management
              </span>
            </div>
          </>
        )}
      </footer>

      {/* FYERS Token Generator Modal */}
      {isTokenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-white/95 rounded-3xl border border-sky-200 shadow-2xl p-6 sm:p-7 flex flex-col gap-5 text-slate-800">

            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-100 border border-sky-200 flex items-center justify-center text-sky-600 shadow-inner">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-sky-950 leading-tight">
                    FYERS Token Generator
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    1-Click automated daily Access Token generation
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTokenModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Token Status Pill */}
            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono">
              <span className="text-slate-600">Current Status:</span>
              <span className={`font-bold flex items-center gap-1.5 ${authConfig?.hasToken ? 'text-emerald-700' : 'text-amber-700'}`}>
                {authConfig?.hasToken ? (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Active ({authConfig.tokenPreview})</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span>Missing / Expired</span>
                  </>
                )}
              </span>
            </div>

            {/* Tabs: 1-Click OAuth vs Manual Paste */}
            <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setAuthTab('1click')}
                className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${authTab === '1click'
                  ? 'bg-white text-sky-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                <span>1-Click Auto OAuth</span>
              </button>
              <button
                type="button"
                onClick={() => setAuthTab('manual')}
                className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${authTab === 'manual'
                  ? 'bg-white text-sky-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-600" />
                <span>Manual Paste (127.0.0.1)</span>
              </button>
            </div>

            {/* Form Fields */}
            <div className="flex flex-col gap-3.5 text-xs">
              {/* App ID */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  FYERS App ID <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={tokenAppId}
                  onChange={(e) => setTokenAppId(e.target.value)}
                  placeholder="e.g. VX4SHQQSBA-100"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 bg-white"
                />
              </div>

              {/* Secret Key */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">
                    Secret Key <span className="text-rose-500">*</span>
                  </label>
                  {authConfig?.hasSecretKey && !tokenSecretKey && (
                    <span className="text-[11px] text-emerald-600 font-medium">✓ Saved in .env</span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showSecret ? "text" : "password"}
                    value={tokenSecretKey}
                    onChange={(e) => setTokenSecretKey(e.target.value)}
                    placeholder={authConfig?.hasSecretKey ? "Using saved secret key (or enter new)" : "Enter Secret Key from Fyers"}
                    className="w-full px-3 py-2 pr-10 rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Tab 1: 1-Click Browser OAuth */}
              {authTab === '1click' && (
                <div className="flex flex-col gap-3 pt-1">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Redirect URI
                    </label>
                    <input
                      type="text"
                      value={tokenRedirectUri}
                      onChange={(e) => setTokenRedirectUri(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-[11px] text-slate-600 bg-slate-50 focus:outline-none"
                    />
                    <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                      💡 Ensure this redirect URI is added in your <a href="https://myapi.fyers.in" target="_blank" rel="noreferrer" className="text-sky-600 underline">Fyers API Dashboard</a> for true 1-click automatic token generation.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handle1ClickLogin}
                    disabled={tokenLoading}
                    className="mt-1 w-full py-2.5 rounded-xl font-bold text-sm text-white glossy-btn-sky flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-60"
                  >
                    {tokenLoading ? (
                      <span>Launching Fyers Login...</span>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Login with FYERS (1-Click)</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Tab 2: Manual Paste (for https://127.0.0.1) */}
              {authTab === 'manual' && (
                <div className="flex flex-col gap-3 pt-1">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Paste Redirect URL or Auth Code
                    </label>
                    <input
                      type="text"
                      value={tokenAuthCode}
                      onChange={(e) => setTokenAuthCode(e.target.value)}
                      placeholder="Paste https://127.0.0.1/?auth_code=... or raw code"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 bg-white"
                    />
                    <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                      If your Fyers app redirect URI is set to <code className="bg-slate-100 px-1 py-0.5 rounded text-sky-800">https://127.0.0.1</code>, complete your login, copy the address bar URL, and paste it here.
                    </p>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveSecretKey}
                      onChange={(e) => setSaveSecretKey(e.target.checked)}
                      className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span>Save Secret Key into .env file</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleManualExchange}
                    disabled={tokenLoading}
                    className="mt-1 w-full py-2.5 rounded-xl font-bold text-sm text-white glossy-btn-emerald flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-60"
                  >
                    {tokenLoading ? (
                      <span>Exchanging Token...</span>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Validate & Activate Token</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Error Notification */}
              {tokenError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>{tokenError}</span>
                </div>
              )}

              {/* Success Notification */}
              {tokenSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{tokenSuccessMsg}</span>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Past Sessions Archive & Backups Modal */}
      {showBackupsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-white/95 rounded-3xl border border-sky-200 shadow-2xl p-6 sm:p-7 flex flex-col gap-4 text-slate-800 max-h-[85vh]">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600 shadow-inner">
                  <Archive className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-950 leading-tight flex items-center gap-2">
                    <span>Past Session Backups</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-mono font-bold">
                      {backups.length} Archived
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    All prior live market sessions safely backed up before fresh session execution
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBackupsModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Database Health & 7-Day Storage Pruner */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/80 via-slate-50 to-sky-50/60 border border-indigo-200/80 shadow-xs flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">SQLite Storage & Maintenance</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] font-mono font-bold">
                        {sqliteStats ? `${sqliteStats.dbSizeMB} MB` : 'Loading...'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Auto-prunes 1s ticks older than 7d · Retains 1m bars 90d · Orders & Smart Money permanent
                    </p>
                  </div>
                </div>

                <button
                  disabled={optimizingDb}
                  onClick={() => handleOptimizeDb(7)}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors shrink-0"
                  title="Prune ticks older than 7 days and reclaim disk space with SQLite VACUUM"
                >
                  {optimizingDb ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Optimizing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Prune & Optimize</span>
                    </>
                  )}
                </button>
              </div>

              {/* Live Metric Pills */}
              {sqliteStats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-indigo-100/80 text-[11px] font-mono">
                  <div className="bg-white/80 p-2 rounded-xl border border-indigo-100/60 flex flex-col">
                    <span className="text-slate-400 text-[10px]">RAW TICKS</span>
                    <span className="font-bold text-slate-800 text-xs mt-0.5">{sqliteStats.totalTicks.toLocaleString()}</span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-indigo-100/60 flex flex-col">
                    <span className="text-slate-400 text-[10px]">1S BARS</span>
                    <span className="font-bold text-slate-800 text-xs mt-0.5">{sqliteStats.totalBars1s.toLocaleString()}</span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-indigo-100/60 flex flex-col">
                    <span className="text-slate-400 text-[10px]">1M BARS</span>
                    <span className="font-bold text-slate-800 text-xs mt-0.5">{sqliteStats.totalBars1m.toLocaleString()}</span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-indigo-100/60 flex flex-col">
                    <span className="text-slate-400 text-[10px]">SMART MONEY</span>
                    <span className="font-bold text-indigo-700 text-xs mt-0.5">{sqliteStats.totalSmartMoney.toLocaleString()} events</span>
                  </div>
                </div>
              )}

              {/* Feedback Alert */}
              {optimizeSuccessMsg && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{optimizeSuccessMsg}</span>
                </div>
              )}
            </div>

            {/* Backups List */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
              {backups.length === 0 ? (
                <div className="p-8 text-center text-slate-400 italic bg-slate-50 rounded-2xl border border-slate-100">
                  <Archive className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p>No past session archives found yet.</p>
                  <p className="text-xs text-slate-400 mt-1">Starting a fresh streaming session automatically creates timestamped backups.</p>
                </div>
              ) : (
                backups.map((b, idx) => (
                  <div key={b.id || idx} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 hover:bg-amber-50/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          <span>{b.timestamp}</span>
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-xs font-mono font-extrabold">
                          {b.totalTicks.toLocaleString()} ticks
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-1">
                        Tag: {b.id} {b.dbSizeBytes ? `· ${(b.dbSizeBytes / 1024).toFixed(1)} KB` : ''}
                      </div>
                    </div>

                    {/* Download buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      {b.xlsxFile && (
                        <button
                          onClick={() => handleDownloadBackupFile(b.xlsxFile)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                          title={`Download ${b.xlsxFile}`}
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          <span>Excel (.xlsx)</span>
                        </button>
                      )}
                      {b.dbFile && (
                        <button
                          onClick={() => handleDownloadBackupFile(b.dbFile)}
                          className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                          title={`Download ${b.dbFile}`}
                        >
                          <Database className="w-3.5 h-3.5" />
                          <span>SQLite (.db)</span>
                        </button>
                      )}
                      {b.csvFile && (
                        <button
                          onClick={() => handleDownloadBackupFile(b.csvFile)}
                          className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                          title={`Download ${b.csvFile}`}
                        >
                          <FileCode2 className="w-3.5 h-3.5" />
                          <span>CSV (.csv)</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Backups stored locally in <code className="font-mono text-slate-600 font-bold">/backups</code>
              </span>
              <button
                onClick={() => setShowBackupsModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Global Smart Money Footprint Toast */}
      {globalSmartMoneyAlert && (
        <div className="fixed bottom-16 right-6 z-50 max-w-sm w-full p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-amber-950 to-slate-950 border border-amber-400/80 shadow-2xl text-white animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
              <span className="text-[10px] font-mono font-extrabold uppercase text-amber-300 tracking-wider">
                Institutional Footprint Detected
              </span>
            </div>
            <button
              type="button"
              onClick={() => setGlobalSmartMoneyAlert(null)}
              className="text-slate-400 hover:text-white text-xs cursor-pointer p-0.5"
            >
              ✕
            </button>
          </div>
          <div className="mt-2 flex items-baseline justify-between font-mono">
            <div className="text-base font-black text-amber-400">{globalSmartMoneyAlert.ticker}</div>
            <div className="text-xs font-bold text-emerald-400">₹{globalSmartMoneyAlert.ltp}</div>
          </div>
          <p className="text-[11px] text-slate-300 mt-1 leading-snug">
            {globalSmartMoneyAlert.pattern_type.replace(/_/g, ' ')} • {globalSmartMoneyAlert.note}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRadarSelectedSymbol(globalSmartMoneyAlert.symbol);
                setPlatformTab('smart_money');
                setGlobalSmartMoneyAlert(null);
              }}
              className="flex-1 py-1.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-xs shadow-sm cursor-pointer text-center"
            >
              Inspect in Radar →
            </button>
            <button
              type="button"
              onClick={() => {
                handleSelectForTrade(globalSmartMoneyAlert.symbol, globalSmartMoneyAlert.ltp);
                setGlobalSmartMoneyAlert(null);
              }}
              className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold text-xs border border-emerald-500/30 cursor-pointer"
            >
              Trade
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
