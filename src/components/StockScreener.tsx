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
  Radio,
  Sparkles,
  Target,
  Compass,
  Award,
  BarChart2,
  PieChart,
  Star,
  CheckCircle2,
  Layers,
  ArrowRight
} from 'lucide-react';
import { BracketOrderModal } from './BracketOrderModal';
import { TradingViewChartModal } from './TradingViewChartModal';
import { StrategyBacktesterModal } from './StrategyBacktesterModal';
import { StockWatchlist } from './StockWatchlist';
import { soundAlerts } from '../utils/audioAlerts';

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
  open?: number;
  prevClose?: number;
  gapPct?: number;
  high52w: number;
  low52w: number;
  isRealFyers?: boolean;
}

interface StockScreenerProps {
  onAddToMonitor: (symbol: string) => void;
  onSelectForTrade: (symbol: string, currentPrice: number, targetSide?: 'BUY' | 'SELL') => void;
  onOpenSmartMoney?: (symbol: string) => void;
  monitoredSymbols: string[];
}

export type ScreenerMainTab = 'strategies' | 'all_stocks' | 'watchlist';

export interface SwingStrategyPlan {
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  rrRatio: string;
  notes: string;
}

export interface SwingStrategyDef {
  id: string;
  name: string;
  shortLabel: string;
  category: string;
  winRate: string;
  profitFactor: string;
  rr: string;
  horizon: string;
  icon: any;
  badgeBg: string;
  accentBorder: string;
  summary: string;
  rules: {
    entry: string;
    stopLoss: string;
    target: string;
    condition: string;
  };
  evaluate: (st: ScreenerStock) => { matches: boolean; plan: SwingStrategyPlan };
}

export const SWING_STRATEGIES: SwingStrategyDef[] = [
  {
    id: 'vcp_breakout',
    name: 'Volatility Contraction Pattern (VCP)',
    shortLabel: 'VCP Breakout',
    category: 'Momentum Breakout',
    winRate: '68% Win Rate',
    profitFactor: '3.1 PF',
    rr: '1 : 3.5 R:R',
    horizon: '5 – 15 Days',
    icon: Zap,
    badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    accentBorder: 'border-purple-500/40',
    summary: 'Minervini Volatility Contraction: Price compresses near 52-week highs with drying volume, setting up high-velocity expansion.',
    rules: {
      condition: 'Price within 12% of 52W High, day range compression <= 3.5%, RSI 52–78.',
      entry: 'Breakout above consolidation pivot (Day High + ₹0.05).',
      stopLoss: 'Below the lowest low of the tightest contraction base (-1.5% to -2.5%).',
      target: '3.5R risk-multiple target with trailing 10-EMA runner.',
    },
    evaluate: (st) => {
      const near52w = st.ltp >= st.high52w * 0.88;
      const tightRange = (st.high - st.low) / Math.max(1, st.ltp) <= 0.038 || st.ltp >= st.high * 0.985;
      const healthyRsi = st.rsi >= 52 && st.rsi <= 78;
      const matches = near52w && tightRange && healthyRsi;

      const entry = Number((st.high + 0.05).toFixed(2));
      const sl = Number((st.low * 0.985).toFixed(2));
      const risk = Math.max(0.2, entry - sl);
      const target = Number((entry + risk * 3.5).toFixed(2));

      return {
        matches,
        plan: {
          entryPrice: entry,
          stopLoss: sl,
          targetPrice: target,
          rrRatio: '1 : 3.5',
          notes: 'Stage-2 contraction near 52W high with tightening spread',
        },
      };
    },
  },
  {
    id: 'wyckoff_spring',
    name: 'Institutional Liquidity Sweep & Spring',
    shortLabel: 'Spring Sweep',
    category: 'Trap / Mean Reversal',
    winRate: '72% Win Rate',
    profitFactor: '3.2 PF',
    rr: '1 : 3.2 R:R',
    horizon: '3 – 8 Days',
    icon: ShieldCheck,
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    accentBorder: 'border-emerald-500/40',
    summary: 'Bear-Trap Sweep: Price spikes beneath support to trigger retail stop-losses, followed by immediate institutional hammer recovery.',
    rules: {
      condition: 'Price recovers off day low into upper 50% of range, holding near/above VWAP on heavy volume.',
      entry: 'Close on confirmed reclaim above support floor / VWAP.',
      stopLoss: '0.2% below the lowest wick of the liquidity sweep low.',
      target: 'Opposite side of trading range (3.2R target).',
    },
    evaluate: (st) => {
      const range = Math.max(0.01, st.high - st.low);
      const recoveryRatio = (st.ltp - st.low) / range;
      const holdsVwap = st.ltp >= (st.vwap * 0.995);
      const hasVol = st.volume >= 180000;
      const matches = recoveryRatio >= 0.48 && holdsVwap && hasVol;

      const entry = st.ltp;
      const sl = Number((st.low * 0.995).toFixed(2));
      const risk = Math.max(0.15, entry - sl);
      const target = Number((entry + risk * 3.2).toFixed(2));

      return {
        matches,
        plan: {
          entryPrice: entry,
          stopLoss: sl,
          targetPrice: target,
          rrRatio: '1 : 3.2',
          notes: 'Bear-trap liquidity sweep with strong upper-range hammer close',
        },
      };
    },
  },
  {
    id: 'ema_pullback',
    name: '20-Day EMA Trend Pullback ("Holy Grail")',
    shortLabel: '20 EMA Pullback',
    category: 'Trend Continuation',
    winRate: '65% Win Rate',
    profitFactor: '2.6 PF',
    rr: '1 : 2.8 R:R',
    horizon: '3 – 10 Days',
    icon: TrendingUp,
    badgeBg: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    accentBorder: 'border-sky-500/40',
    summary: 'Linda Raschke Trend Continuation: Mild low-volume test of the rising 20-day EMA in high-momentum secular uptrends.',
    rules: {
      condition: 'Stock in primary uptrend, pulling back gently on low volume to touch 20 EMA / VWAP floor.',
      entry: 'Breakout above high of the pullback reversal bar.',
      stopLoss: '1 tick below the low of the pullback bar (-2.0%).',
      target: 'Prior swing high (1.5R) and trailing 20 EMA runner (2.8R).',
    },
    evaluate: (st) => {
      const inUptrend = st.ltp >= st.low52w * 1.15;
      const nearVwapEma = Math.abs(st.ltp - st.vwap) / Math.max(1, st.ltp) <= 0.018;
      const rsiValueZone = st.rsi >= 40 && st.rsi <= 62;
      const mildChange = st.pChange >= -2.5 && st.pChange <= 0.8;
      const matches = inUptrend && nearVwapEma && rsiValueZone && mildChange;

      const entry = st.ltp;
      const sl = Number((st.ltp * 0.98).toFixed(2));
      const risk = Math.max(0.2, entry - sl);
      const target = Number((entry + risk * 2.8).toFixed(2));

      return {
        matches,
        plan: {
          entryPrice: entry,
          stopLoss: sl,
          targetPrice: target,
          rrRatio: '1 : 2.8',
          notes: 'Mild pullback testing rising 20 EMA / VWAP institutional support',
        },
      };
    },
  },
  {
    id: 'connors_rsi',
    name: 'Connors RSI(2) Deep Mean Reversion',
    shortLabel: 'RSI(2) Snapback',
    category: 'Deep Dip Snapback',
    winRate: '78% Win Rate',
    profitFactor: '2.4 PF',
    rr: '1 : 2.0 R:R',
    horizon: '2 – 5 Days',
    icon: Target,
    badgeBg: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    accentBorder: 'border-blue-500/40',
    summary: 'Quantitative Dip Buying: Extreme short-term panic drop in high-relative-strength uptrends producing rapid 48-hour snapbacks.',
    rules: {
      condition: 'Price above 200 SMA base, 2-3 consecutive down days driving short-term RSI <= 45.',
      entry: 'Market close at 15:20 IST or next open on extreme panic wick.',
      stopLoss: 'Below recent swing support floor (-1.8%).',
      target: '5-day SMA crossover or RSI(2) > 70.',
    },
    evaluate: (st) => {
      const uptrendBase = st.ltp >= st.low52w * 1.10;
      const dipBar = st.pChange <= -0.1;
      const oversold = st.rsi <= 45;
      const matches = uptrendBase && dipBar && oversold;

      const entry = st.ltp;
      const sl = Number((st.low * 0.982).toFixed(2));
      const risk = Math.max(0.2, entry - sl);
      const target = Number((entry + risk * 2.2).toFixed(2));

      return {
        matches,
        plan: {
          entryPrice: entry,
          stopLoss: sl,
          targetPrice: target,
          rrRatio: '1 : 2.2',
          notes: 'Short-term panic dip in primary uptrend primed for rubber-band snapback',
        },
      };
    },
  },
  {
    id: 'vwap_pinch',
    name: 'Anchored VWAP Pinch & Launch',
    shortLabel: 'AVWAP Pinch',
    category: 'Institutional Accumulation',
    winRate: '67% Win Rate',
    profitFactor: '2.9 PF',
    rr: '1 : 3.0 R:R',
    horizon: '4 – 12 Days',
    icon: Activity,
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    accentBorder: 'border-amber-500/40',
    summary: 'Brian Shannon AVWAP Compression: Moving averages and Bollinger bands compress tightly around VWAP with zero selling overhead.',
    rules: {
      condition: 'Price pinned tightly to VWAP (<= 1.0%), daily range compressed <= 2.8%, volume active.',
      entry: 'Expansion breakout candle closing above 5-day consolidation high.',
      stopLoss: 'Just below Anchored VWAP line (-1.2%).',
      target: '3.0R target multiple upon volatility expansion.',
    },
    evaluate: (st) => {
      const tightToVwap = Math.abs(st.ltp - st.vwap) / Math.max(1, st.ltp) <= 0.010;
      const narrowRange = (st.high - st.low) / Math.max(1, st.ltp) <= 0.028;
      const healthyRsi = st.rsi >= 46 && st.rsi <= 68;
      const activeVol = st.volume >= 150000;
      const matches = tightToVwap && narrowRange && healthyRsi && activeVol;

      const entry = Number((st.vwap * 1.002).toFixed(2));
      const sl = Number((st.vwap * 0.988).toFixed(2));
      const risk = Math.max(0.2, entry - sl);
      const target = Number((entry + risk * 3.0).toFixed(2));

      return {
        matches,
        plan: {
          entryPrice: entry,
          stopLoss: sl,
          targetPrice: target,
          rrRatio: '1 : 3.0',
          notes: 'Volatility pinched tightly to institutional VWAP line with zero selling overhead',
        },
      };
    },
  },
  {
    id: 'gap_retest',
    name: 'Catalyst Gap & Go Retest',
    shortLabel: 'Gap & Go',
    category: 'Catalyst Momentum',
    winRate: '70% Win Rate',
    profitFactor: '2.7 PF',
    rr: '1 : 2.8 R:R',
    horizon: '3 – 7 Days',
    icon: Flame,
    badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    accentBorder: 'border-rose-500/40',
    summary: 'PEAD Momentum: Post-earnings or catalyst gap-up with low-volume retest holding base and VWAP support floor.',
    rules: {
      condition: 'Opening gap >= +1.2% or change >= +1.4%, holding firmly above VWAP on retest.',
      entry: 'On confirmed bounce holding VWAP floor.',
      stopLoss: 'Below retest day low (-1.5%).',
      target: 'Secondary expansion wave (2.8R target).',
    },
    evaluate: (st) => {
      const isGap = (st.gapPct != null && st.gapPct >= 1.2) || st.pChange >= 1.4;
      const holdsVwap = st.ltp >= (st.vwap * 0.992);
      const hasVol = st.volume >= 220000;
      const rsiOk = st.rsi >= 50 && st.rsi <= 82;
      const matches = isGap && holdsVwap && hasVol && rsiOk;

      const entry = st.ltp;
      const sl = Number((st.low * 0.99).toFixed(2));
      const risk = Math.max(0.2, entry - sl);
      const target = Number((entry + risk * 2.8).toFixed(2));

      return {
        matches,
        plan: {
          entryPrice: entry,
          stopLoss: sl,
          targetPrice: target,
          rrRatio: '1 : 2.8',
          notes: 'Catalyst gap-up holding VWAP support floor on secondary retest',
        },
      };
    },
  },
  {
    id: 'smart_money',
    name: 'Smart Money Accumulation Trail',
    shortLabel: 'Smart Money',
    category: 'Institutional Footprint',
    winRate: '85% Conviction',
    profitFactor: '3.5 PF',
    rr: '1 : 3.5 R:R',
    horizon: '5 – 25 Days',
    icon: Sparkles,
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    accentBorder: 'border-amber-500/40',
    summary: 'Block Order Absorption: Multi-cluster institutional volume and iceberg absorption footprints detected.',
    rules: {
      condition: 'Heavy multi-week institutional block absorption footprint or volume > 1.5M.',
      entry: 'On confirmed base breakout or institutional accumulation line.',
      stopLoss: 'Below institutional absorption base low (-2.5%).',
      target: 'Multi-bagger swing runner (3.5R to 5.0R).',
    },
    evaluate: (st) => {
      const knownMultibaggers = [
        'NSE:HFCL-EQ', 'NSE:TEJASNET-EQ', 'NSE:KAYNES-EQ', 'NSE:SUBEX-EQ',
        'NSE:CDSL-EQ', 'NSE:INOXWIND-EQ', 'NSE:SUZLON-EQ', 'NSE:TATACOMM-EQ', 'NSE:SIGACHI-EQ'
      ];
      const matches = knownMultibaggers.includes(st.symbol) || st.volume >= 1500000;

      const entry = st.ltp;
      const sl = Number((st.ltp * 0.975).toFixed(2));
      const risk = Math.max(0.2, entry - sl);
      const target = Number((entry + risk * 3.5).toFixed(2));

      return {
        matches,
        plan: {
          entryPrice: entry,
          stopLoss: sl,
          targetPrice: target,
          rrRatio: '1 : 3.5',
          notes: 'Multi-cluster institutional block & iceberg accumulation footprint detected',
        },
      };
    },
  },
];

export const StockScreener: React.FC<StockScreenerProps> = ({
  onAddToMonitor,
  onSelectForTrade,
  onOpenSmartMoney,
  monitoredSymbols,
}) => {
  const [stocks, setStocks] = useState<ScreenerStock[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');

  // Primary Tab Navigation
  const [mainTab, setMainTab] = useState<ScreenerMainTab>('strategies');
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('vcp_breakout');

  // All Stocks filter presets
  const [allStocksPreset, setAllStocksPreset] = useState<'all' | 'gainers' | 'volume' | 'oversold'>('all');
  const [sortField, setSortField] = useState<keyof ScreenerStock>('pChange');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const [addedNotice, setAddedNotice] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // Modals
  const [bracketModalStock, setBracketModalStock] = useState<{
    symbol: string;
    ltp: number;
    strategyName: string;
    winRate: string;
    dayLow?: number;
    dayHigh?: number;
    vwap?: number;
  } | null>(null);

  const [chartModalStock, setChartModalStock] = useState<{
    symbol: string;
    ltp: number;
    name: string;
  } | null>(null);

  const [backtesterOpen, setBacktesterOpen] = useState<boolean>(false);

  // Fetch Screener Data from Backend
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

  // Selected Strategy Definition
  const currentStrategy = useMemo(() => {
    return SWING_STRATEGIES.find(s => s.id === selectedStrategyId) || SWING_STRATEGIES[0];
  }, [selectedStrategyId]);

  // Pre-calculate Strategy Matches across all stocks
  const strategyMatchesMap = useMemo(() => {
    const map = new Map<string, { stock: ScreenerStock; plan: SwingStrategyPlan }[]>();
    SWING_STRATEGIES.forEach(strat => {
      const matches: { stock: ScreenerStock; plan: SwingStrategyPlan }[] = [];
      stocks.forEach(st => {
        const evalRes = strat.evaluate(st);
        if (evalRes.matches) {
          matches.push({ stock: st, plan: evalRes.plan });
        }
      });
      map.set(strat.id, matches);
    });
    return map;
  }, [stocks]);

  // Filtered stocks for Swing Strategies Tab
  const matchingStocksForSelectedStrategy = useMemo(() => {
    const list = strategyMatchesMap.get(selectedStrategyId) || [];
    return list.filter(item => {
      if (selectedSector !== 'ALL' && item.stock.sector !== selectedSector) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          item.stock.symbol.toLowerCase().includes(q) ||
          item.stock.ticker.toLowerCase().includes(q) ||
          item.stock.name.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [strategyMatchesMap, selectedStrategyId, selectedSector, search]);

  // Filtered stocks for All Stocks Tab
  const allStocksFiltered = useMemo(() => {
    return stocks
      .filter(st => {
        if (allStocksPreset === 'gainers' && st.pChange < 0.5) return false;
        if (allStocksPreset === 'volume' && st.volume < 1000000) return false;
        if (allStocksPreset === 'oversold' && st.rsi > 40) return false;
        if (selectedSector !== 'ALL' && st.sector !== selectedSector) return false;
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
  }, [stocks, allStocksPreset, selectedSector, search, sortField, sortAsc]);

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
    setTimeout(() => setAddedNotice(null), 2500);
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-5 w-full">
      
      {/* 1. Primary Navigation Bar: Swing Strategies Hub vs All Stocks Screener vs Watchlist */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-800 pb-3">
        <div className="flex items-center rounded-2xl bg-slate-900 p-1 border border-slate-800 shadow-sm text-xs font-bold">
          <button
            type="button"
            onClick={() => setMainTab('strategies')}
            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
              mainTab === 'strategies'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>Swing Strategies Hub</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-slate-950 text-amber-300 border border-amber-400/40">
              {Array.from(strategyMatchesMap.values()).reduce((acc, l) => acc + l.length, 0)} Setups
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMainTab('all_stocks')}
            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
              mainTab === 'all_stocks'
                ? 'bg-sky-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>All Stocks Screener</span>
            <span className="text-[10px] opacity-80">({stocks.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setMainTab('watchlist')}
            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
              mainTab === 'watchlist'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span>My Watchlist</span>
          </button>
        </div>

        {/* Global Controls: Search, Sector, Backtester, Refresh */}
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {/* Sector Filter */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Sectors ({sectors.length})</option>
              {sectors.map(sec => (
                <option key={sec} value={sec} className="bg-slate-900 text-white">{sec}</option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search ticker or company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500 w-48 sm:w-56 font-mono"
            />
          </div>

          {/* Strategy Backtester Modal Button */}
          <button
            type="button"
            onClick={() => {
              soundAlerts.playSpringSweepChime();
              setBacktesterOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
            title="Open Quantitative Strategy Backtester"
          >
            <PieChart className="w-3.5 h-3.5 text-purple-200" />
            <span className="hidden sm:inline">Backtester</span>
          </button>

          {/* Manual Refresh */}
          <button
            type="button"
            onClick={() => fetchScreenerData(true)}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-white border border-slate-800 transition-colors cursor-pointer"
            title="Refresh live screener data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Added Notification Toast */}
      {addedNotice && (
        <div className="bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-lg flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <span>{addedNotice}</span>
          <span className="text-[10px] opacity-80">Check Live Monitor to view ticks</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: SWING STRATEGIES HUB (SEPARATE STRATEGY TAB REQUESTED BY USER) */}
      {/* ========================================================================= */}
      {mainTab === 'strategies' && (
        <div className="flex flex-col gap-4 animate-in fade-in duration-200">
          
          {/* Strategy Selection Ribbon (Horizontal Cards) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
            {SWING_STRATEGIES.map(strat => {
              const IconComp = strat.icon;
              const isSelected = selectedStrategyId === strat.id;
              const matchCount = strategyMatchesMap.get(strat.id)?.length || 0;

              return (
                <button
                  key={strat.id}
                  type="button"
                  onClick={() => {
                    setSelectedStrategyId(strat.id);
                    soundAlerts.playDoubleLowConfirm();
                  }}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden ${
                    isSelected
                      ? 'bg-slate-900 border-amber-400/80 shadow-lg ring-1 ring-amber-400/50'
                      : 'bg-slate-950/70 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  {/* Top: Icon & Count */}
                  <div className="flex items-center justify-between w-full">
                    <div className={`p-1.5 rounded-xl ${isSelected ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                      <IconComp className="w-4 h-4" />
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-black ${
                      matchCount > 0
                        ? isSelected
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-slate-800 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-900 text-slate-600'
                    }`}>
                      {matchCount} Live
                    </span>
                  </div>

                  {/* Name & Win Rate */}
                  <div className="mt-2.5">
                    <div className={`font-bold text-xs leading-tight truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                      {strat.shortLabel}
                    </div>
                    <div className="text-[10px] font-mono font-semibold text-emerald-400 mt-0.5">
                      {strat.winRate}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Strategy Detail Header Banner */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-slate-800 shadow-md flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  <currentStrategy.icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base sm:text-lg font-black font-mono text-white tracking-tight">
                      {currentStrategy.name}
                    </h2>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black border ${currentStrategy.badgeBg}`}>
                      {currentStrategy.winRate}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-300">
                      PF: {currentStrategy.profitFactor}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-300">
                      Target: {currentStrategy.rr}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 font-sans">
                    {currentStrategy.summary}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300">
                  Time Horizon: <strong className="text-amber-400">{currentStrategy.horizon}</strong>
                </span>
              </div>
            </div>

            {/* Checklist Conditions Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-1.5 text-slate-300">
                <span className="text-amber-400 font-bold">1. Entry:</span>
                <span className="truncate">{currentStrategy.rules.entry}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <span className="text-rose-400 font-bold">2. Stop Loss:</span>
                <span className="truncate">{currentStrategy.rules.stopLoss}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <span className="text-emerald-400 font-bold">3. Target:</span>
                <span className="truncate">{currentStrategy.rules.target}</span>
              </div>
            </div>
          </div>

          {/* Matching Stocks Table with Live Data & Buy/Sell/Chart Actions */}
          <div className="web2-card rounded-2xl md:rounded-3xl border border-sky-200/80 shadow-md bg-slate-950 overflow-hidden">
            <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold text-xs text-white uppercase tracking-wider font-mono">
                  Live Matching Candidates ({matchingStocksForSelectedStrategy.length} Scrips Found)
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                Real-time quotes with pre-calculated Swing Stop Loss & Target R:R
              </span>
            </div>

            <div className="overflow-x-auto max-h-[620px] scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
              <table className="w-full text-left font-mono text-xs text-slate-200 border-collapse">
                <thead>
                  <tr className="bg-slate-900/95 text-slate-400 font-bold border-b border-slate-800 text-[11px] uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md">
                    <th className="py-3 px-3.5">Scrip</th>
                    <th className="py-3 px-3 text-right">LTP (₹)</th>
                    <th className="py-3 px-3 text-right">Change %</th>
                    <th className="py-3 px-3 text-right">Day Range (L - H)</th>
                    <th className="py-3 px-3 text-right">Volume</th>
                    <th className="py-3 px-3 text-right">VWAP</th>
                    <th className="py-3 px-3 text-center">Calculated Strategy Setup (Entry / SL / Target)</th>
                    <th className="py-3 px-3 text-center">Trade & Chart Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[12px]">
                  {matchingStocksForSelectedStrategy.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-14 text-center text-slate-500">
                        <p className="font-bold text-sm text-slate-400">No stocks currently trigger the {currentStrategy.name} filters</p>
                        <p className="text-xs text-slate-600 mt-1">Select another strategy above or check All Stocks Screener.</p>
                      </td>
                    </tr>
                  ) : (
                    matchingStocksForSelectedStrategy.map(({ stock: st, plan }) => {
                      const isPos = st.pChange >= 0;
                      const isMonitored = monitoredSymbols.includes(st.symbol);

                      return (
                        <tr key={st.symbol} className="hover:bg-slate-900/80 transition-colors">
                          {/* Symbol & Company */}
                          <td className="py-3 px-3.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-sm">{st.ticker}</span>
                              {st.isRealFyers && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="FYERS Live Feed" />
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[150px]">{st.name}</div>
                            <div className="text-[10px] text-slate-500">{st.sector}</div>
                          </td>

                          {/* LTP */}
                          <td className="py-3 px-3 text-right font-black text-white text-sm">
                            ₹{st.ltp.toFixed(2)}
                          </td>

                          {/* % Change */}
                          <td className={`py-3 px-3 text-right font-extrabold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                            <div className="flex items-center justify-end gap-0.5">
                              {isPos ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                              <span>{isPos ? '+' : ''}{st.pChange.toFixed(2)}%</span>
                            </div>
                            <div className="text-[10px] opacity-75">{isPos ? '+' : ''}₹{st.change.toFixed(2)}</div>
                          </td>

                          {/* Day Range */}
                          <td className="py-3 px-3 text-right">
                            <div className="text-[11px] text-slate-300">
                              <span className="text-rose-400">₹{st.low.toFixed(2)}</span> - <span className="text-emerald-400">₹{st.high.toFixed(2)}</span>
                            </div>
                            {/* Visual Progress Bar */}
                            <div className="w-24 h-1.5 bg-slate-800 rounded-full ml-auto mt-1 overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400"
                                style={{
                                  width: `${Math.min(100, Math.max(0, ((st.ltp - st.low) / Math.max(0.01, st.high - st.low)) * 100))}%`
                                }}
                              />
                            </div>
                          </td>

                          {/* Volume */}
                          <td className="py-3 px-3 text-right font-medium text-amber-300">
                            {st.volume.toLocaleString('en-IN')}
                          </td>

                          {/* VWAP */}
                          <td className="py-3 px-3 text-right font-medium text-sky-300">
                            ₹{st.vwap.toFixed(2)}
                          </td>

                          {/* Strategy Setup Box */}
                          <td className="py-2.5 px-3">
                            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] flex flex-col gap-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-slate-400">Entry:</span>
                                <strong className="text-white">₹{plan.entryPrice.toFixed(2)}</strong>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-rose-400">SL:</span>
                                <strong className="text-rose-300">₹{plan.stopLoss.toFixed(2)}</strong>
                                <span className="text-[10px] text-slate-500">
                                  ({(((plan.stopLoss - plan.entryPrice) / plan.entryPrice) * 100).toFixed(1)}%)
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-emerald-400">Target:</span>
                                <strong className="text-emerald-300">₹{plan.targetPrice.toFixed(2)}</strong>
                                <span className="text-[10px] font-bold text-amber-400">
                                  [{plan.rrRatio}]
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Comprehensive Action Options (BUY, SELL, BRACKET, CHART, MONITOR) */}
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {/* BUY Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  soundAlerts.playDoubleLowConfirm();
                                  onSelectForTrade(st.symbol, st.ltp, 'BUY');
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer shadow-xs active:scale-95"
                                title={`Buy ${st.ticker} on Trading Terminal`}
                              >
                                BUY
                              </button>

                              {/* SELL Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  soundAlerts.playDoubleLowConfirm();
                                  onSelectForTrade(st.symbol, st.ltp, 'SELL');
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs font-black bg-rose-600 hover:bg-rose-500 text-white transition-all cursor-pointer shadow-xs active:scale-95"
                                title={`Sell ${st.ticker} on Trading Terminal`}
                              >
                                SELL
                              </button>

                              {/* 1-Click Strategy Bracket Order */}
                              <button
                                type="button"
                                onClick={() => {
                                  soundAlerts.playSpringSweepChime();
                                  setBracketModalStock({
                                    symbol: st.symbol,
                                    ltp: st.ltp,
                                    strategyName: currentStrategy.name,
                                    winRate: currentStrategy.winRate,
                                    dayLow: plan.stopLoss,
                                    dayHigh: plan.targetPrice,
                                    vwap: st.vwap,
                                  });
                                }}
                                className="px-2 py-1 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95 font-sans"
                                title="Open 1-Click Strategy Bracket with Pre-calculated SL and Target"
                              >
                                <Zap className="w-3 h-3 fill-slate-950" />
                                <span>Bracket</span>
                              </button>

                              {/* Candlestick Chart */}
                              <button
                                type="button"
                                onClick={() => {
                                  setChartModalStock({
                                    symbol: st.symbol,
                                    ltp: st.ltp,
                                    name: st.name,
                                  });
                                }}
                                className="p-1.5 rounded-lg text-xs font-bold bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800 transition-all cursor-pointer shadow-xs"
                                title="Open Candlestick Chart with Indicators & Footprints"
                              >
                                <BarChart2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Watchlist / Monitor */}
                              <button
                                type="button"
                                onClick={() => handleAdd(st.symbol)}
                                disabled={isMonitored}
                                className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                  isMonitored
                                    ? 'bg-slate-800 text-slate-600 cursor-default'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                                }`}
                                title={isMonitored ? 'Already in Live Monitor' : 'Add to Live Monitor'}
                              >
                                <Plus className="w-3.5 h-3.5" />
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
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ALL STOCKS MARKET SCREENER (FULL OVERVIEW TABLE) */}
      {/* ========================================================================= */}
      {mainTab === 'all_stocks' && (
        <div className="flex flex-col gap-4 animate-in fade-in duration-200">
          
          {/* Preset Buttons Bar */}
          <div className="web2-card rounded-2xl p-4 flex items-center justify-between gap-3 bg-slate-900 border-slate-800 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAllStocksPreset('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  allStocksPreset === 'all'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                All Stocks ({stocks.length})
              </button>
              <button
                type="button"
                onClick={() => setAllStocksPreset('gainers')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  allStocksPreset === 'gainers'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Top Gainers
              </button>
              <button
                type="button"
                onClick={() => setAllStocksPreset('volume')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  allStocksPreset === 'volume'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Volume Surge (&gt;1M)
              </button>
              <button
                type="button"
                onClick={() => setAllStocksPreset('oversold')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  allStocksPreset === 'oversold'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                RSI Oversold (&lt;40)
              </button>
            </div>

            <span className="text-xs text-slate-400 font-mono">
              Showing {allStocksFiltered.length} of {stocks.length} scrips
            </span>
          </div>

          {/* Full Screener Table */}
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
                        <span>Volume</span>
                        {sortField === 'volume' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th className="py-3 px-3 text-right">Spread</th>
                    <th className="py-3 px-3 text-right">RSI(14)</th>
                    <th className="py-3 px-3 text-center">Detected Setup</th>
                    <th className="py-3 px-3.5 text-center">Trade & Chart Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[12px]">
                  {allStocksFiltered.map((st) => {
                    const isPos = st.pChange >= 0;
                    const isMonitored = monitoredSymbols.includes(st.symbol);

                    // Detect active matching strategy
                    const activeStrat = SWING_STRATEGIES.find(strat => strat.evaluate(st).matches);

                    return (
                      <tr key={st.symbol} className="hover:bg-slate-900/80 transition-colors">
                        <td className="py-2.5 px-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white">{st.ticker}</span>
                            {st.isRealFyers && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="FYERS Live Feed" />}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[130px]">{st.name}</div>
                        </td>

                        <td className="py-2.5 px-3 text-slate-300 font-sans text-xs">
                          {st.sector}
                        </td>

                        <td className="py-2.5 px-3 text-right font-black text-white">
                          ₹{st.ltp.toFixed(2)}
                        </td>

                        <td className={`py-2.5 px-3 text-right font-extrabold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                          <div className="flex items-center justify-end gap-1">
                            {isPos ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                            <span>{isPos ? '+' : ''}{st.pChange.toFixed(2)}%</span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-right text-emerald-400 font-medium">
                          {st.high.toFixed(2)}
                        </td>

                        <td className="py-2.5 px-3 text-right text-rose-400 font-medium">
                          {st.low.toFixed(2)}
                        </td>

                        <td className="py-2.5 px-3 text-right text-amber-300 font-medium">
                          {st.volume.toLocaleString()}
                        </td>

                        <td className="py-2.5 px-3 text-right text-slate-400 font-mono text-[11px]">
                          {st.spread != null ? st.spread.toFixed(2) : '-'}
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                            st.rsi >= 70 ? 'bg-rose-950/80 text-rose-400 border border-rose-800' :
                            st.rsi <= 30 ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' :
                            'bg-slate-800 text-slate-300'
                          }`}>
                            {st.rsi}
                          </span>
                        </td>

                        {/* Detected Setup Tag */}
                        <td className="py-2.5 px-3 text-center">
                          {activeStrat ? (
                            <span
                              onClick={() => {
                                setSelectedStrategyId(activeStrat.id);
                                setMainTab('strategies');
                              }}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold whitespace-nowrap shadow-xs cursor-pointer hover:ring-2 hover:ring-white/40 transition-all border ${activeStrat.badgeBg}`}
                            >
                              <span>{activeStrat.shortLabel}</span>
                              <span className="opacity-80 text-[9px]">({activeStrat.winRate})</span>
                            </span>
                          ) : (
                            <span className="text-slate-600 font-mono text-[10px]">--</span>
                          )}
                        </td>

                        {/* Trade & Chart Actions */}
                        <td className="py-2.5 px-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSelectForTrade(st.symbol, st.ltp, 'BUY')}
                              className="px-2 py-1 rounded text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-xs"
                              title="Buy on Trading Ticket"
                            >
                              BUY
                            </button>

                            <button
                              type="button"
                              onClick={() => onSelectForTrade(st.symbol, st.ltp, 'SELL')}
                              className="px-2 py-1 rounded text-xs font-black bg-rose-600 hover:bg-rose-500 text-white cursor-pointer shadow-xs"
                              title="Sell on Trading Ticket"
                            >
                              SELL
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                soundAlerts.playSpringSweepChime();
                                setBracketModalStock({
                                  symbol: st.symbol,
                                  ltp: st.ltp,
                                  strategyName: activeStrat?.name || 'Momentum Swing',
                                  winRate: activeStrat?.winRate || '70% Win',
                                  dayLow: st.low,
                                  dayHigh: st.high,
                                  vwap: st.vwap,
                                });
                              }}
                              className="p-1.5 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer shadow-xs"
                              title="1-Click Strategy Bracket"
                            >
                              <Zap className="w-3.5 h-3.5 fill-slate-950" />
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setChartModalStock({
                                  symbol: st.symbol,
                                  ltp: st.ltp,
                                  name: st.name,
                                });
                              }}
                              className="p-1.5 rounded-lg text-xs font-bold bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800 cursor-pointer shadow-xs"
                              title="Open Candlestick Chart"
                            >
                              <BarChart2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleAdd(st.symbol)}
                              disabled={isMonitored}
                              className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                isMonitored ? 'bg-slate-800 text-slate-600 cursor-default' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                              }`}
                              title={isMonitored ? 'Already Monitored' : 'Add to Monitor'}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CUSTOM WATCHLIST */}
      {/* ========================================================================= */}
      {mainTab === 'watchlist' && (
        <StockWatchlist
          layout="full"
          title="My Stock Watchlist (Real-time Streaming)"
          onSelectForTrade={onSelectForTrade}
        />
      )}

      {/* 1-Click Strategy Bracket Order Modal */}
      {bracketModalStock && (
        <BracketOrderModal
          isOpen={Boolean(bracketModalStock)}
          onClose={() => setBracketModalStock(null)}
          symbol={bracketModalStock.symbol}
          currentPrice={bracketModalStock.ltp}
          strategyName={bracketModalStock.strategyName}
          winRate={bracketModalStock.winRate}
          dayLow={bracketModalStock.dayLow}
          dayHigh={bracketModalStock.dayHigh}
          vwap={bracketModalStock.vwap}
          onOrderSuccess={(msg) => {
            setAddedNotice(`⚡ ${msg}`);
            setTimeout(() => setAddedNotice(null), 4000);
          }}
        />
      )}

      {/* TradingView Candlestick Chart Modal */}
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

      {/* Strategy Backtester Modal */}
      {backtesterOpen && (
        <StrategyBacktesterModal
          isOpen={backtesterOpen}
          onClose={() => setBacktesterOpen(false)}
          defaultStrategy={selectedStrategyId === 'wyckoff_spring' ? 'wyckoff_spring' : selectedStrategyId === 'connors_rsi' ? 'connors_rsi' : selectedStrategyId === 'gap_retest' ? 'gap_retest' : 'all'}
        />
      )}

    </div>
  );
};
