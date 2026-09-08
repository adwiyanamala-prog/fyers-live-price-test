import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Flame,
  FileSpreadsheet,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Zap,
  Layers,
  Clock,
  CheckCircle2,
  Calendar,
  Activity,
  ChevronRight,
  ShieldCheck,
  Award,
  RefreshCw,
  ExternalLink,
  SlidersHorizontal,
  Compass,
  DollarSign,
  BarChart2,
  PieChart
} from 'lucide-react';
import { BracketOrderModal } from './BracketOrderModal';
import { TradingViewChartModal } from './TradingViewChartModal';
import { StrategyBacktesterModal } from './StrategyBacktesterModal';
import { soundAlerts } from '../utils/audioAlerts';

export interface SmartMoneyStock {
  rank: number;
  symbol: string;
  ticker: string;
  company_name: string;
  sector: string;
  currentLtp: number;
  change: number;
  pChange: number;
  eventCount: number;
  baseMinPrice: number;
  baseMaxPrice: number;
  basePriceBand: string;
  avgVolMult: number;
  avgTradeMult: number;
  avgAggressorRatio: number;
  convictionScore: number;
  latestDate: string;
  latestPattern: string;
  latestNote: string;
}

export interface SmartMoneyEvent {
  id: number;
  date: string;
  symbol: string;
  company_name: string;
  sector: string;
  ltp: number;
  volume_multiple: number;
  trade_size_mult: number;
  aggressor_ratio: number;
  price_spread_pct: number;
  pattern_type: string;
  score: number;
  note: string;
  created_at: number;
}

interface SmartMoneyRadarProps {
  onAddToMonitor: (symbol: string) => void;
  onSelectForTrade: (symbol: string, currentPrice: number) => void;
  monitoredSymbols: string[];
  initialSymbol?: string;
}

export const SmartMoneyRadar: React.FC<SmartMoneyRadarProps> = ({
  onAddToMonitor,
  onSelectForTrade,
  monitoredSymbols,
  initialSymbol,
}) => {
  const [timeframe, setTimeframe] = useState<'30d' | '90d' | '180d' | 'all'>('all');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [minScore, setMinScore] = useState<number>(0);

  const [leaderboard, setLeaderboard] = useState<SmartMoneyStock[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>(initialSymbol || 'NSE:HFCL-EQ');
  const [trailEvents, setTrailEvents] = useState<SmartMoneyEvent[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<any[]>([]);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [bracketOrderModal, setBracketOrderModal] = useState<{
    isOpen: boolean;
    symbol: string;
    currentPrice: number;
    strategyName: string;
    winRate: string;
    dayLow?: number;
  } | null>(null);
  const [chartModalStock, setChartModalStock] = useState<{
    symbol: string;
    ltp: number;
    name: string;
  } | null>(null);
  const [backtesterOpen, setBacktesterOpen] = useState<boolean>(false);
  const [liveAlertNotice, setLiveAlertNotice] = useState<string | null>(null);

  const [loadingLeaderboard, setLoadingLeaderboard] = useState<boolean>(true);
  const [loadingTrail, setLoadingTrail] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Sync initialSymbol if passed from parent
  useEffect(() => {
    if (initialSymbol) {
      setSelectedSymbol(initialSymbol);
    }
  }, [initialSymbol]);

  // Fetch Live Footprint Feed
  const fetchLiveFeed = async () => {
    try {
      const res = await fetch('/api/smart-money/live-feed');
      if (res.ok) {
        const data = await res.json();
        setLiveAlerts(data.alerts || []);
      }
    } catch {}
  };

  useEffect(() => {
    fetchLiveFeed();
    const interval = setInterval(fetchLiveFeed, 4000);
    return () => clearInterval(interval);
  }, []);

  // Trigger Simulated Footprint (for instant demo/testing)
  const handleSimulateFootprint = async (sym?: string) => {
    try {
      setIsSimulating(true);
      const targetSym = sym || selectedSymbol || 'NSE:HFCL-EQ';
      const patterns = ['BLOCK_ACCUMULATION', 'ICEBERG_ABSORPTION', 'STEALTH_BREAKOUT', 'ABSORPTION'];
      const chosenPattern = patterns[Math.floor(Math.random() * patterns.length)];

      const res = await fetch('/api/smart-money/simulate-footprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: targetSym, pattern_type: chosenPattern }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.alert) {
          setLiveAlerts(prev => [data.alert, ...prev.slice(0, 19)]);
          soundAlerts.playSmartMoneyChime();
          setLiveAlertNotice(`⚡ Live Footprint Logged: ${data.alert.ticker} - ${data.alert.pattern_type} (${data.alert.volume_multiple}x Vol)`);
          setTimeout(() => setLiveAlertNotice(null), 5000);
          fetchLeaderboard();
          fetchTrail(targetSym);
        }
      }
    } catch (err) {
      console.error('Simulate footprint error:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  // Fetch Leaderboard
  const fetchLeaderboard = async () => {
    try {
      setLoadingLeaderboard(true);
      const params = new URLSearchParams();
      if (timeframe !== 'all') params.set('timeframe', timeframe);
      if (selectedSector !== 'ALL') params.set('sector', selectedSector);
      if (minScore > 0) params.set('minScore', String(minScore));

      const res = await fetch(`/api/smart-money/leaderboard?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data.stocks || []);
        // Default selected symbol to HFCL or first item if HFCL not found
        if (data.stocks && data.stocks.length > 0) {
          const hasHfcl = data.stocks.some((s: SmartMoneyStock) => s.symbol === 'NSE:HFCL-EQ');
          if (!selectedSymbol || !data.stocks.some((s: SmartMoneyStock) => s.symbol === selectedSymbol)) {
            setSelectedSymbol(hasHfcl ? 'NSE:HFCL-EQ' : data.stocks[0].symbol);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load smart money leaderboard:', err);
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  // Fetch Trail for Selected Stock
  const fetchTrail = async (symbol: string) => {
    try {
      setLoadingTrail(true);
      const params = new URLSearchParams({ symbol });
      if (timeframe !== 'all') params.set('timeframe', timeframe);

      const res = await fetch(`/api/smart-money/trail?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTrailEvents(data.trail || []);
      }
    } catch (err) {
      console.error('Failed to load smart money trail:', err);
    } finally {
      setLoadingTrail(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, [timeframe, selectedSector, minScore]);

  useEffect(() => {
    if (selectedSymbol) {
      fetchTrail(selectedSymbol);
    }
  }, [selectedSymbol, timeframe]);

  // Sector list
  const sectors = useMemo(() => {
    const set = new Set<string>();
    leaderboard.forEach(s => {
      if (s.sector) set.add(s.sector);
    });
    return Array.from(set).sort();
  }, [leaderboard]);

  // Filtered leaderboard
  const filteredStocks = useMemo(() => {
    return leaderboard.filter(s => {
      const matchSearch =
        !searchQuery ||
        s.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.sector.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
    });
  }, [leaderboard, searchQuery]);

  // Selected Stock Details
  const currentSelectedStock = useMemo(() => {
    return leaderboard.find(s => s.symbol === selectedSymbol) || null;
  }, [leaderboard, selectedSymbol]);

  // Handle Export
  const handleExport = async () => {
    try {
      setIsExporting(true);
      setExportNotice('Generating multi-sheet 6-8 month Gold Mine summary...');
      const params = new URLSearchParams();
      if (timeframe !== 'all') params.set('timeframe', timeframe);

      const res = await fetch(`/api/smart-money/export?${params.toString()}`);
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fyers_smart_money_gold_mines_${timeframe}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setExportNotice('Excel summary downloaded successfully!');
      setTimeout(() => setExportNotice(null), 4000);
    } catch (err) {
      console.error('Export error:', err);
      setExportNotice('Failed to download Excel export.');
      setTimeout(() => setExportNotice(null), 4000);
    } finally {
      setIsExporting(false);
    }
  };

  // Top pick (highest event count)
  const topPick = leaderboard[0] || null;
  const highConvictionCount = leaderboard.filter(s => s.convictionScore >= 85).length;
  const totalEvents = leaderboard.reduce((sum, s) => sum + s.eventCount, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Platform Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-amber-950/40 to-slate-950 border border-amber-500/30 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
                <Sparkles className="w-3 h-3 text-amber-400" />
                Multi-Bagger Accumulation Radar
              </span>
              <span className="text-slate-400 text-xs font-mono">• 6–8 Month Continuous Excerpt Stream</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
              <span>Smart Money Trail</span>
              <span className="text-amber-400 text-lg font-bold font-mono">/ Gold Mines</span>
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Pinpointing institutional footprints, block order chunking, and Wyckoff absorption before multi-bagger rallies. Distilled into 1–2 line excerpts per date—no tick storage bloat.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Live Footprint Simulator Trigger */}
            <button
              type="button"
              id="simulate-footprint-btn"
              onClick={() => handleSimulateFootprint()}
              disabled={isSimulating}
              className="px-4 py-3 rounded-2xl bg-slate-800/90 hover:bg-slate-700/90 text-amber-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border border-amber-500/40 active:scale-95 transition-all cursor-pointer shadow-md disabled:opacity-50"
              title="Test real-time intraday footprint detector on selected stock"
            >
              <Zap className={`w-4 h-4 text-amber-400 ${isSimulating ? 'animate-spin' : ''}`} />
              <span>{isSimulating ? 'Scanning Footprint...' : '⚡ Simulate Footprint Scan'}</span>
            </button>

            <button
              type="button"
              id="export-gold-mine-xlsx"
              onClick={handleExport}
              disabled={isExporting}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 active:scale-95 transition-all cursor-pointer border border-amber-300"
            >
              <FileSpreadsheet className="w-4 h-4 text-slate-950" />
              <span>{isExporting ? 'Generating...' : 'Download Gold Mine (.xlsx)'}</span>
            </button>

            {/* Quantitative Strategy Backtester Button */}
            <button
              type="button"
              id="open-backtester-btn"
              onClick={() => {
                soundAlerts.playSpringSweepChime();
                setBacktesterOpen(true);
              }}
              className="px-4 py-3 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25 active:scale-95 transition-all cursor-pointer border border-purple-400/40"
              title="Open Quantitative Strategy Backtester & Compounding Equity Simulator"
            >
              <PieChart className="w-4 h-4 text-purple-200" />
              <span>Strategy Backtester</span>
            </button>
          </div>
        </div>

        {/* Live Footprint Captured Notice alert */}
        {liveAlertNotice && (
          <div className="mt-4 p-3 rounded-xl bg-gradient-to-r from-amber-500/20 via-emerald-500/10 to-amber-500/20 border border-amber-400 text-amber-200 text-xs font-bold flex items-center justify-between gap-2 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>{liveAlertNotice}</span>
            </div>
            <span className="text-[10px] opacity-75 font-mono">Recorded to SQLite</span>
          </div>
        )}

        {/* Notice alert */}
        {exportNotice && (
          <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{exportNotice}</span>
          </div>
        )}
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="web2-card p-5 rounded-2xl border border-sky-100/80 bg-white/90 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Monitored Small-Caps</span>
            <Layers className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 tracking-tight">
            {leaderboard.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 font-medium">
            <span>High-growth & turnaround universe</span>
          </div>
        </div>

        {/* Card 2 */}
        <div className="web2-card p-5 rounded-2xl border border-amber-200/80 bg-gradient-to-br from-white to-amber-50/40 shadow-sm">
          <div className="flex items-center justify-between text-amber-800 text-xs font-semibold mb-1">
            <span>Accumulation Footprints</span>
            <Flame className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-amber-950 tracking-tight">
            {totalEvents} <span className="text-xs font-sans text-amber-700 font-semibold">Events Logged</span>
          </div>
          <div className="text-[11px] text-amber-800/80 mt-1 flex items-center gap-1 font-medium">
            <span>Across 6–8 month rolling trail</span>
          </div>
        </div>

        {/* Card 3: Top Candidate (HFCL) */}
        <div className="web2-card p-5 rounded-2xl border border-amber-300/80 bg-gradient-to-br from-amber-500/10 via-white to-amber-500/5 shadow-sm">
          <div className="flex items-center justify-between text-amber-900 text-xs font-semibold mb-1">
            <span>⭐ Top Gold Mine Candidate</span>
            <Award className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black font-mono text-slate-950">
              {topPick ? topPick.ticker : 'HFCL'}
            </span>
            <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-full bg-amber-200/70 text-amber-950 border border-amber-300">
              {topPick ? `${topPick.eventCount} Clusters` : '6 Clusters'}
            </span>
          </div>
          <div className="text-[11px] text-slate-600 mt-1 font-mono">
            Base: <strong>{topPick?.basePriceBand || '₹81.50 - ₹88.75'}</strong>
          </div>
        </div>

        {/* Card 4: High Conviction */}
        <div className="web2-card p-5 rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-white to-emerald-50/40 shadow-sm">
          <div className="flex items-center justify-between text-emerald-800 text-xs font-semibold mb-1">
            <span>High Conviction (&gt;85%)</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-950 tracking-tight">
            {highConvictionCount}
          </div>
          <div className="text-[11px] text-emerald-800/80 mt-1 font-medium">
            Multi-cluster institutional absorption
          </div>
        </div>
      </div>

      {/* Live Intraday Footprint Scanner Stream Strip */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-amber-950/20 to-slate-900 border border-amber-500/30 text-xs shadow-md">
        <div className="flex items-center justify-between gap-3 mb-2.5 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-extrabold text-amber-300 uppercase tracking-wide font-mono text-[11px]">
              Live Intraday Footprint Scanner
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 text-[9px] font-mono font-bold">
              ACTIVE ENGINE
            </span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            {liveAlerts.length > 0
              ? `${liveAlerts.length} Footprints Logged Today`
              : 'Streaming ticks analyzed: block orders (≥3.2x), icebergs, and Ask absorption'}
          </div>
        </div>

        {liveAlerts.length === 0 ? (
          <div className="text-center py-2.5 text-slate-400 text-[11px] font-mono bg-slate-950/50 rounded-xl border border-slate-800/60">
            Engine active: monitoring live stream for high-ticket block footprints and institutional Ask-absorption...
          </div>
        ) : (
          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-none">
            {liveAlerts.slice(0, 8).map((al: any) => (
              <div
                key={al.id || `${al.symbol}-${al.timestamp}`}
                onClick={() => {
                  setSelectedSymbol(al.symbol);
                  fetchTrail(al.symbol);
                }}
                className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer shrink-0 transition-all ${
                  selectedSymbol === al.symbol
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200 ring-1 ring-amber-400 shadow-sm'
                    : 'bg-slate-950/80 border-slate-800 hover:border-amber-500/40 text-slate-300'
                }`}
                title="Click to view continuous accumulation trail"
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5 font-bold font-mono text-[11px]">
                    <span className="text-amber-400">{al.ticker}</span>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                      {al.volume_multiple}x Vol
                    </span>
                    <span className="text-[9px] text-emerald-400">₹{al.ltp}</span>
                    <span className="text-[9px] text-slate-400 opacity-80">{al.time || 'Just now'}</span>
                  </div>
                  <div className="text-[9px] text-slate-400 truncate max-w-[220px] mt-0.5">
                    {al.pattern_type.replace(/_/g, ' ')} • {al.note.split(':')[1] || al.note}
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Control Filters Toolbar */}
      <div className="web2-card p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4">
        {/* Left: Search & Sector */}
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              id="search-smart-money"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ticker, company, or sector (e.g., HFCL)..."
              className="w-full pl-9.5 pr-4 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all font-medium"
            />
          </div>

          {/* Sector Filter */}
          <div className="relative">
            <select
              id="select-smart-sector"
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="pl-3 pr-8 py-2 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer appearance-none"
            >
              <option value="ALL">All Sectors ({sectors.length})</option>
              {sectors.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Right: Timeframe Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTimeframe('30d')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              timeframe === '30d'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            Last 30D
          </button>
          <button
            type="button"
            onClick={() => setTimeframe('90d')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              timeframe === '90d'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            Last 90D
          </button>
          <button
            type="button"
            onClick={() => setTimeframe('180d')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              timeframe === '180d'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            Last 180D (6M)
          </button>
          <button
            type="button"
            onClick={() => setTimeframe('all')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              timeframe === 'all'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            All 8M Trail
          </button>
        </div>
      </div>

      {/* Master-Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT PANEL: Gold Mine Small-Cap Leaderboard (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="web2-card rounded-2xl overflow-hidden shadow-sm border border-slate-200">
            <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  Gold Mine Leaderboard ({filteredStocks.length} Stocks)
                </h2>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">Ranked by Accumulation Clusters</span>
            </div>

            {loadingLeaderboard ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-500 mb-2" />
                <span>Scanning smart money database...</span>
              </div>
            ) : filteredStocks.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                No stocks match your filter criteria.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[680px] overflow-y-auto">
                <table className="w-full text-left font-sans text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 text-slate-600 font-bold border-b border-slate-200 text-[11px] uppercase tracking-wider sticky top-0 z-10">
                      <th className="py-2.5 px-3">Rank</th>
                      <th className="py-2.5 px-3">Stock / Sector</th>
                      <th className="py-2.5 px-3 text-right">LTP (₹)</th>
                      <th className="py-2.5 px-3 text-center">Clusters</th>
                      <th className="py-2.5 px-3">Base Price Band</th>
                      <th className="py-2.5 px-3 text-right">Avg Vol</th>
                      <th className="py-2.5 px-3 text-center">Conviction</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStocks.map((stock) => {
                      const isSelected = stock.symbol === selectedSymbol;
                      const isPositive = stock.change >= 0;

                      return (
                        <tr
                          key={stock.symbol}
                          onClick={() => setSelectedSymbol(stock.symbol)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-amber-50/90 border-l-4 border-amber-500'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          {/* Rank */}
                          <td className="py-3 px-3 font-mono font-bold text-slate-500 text-center w-8">
                            #{stock.rank}
                          </td>

                          {/* Stock Name */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-900 text-xs">
                                {stock.ticker}
                              </span>
                              {stock.symbol === 'NSE:HFCL-EQ' && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500 text-slate-950 font-bold uppercase font-mono">
                                  Top Pick
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate max-w-[140px]">
                              {stock.company_name}
                            </div>
                            <div className="text-[10px] text-amber-700 font-medium truncate max-w-[140px]">
                              {stock.sector}
                            </div>
                          </td>

                          {/* LTP */}
                          <td className="py-3 px-3 text-right font-mono">
                            <div className="font-extrabold text-slate-900">
                              ₹{stock.currentLtp.toFixed(2)}
                            </div>
                            <div
                              className={`text-[10px] font-bold ${
                                isPositive ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {isPositive ? '+' : ''}
                              {stock.pChange.toFixed(2)}%
                            </div>
                          </td>

                          {/* Event Count Badge */}
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
                                stock.eventCount >= 5
                                  ? 'bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs'
                                  : stock.eventCount >= 3
                                  ? 'bg-sky-100 text-sky-950 border border-sky-300'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              <Flame className="w-3 h-3 text-amber-500" />
                              {stock.eventCount}
                            </span>
                          </td>

                          {/* Accumulation Base Price Band */}
                          <td className="py-3 px-3 font-mono text-[11px]">
                            <div className="font-bold text-slate-800">{stock.basePriceBand}</div>
                            <div className="text-[10px] text-slate-400">
                              Latest: {stock.latestDate}
                            </div>
                          </td>

                          {/* Avg Vol Multiple */}
                          <td className="py-3 px-3 text-right font-mono font-bold text-amber-700 text-xs">
                            {stock.avgVolMult}x
                          </td>

                          {/* Conviction Score */}
                          <td className="py-3 px-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span
                                className={`text-[11px] font-mono font-bold ${
                                  stock.convictionScore >= 90
                                    ? 'text-emerald-600'
                                    : stock.convictionScore >= 80
                                    ? 'text-amber-600'
                                    : 'text-slate-600'
                                }`}
                              >
                                {stock.convictionScore}%
                              </span>
                              <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    stock.convictionScore >= 90
                                      ? 'bg-emerald-500'
                                      : stock.convictionScore >= 80
                                      ? 'bg-amber-500'
                                      : 'bg-slate-400'
                                  }`}
                                  style={{ width: `${stock.convictionScore}%` }}
                                ></div>
                              </div>
                            </div>
                          </td>

                          {/* Quick Action */}
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedSymbol(stock.symbol);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 text-[11px] font-bold transition-all cursor-pointer"
                              >
                                Inspect
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  let baseFloor: number | undefined;
                                  if (stock.basePriceBand) {
                                    const match = stock.basePriceBand.match(/₹?([0-9.]+)/);
                                    if (match) baseFloor = parseFloat(match[1]);
                                  }
                                  setBracketOrderModal({
                                    isOpen: true,
                                    symbol: stock.symbol,
                                    currentPrice: stock.currentLtp,
                                    strategyName: 'Institutional Smart Money Trail (Accumulation Base)',
                                    winRate: `${stock.convictionScore}% Conviction`,
                                    dayLow: baseFloor || stock.currentLtp * 0.96
                                  });
                                }}
                                className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300/80 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-0.5"
                                title="1-Click Institutional Bracket Order"
                              >
                                <Zap className="w-3 h-3 text-emerald-600" />
                                <span>Bracket</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setChartModalStock({
                                    symbol: stock.symbol,
                                    ltp: stock.currentLtp,
                                    name: stock.company_name,
                                  });
                                }}
                                className="px-2 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300/80 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-0.5"
                                title="Open Candlestick Chart with Smart Money Footprints"
                              >
                                <BarChart2 className="w-3 h-3 text-sky-600" />
                                <span>Chart</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Chronological Excerpt Timeline (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="web2-card rounded-2xl overflow-hidden shadow-sm border border-slate-200">
            {/* Timeline Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-slate-950 text-white border-b border-slate-800">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-lg sm:text-xl text-amber-400">
                      {currentSelectedStock?.ticker || selectedSymbol}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      {trailEvents.length} Excerpt Notes
                    </span>
                  </div>
                  <h3 className="text-xs text-slate-300 font-medium">
                    {currentSelectedStock?.company_name}
                  </h3>
                </div>

                {/* Live Action Buttons */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentSelectedStock) return;
                      let baseFloor: number | undefined;
                      if (currentSelectedStock.basePriceBand) {
                        const match = currentSelectedStock.basePriceBand.match(/₹?([0-9.]+)/);
                        if (match) baseFloor = parseFloat(match[1]);
                      }
                      soundAlerts.playSmartMoneyChime();
                      setBracketOrderModal({
                        isOpen: true,
                        symbol: currentSelectedStock.symbol,
                        currentPrice: currentSelectedStock.currentLtp,
                        strategyName: 'Institutional Smart Money Trail (Accumulation Base)',
                        winRate: `${currentSelectedStock.convictionScore}% Conviction`,
                        dayLow: baseFloor || currentSelectedStock.currentLtp * 0.96
                      });
                    }}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs flex items-center gap-1 shadow-md transition-all cursor-pointer"
                    title="Pre-calculated 2R/3.5R Bracket Order with SL under base"
                  >
                    <Zap className="w-3.5 h-3.5 fill-slate-950" />
                    <span>⚡ Bracket (1-Click)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentSelectedStock) return;
                      setChartModalStock({
                        symbol: currentSelectedStock.symbol,
                        ltp: currentSelectedStock.currentLtp,
                        name: currentSelectedStock.company_name,
                      });
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-500/40 font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
                    title="Open TradingView Candlestick Chart"
                  >
                    <BarChart2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>Chart</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      currentSelectedStock &&
                      onSelectForTrade(currentSelectedStock.symbol, currentSelectedStock.currentLtp)
                    }
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1 border border-slate-700 transition-all cursor-pointer"
                  >
                    <span>Regular</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      currentSelectedStock && onAddToMonitor(currentSelectedStock.symbol)
                    }
                    className="px-2.5 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-400/40 font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <span>+ Monitor</span>
                  </button>
                </div>
              </div>

              {/* Price & Base Band Highlight */}
              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-xs font-mono">
                <div>
                  <span className="text-slate-400 text-[10px] block">CURRENT PRICE</span>
                  <span className="font-bold text-white text-sm">
                    ₹{currentSelectedStock?.currentLtp.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">ACCUMULATION BASE</span>
                  <span className="font-bold text-amber-300 text-sm">
                    {currentSelectedStock?.basePriceBand}
                  </span>
                </div>
              </div>
            </div>

            {/* Timeline Excerpts Container */}
            <div className="p-4 sm:p-5 max-h-[620px] overflow-y-auto space-y-4">
              {loadingTrail ? (
                <div className="p-10 text-center text-slate-500 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-amber-500 mb-2" />
                  <span>Loading excerpts...</span>
                </div>
              ) : trailEvents.length === 0 ? (
                <div className="p-10 text-center text-slate-500 text-xs">
                  No trail excerpts recorded for this timeframe.
                </div>
              ) : (
                trailEvents.map((evt, index) => (
                  <div
                    key={evt.id || index}
                    className="relative pl-6 pb-2 border-l-2 border-amber-300/60 last:border-transparent"
                  >
                    {/* Circle Node */}
                    <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-amber-500 border-2 border-white shadow-xs flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-950"></div>
                    </div>

                    {/* Excerpt Card */}
                    <div className="web2-card p-3.5 rounded-xl border border-slate-200 bg-white/95 shadow-2xs hover:border-amber-400 transition-all">
                      {/* Top Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-900 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-amber-600" />
                            {evt.date}
                          </span>
                          <span className="text-xs font-mono font-black text-slate-950 bg-slate-100 px-2 py-0.5 rounded-md">
                            LTP ₹{evt.ltp.toFixed(2)}
                          </span>
                        </div>

                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                          Score: {evt.score}%
                        </span>
                      </div>

                      {/* Quantitative Footprint Metrics */}
                      <div className="grid grid-cols-3 gap-1.5 mb-2.5 p-2 rounded-lg bg-slate-50 border border-slate-100 text-[10px] font-mono">
                        <div>
                          <span className="text-slate-400 block text-[9px]">VOL MULTIPLE</span>
                          <span className="font-bold text-amber-800">{evt.volume_multiple}x 20DMA</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px]">AVG TICKET</span>
                          <span className="font-bold text-slate-800">{evt.trade_size_mult}x Size</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px]">BUY AGGRESSOR</span>
                          <span className="font-bold text-emerald-700">{evt.aggressor_ratio}% Ask</span>
                        </div>
                      </div>

                      {/* The 1-2 Line Concise Note */}
                      <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200/80 text-xs text-slate-800 leading-relaxed font-medium">
                        <p>“{evt.note}”</p>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span>Pattern: {evt.pattern_type}</span>
                        <span>Spread: {evt.price_spread_pct}%</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 1-Click Institutional Bracket Order Modal */}
      {bracketOrderModal && (
        <BracketOrderModal
          isOpen={bracketOrderModal.isOpen}
          onClose={() => setBracketOrderModal(null)}
          symbol={bracketOrderModal.symbol}
          currentPrice={bracketOrderModal.currentPrice}
          strategyName={bracketOrderModal.strategyName}
          winRate={bracketOrderModal.winRate}
          dayLow={bracketOrderModal.dayLow}
          onOrderSuccess={(msg) => {
            setLiveAlertNotice(`✅ ${msg}`);
            setTimeout(() => setLiveAlertNotice(null), 6000);
          }}
        />
      )}

      {/* TradingView Candlestick Chart with Smart Money Overlays */}
      {chartModalStock && (
        <TradingViewChartModal
          isOpen={Boolean(chartModalStock)}
          onClose={() => setChartModalStock(null)}
          symbol={chartModalStock.symbol}
          currentPrice={chartModalStock.ltp}
          companyName={chartModalStock.name}
          onSelectForTrade={onSelectForTrade}
        />
      )}

      {/* Quantitative Strategy Backtester & Equity Curve Simulator Modal */}
      {backtesterOpen && (
        <StrategyBacktesterModal
          isOpen={backtesterOpen}
          onClose={() => setBacktesterOpen(false)}
          defaultStrategy="smart_money_trail"
          initialSymbol={selectedSymbol}
        />
      )}
    </div>
  );
};
