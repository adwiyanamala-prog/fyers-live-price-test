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
  XCircle
} from 'lucide-react';
import { LogEntry, SymbolSnapshot, CsvRecord } from './types';
import { NIFTY_500_SYMBOLS, StockSymbol } from './data/nifty500';
import { BANK_NIFTY_SYMBOLS } from './data/banknifty';

export type AppTheme = 'sky' | 'emerald';

const DEFAULT_SYMBOLS = [
  "NSE:RELIANCE-EQ",
  "NSE:TCS-EQ",
  "NSE:HDFCBANK-EQ",
  "NSE:INFY-EQ",
  "NSE:ICICIBANK-EQ"
];

export default function App() {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'streaming' | 'stopped'>('idle');
  const DEFAULT_BANK_NIFTY_SYMBOLS = [
    "NSE:NIFTYBANK-INDEX",
    "NSE:BANKNIFTY-FUT",
    "NSE:HDFCBANK-EQ",
    "NSE:ICICIBANK-EQ",
    "NSE:AXISBANK-EQ"
  ];

  const [selectedNifty500Symbols, setSelectedNifty500Symbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [selectedBankNiftySymbols, setSelectedBankNiftySymbols] = useState<string[]>(DEFAULT_BANK_NIFTY_SYMBOLS);

  // Combined symbols for streaming & API request
  const selectedSymbols = Array.from(new Set([...selectedNifty500Symbols, ...selectedBankNiftySymbols]));
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

  // Nifty 500 Dropdown States
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');

  // Bank Nifty Dropdown States
  const [isBankNiftyOpen, setIsBankNiftyOpen] = useState<boolean>(false);
  const [bankNiftyQuery, setBankNiftyQuery] = useState<string>('');
  const [bankNiftySector, setBankNiftySector] = useState<string>('ALL');

  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const bankNiftyRef = useRef<HTMLDivElement | null>(null);
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

  const handleStart = () => {
    if (isRunning) return;

    // Close any previous stream
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setIsRunning(true);
    setStatus('connecting');
    setTickCount(0);
    setCsvRecords([]);

    const startTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    // Add start log
    setLogs(prev => [
      ...prev,
      {
        id: `start-${Date.now()}`,
        type: 'system',
        rawText: `\n--- [${startTimestamp}] Starting WebSocket session (${selectedSymbols.length} symbols) | CSV logging enabled ---`,
        timestamp: startTimestamp
      }
    ]);

    const symbolsParam = encodeURIComponent(selectedSymbols.join(','));
    const es = new EventSource(`/api/stream?symbols=${symbolsParam}`);
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

  const handleDownloadCsv = () => {
    if (csvRecords.length === 0) return;

    const headers = ["Date", "Time", "Symbol", "Open", "High", "Low", "Close", "LTP", "Quantity", "Volume", "Average", "Bid", "Ask", "Change", "PercentChange"];
    const rows = csvRecords.map(r => [
      `"${r.date || ''}"`,
      `"${r.time || ''}"`,
      `"${r.symbol}"`,
      r.open !== undefined ? r.open.toFixed(2) : "",
      r.high !== undefined ? r.high.toFixed(2) : "",
      r.low !== undefined ? r.low.toFixed(2) : "",
      r.close !== undefined ? r.close.toFixed(2) : "",
      r.ltp.toFixed(2),
      r.quantity !== undefined ? r.quantity : "",
      r.volume !== undefined ? r.volume : "",
      r.average !== undefined ? r.average.toFixed(2) : "",
      r.bid !== undefined ? r.bid.toFixed(2) : "",
      r.ask !== undefined ? r.ask.toFixed(2) : "",
      r.change !== undefined ? r.change.toFixed(2) : "",
      r.pChange !== undefined ? r.pChange.toFixed(2) : ""
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `fyers_prices_${ts}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloadSuccess(true);
    setDownloadMenuOpen(false);
    setTimeout(() => setDownloadSuccess(false), 2500);
  };

  const handleDownloadExcel = () => {
    if (csvRecords.length === 0) return;

    const headers = ["Date", "Time", "Symbol", "Open", "High", "Low", "Close", "LTP", "Quantity", "Volume", "Average", "Bid", "Ask", "Change", "Percent Change (%)"];
    const rows = csvRecords.map(r => ({
      "Date": r.date || '',
      "Time": r.time || '',
      "Symbol": r.symbol,
      "Open": r.open !== undefined ? r.open : '',
      "High": r.high !== undefined ? r.high : '',
      "Low": r.low !== undefined ? r.low : '',
      "Close": r.close !== undefined ? r.close : '',
      "LTP": r.ltp,
      "Quantity": r.quantity !== undefined ? r.quantity : '',
      "Volume": r.volume !== undefined ? r.volume : '',
      "Average": r.average !== undefined ? r.average : '',
      "Bid": r.bid !== undefined ? r.bid : '',
      "Ask": r.ask !== undefined ? r.ask : '',
      "Change": r.change !== undefined ? r.change : '',
      "Percent Change (%)": r.pChange !== undefined ? r.pChange : ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "FYERS Prices");

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    XLSX.writeFile(workbook, `fyers_prices_${ts}.xlsx`);

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
      
      {/* Top Header */}
      <header className="border-b border-sky-200/80 bg-white/80 backdrop-blur-xl sticky top-0 z-30 px-4 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4 shadow-sm shadow-sky-200/40">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg shrink-0 ${
            theme === 'emerald' ? 'glossy-orb-emerald shadow-emerald-500/40' : 'glossy-orb shadow-sky-400/40'
          }`}>
            <Terminal className="w-5 h-5 text-white drop-shadow-sm" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-sky-950 text-base tracking-tight">
                FYERS Live Price Monitor
              </h1>
              <span className="web2-badge text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full text-sky-900 font-bold">
                API V3 WebSocket
              </span>
            </div>
            <p className="text-xs text-sky-700/90 font-medium">
              NSE Real-Time Market Feed & Live CSV Logger
            </p>
          </div>
        </div>

        {/* Live Status Indicator & CSV Status */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          
          {/* CSV Recording Badge */}
          <div className="web2-badge flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-sky-900 font-mono font-medium">
            <FileSpreadsheet className={`w-3.5 h-3.5 ${isRunning ? 'text-sky-600 animate-pulse' : 'text-sky-500'}`} />
            <span className="text-[11px]">
              CSV: <span className="font-bold text-sky-950">{csvRecords.length}</span> rows
            </span>
          </div>

          {/* Connection State Badge */}
          <div className="web2-badge flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono">
            <span className="relative flex h-2.5 w-2.5">
              {isRunning && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                status === 'streaming' ? 'bg-emerald-500 shadow-sm shadow-emerald-400' :
                status === 'connecting' || status === 'connected' ? 'bg-amber-400' :
                status === 'stopped' ? 'bg-rose-500' : 'bg-slate-400'
              }`}></span>
            </span>
            <span className="uppercase text-[11px] font-bold text-sky-900">
              {status === 'streaming' ? `Streaming (${tickCount} ticks)` :
               status === 'connecting' ? 'Connecting...' :
               status === 'connected' ? 'Connected' :
               status === 'stopped' ? 'Stopped' : 'Ready'}
            </span>
          </div>

          {/* 2-Way Theme Toggle Switch */}
          <div className="web2-badge p-1 rounded-xl flex items-center gap-1 bg-white/90 shadow-inner border border-sky-200/60">
            <button
              type="button"
              id="btn-theme-emerald"
              onClick={() => handleThemeChange('emerald')}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                theme === 'emerald'
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
              className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                theme === 'sky'
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

        {/* Top Control Bar with Primary Run / Stop / CSV Download Buttons */}
        <section className={`web2-card rounded-2xl md:rounded-3xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative transition-all ${
          isDropdownOpen || isBankNiftyOpen ? 'z-50' : 'z-20'
        }`}>
          
          {/* Action Buttons: Run, Stop, Download CSV */}
          <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
            <button
              id="btn-run"
              onClick={handleStart}
              disabled={isRunning}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
                isRunning
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                  : 'glossy-btn-emerald text-white cursor-pointer'
              }`}
            >
              <Play className="w-4 h-4 fill-current drop-shadow-sm" />
              <span>Run</span>
            </button>

            <button
              id="btn-stop"
              onClick={handleStop}
              disabled={!isRunning}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
                !isRunning
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                  : 'glossy-btn-rose text-white cursor-pointer'
              }`}
            >
              <Square className="w-4 h-4 fill-current drop-shadow-sm" />
              <span>Stop</span>
            </button>

            {/* Download Dropdown Button (CSV & Excel) */}
            <div className="relative" ref={downloadMenuRef}>
              <button
                id="btn-download-menu"
                onClick={() => setDownloadMenuOpen(!downloadMenuOpen)}
                disabled={csvRecords.length === 0}
                className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${
                  csvRecords.length === 0
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                    : 'glossy-btn-cyan text-white cursor-pointer hover:brightness-105'
                }`}
                title="Download recorded prices as CSV or Excel file"
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
                    {csvRecords.length > 0 && (
                      <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-white/30 text-white text-[10px] font-mono font-extrabold">
                        {csvRecords.length}
                      </span>
                    )}
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${downloadMenuOpen ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>

              {/* Download Format Popover Menu */}
              {downloadMenuOpen && csvRecords.length > 0 && (
                <div className="absolute left-0 mt-2 z-50 w-60 web2-card p-2 rounded-2xl shadow-2xl border border-sky-300/90 bg-white/98 backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3 py-1.5 text-[10px] uppercase font-mono tracking-wider font-bold text-sky-800 border-b border-sky-100 mb-1">
                    Select Export Format ({csvRecords.length} records)
                  </div>

                  <button
                    onClick={handleDownloadCsv}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-sky-50 text-sky-950 transition-colors cursor-pointer group"
                  >
                    <div className="p-2 rounded-lg bg-sky-100 text-sky-700 group-hover:bg-sky-600 group-hover:text-white transition-colors">
                      <FileCode2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-xs">CSV File (.csv)</div>
                      <div className="text-[10px] text-sky-700 font-mono">Comma-separated data</div>
                    </div>
                  </button>

                  <button
                    onClick={handleDownloadExcel}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-emerald-50 text-emerald-950 transition-colors cursor-pointer group"
                  >
                    <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-xs">Excel Workbook (.xlsx)</div>
                      <div className="text-[10px] text-emerald-700 font-mono">Formatted Excel sheet</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            <div className="h-6 w-px bg-sky-200/80 hidden sm:block mx-0.5" />

            <button
              id="btn-clear"
              onClick={handleClear}
              className="p-2.5 rounded-xl text-sky-800 hover:text-sky-950 web2-badge hover:brightness-105 transition-all"
              title="Clear terminal output"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              id="btn-copy"
              onClick={handleCopyLogs}
              className="p-2.5 rounded-xl text-sky-800 hover:text-sky-950 web2-badge hover:brightness-105 transition-all flex items-center gap-1.5 text-xs font-semibold"
              title="Copy output to clipboard"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          {/* Nifty 500 Dropdown & Controls */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs relative z-50" ref={dropdownRef}>
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
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all web2-badge shadow-sm hover:brightness-105 cursor-pointer ${
                isRunning ? 'opacity-70 cursor-not-allowed' : ''
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

            {/* Expanded Nifty 500 Dropdown Panel */}
            {isDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 z-50 w-full sm:w-[500px] md:w-[600px] max-w-[calc(100vw-2rem)] web2-card p-4 rounded-2xl shadow-2xl border border-sky-300/90 bg-white/98 backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 duration-150">
                
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
                          className={`flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer select-none border ${
                            isChecked
                              ? 'bg-sky-100/80 border-sky-300/80 text-sky-950 font-semibold shadow-xs'
                              : 'bg-white/60 hover:bg-sky-50/80 border-sky-100/60 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}} // handled by parent div onClick
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
                <div className="mt-3 pt-2.5 border-t border-sky-100 flex items-center justify-between text-xs">
                  <span className="font-semibold text-sky-950">
                    {selectedNifty500Count} of {NIFTY_500_SYMBOLS.length} Nifty 500 Selected
                  </span>
                  <button
                    onClick={() => setIsDropdownOpen(false)}
                    className="glossy-btn-cyan text-white px-4 py-1.5 rounded-xl font-bold text-xs cursor-pointer"
                  >
                    Done
                  </button>
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
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all web2-badge shadow-sm hover:brightness-105 cursor-pointer ${
                isRunning ? 'opacity-70 cursor-not-allowed' : ''
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

            {/* Expanded Bank Nifty Dropdown Panel */}
            {isBankNiftyOpen && (
              <div className="absolute top-full left-0 sm:right-0 sm:left-auto mt-2 z-50 w-full sm:w-[500px] md:w-[600px] max-w-[calc(100vw-2rem)] web2-card p-4 rounded-2xl shadow-2xl border border-emerald-300/90 bg-white/98 backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 duration-150">
                
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
                          className={`flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer select-none border ${
                            isChecked
                              ? 'bg-emerald-100/80 border-emerald-300/80 text-emerald-950 font-semibold shadow-xs'
                              : 'bg-white/60 hover:bg-emerald-50/80 border-sky-100/60 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
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
                <div className="mt-3 pt-2.5 border-t border-emerald-100 flex items-center justify-between text-xs">
                  <span className="font-semibold text-sky-950">
                    {selectedBankNiftyCount} of {BANK_NIFTY_SYMBOLS.length} Bank Nifty Selected
                  </span>
                  <button
                    onClick={() => setIsBankNiftyOpen(false)}
                    className="bg-emerald-600 text-white hover:bg-emerald-700 px-4 py-1.5 rounded-xl font-bold text-xs cursor-pointer shadow-xs"
                  >
                    Done
                  </button>
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
                    className={`web2-card p-4 rounded-2xl transition-all duration-300 ${
                      priceChanged
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
                        ₹{snap.ltp.toFixed(2)}
                      </div>
                      <div className={`flex items-center text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
                        isPositive 
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}>
                        {isPositive ? <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> : <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />}
                        <span>{isPositive ? '+' : ''}{snap.change.toFixed(2)}</span>
                        <span className="ml-1 opacity-90">({isPositive ? '+' : ''}{snap.pChange.toFixed(2)}%)</span>
                      </div>
                    </div>

                    {/* OHLC Bar */}
                    <div className="grid grid-cols-4 gap-1 p-1.5 rounded-xl bg-sky-50/80 border border-sky-100 text-[10px] font-mono text-sky-950 text-center mb-2">
                      <div>
                        <span className="text-sky-500 font-sans block text-[9px]">OPEN</span>
                        <span className="font-bold">{snap.open !== undefined ? snap.open.toFixed(2) : '-'}</span>
                      </div>
                      <div>
                        <span className="text-emerald-600 font-sans block text-[9px]">HIGH</span>
                        <span className="font-bold">{snap.high !== undefined ? snap.high.toFixed(2) : '-'}</span>
                      </div>
                      <div>
                        <span className="text-rose-500 font-sans block text-[9px]">LOW</span>
                        <span className="font-bold">{snap.low !== undefined ? snap.low.toFixed(2) : '-'}</span>
                      </div>
                      <div>
                        <span className="text-sky-600 font-sans block text-[9px]">CLOSE</span>
                        <span className="font-bold">{snap.close !== undefined ? snap.close.toFixed(2) : '-'}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-sky-100 flex items-center justify-between text-[11px] text-sky-900 font-mono">
                      <span>Qty: <strong className="text-sky-950">{snap.quantity || '-'}</strong></span>
                      <span>Vol: <strong className="text-sky-950">{snap.volume.toLocaleString()}</strong></span>
                      <span>Avg: <strong className="text-sky-950">{snap.average !== undefined ? snap.average.toFixed(2) : '-'}</strong></span>
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
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeViewTab === 'terminal'
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
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeViewTab === 'csvTable'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>CSV Logger Table ({csvRecords.length})</span>
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
                    <div key={log.id} className={`whitespace-pre-wrap ${
                      isSuccess ? 'text-emerald-400 font-medium' :
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
                      {log.bid !== undefined && log.ask !== undefined && (
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
                      <tr className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-800 text-[11px] uppercase tracking-wider sticky top-0 z-10">
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Time</th>
                        <th className="py-2.5 px-3 text-sky-400">Symbol</th>
                        <th className="py-2.5 px-3 text-slate-300">Open</th>
                        <th className="py-2.5 px-3 text-emerald-400">High</th>
                        <th className="py-2.5 px-3 text-rose-400">Low</th>
                        <th className="py-2.5 px-3 text-slate-300">Close</th>
                        <th className="py-2.5 px-3 text-white">LTP</th>
                        <th className="py-2.5 px-3 text-cyan-300">Quantity</th>
                        <th className="py-2.5 px-3 text-amber-300">Volume</th>
                        <th className="py-2.5 px-3 text-emerald-300">Average</th>
                        <th className="py-2.5 px-3 text-slate-400">Bid</th>
                        <th className="py-2.5 px-3 text-slate-400">Ask</th>
                        <th className="py-2.5 px-3 text-right">Change</th>
                        <th className="py-2.5 px-3 text-right">% Change</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[12px]">
                      {csvRecords
                        .slice()
                        .reverse()
                        .filter(r => !csvSearch || r.symbol.toLowerCase().includes(csvSearch.toLowerCase()) || r.date.includes(csvSearch) || r.time.includes(csvSearch))
                        .map((rec, i) => {
                          const isPos = (rec.change ?? 0) >= 0;
                          return (
                            <tr key={`csv-row-${i}`} className="hover:bg-slate-900/80 transition-colors">
                              <td className="py-2 px-3 text-slate-400">{rec.date || '-'}</td>
                              <td className="py-2 px-3 text-slate-300">{rec.time || '-'}</td>
                              <td className="py-2 px-3 font-bold text-sky-300">{rec.symbol}</td>
                              <td className="py-2 px-3 text-slate-300">{rec.open !== undefined ? rec.open.toFixed(2) : '-'}</td>
                              <td className="py-2 px-3 text-emerald-400 font-semibold">{rec.high !== undefined ? rec.high.toFixed(2) : '-'}</td>
                              <td className="py-2 px-3 text-rose-400 font-semibold">{rec.low !== undefined ? rec.low.toFixed(2) : '-'}</td>
                              <td className="py-2 px-3 text-slate-300">{rec.close !== undefined ? rec.close.toFixed(2) : '-'}</td>
                              <td className={`py-2 px-3 font-extrabold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {rec.ltp.toFixed(2)}
                              </td>
                              <td className="py-2 px-3 text-cyan-300">{rec.quantity !== undefined ? rec.quantity : '-'}</td>
                              <td className="py-2 px-3 text-amber-300">{rec.volume !== undefined ? rec.volume.toLocaleString() : '-'}</td>
                              <td className="py-2 px-3 text-emerald-300">{rec.average !== undefined ? rec.average.toFixed(2) : '-'}</td>
                              <td className="py-2 px-3 text-slate-400">{rec.bid !== undefined ? rec.bid.toFixed(2) : '-'}</td>
                              <td className="py-2 px-3 text-slate-400">{rec.ask !== undefined ? rec.ask.toFixed(2) : '-'}</td>
                              <td className={`py-2 px-3 text-right font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isPos ? '+' : ''}{rec.change !== undefined ? rec.change.toFixed(2) : '-'}
                              </td>
                              <td className={`py-2 px-3 text-right font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isPos ? '+' : ''}{rec.pChange !== undefined ? rec.pChange.toFixed(2) : '-'}%
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

      </main>

      {/* Full-width Footer */}
      <footer className="border-t border-sky-200/60 px-4 sm:px-6 lg:px-8 py-3.5 text-center text-xs text-sky-900 bg-white/60 backdrop-blur-md flex flex-wrap items-center justify-between gap-2 w-full">
        <div className="flex items-center gap-2">
          <span className="font-semibold">FYERS API V3 Market Data WebSocket Spec</span>
          <span className="text-sky-300">•</span>
          <span className="text-sky-800">data_ws.FyersDataSocket</span>
        </div>
        <div className="font-mono text-[11px] text-sky-800 font-medium">
          CSV Logger: Date, Time, Symbol, Open, High, Low, Close, LTP, Quantity, Volume, Average, Bid, Ask
        </div>
      </footer>

    </div>
  );
}

