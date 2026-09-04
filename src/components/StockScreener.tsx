import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  ArrowUpRight, 
  ArrowDownRight, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Flame, 
  Plus, 
  Zap, 
  RefreshCw, 
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
  ShieldCheck,
  Radio
} from 'lucide-react';

export interface ScreenerStock {
  symbol: string;
  ticker: string;
  name: string;
  sector: string;
  ltp: number;
  change: number;
  pChange: number;
  high: number;
  low: number;
  volume: number;
  vwap: number;
  bid?: number;
  ask?: number;
  spread?: number;
  rsi: number;
  high52w: number;
  low52w: number;
  isRealFyers?: boolean;
}

interface StockScreenerProps {
  onAddToMonitor: (symbol: string) => void;
  onSelectForTrade: (symbol: string, currentPrice: number) => void;
  monitoredSymbols: string[];
}

export const StockScreener: React.FC<StockScreenerProps> = ({
  onAddToMonitor,
  onSelectForTrade,
  monitoredSymbols,
}) => {
  const [stocks, setStocks] = useState<ScreenerStock[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [preset, setPreset] = useState<'all' | 'gainers' | 'losers' | 'volume' | 'momentum'>('all');
  const [sortField, setSortField] = useState<keyof ScreenerStock>('pChange');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [addedNotice, setAddedNotice] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const fetchScreenerData = async (isManual = false) => {
    try {
      if (isManual) setLoading(true);
      const res = await fetch('/api/screener/data');
      if (res.ok) {
        const data = await res.json();
        setStocks(data);
        setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour12: false }));
      }
    } catch (err) {
      console.error('Screener fetch error:', err);
    } finally {
      if (isManual) setLoading(false);
    }
  };

  useEffect(() => {
    fetchScreenerData(true);
  }, []);

  // Real-time live polling (every 4 seconds)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchScreenerData(false);
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Distinct sectors
  const sectors = useMemo(() => {
    const s = new Set<string>();
    stocks.forEach(st => {
      if (st.sector) s.add(st.sector);
    });
    return Array.from(s).sort();
  }, [stocks]);

  // Summary Metrics
  const summary = useMemo(() => {
    if (!stocks.length) return { advances: 0, declines: 0, topGainer: null, topLoser: null };
    let adv = 0, dec = 0;
    let topG: ScreenerStock = stocks[0];
    let topL: ScreenerStock = stocks[0];

    stocks.forEach(st => {
      if (st.pChange >= 0) adv++;
      else dec++;
      if (st.pChange > topG.pChange) topG = st;
      if (st.pChange < topL.pChange) topL = st;
    });

    return { advances: adv, declines: dec, topGainer: topG, topLoser: topL };
  }, [stocks]);

  // Filtering & Sorting
  const filteredStocks = useMemo(() => {
    return stocks
      .filter(st => {
        // Preset filtering
        if (preset === 'gainers' && st.pChange < 0.5) return false;
        if (preset === 'losers' && st.pChange > -0.5) return false;
        if (preset === 'volume' && st.volume < 1000000) return false;
        if (preset === 'momentum' && st.rsi < 60) return false;

        // Sector filtering
        if (selectedSector !== 'ALL' && st.sector !== selectedSector) return false;

        // Search
        if (search.trim()) {
          const q = search.toLowerCase();
          return (
            st.symbol.toLowerCase().includes(q) ||
            st.ticker.toLowerCase().includes(q) ||
            st.name.toLowerCase().includes(q)
          );
        }

        return true;
      })
      .sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return sortAsc ? Number(valA || 0) - Number(valB || 0) : Number(valB || 0) - Number(valA || 0);
      });
  }, [stocks, preset, selectedSector, search, sortField, sortAsc]);

  const handleSort = (field: keyof ScreenerStock) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const handleAdd = (symbol: string) => {
    onAddToMonitor(symbol);
    setAddedNotice(`Added ${symbol} to Live Monitor!`);
    setTimeout(() => setAddedNotice(null), 2000);
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      
      {/* Top Screener Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        
        {/* Total Stocks Card */}
        <div className="web2-card rounded-2xl p-4 flex flex-col justify-between border-sky-200/80 bg-white/90 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase font-mono">
            <span>Market Breadth</span>
            <Activity className="w-4 h-4 text-sky-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-sky-950">{stocks.length}</span>
            <span className="text-xs text-slate-500">Live Quotes</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs font-mono font-bold">
            <span className="text-emerald-600">▲ {summary.advances} Adv</span>
            <span className="text-rose-600">▼ {summary.declines} Dec</span>
          </div>
        </div>

        {/* Top Gainer */}
        <div className="web2-card rounded-2xl p-4 flex flex-col justify-between border-emerald-200/80 bg-emerald-50/50 shadow-xs">
          <div className="flex items-center justify-between text-xs text-emerald-800 font-bold uppercase font-mono">
            <span>Top Gainer</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <div className="text-sm font-extrabold text-emerald-950 truncate">{summary.topGainer?.ticker || '—'}</div>
            <div className="text-xs text-slate-500 truncate">{summary.topGainer?.name || '—'}</div>
          </div>
          <div className="mt-1 text-sm font-mono font-black text-emerald-600">
            +{summary.topGainer?.pChange?.toFixed(2) ?? '0.00'}%
          </div>
        </div>

        {/* Top Loser */}
        <div className="web2-card rounded-2xl p-4 flex flex-col justify-between border-rose-200/80 bg-rose-50/50 shadow-xs">
          <div className="flex items-center justify-between text-xs text-rose-800 font-bold uppercase font-mono">
            <span>Top Drag</span>
            <TrendingDown className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2">
            <div className="text-sm font-extrabold text-rose-950 truncate">{summary.topLoser?.ticker || '—'}</div>
            <div className="text-xs text-slate-500 truncate">{summary.topLoser?.name || '—'}</div>
          </div>
          <div className="mt-1 text-sm font-mono font-black text-rose-600">
            {summary.topLoser?.pChange?.toFixed(2) ?? '0.00'}%
          </div>
        </div>

        {/* Volume Heat */}
        <div className="web2-card rounded-2xl p-4 flex flex-col justify-between border-amber-200/80 bg-amber-50/50 shadow-xs">
          <div className="flex items-center justify-between text-xs text-amber-800 font-bold uppercase font-mono">
            <span>Volume Breakouts</span>
            <Flame className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black text-amber-950">
              {stocks.filter(s => s.volume > 1500000).length}
            </span>
            <span className="text-xs text-slate-500">Active Surges</span>
          </div>
          <div className="mt-1 text-xs text-amber-700 font-medium">
            &gt; 1.5M real volume today
          </div>
        </div>

      </div>

      {/* Control Bar: Presets, Sector Filter, Search & Refresh */}
      <div className="web2-card rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white/90 border-sky-200/80 shadow-xs">
        
        {/* Preset Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setPreset('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              preset === 'all'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Stocks ({stocks.length})
          </button>
          <button
            type="button"
            onClick={() => setPreset('gainers')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer ${
              preset === 'gainers'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Gainers (&gt; +0.5%)</span>
          </button>
          <button
            type="button"
            onClick={() => setPreset('losers')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer ${
              preset === 'losers'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            <span>Losers (&lt; -0.5%)</span>
          </button>
          <button
            type="button"
            onClick={() => setPreset('volume')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer ${
              preset === 'volume'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>High Volume</span>
          </button>
          <button
            type="button"
            onClick={() => setPreset('momentum')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer ${
              preset === 'momentum'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-purple-50 text-purple-900 border border-purple-200 hover:bg-purple-100'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>RSI Momentum</span>
          </button>
        </div>

        {/* Right Controls: Sector, Search, Auto-Refresh & Live Indicator */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          
          {/* Live Feed Status Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-[11px] font-mono font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>REAL FYERS FEED</span>
            {lastUpdated && <span className="opacity-70 ml-1">({lastUpdated})</span>}
          </div>

          {/* Auto Refresh Toggle */}
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border ${
              autoRefresh
                ? 'bg-sky-50 text-sky-800 border-sky-300'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
            title="Auto-refresh screener prices every 4 seconds"
          >
            <Radio className={`w-3 h-3 ${autoRefresh ? 'text-sky-600 animate-pulse' : 'text-slate-400'}`} />
            <span>{autoRefresh ? 'Auto 4s' : 'Paused'}</span>
          </button>

          {/* Sector Select */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Sectors ({sectors.length})</option>
              {sectors.map(sec => (
                <option key={sec} value={sec}>{sec}</option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 sm:w-44">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticker, name..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-sky-500 bg-white"
            />
          </div>

          {/* Manual Refresh Button */}
          <button
            type="button"
            onClick={() => fetchScreenerData(true)}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:text-sky-700 hover:bg-sky-50 border border-slate-300 transition-colors cursor-pointer"
            title="Refresh now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-600' : ''}`} />
          </button>
        </div>

      </div>

      {/* Added Notification Toast */}
      {addedNotice && (
        <div className="bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-lg flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <span>{addedNotice}</span>
          <span className="text-[10px] opacity-80">Switch to Live Monitor tab to view feed</span>
        </div>
      )}

      {/* Main Screener Table */}
      <div className="web2-card rounded-2xl md:rounded-3xl border border-sky-200/80 shadow-md bg-slate-950 overflow-hidden">
        <div className="overflow-x-auto max-h-[640px] scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
          <table className="w-full text-left font-mono text-xs text-slate-200 border-collapse">
            <thead>
              <tr className="bg-slate-900/95 text-slate-400 font-bold border-b border-slate-800 text-[11px] uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md">
                <th className="py-3 px-3.5 cursor-pointer hover:text-white" onClick={() => handleSort('symbol')}>
                  <div className="flex items-center gap-1">
                    <span>Symbol</span>
                    {sortField === 'symbol' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="py-3 px-3">Sector</th>
                <th className="py-3 px-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort('ltp')}>
                  <div className="flex items-center justify-end gap-1">
                    <span>LTP (₹)</span>
                    {sortField === 'ltp' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="py-3 px-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort('pChange')}>
                  <div className="flex items-center justify-end gap-1">
                    <span>Change %</span>
                    {sortField === 'pChange' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="py-3 px-3 text-right text-emerald-400">Day High</th>
                <th className="py-3 px-3 text-right text-rose-400">Day Low</th>
                <th className="py-3 px-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort('volume')}>
                  <div className="flex items-center justify-end gap-1">
                    <span>Exchange Vol</span>
                    {sortField === 'volume' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="py-3 px-3 text-right">Spread</th>
                <th className="py-3 px-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort('rsi')}>
                  <div className="flex items-center justify-end gap-1">
                    <span>RSI</span>
                    {sortField === 'rsi' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="py-3 px-3.5 text-center">Quick Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[12px]">
              {loading && stocks.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-400" />
                    <span>Fetching live market quotes from FYERS Cloud...</span>
                  </td>
                </tr>
              ) : filteredStocks.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    No stocks matching the selected filter or search query.
                  </td>
                </tr>
              ) : (
                filteredStocks.map((st) => {
                  const isPos = st.pChange >= 0;
                  const isMonitored = monitoredSymbols.includes(st.symbol);

                  return (
                    <tr key={st.symbol} className="hover:bg-slate-900/80 transition-colors">
                      {/* Symbol & Name */}
                      <td className="py-2.5 px-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sky-300 text-[13px]">{st.ticker}</span>
                          {st.isRealFyers && (
                            <span className="px-1 py-0.2 rounded text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800" title="Real-time FYERS Quote">
                              FYERS
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[170px]">{st.name}</div>
                      </td>

                      {/* Sector */}
                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                        <span className="px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700/60">
                          {st.sector}
                        </span>
                      </td>

                      {/* LTP */}
                      <td className={`py-2.5 px-3 text-right font-extrabold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ₹{st.ltp.toFixed(2)}
                      </td>

                      {/* % Change */}
                      <td className={`py-2.5 px-3 text-right font-extrabold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                        <div className="flex items-center justify-end gap-1">
                          {isPos ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          <span>{isPos ? '+' : ''}{st.pChange.toFixed(2)}%</span>
                        </div>
                      </td>

                      {/* High */}
                      <td className="py-2.5 px-3 text-right text-emerald-400/90 font-medium">
                        {st.high.toFixed(2)}
                      </td>

                      {/* Low */}
                      <td className="py-2.5 px-3 text-right text-rose-400/90 font-medium">
                        {st.low.toFixed(2)}
                      </td>

                      {/* Volume */}
                      <td className="py-2.5 px-3 text-right text-amber-300 font-medium">
                        {st.volume.toLocaleString()}
                      </td>

                      {/* Spread */}
                      <td className="py-2.5 px-3 text-right text-slate-400 font-mono text-[11px]">
                        {st.spread != null ? st.spread.toFixed(2) : '-'}
                      </td>

                      {/* RSI Gauge */}
                      <td className="py-2.5 px-3 text-right">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                          st.rsi >= 70 ? 'bg-rose-950/80 text-rose-400 border border-rose-800' :
                          st.rsi <= 30 ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' :
                          'bg-slate-800 text-slate-300'
                        }`}>
                          {st.rsi}
                        </span>
                      </td>

                      {/* Quick Actions */}
                      <td className="py-2.5 px-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          
                          {/* Monitor Button */}
                          <button
                            type="button"
                            onClick={() => handleAdd(st.symbol)}
                            disabled={isMonitored}
                            className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              isMonitored
                                ? 'bg-slate-800 text-slate-500 cursor-default'
                                : 'bg-sky-950 text-sky-300 hover:bg-sky-800 border border-sky-700'
                            }`}
                            title={isMonitored ? 'Already in Live Monitor' : 'Add to Live Monitor Watchlist'}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>

                          {/* Trade Button */}
                          <button
                            type="button"
                            onClick={() => onSelectForTrade(st.symbol, st.ltp)}
                            className="px-2 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                            title="Open in Trading Ticket"
                          >
                            <Zap className="w-3 h-3 fill-current" />
                            <span>Trade</span>
                          </button>

                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
