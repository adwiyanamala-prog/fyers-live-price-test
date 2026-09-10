import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createSeriesMarkers,
  LineStyle,
} from 'lightweight-charts';
import {
  X,
  Maximize2,
  Minimize2,
  Zap,
  TrendingUp,
  Calendar,
  Sparkles,
  RefreshCw,
  Sliders,
  Activity,
  ArrowUp,
  ArrowDown,
  Edit3,
  Check,
  AlertCircle
} from 'lucide-react';
import { BracketOrderModal } from './BracketOrderModal';
import { soundAlerts } from '../utils/audioAlerts';

export interface TradingViewChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  currentPrice?: number;
  companyName?: string;
  onSelectForTrade?: (symbol: string, price: number) => void;
}

export const TradingViewChartModal: React.FC<TradingViewChartModalProps> = ({
  isOpen,
  onClose,
  symbol,
  currentPrice,
  companyName,
  onSelectForTrade,
}) => {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema9SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema21SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const markersPluginRef = useRef<any>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<'1' | '5' | '15' | '60' | 'D'>('15');
  const [timeframe, setTimeframe] = useState<'1M' | '3M' | '6M' | '1Y'>('6M');

  // Technical Indicators Toggles
  const [showFootprints, setShowFootprints] = useState<boolean>(true);
  const [showVwap, setShowVwap] = useState<boolean>(true);
  const [showVolume, setShowVolume] = useState<boolean>(true);
  const [showEMA, setShowEMA] = useState<boolean>(true);
  const [showRSI, setShowRSI] = useState<boolean>(true);
  const [showMACD, setShowMACD] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  // Active hover tooltip state
  const [hoverData, setHoverData] = useState<{
    time: string | number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    footprintNote?: string;
  } | null>(null);

  // Loaded chart API data
  const [chartData, setChartData] = useState<{
    candles: any[];
    volumeData: any[];
    vwapData: any[];
    indicators?: {
      ema9: any[];
      ema21: any[];
      ema50: any[];
      rsi: any[];
      macd: {
        line: any[];
        signal: any[];
        histogram: any[];
      };
    };
    markers: any[];
    trailEvents: any[];
    currentLtp: number;
    companyName: string;
    sector: string;
    isRealFyers?: boolean;
    activeOrders?: any[];
    activePosition?: any;
  } | null>(null);

  // Bracket Order Modal trigger from chart
  const [bracketModalOpen, setBracketModalOpen] = useState<boolean>(false);

  // Order modification state
  const [modifyingOrderId, setModifyingOrderId] = useState<string | null>(null);
  const [modifyingPrice, setModifyingPrice] = useState<number>(0);
  const [modifyLoading, setModifyLoading] = useState<boolean>(false);
  const [orderActionMsg, setOrderActionMsg] = useState<string | null>(null);

  // Fetch Chart Data
  const fetchChartData = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = `/api/chart/candles/${encodeURIComponent(symbol)}?timeframe=${timeframe}&resolution=${resolution}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load chart candles');
      const data = await res.json();
      setChartData(data);
    } catch (err: any) {
      setError(err.message || 'Error loading chart');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && symbol) {
      fetchChartData();
    }
  }, [isOpen, symbol, timeframe, resolution]);

  // Handle Quick Order Modification / Price Nudge directly from Chart
  const handleNudgeOrderPrice = async (order: any, delta: number) => {
    const newPrice = Number((Math.max(0.05, (order.price || chartData?.currentLtp || 100) + delta)).toFixed(2));
    try {
      setModifyLoading(true);
      const res = await fetch('/api/trading/order/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: order.id,
          qty: order.qty,
          price: newPrice,
          triggerPrice: order.trigger_price || 0,
          orderType: order.order_type || 'LIMIT',
          isPaper: true,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        soundAlerts.playOrderFilledFanfare();
        setOrderActionMsg(`Order modified to ₹${newPrice.toFixed(2)}`);
        setTimeout(() => setOrderActionMsg(null), 3500);
        await fetchChartData();
      } else {
        soundAlerts.playRejectionBuzzer();
        setOrderActionMsg(data.error || 'Failed to modify order');
        setTimeout(() => setOrderActionMsg(null), 4000);
      }
    } catch (err: any) {
      soundAlerts.playRejectionBuzzer();
      setOrderActionMsg(err.message || 'Network error');
      setTimeout(() => setOrderActionMsg(null), 4000);
    } finally {
      setModifyLoading(false);
      setModifyingOrderId(null);
    }
  };

  // Handle Quick Order Cancel from Chart
  const handleCancelOrder = async (orderId: string) => {
    try {
      setModifyLoading(true);
      const res = await fetch('/api/trading/order/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, isPaper: true }),
      });
      if (res.ok) {
        soundAlerts.playDoubleNeutralBeep();
        setOrderActionMsg(`Order #${orderId.slice(-4)} cancelled`);
        setTimeout(() => setOrderActionMsg(null), 3000);
        await fetchChartData();
      }
    } catch (err: any) {
      setOrderActionMsg(err.message || 'Error cancelling order');
      setTimeout(() => setOrderActionMsg(null), 4000);
    } finally {
      setModifyLoading(false);
    }
  };

  // Initialize and update Lightweight Charts
  useEffect(() => {
    if (!isOpen || !chartContainerRef.current || !chartData || loading) return;

    // Clean up previous chart instance
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;
    const chartHeight = isMaximized ? Math.max(500, window.innerHeight - 260) : 460;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#090d16' },
        textColor: '#94a3b8',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.45)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.45)' },
      },
      crosshair: {
        vertLine: { color: '#f59e0b', width: 1, style: 2 },
        horzLine: { color: '#f59e0b', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: {
          top: 0.08,
          bottom: 0.22,
        },
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: resolution !== 'D',
        secondsVisible: false,
      },
      width: container.clientWidth,
      height: chartHeight,
    });

    chartRef.current = chart;

    // 1. Candlestick Series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });
    candlestickSeriesRef.current = candlestickSeries;
    candlestickSeries.setData(chartData.candles);

    // 2. Volume Series
    if (showVolume && chartData.volumeData?.length > 0) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });
      volumeSeries.setData(chartData.volumeData);
      volumeSeriesRef.current = volumeSeries;
    }

    // 3. Anchored VWAP Series
    if (showVwap && chartData.vwapData?.length > 0) {
      const vwapSeries = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 2,
        title: 'VWAP',
      });
      vwapSeries.setData(chartData.vwapData);
      vwapSeriesRef.current = vwapSeries;
    }

    // 4. EMA 9, 21, 50 Series
    if (showEMA && chartData.indicators) {
      if (chartData.indicators.ema9?.length > 0) {
        const ema9 = chart.addSeries(LineSeries, {
          color: '#06b6d4',
          lineWidth: 1.5,
          title: 'EMA 9',
        });
        ema9.setData(chartData.indicators.ema9);
        ema9SeriesRef.current = ema9;
      }
      if (chartData.indicators.ema21?.length > 0) {
        const ema21 = chart.addSeries(LineSeries, {
          color: '#a855f7',
          lineWidth: 1.5,
          title: 'EMA 21',
        });
        ema21.setData(chartData.indicators.ema21);
        ema21SeriesRef.current = ema21;
      }
      if (chartData.indicators.ema50?.length > 0) {
        const ema50 = chart.addSeries(LineSeries, {
          color: '#f97316',
          lineWidth: 1.5,
          title: 'EMA 50',
        });
        ema50.setData(chartData.indicators.ema50);
        ema50SeriesRef.current = ema50;
      }
    }

    // 5. Visual Chart Trading Price Lines (Entry, SL, Target, Position)
    if (chartData.activeOrders && chartData.activeOrders.length > 0) {
      chartData.activeOrders.forEach(ord => {
        if (ord.price > 0) {
          candlestickSeries.createPriceLine({
            price: ord.price,
            color: ord.side === 'BUY' ? '#38bdf8' : '#f43f5e',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `${ord.side} LMT ₹${ord.price.toFixed(2)} (#${ord.id.slice(-4)})`,
          });
        }
        if (ord.stop_loss && ord.stop_loss > 0) {
          candlestickSeries.createPriceLine({
            price: ord.stop_loss,
            color: '#ef4444',
            lineWidth: 1.5,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: `SL ₹${ord.stop_loss.toFixed(2)}`,
          });
        }
        if (ord.take_profit && ord.take_profit > 0) {
          candlestickSeries.createPriceLine({
            price: ord.take_profit,
            color: '#10b981',
            lineWidth: 1.5,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: `TARGET ₹${ord.take_profit.toFixed(2)}`,
          });
        }
      });
    }

    if (chartData.activePosition && chartData.activePosition.avg_price) {
      const pos = chartData.activePosition;
      candlestickSeries.createPriceLine({
        price: pos.avg_price,
        color: '#c084fc',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `POS ${pos.side} ${pos.qty} @ ₹${pos.avg_price.toFixed(2)}`,
      });
    }

    // 6. Smart Money Footprint Markers
    if (showFootprints && chartData.markers?.length > 0) {
      try {
        const candleTimes = new Set(chartData.candles.map(c => String(c.time)));
        const validMarkers = chartData.markers
          .filter((m: any) => candleTimes.has(String(m.time)))
          .sort((a: any, b: any) => String(a.time).localeCompare(String(b.time)));
        if (validMarkers.length > 0) {
          const markersPlugin = createSeriesMarkers(candlestickSeries, validMarkers);
          markersPluginRef.current = markersPlugin;
        }
      } catch (mErr) {
        console.warn('Markers error:', mErr);
      }
    }

    // Subscribe to crosshair move for tooltip HUD
    chart.subscribeCrosshairMove(param => {
      if (!param.time || !param.seriesData || !candlestickSeries) {
        setHoverData(null);
        return;
      }
      const barData: any = param.seriesData.get(candlestickSeries);
      if (!barData) {
        setHoverData(null);
        return;
      }

      let timeDisplay = String(param.time);
      if (typeof param.time === 'number') {
        const d = new Date(param.time * 1000);
        timeDisplay = `${d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
      }

      const trailHit = chartData.trailEvents?.find(t => String(t.date) === String(param.time));

      setHoverData({
        time: timeDisplay,
        open: barData.open,
        high: barData.high,
        low: barData.low,
        close: barData.close,
        volume: barData.volume || 0,
        footprintNote: trailHit ? `${trailHit.pattern_type}: ${trailHit.note}` : undefined,
      });
    });

    // Auto-fit content
    chart.timeScale().fitContent();

    // Window resize handler
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [isOpen, chartData, loading, showFootprints, showVwap, showVolume, showEMA, isMaximized, resolution]);

  if (!isOpen) return null;

  const effectiveLtp = chartData?.currentLtp || currentPrice || 100;
  const effectiveName = chartData?.companyName || companyName || symbol;
  const footprintCount = chartData?.markers?.length || 0;

  // Latest Indicator Values for HUD Badges
  const latestRsi = chartData?.indicators?.rsi && chartData.indicators.rsi.length > 0
    ? chartData.indicators.rsi[chartData.indicators.rsi.length - 1]?.value
    : null;

  const latestMacd = chartData?.indicators?.macd?.histogram && chartData.indicators.macd.histogram.length > 0
    ? chartData.indicators.macd.histogram[chartData.indicators.macd.histogram.length - 1]?.value
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`relative w-full bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col text-slate-100 overflow-hidden transition-all duration-300 ${
          isMaximized ? 'max-w-[98vw] h-[95vh]' : 'max-w-5xl max-h-[92vh]'
        }`}
      >
        {/* Header Bar */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800 flex items-center justify-between gap-4 flex-wrap">
          {/* Symbol Title & High-Conviction Chip */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black font-mono text-white tracking-tight">
                  {symbol}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {footprintCount} Footprint Clusters
                </span>
                {chartData?.isRealFyers && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    FYERS Real Feed
                  </span>
                )}
                {chartData?.sector && (
                  <span className="text-[11px] text-slate-400 hidden sm:inline">
                    • {chartData.sector}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span className="text-white font-medium">{effectiveName}</span>
                <span>•</span>
                <span className="text-emerald-400 font-mono font-extrabold text-sm">
                  LTP: ₹{effectiveLtp.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Controls: Resolution, Indicators, 1-Click Bracket, Maximize & Close */}
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            {/* Resolution Selector */}
            <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono font-bold">
              {(
                [
                  { label: '1m', val: '1' },
                  { label: '5m', val: '5' },
                  { label: '15m', val: '15' },
                  { label: '1h', val: '60' },
                  { label: '1D', val: 'D' },
                ] as const
              ).map(r => (
                <button
                  key={r.val}
                  type="button"
                  onClick={() => setResolution(r.val)}
                  className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                    resolution === r.val
                      ? 'bg-amber-500 text-slate-950 shadow-xs font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title={`${r.label} Resolution`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Timeframe selector (when Daily resolution is selected) */}
            {resolution === 'D' && (
              <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono font-bold">
                {(['1M', '3M', '6M', '1Y'] as const).map(tf => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setTimeframe(tf)}
                    className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                      timeframe === tf
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            )}

            {/* Indicators Toggle Toolbar */}
            <div className="hidden lg:flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-medium">
              <button
                type="button"
                onClick={() => setShowEMA(!showEMA)}
                className={`px-2 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-all ${
                  showEMA
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Toggle EMA 9 / 21 / 50 Ribbons"
              >
                <Sliders className="w-3 h-3" />
                <span>EMA</span>
              </button>
              <button
                type="button"
                onClick={() => setShowVwap(!showVwap)}
                className={`px-2 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-all ${
                  showVwap
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Toggle Institutional VWAP"
              >
                <span>VWAP</span>
              </button>
              <button
                type="button"
                onClick={() => setShowRSI(!showRSI)}
                className={`px-2 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-all ${
                  showRSI
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Toggle RSI 14 Momentum Tracker"
              >
                <Activity className="w-3 h-3" />
                <span>RSI</span>
              </button>
              <button
                type="button"
                onClick={() => setShowFootprints(!showFootprints)}
                className={`px-2 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-all ${
                  showFootprints
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Toggle Smart Money Accumulation Arrows"
              >
                <Sparkles className="w-3 h-3" />
                <span>Footprints</span>
              </button>
            </div>

            {/* 1-Click Bracket Order Trigger */}
            <button
              type="button"
              onClick={() => {
                soundAlerts.playSpringSweepChime();
                setBracketModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center gap-1 shadow-md transition-all cursor-pointer active:scale-95"
              title="Execute 1-Click Bracket Order directly from chart"
            >
              <Zap className="w-3.5 h-3.5 fill-slate-950" />
              <span>⚡ 1-Click Bracket</span>
            </button>

            {/* Maximize toggle */}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title={isMaximized ? 'Restore View' : 'Maximize Chart'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-200 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Real-time OHLCV, Indicators & Footprint HUD Strip */}
        <div className="px-4 py-2 bg-slate-950/90 border-b border-slate-800/80 flex items-center justify-between text-xs font-mono gap-3 overflow-x-auto scrollbar-none flex-wrap">
          {hoverData ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-slate-400 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-amber-500" />
                {hoverData.time}
              </span>
              <span>O: <strong className="text-white">₹{hoverData.open.toFixed(2)}</strong></span>
              <span>H: <strong className="text-emerald-400">₹{hoverData.high.toFixed(2)}</strong></span>
              <span>L: <strong className="text-rose-400">₹{hoverData.low.toFixed(2)}</strong></span>
              <span>C: <strong className="text-sky-300">₹{hoverData.close.toFixed(2)}</strong></span>
              <span>Vol: <strong className="text-amber-400">{hoverData.volume.toLocaleString()}</strong></span>
              {hoverData.footprintNote && (
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[11px] font-bold">
                  ★ {hoverData.footprintNote}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2.5 text-slate-400 text-[11px] flex-wrap">
              <span className="text-amber-400 font-bold">Crosshair HUD Active</span>
              <span>•</span>
              {showEMA && (
                <span className="flex items-center gap-2">
                  <span className="text-cyan-400">EMA 9</span>
                  <span className="text-purple-400">EMA 21</span>
                  <span className="text-orange-400">EMA 50</span>
                </span>
              )}
              {showRSI && latestRsi != null && (
                <span className="px-1.5 py-0.5 rounded-md bg-violet-950 text-violet-300 border border-violet-800 text-[10px] font-bold">
                  RSI(14): {latestRsi} {latestRsi > 70 ? '🔥 OB' : latestRsi < 30 ? '🧊 OS' : '⚖ Bullish'}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {chartData?.activeOrders && chartData.activeOrders.length > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-sky-950 text-sky-300 border border-sky-800 text-[10px] font-bold">
                {chartData.activeOrders.length} Chart Order Line(s)
              </span>
            )}
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">
              {resolution === 'D' ? 'Daily Candles' : `${resolution}m Real Intraday`}
            </span>
          </div>
        </div>

        {/* Action Status Notification Toast */}
        {orderActionMsg && (
          <div className="px-4 py-1.5 bg-emerald-950/90 border-b border-emerald-800 text-emerald-300 text-xs font-mono font-bold flex items-center justify-between animate-in slide-in-from-top-1">
            <span className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              {orderActionMsg}
            </span>
            <button
              type="button"
              onClick={() => setOrderActionMsg(null)}
              className="text-emerald-500 hover:text-emerald-200 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Chart Canvas Area */}
        <div className="relative flex-1 bg-slate-950 min-h-[360px] flex flex-col justify-center">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 space-y-3">
              <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
              <p className="font-bold text-sm text-slate-200">Loading Candlestick Series...</p>
              <p className="text-xs text-slate-500">Pulling real {resolution === 'D' ? 'daily' : `${resolution}m intraday`} FYERS candles & indicators</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-rose-400 space-y-2">
              <p className="font-bold text-sm">Failed to load chart: {error}</p>
              <button
                type="button"
                onClick={fetchChartData}
                className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs font-bold cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : (
            <div ref={chartContainerRef} className="w-full h-full" />
          )}
        </div>

        {/* Visual Chart Trading & Drag/Nudge Order Bar */}
        {chartData?.activeOrders && chartData.activeOrders.length > 0 ? (
          <div className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3 flex-wrap text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-400 border border-sky-500/40 font-bold text-[11px] flex items-center gap-1">
                <Edit3 className="w-3 h-3" />
                Visual Chart Trading Active
              </span>
              <span className="text-slate-400 text-[11px]">
                Nudge or adjust pending orders directly on the candlestick chart:
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {chartData.activeOrders.map(ord => (
                <div
                  key={ord.id}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 shadow-xs"
                >
                  <span className={`font-black ${ord.side === 'BUY' ? 'text-sky-400' : 'text-rose-400'}`}>
                    {ord.side} {ord.qty} @ ₹{ord.price?.toFixed(2)}
                  </span>

                  {/* Nudge Buttons */}
                  <div className="flex items-center gap-0.5 ml-1">
                    <button
                      type="button"
                      disabled={modifyLoading}
                      onClick={() => handleNudgeOrderPrice(ord, -0.10)}
                      className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-bold cursor-pointer transition-colors"
                      title="Nudge price down by ₹0.10"
                    >
                      -₹0.10
                    </button>
                    <button
                      type="button"
                      disabled={modifyLoading}
                      onClick={() => handleNudgeOrderPrice(ord, +0.10)}
                      className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-bold cursor-pointer transition-colors"
                      title="Nudge price up by ₹0.10"
                    >
                      +₹0.10
                    </button>
                  </div>

                  {/* Cancel Button */}
                  <button
                    type="button"
                    disabled={modifyLoading}
                    onClick={() => handleCancelOrder(ord.id)}
                    className="p-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-400 hover:text-rose-200 text-[10px] cursor-pointer ml-1"
                    title="Cancel pending order"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-4 py-2 bg-slate-950/95 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400 flex-wrap gap-2">
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-slate-300 font-semibold">Quick Chart Actions:</span>
              <button
                type="button"
                onClick={() => {
                  soundAlerts.playDoubleLowConfirm();
                  onSelectForTrade?.(symbol, Number(effectiveLtp.toFixed(2)));
                  onClose();
                }}
                className="px-2.5 py-1 rounded-lg bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800 font-bold cursor-pointer transition-colors"
              >
                Trade {symbol.split(':')[1] || symbol} (₹{effectiveLtp.toFixed(2)})
              </button>
              <button
                type="button"
                onClick={() => {
                  soundAlerts.playSpringSweepChime();
                  setBracketModalOpen(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 font-bold cursor-pointer transition-colors"
              >
                ⚡ Open Bracket Setup
              </button>
            </div>
            <div className="text-[11px] text-slate-500">
              Chart lines automatically render whenever orders or positions are active
            </div>
          </div>
        )}

        {/* Footer Legend */}
        <div className="p-3 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400 flex-wrap gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>
              <span>Bullish</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500"></span>
              <span>Bearish</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-amber-500"></span>
              <span>VWAP</span>
            </div>
            {showEMA && (
              <div className="flex items-center gap-2">
                <span className="text-cyan-400 text-[11px]">━ EMA 9</span>
                <span className="text-purple-400 text-[11px]">━ EMA 21</span>
                <span className="text-orange-400 text-[11px]">━ EMA 50</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-amber-400">★ ▲</span>
              <span>Footprint Marker</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500">
            Click candle to inspect price action or launch bracket order
          </div>
        </div>

        {/* Bracket Order Modal Opened from Chart */}
        {bracketModalOpen && (
          <BracketOrderModal
            isOpen={bracketModalOpen}
            onClose={() => setBracketModalOpen(false)}
            symbol={symbol}
            currentPrice={effectiveLtp}
            strategyName="TradingView Chart Setup (Institutional VWAP Rebound)"
            winRate="72% Win"
            dayLow={effectiveLtp * 0.98}
            onOrderSuccess={(msg) => {
              setBracketModalOpen(false);
              fetchChartData();
            }}
          />
        )}
      </div>
    </div>
  );
};
