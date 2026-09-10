import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Trash2, 
  ArrowUpRight, 
  ArrowDownRight, 
  Zap, 
  RefreshCw, 
  ShieldCheck, 
  Star,
  CheckCircle2,
  AlertCircle,
  BarChart2,
  ExternalLink,
  Activity,
  Layers,
  Sparkles
} from 'lucide-react';
import { TradingViewChartModal } from './TradingViewChartModal';
import { getStockFundamentals, StockFundamentals } from '../data/stockFundamentals';

export interface WatchlistQuote {
  symbol: string;
  ltp: number;
  change: number;
  pChange: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  volume: number;
  vwap: number;
  bid: number;
  ask: number;
  spread: number;
  isRealFyers?: boolean;
}

interface StockWatchlistProps {
  onSelectForTrade: (symbol: string, currentPrice: number, side?: 'BUY' | 'SELL') => void;
  selectedSymbol?: string;
  layout?: 'full' | 'compact';
  title?: string;
}

const DEFAULT_WATCHLIST = [
  'NSE:SIGACHI-EQ',
  'NSE:IDEA-EQ',
  'NSE:YESBANK-EQ',
  'NSE:TATASTEEL-EQ',
  'NSE:SBIN-EQ',
  'NSE:RELIANCE-EQ',
  'NSE:INFY-EQ',
];

const POPULAR_SUGGESTIONS = [
  { sym: 'NSE:SIGACHI-EQ', label: 'SIGACHI (~₹38)' },
  { sym: 'NSE:IDEA-EQ', label: 'IDEA (~₹15)' },
  { sym: 'NSE:YESBANK-EQ', label: 'YESBANK (~₹20)' },
  { sym: 'NSE:SUZLON-EQ', label: 'SUZLON (~₹58)' },
  { sym: 'NSE:IRFC-EQ', label: 'IRFC (~₹140)' },
  { sym: 'NSE:ZOMATO-EQ', label: 'ZOMATO (~₹260)' },
  { sym: 'NSE:TATASTEEL-EQ', label: 'TATASTEEL (~₹150)' },
  { sym: 'NSE:SBIN-EQ', label: 'SBIN (~₹800)' },
  { sym: 'NSE:RELIANCE-EQ', label: 'RELIANCE (~₹1280)' },
];

const STORAGE_KEY = 'fyers_user_watchlist';

export const StockWatchlist: React.FC<StockWatchlistProps> = ({
  onSelectForTrade,
  selectedSymbol,
  layout = 'full',
  title = 'My Stock Watchlist'
}) => {
  // Load initial symbols from localStorage
  const [symbols, setSymbols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (!parsed.includes('NSE:SIGACHI-EQ')) {
            return ['NSE:SIGACHI-EQ', ...parsed];
          }
          return parsed;
        }
      }
    } catch {}
    return DEFAULT_WATCHLIST;
  });

  const [quotes, setQuotes] = useState<Record<string, WatchlistQuote>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [newSymbolInput, setNewSymbolInput] = useState<string>('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [flashMap, setFlashMap] = useState<Record<string, 'up' | 'down'>>({});
  const prevQuotesRef = useRef<Record<string, number>>({});

  // Chart modal state
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);

  // Hover Popover HUD state
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const hoverEnterTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hoverLeaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Real FYERS fundamentals & performance cache
  const [realFundamentalsMap, setRealFundamentalsMap] = useState<Record<string, any>>({});

  const fetchRealFundamentals = async (sym: string) => {
    if (realFundamentalsMap[sym]) return;
    try {
      const res = await fetch(`/api/market/fundamentals/${encodeURIComponent(sym)}`);
      if (res.ok) {
        const data = await res.json();
        setRealFundamentalsMap(prev => ({ ...prev, [sym]: data }));
      }
    } catch (err) {
      console.warn('Fundamentals fetch error:', err);
    }
  };

  const handleMouseEnter = (sym: string, e: React.MouseEvent) => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
    const clientX = e.clientX;
    const clientY = e.clientY;
    fetchRealFundamentals(sym);
    hoverEnterTimerRef.current = setTimeout(() => {
      setHoverPos({ x: clientX, y: clientY });
      setHoveredSymbol(sym);
    }, 120);
  };

  const handleMouseLeave = () => {
    if (hoverEnterTimerRef.current) {
      clearTimeout(hoverEnterTimerRef.current);
      hoverEnterTimerRef.current = null;
    }
    hoverLeaveTimerRef.current = setTimeout(() => {
      setHoveredSymbol(null);
      setHoverPos(null);
    }, 180);
  };

  const cancelHoverClose = () => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
  };

  // Sync to localStorage & broadcast event for cross-component sync
  const saveSymbols = (newSyms: string[]) => {
    setSymbols(newSyms);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSyms));
      window.dispatchEvent(new CustomEvent('fyers_watchlist_updated', { detail: newSyms }));
    } catch {}
  };

  // Listen to external changes (e.g. from other tab or component)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setSymbols(parsed);
        } catch {}
      }
    };

    const handleCustomChange = (e: any) => {
      if (Array.isArray(e.detail)) setSymbols(e.detail);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('fyers_watchlist_updated', handleCustomChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('fyers_watchlist_updated', handleCustomChange);
    };
  }, []);

  // Normalize symbol (e.g. "sigachi" -> "NSE:SIGACHI-EQ")
  const normalizeSymbol = (raw: string): string => {
    let clean = raw.trim().toUpperCase();
    if (!clean) return '';
    if (clean.includes(':')) return clean;
    if (clean.endsWith('-EQ')) return `NSE:${clean}`;
    return `NSE:${clean}-EQ`;
  };

  // Fetch Quotes in Batch from backend
  const fetchQuotes = async () => {
    if (symbols.length === 0) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/market/quotes?symbols=${encodeURIComponent(symbols.join(','))}`);
      if (!res.ok) throw new Error('Failed to fetch quotes');
      const data = await res.json();
      if (data.quotes) {
        const newFlash: Record<string, 'up' | 'down'> = {};
        Object.entries(data.quotes).forEach(([sym, q]: [string, any]) => {
          const prev = prevQuotesRef.current[sym];
          if (prev != null && q.ltp != null) {
            if (q.ltp > prev) newFlash[sym] = 'up';
            else if (q.ltp < prev) newFlash[sym] = 'down';
          }
          if (q.ltp != null) prevQuotesRef.current[sym] = q.ltp;
        });

        if (Object.keys(newFlash).length > 0) {
          setFlashMap(prev => ({ ...prev, ...newFlash }));
          setTimeout(() => {
            setFlashMap(prev => {
              const updated = { ...prev };
              Object.keys(newFlash).forEach(k => delete updated[k]);
              return updated;
            });
          }, 800);
        }

        setQuotes(data.quotes);
      }
    } catch (err) {
      console.warn('Watchlist quote fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 2500);
    return () => clearInterval(interval);
  }, [symbols]);

  // Add symbol to watchlist
  const handleAddSymbol = (e: React.FormEvent) => {
    e.preventDefault();
    setInputError(null);
    const sym = normalizeSymbol(newSymbolInput);
    if (!sym) return;

    if (symbols.includes(sym)) {
      setInputError(`${sym} is already in watchlist`);
      return;
    }

    const updated = [sym, ...symbols];
    saveSymbols(updated);
    setNewSymbolInput('');
    fetchQuotes();
  };

  // Add quick suggestion
  const handleAddQuickSuggestion = (sym: string) => {
    if (!symbols.includes(sym)) {
      const updated = [sym, ...symbols];
      saveSymbols(updated);
      fetchQuotes();
    }
  };

  // Remove symbol
  const handleRemoveSymbol = (sym: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = symbols.filter(s => s !== sym);
    saveSymbols(updated);
  };

  const getTickerOnly = (sym: string) => {
    return sym.replace('NSE:', '').replace('BSE:', '').replace('-EQ', '');
  };

  return (
    <div className="flex flex-col gap-3 relative w-full">
      
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
          <h3 className="font-extrabold text-sm text-sky-950 tracking-tight">{title}</h3>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-bold">
            {symbols.length} Stocks
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={fetchQuotes}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-500 hover:text-sky-700 hover:bg-sky-50 transition-colors cursor-pointer"
            title="Refresh Quotes"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Symbol Search & Quick Add Bar */}
      <form onSubmit={handleAddSymbol} className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={newSymbolInput}
              onChange={(e) => setNewSymbolInput(e.target.value)}
              placeholder="Search or add symbol (e.g. SIGACHI, INFY, SBIN)..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs font-mono uppercase bg-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-400 transition-all placeholder:normal-case placeholder:text-slate-400"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>
        {inputError && (
          <span className="text-[10px] text-rose-500 font-semibold px-1">{inputError}</span>
        )}
      </form>

      {/* Quick Click Suggestions (Pills) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <span className="text-[10px] font-bold text-slate-400 shrink-0 uppercase tracking-wider">Quick:</span>
        {POPULAR_SUGGESTIONS.map((item) => {
          const isAdded = symbols.includes(item.sym);
          return (
            <button
              key={item.sym}
              type="button"
              onClick={() => handleAddQuickSuggestion(item.sym)}
              disabled={isAdded}
              className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border transition-all flex items-center gap-1 shrink-0 ${
                isAdded
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-default opacity-60'
                  : 'bg-sky-50/80 text-sky-800 border-sky-200 hover:bg-sky-100 cursor-pointer shadow-xs hover:border-sky-300'
              }`}
            >
              {!isAdded && <Plus className="w-2.5 h-2.5" />}
              <span>{item.label}</span>
              {isAdded && <span className="text-emerald-600 font-bold">✓</span>}
            </button>
          );
        })}
      </div>

      {/* Watchlist Items Grid / Table */}
      {layout === 'compact' ? (
        /* Compact Vertical List (For Trading Dashboard sidebar/panel) */
        <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1">
          {symbols.map((sym) => {
            const quote = quotes[sym];
            const isSelected = selectedSymbol === sym;
            const flash = flashMap[sym];
            const ticker = getTickerOnly(sym);

            return (
              <div
                key={sym}
                onClick={() => onSelectForTrade(sym, quote?.ltp || 0, 'BUY')}
                onMouseEnter={(e) => handleMouseEnter(sym, e)}
                onMouseLeave={handleMouseLeave}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                  isSelected
                    ? 'bg-sky-50 border-sky-400 shadow-sm ring-1 ring-sky-300'
                    : 'bg-white hover:bg-slate-50 border-slate-200 shadow-xs'
                }`}
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-xs text-sky-950">{ticker}</span>
                    {sym === 'NSE:SIGACHI-EQ' && (
                      <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded">HOT</span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">NSE • Hover for info</span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className={`font-mono font-bold text-xs transition-colors duration-300 ${
                      flash === 'up'
                        ? 'text-emerald-600 bg-emerald-50 px-1 rounded'
                        : flash === 'down'
                        ? 'text-rose-600 bg-rose-50 px-1 rounded'
                        : 'text-slate-900'
                    }`}>
                      ₹{quote?.ltp != null ? quote.ltp.toFixed(2) : '—'}
                    </div>
                    <div className={`text-[10px] font-mono font-bold flex items-center justify-end ${
                      (quote?.pChange || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {(quote?.pChange || 0) >= 0 ? '+' : ''}
                      {quote?.pChange != null ? quote.pChange.toFixed(2) : '0.00'}%
                    </div>
                  </div>

                  {/* Chart Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setChartSymbol(sym);
                    }}
                    className="p-1.5 rounded-lg text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 shadow-xs transition-all cursor-pointer"
                    title={`Open interactive chart for ${ticker}`}
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectForTrade(sym, quote?.ltp || 0, 'BUY');
                    }}
                    className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer"
                    title="Trade this stock"
                  >
                    TRADE
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleRemoveSymbol(sym, e)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 p-1 transition-all cursor-pointer"
                    title="Remove from watchlist"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Full Grid / Table Layout (For Stock Screener or Wide View) */
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-inner bg-slate-50/50">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                <th className="py-2.5 px-3">Stock Symbol</th>
                <th className="py-2.5 px-2 text-center">Chart</th>
                <th className="py-2.5 px-3 text-right">LTP (₹)</th>
                <th className="py-2.5 px-3 text-right">24h Change</th>
                <th className="py-2.5 px-3 text-right hidden sm:table-cell">Day Range (L - H)</th>
                <th className="py-2.5 px-3 text-right hidden md:table-cell">Volume</th>
                <th className="py-2.5 px-3 text-right hidden lg:table-cell">Bid / Ask (Spread)</th>
                <th className="py-2.5 px-3 text-center">Trade Execution</th>
                <th className="py-2.5 px-2 text-center w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {symbols.map((sym) => {
                const quote = quotes[sym];
                const flash = flashMap[sym];
                const isSelected = selectedSymbol === sym;
                const ticker = getTickerOnly(sym);

                return (
                  <tr
                    key={sym}
                    onMouseEnter={(e) => handleMouseEnter(sym, e)}
                    onMouseLeave={handleMouseLeave}
                    className={`transition-colors hover:bg-sky-50/70 group cursor-pointer ${
                      isSelected ? 'bg-sky-50/90 font-bold' : 'bg-white'
                    }`}
                  >
                    {/* Stock Symbol */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-extrabold text-sky-950 flex items-center gap-1.5">
                            <span>{ticker}</span>
                            {sym === 'NSE:SIGACHI-EQ' && (
                              <span className="text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-1 rounded-sm">
                                TARGET
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">{sym}</div>
                        </div>
                      </div>
                    </td>

                    {/* Chart Button */}
                    <td className="py-3 px-2 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setChartSymbol(sym);
                        }}
                        className="px-2 py-1 rounded-lg text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-all cursor-pointer inline-flex items-center gap-1 shadow-xs"
                        title={`Open chart for ${ticker}`}
                      >
                        <BarChart2 className="w-3.5 h-3.5" />
                        <span className="hidden xl:inline">Chart</span>
                      </button>
                    </td>

                    {/* LTP */}
                    <td className="py-3 px-3 text-right">
                      <span className={`text-sm font-black transition-all duration-300 px-1.5 py-0.5 rounded ${
                        flash === 'up'
                          ? 'bg-emerald-100 text-emerald-800'
                          : flash === 'down'
                          ? 'bg-rose-100 text-rose-800'
                          : 'text-slate-900'
                      }`}>
                        ₹{quote?.ltp != null ? quote.ltp.toFixed(2) : '—'}
                      </span>
                    </td>

                    {/* Change & % */}
                    <td className="py-3 px-3 text-right">
                      <div className={`font-bold inline-flex items-center gap-0.5 ${
                        (quote?.pChange || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {(quote?.pChange || 0) >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        <span>{(quote?.pChange || 0) >= 0 ? '+' : ''}{quote?.pChange != null ? quote.pChange.toFixed(2) : '0.00'}%</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        ₹{(quote?.change || 0) >= 0 ? '+' : ''}{quote?.change != null ? quote.change.toFixed(2) : '0.00'}
                      </div>
                    </td>

                    {/* Day Range */}
                    <td className="py-3 px-3 text-right hidden sm:table-cell text-slate-700">
                      <div>₹{quote?.low != null ? quote.low.toFixed(2) : '—'} - ₹{quote?.high != null ? quote.high.toFixed(2) : '—'}</div>
                      <div className="text-[10px] text-slate-400">Open: ₹{quote?.open != null ? quote.open.toFixed(2) : '—'}</div>
                    </td>

                    {/* Volume */}
                    <td className="py-3 px-3 text-right hidden md:table-cell font-mono text-slate-700">
                      <div>{(quote?.volume || 0).toLocaleString('en-IN')}</div>
                      <div className="text-[10px] text-slate-400">VWAP: ₹{quote?.vwap != null ? quote.vwap.toFixed(2) : '—'}</div>
                    </td>

                    {/* Bid / Ask */}
                    <td className="py-3 px-3 text-right hidden lg:table-cell font-mono text-slate-700">
                      <div>₹{quote?.bid?.toFixed(2) || '—'} / ₹{quote?.ask?.toFixed(2) || '—'}</div>
                      <div className="text-[10px] text-slate-400">Spread: ₹{quote?.spread?.toFixed(2) || '0.05'}</div>
                    </td>

                    {/* 1-Click Trade Actions */}
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectForTrade(sym, quote?.ltp || 0, 'BUY')}
                          className="px-3 py-1.5 rounded-xl font-extrabold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs hover:shadow-md transition-all flex items-center gap-1 cursor-pointer"
                          title={`Buy ${ticker} on Trading Desk`}
                        >
                          <Zap className="w-3 h-3" />
                          <span>BUY</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectForTrade(sym, quote?.ltp || 0, 'SELL')}
                          className="px-2.5 py-1.5 rounded-xl font-bold text-xs bg-rose-600 hover:bg-rose-700 text-white shadow-xs hover:shadow-md transition-all flex items-center gap-1 cursor-pointer"
                          title={`Sell / Short ${ticker} on Trading Desk`}
                        >
                          <span>SELL</span>
                        </button>
                      </div>
                    </td>

                    {/* Remove */}
                    <td className="py-3 px-2 text-center">
                      <button
                        type="button"
                        onClick={(e) => handleRemoveSymbol(sym, e)}
                        className="text-slate-300 hover:text-rose-500 p-1.5 transition-colors cursor-pointer rounded-lg hover:bg-rose-50"
                        title="Remove from watchlist"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Floating Stock Fundamentals & Performance HUD Popover */}
      {hoveredSymbol && hoverPos && (() => {
        const fallbackFund = getStockFundamentals(hoveredSymbol, quotes[hoveredSymbol]);
        const realFund = realFundamentalsMap[hoveredSymbol];
        const fund = realFund ? { ...fallbackFund, ...realFund } : fallbackFund;
        const quote = quotes[hoveredSymbol];
        const curLtp = quote?.ltp || fund.currentLtp || fund.low52 + (fund.high52 - fund.low52) * 0.5;
        const rangeSpan = Math.max(0.01, fund.high52 - fund.low52);
        const rangePercent = Math.min(100, Math.max(0, ((curLtp - fund.low52) / rangeSpan) * 100));

        // Smart edge positioning relative to cursor
        const popoverWidth = 380;
        const popoverHeight = 420;
        let left = hoverPos.x + 16;
        if (typeof window !== 'undefined') {
          if (left + popoverWidth > window.innerWidth - 16) {
            left = Math.max(16, hoverPos.x - popoverWidth - 16);
          }
        }

        let top = hoverPos.y - 40;
        if (typeof window !== 'undefined') {
          if (top + popoverHeight > window.innerHeight - 16) {
            top = Math.max(16, window.innerHeight - popoverHeight - 16);
          }
          if (top < 16) top = 16;
        }

        return (
          <div
            style={{ left: `${left}px`, top: `${top}px` }}
            onMouseEnter={cancelHoverClose}
            onMouseLeave={handleMouseLeave}
            className="fixed z-50 w-[380px] bg-slate-950/95 text-slate-100 backdrop-blur-xl border border-sky-400/40 rounded-2xl shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-150 font-sans pointer-events-auto"
          >
            {/* Top Bar: Company Name & Category */}
            <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-extrabold text-sm text-white tracking-tight">{fund.companyName}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    fund.capCategory === 'Mega Cap' ? 'bg-purple-900/80 text-purple-200 border border-purple-700' :
                    fund.capCategory === 'Large Cap' ? 'bg-sky-900/80 text-sky-200 border border-sky-700' :
                    fund.capCategory === 'Mid Cap' ? 'bg-teal-900/80 text-teal-200 border border-teal-700' :
                    'bg-amber-900/80 text-amber-200 border border-amber-700'
                  }`}>
                    {fund.capCategory}
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    FYERS Live Feed
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {fund.ticker} • {fund.sector}
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm font-black font-mono text-sky-300">
                  ₹{curLtp.toFixed(2)}
                </div>
                <div className={`text-[10px] font-bold font-mono ${
                  (quote?.pChange || fund.returns.d1) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {(quote?.pChange || fund.returns.d1) >= 0 ? '+' : ''}
                  {(quote?.pChange != null ? quote.pChange : fund.returns.d1).toFixed(2)}%
                </div>
              </div>
            </div>

            {/* 52-Week Range Bar */}
            <div className="py-2.5 border-b border-slate-800">
              <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                <span>52W L: <strong className="text-slate-200 font-mono">₹{fund.low52.toFixed(2)}</strong></span>
                <span className="text-sky-400 font-bold">52-Week Range</span>
                <span>52W H: <strong className="text-slate-200 font-mono">₹{fund.high52.toFixed(2)}</strong></span>
              </div>
              <div className="relative w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 rounded-full" 
                  style={{ width: `${rangePercent}%` }} 
                />
              </div>
              <div className="flex justify-end mt-0.5">
                <span className="text-[9px] text-slate-400 font-mono">
                  Current at {rangePercent.toFixed(0)}% of 52W range
                </span>
              </div>
            </div>

            {/* Fundamentals 6-Pack Grid */}
            <div className="grid grid-cols-3 gap-2 py-2.5 border-b border-slate-800 text-[11px]">
              <div className="bg-slate-900/80 p-1.5 rounded-lg border border-slate-800/80">
                <span className="text-[9px] text-slate-400 block">Market Cap</span>
                <span className="font-bold text-white font-mono">₹{fund.mCapCr >= 1000 ? `${(fund.mCapCr / 1000).toFixed(1)}k` : fund.mCapCr} Cr</span>
              </div>
              <div className="bg-slate-900/80 p-1.5 rounded-lg border border-slate-800/80">
                <span className="text-[9px] text-slate-400 block">P/E Ratio</span>
                <span className="font-bold text-sky-300 font-mono">{fund.peRatio > 0 ? `${fund.peRatio}x` : 'N/A'}</span>
              </div>
              <div className="bg-slate-900/80 p-1.5 rounded-lg border border-slate-800/80">
                <span className="text-[9px] text-slate-400 block">Industry P/E</span>
                <span className="font-bold text-slate-300 font-mono">{fund.sectorPe}x</span>
              </div>
              <div className="bg-slate-900/80 p-1.5 rounded-lg border border-slate-800/80">
                <span className="text-[9px] text-slate-400 block">P/B Ratio</span>
                <span className="font-bold text-white font-mono">{fund.pbRatio}x</span>
              </div>
              <div className="bg-slate-900/80 p-1.5 rounded-lg border border-slate-800/80">
                <span className="text-[9px] text-slate-400 block">ROE</span>
                <span className={`font-bold font-mono ${fund.roePercent >= 15 ? 'text-emerald-400' : 'text-slate-200'}`}>
                  {fund.roePercent}%
                </span>
              </div>
              <div className="bg-slate-900/80 p-1.5 rounded-lg border border-slate-800/80">
                <span className="text-[9px] text-slate-400 block">Debt/Equity</span>
                <span className="font-bold text-slate-300 font-mono">{fund.debtToEquity}</span>
              </div>
            </div>

            {/* Recent Performance Multi-Timeframe Pills */}
            <div className="py-2.5 border-b border-slate-800">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-1.5">
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3 text-sky-400" />
                  <span>Recent Performance</span>
                </span>
                <span className="text-[9px] text-slate-500 font-mono">20D Vol: {fund.avgVol20D}</span>
              </div>
              <div className="grid grid-cols-6 gap-1 text-center font-mono">
                {[
                  { label: '1D', val: fund.returns.d1 },
                  { label: '1W', val: fund.returns.w1 },
                  { label: '1M', val: fund.returns.m1 },
                  { label: '3M', val: fund.returns.m3 },
                  { label: '6M', val: fund.returns.m6 },
                  { label: '1Y', val: fund.returns.y1 },
                ].map((ret) => (
                  <div key={ret.label} className="bg-slate-900/90 rounded-md p-1 border border-slate-800">
                    <span className="text-[9px] text-slate-500 block">{ret.label}</span>
                    <span className={`text-[10px] font-extrabold ${ret.val >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {ret.val >= 0 ? '+' : ''}{ret.val.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Brief Profile Summary */}
            <div className="pt-2 text-[10px] text-slate-400 leading-relaxed">
              {fund.summary}
            </div>

            {/* Quick Actions inside Popover */}
            <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setChartSymbol(hoveredSymbol);
                  setHoveredSymbol(null);
                }}
                className="flex-1 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-all"
              >
                <BarChart2 className="w-3.5 h-3.5" />
                <span>Launch Chart</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectForTrade(hoveredSymbol, curLtp, 'BUY');
                  setHoveredSymbol(null);
                }}
                className="flex-1 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-all"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Trade Now</span>
              </button>
            </div>
          </div>
        );
      })()}

      {/* Interactive Candlestick Chart Modal */}
      {chartSymbol && (
        <TradingViewChartModal
          isOpen={!!chartSymbol}
          onClose={() => setChartSymbol(null)}
          symbol={chartSymbol}
          currentPrice={quotes[chartSymbol]?.ltp}
          companyName={getStockFundamentals(chartSymbol, quotes[chartSymbol]).companyName}
          onSelectForTrade={(sym, price) => {
            onSelectForTrade(sym, price, 'BUY');
            setChartSymbol(null);
          }}
        />
      )}

    </div>
  );
};
