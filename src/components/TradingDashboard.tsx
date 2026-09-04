import React, { useState, useEffect, useRef } from 'react';
import { 
  Zap, 
  ShieldCheck, 
  ArrowUpRight, 
  ArrowDownRight, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Briefcase, 
  History, 
  DollarSign, 
  Radio,
  Layers,
  ChevronRight,
  TrendingUp,
  Landmark
} from 'lucide-react';

export interface Position {
  symbol: string;
  side: 'BUY' | 'SELL';
  product: 'INTRADAY' | 'CNC';
  qty: number;
  avg_price: number;
  currentLtp: number;
  pnl: number;
  pnlPercent: number;
  currentValue: number;
}

export interface OrderItem {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  order_type: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  product: 'INTRADAY' | 'CNC';
  qty: number;
  price: number;
  trigger_price?: number | null;
  status: 'COMPLETE' | 'PENDING' | 'CANCELLED' | 'REJECTED';
  executed_price: number;
  created_at: string;
}

export interface LiveSymbolQuote {
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

interface TradingDashboardProps {
  initialSymbol?: string;
  initialPrice?: number;
  availableSymbols: string[];
}

export const TradingDashboard: React.FC<TradingDashboardProps> = ({
  initialSymbol,
  initialPrice,
  availableSymbols,
}) => {
  // Order Ticket States
  const [selectedSymbol, setSelectedSymbol] = useState<string>(initialSymbol || 'NSE:RELIANCE-EQ');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT' | 'SL'>('MARKET');
  const [product, setProduct] = useState<'INTRADAY' | 'CNC'>('INTRADAY');
  const [qty, setQty] = useState<number>(50);
  const [price, setPrice] = useState<number>(initialPrice || 1310);
  const [triggerPrice, setTriggerPrice] = useState<number>(0);
  const [isPaper, setIsPaper] = useState<boolean>(true);
  
  // Real-time Selected Symbol Quote
  const [liveQuote, setLiveQuote] = useState<LiveSymbolQuote | null>(null);
  const [quoteFlash, setQuoteFlash] = useState<'up' | 'down' | null>(null);
  const prevLtpRef = useRef<number | null>(null);

  // Funds & Margin State
  const [funds, setFunds] = useState<{
    totalBalance: number;
    availableBalance: number;
    utilizedAmount: number;
    realizedPnl?: number;
  }>({
    totalBalance: 1000000,
    availableBalance: 1000000,
    utilizedAmount: 0,
    realizedPnl: 0,
  });

  // Positions & Orders
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [orderLoading, setOrderLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'positions' | 'orders'>('positions');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Sync initial symbol if changed from outside
  useEffect(() => {
    if (initialSymbol) {
      setSelectedSymbol(initialSymbol);
      if (initialPrice) setPrice(initialPrice);
    }
  }, [initialSymbol, initialPrice]);

  // Fetch real-time quote for selected symbol
  const fetchSymbolQuote = async () => {
    if (!selectedSymbol.trim()) return;
    try {
      const res = await fetch(`/api/trading/quote/${encodeURIComponent(selectedSymbol)}`);
      if (res.ok) {
        const q: LiveSymbolQuote = await res.json();
        if (prevLtpRef.current !== null && q.ltp !== prevLtpRef.current) {
          setQuoteFlash(q.ltp > prevLtpRef.current ? 'up' : 'down');
          setTimeout(() => setQuoteFlash(null), 800);
        }
        prevLtpRef.current = q.ltp;
        setLiveQuote(q);

        // If user is placing MARKET order or price is not set, sync with real LTP
        if (orderType === 'MARKET') {
          setPrice(q.ltp);
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchSymbolQuote();
    const quoteInterval = setInterval(fetchSymbolQuote, 2500);
    return () => clearInterval(quoteInterval);
  }, [selectedSymbol]);

  // Fetch Positions, Orders & Funds
  const fetchTradingData = async () => {
    try {
      setLoading(true);
      const [posRes, ordRes, fundRes] = await Promise.all([
        fetch(`/api/trading/positions?isPaper=${isPaper}`),
        fetch(`/api/trading/orders?isPaper=${isPaper}`),
        fetch(`/api/trading/funds?isPaper=${isPaper}`),
      ]);
      if (posRes.ok) {
        const posData = await posRes.json();
        setPositions(posData.positions || posData);
      }
      if (ordRes.ok) {
        const ordData = await ordRes.json();
        setOrders(ordData.orders || ordData);
      }
      if (fundRes.ok) {
        setFunds(await fundRes.json());
      }
    } catch (err) {
      console.error('Failed to fetch trading data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTradingData();
    const interval = setInterval(fetchTradingData, 3500);
    return () => clearInterval(interval);
  }, [isPaper]);

  // Summary Metrics
  const totalPnl = positions.reduce((acc, pos) => acc + (pos.pnl || 0), 0);
  const totalValue = positions.reduce((acc, pos) => acc + (pos.currentValue || 0), 0);

  // Order Submission
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/trading/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedSymbol,
          side,
          orderType,
          product,
          qty,
          price: orderType === 'MARKET' ? (liveQuote?.ltp || price) : price,
          triggerPrice: orderType === 'SL' ? triggerPrice : 0,
          isPaper,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to place order');

      if (data.fyersOrder) {
        if (data.s === 'ok' || data.code === 1101) {
          setFeedback({
            type: 'success',
            message: `Live FYERS Order Accepted! Order ID: ${data.id || data.orderNum || 'ACK'}`,
          });
        } else {
          setFeedback({
            type: 'error',
            message: `FYERS Broker Rejection: ${data.message || 'Order rejected by broker (Insufficient Funds / Margin Rule)'} ${data.code ? `[Code: ${data.code}]` : ''}`,
          });
        }
      } else {
        setFeedback({
          type: 'success',
          message: `${side} ${qty} shares of ${selectedSymbol} executed @ ₹${data.executedPrice || price}!`,
        });
      }
      fetchTradingData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Order execution error',
      });
    } finally {
      setOrderLoading(false);
    }
  };

  // Square Off Position
  const handleSquareOff = async (symbol: string) => {
    try {
      const res = await fetch(`/api/trading/squareoff/${encodeURIComponent(symbol)}?isPaper=${isPaper}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Square off failed');

      setFeedback({
        type: 'success',
        message: `Squared off ${symbol}. Realized P&L: ₹${data.pnl || 0}`,
      });
      fetchTradingData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Square off failed',
      });
    }
  };

  // Order Ticket Calculations
  const currentPrice = liveQuote?.ltp || price || 1000;
  const effectivePrice = orderType === 'MARKET' ? currentPrice : price;
  const totalOrderValue = effectivePrice * qty;
  const estimatedMargin = product === 'INTRADAY' ? totalOrderValue / 5 : totalOrderValue;

  return (
    <div className="flex flex-col gap-5 w-full">

      {/* Account Overview & Mode Bar */}
      <div className="web2-card rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white/90 border-sky-200/80 shadow-xs">
        
        {/* Left: Mode Toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setIsPaper(true)}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                isPaper ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Paper Trading (Safe)</span>
            </button>
            <button
              type="button"
              onClick={() => setIsPaper(false)}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                !isPaper ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Live FYERS Broker API</span>
            </button>
          </div>
          <span className="text-xs font-mono font-bold hidden sm:inline">
            {isPaper ? (
              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                Simulated Capital: ₹10,00,000 (Live Prices)
              </span>
            ) : (
              <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                Direct FYERS API Account
              </span>
            )}
          </span>
        </div>

        {/* Right: Live Balance Metrics */}
        <div className="flex items-center gap-4 sm:gap-6 font-mono text-xs">
          <div>
            <div className="text-slate-500 text-[10px] uppercase font-bold">Available Margin</div>
            <div className="font-extrabold text-sky-950 text-sm sm:text-base">
              ₹{(funds.availableBalance || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-[10px] uppercase font-bold">Used Margin</div>
            <div className="font-bold text-slate-700 text-sm sm:text-base">
              ₹{(funds.utilizedAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-[10px] uppercase font-bold">Unrealized P&L</div>
            <div className={`font-extrabold text-sm sm:text-base flex items-center gap-0.5 ${totalPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toFixed(2)}
            </div>
          </div>
        </div>

      </div>

      {/* Main Trading Area: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left: Order Ticket (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="web2-card rounded-2xl sm:rounded-3xl border border-sky-200/80 bg-white/95 p-5 sm:p-6 shadow-md flex flex-col gap-4">
            
            {/* Real-time Symbol Quote Ticker Banner */}
            <div className={`p-3.5 rounded-2xl border transition-all duration-300 ${
              quoteFlash === 'up'
                ? 'bg-emerald-100 border-emerald-400'
                : quoteFlash === 'down'
                ? 'bg-rose-100 border-rose-400'
                : 'bg-slate-900 border-slate-800 text-slate-100'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono font-bold text-xs tracking-tight text-sky-300">
                  {selectedSymbol}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-emerald-400 border border-emerald-800">
                  REAL FYERS LIVE
                </span>
              </div>

              <div className="flex items-baseline justify-between mb-2">
                <div className={`text-2xl font-black font-mono tracking-tight ${quoteFlash ? 'text-slate-900' : 'text-white'}`}>
                  ₹{liveQuote?.ltp != null ? liveQuote.ltp.toFixed(2) : '-'}
                </div>
                <div className={`flex items-center text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
                  (liveQuote?.pChange || 0) >= 0
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                    : 'bg-rose-950 text-rose-300 border border-rose-700'
                }`}>
                  {(liveQuote?.pChange || 0) >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                  <span>{(liveQuote?.pChange || 0) >= 0 ? '+' : ''}{liveQuote?.pChange?.toFixed(2) ?? '0.00'}%</span>
                </div>
              </div>

              {/* Bid / Ask & Spread Mini Strip */}
              <div className="grid grid-cols-3 gap-1 pt-2 border-t border-slate-800 text-[10px] font-mono text-center">
                <div>
                  <span className="text-slate-400 block text-[9px]">BID</span>
                  <span className="font-bold text-emerald-400">₹{liveQuote?.bid?.toFixed(2) || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px]">ASK</span>
                  <span className="font-bold text-rose-400">₹{liveQuote?.ask?.toFixed(2) || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px]">SPREAD</span>
                  <span className="font-bold text-amber-300">{liveQuote?.spread?.toFixed(2) || '-'}</span>
                </div>
              </div>
            </div>

            <form onSubmit={handlePlaceOrder} className="flex flex-col gap-4 text-xs font-sans">
              
              {/* Buy / Sell Tabs */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setSide('BUY')}
                  className={`py-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                    side === 'BUY'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setSide('SELL')}
                  className={`py-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                    side === 'SELL'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  SELL
                </button>
              </div>

              {/* Symbol Input */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Stock Symbol</label>
                <input
                  type="text"
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g. NSE:RELIANCE-EQ"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:border-sky-500 bg-white"
                  required
                />
              </div>

              {/* Product & Order Type Rows */}
              <div className="grid grid-cols-2 gap-3">
                {/* Product */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Product</label>
                  <select
                    value={product}
                    onChange={(e) => setProduct(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:border-sky-500 bg-white cursor-pointer"
                  >
                    <option value="INTRADAY">INTRADAY (MIS - 5x)</option>
                    <option value="CNC">DELIVERY (CNC - 1x)</option>
                  </select>
                </div>

                {/* Order Type */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Order Type</label>
                  <select
                    value={orderType}
                    onChange={(e) => {
                      const t = e.target.value as any;
                      setOrderType(t);
                      if (t === 'MARKET' && liveQuote?.ltp) setPrice(liveQuote.ltp);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:border-sky-500 bg-white cursor-pointer"
                  >
                    <option value="MARKET">MARKET</option>
                    <option value="LIMIT">LIMIT</option>
                    <option value="SL">STOP LOSS (SL)</option>
                  </select>
                </div>
              </div>

              {/* Quantity & Price */}
              <div className="grid grid-cols-2 gap-3">
                {/* Qty */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">Quantity</label>
                    <div className="flex gap-1 text-[10px] font-mono">
                      <button type="button" onClick={() => setQty(25)} className="text-sky-600 hover:underline cursor-pointer">+25</button>
                      <button type="button" onClick={() => setQty(50)} className="text-sky-600 hover:underline cursor-pointer">+50</button>
                      <button type="button" onClick={() => setQty(100)} className="text-sky-600 hover:underline cursor-pointer">+100</button>
                    </div>
                  </div>
                  <input
                    type="number"
                    min="1"
                    value={qty}
                    onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:border-sky-500 bg-white"
                    required
                  />
                </div>

                {/* Price */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">
                      {orderType === 'MARKET' ? 'Market Price' : 'Limit Price (₹)'}
                    </label>
                    {liveQuote?.ltp && orderType !== 'MARKET' && (
                      <button
                        type="button"
                        onClick={() => setPrice(liveQuote.ltp)}
                        className="text-[10px] text-sky-600 hover:underline font-mono cursor-pointer"
                      >
                        = LTP
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.05"
                    disabled={orderType === 'MARKET'}
                    value={price}
                    onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                    className={`w-full px-3 py-2 rounded-xl border font-mono text-xs focus:outline-none focus:border-sky-500 ${
                      orderType === 'MARKET' ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-white border-slate-300'
                    }`}
                  />
                </div>
              </div>

              {/* Trigger Price if SL */}
              {orderType === 'SL' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Trigger Price (₹)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={triggerPrice}
                    onChange={(e) => setTriggerPrice(parseFloat(e.target.value) || 0)}
                    placeholder="Trigger threshold"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:border-sky-500 bg-white"
                    required
                  />
                </div>
              )}

              {/* Order Estimation Box */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px] flex flex-col gap-1 text-slate-600">
                <div className="flex justify-between">
                  <span>Traded Value:</span>
                  <span className="font-bold text-slate-900">₹{totalOrderValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span>Estimated Margin ({product === 'INTRADAY' ? '5x' : '1x'}):</span>
                  <span className="font-bold text-sky-700">₹{estimatedMargin.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={orderLoading}
                className={`w-full py-3 rounded-xl font-bold text-sm text-white transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 ${
                  side === 'BUY'
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                    : 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
                } disabled:opacity-60`}
              >
                {orderLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-current" />
                    <span>{side} {qty} {selectedSymbol.split(':')[1]?.replace('-EQ', '') || selectedSymbol}</span>
                  </>
                )}
              </button>

              {/* Feedback Alert */}
              {feedback && (
                <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  feedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <span>{feedback.message}</span>
                </div>
              )}

            </form>

          </div>
        </div>

        {/* Right: Positions & Order Book (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          
          {/* Sub Navigation: Positions vs Order Book */}
          <div className="flex items-center justify-between">
            <div className="flex items-center rounded-2xl bg-white p-1 border border-sky-200 shadow-xs text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('positions')}
                className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'positions'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Briefcase className="w-3.5 h-3.5" />
                <span>Positions ({positions.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('orders')}
                className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'orders'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Order Book ({orders.length})</span>
              </button>
            </div>

            <button
              type="button"
              onClick={fetchTradingData}
              disabled={loading}
              className="p-2 rounded-xl bg-white text-slate-600 hover:text-sky-700 border border-sky-200 transition-colors shadow-xs cursor-pointer"
              title="Refresh positions & orders"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-600' : ''}`} />
            </button>
          </div>

          {/* Tab 1: Positions Table */}
          {activeTab === 'positions' && (
            <div className="web2-card rounded-2xl md:rounded-3xl border border-sky-200/80 shadow-md bg-slate-950 overflow-hidden">
              <div className="overflow-x-auto max-h-[580px] scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
                <table className="w-full text-left font-mono text-xs text-slate-200 border-collapse">
                  <thead>
                    <tr className="bg-slate-900/95 text-slate-400 font-bold border-b border-slate-800 text-[11px] uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md">
                      <th className="py-3 px-3.5">Symbol</th>
                      <th className="py-3 px-3">Side</th>
                      <th className="py-3 px-3 text-right">Qty</th>
                      <th className="py-3 px-3 text-right">Avg Price</th>
                      <th className="py-3 px-3 text-right">LTP</th>
                      <th className="py-3 px-3 text-right">P&L (₹)</th>
                      <th className="py-3 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[12px]">
                    {positions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500">
                          No open positions in {isPaper ? 'Paper Trading' : 'FYERS Account'}. Use the order ticket on the left to execute trades.
                        </td>
                      </tr>
                    ) : (
                      positions.map((pos) => {
                        const isPos = pos.pnl >= 0;
                        return (
                          <tr key={pos.symbol} className="hover:bg-slate-900/80 transition-colors">
                            <td className="py-3 px-3.5">
                              <div className="font-bold text-sky-300">{pos.symbol}</div>
                              <div className="text-[10px] text-slate-500">{pos.product}</div>
                            </td>
                            <td className="py-3 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                pos.side === 'BUY' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                              }`}>
                                {pos.side}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-white">
                              {pos.qty}
                            </td>
                            <td className="py-3 px-3 text-right text-slate-300">
                              ₹{pos.avg_price.toFixed(2)}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-sky-300">
                              ₹{pos.currentLtp.toFixed(2)}
                            </td>
                            <td className={`py-3 px-3 text-right font-extrabold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                              <div>{isPos ? '+' : ''}₹{pos.pnl.toFixed(2)}</div>
                              <div className="text-[10px] opacity-80">{isPos ? '+' : ''}{pos.pnlPercent.toFixed(2)}%</div>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleSquareOff(pos.symbol)}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-900/80 hover:bg-rose-800 text-rose-200 border border-rose-700 transition-all cursor-pointer shadow-xs"
                                title="Exit this position at market price"
                              >
                                Exit
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 2: Order Book Table */}
          {activeTab === 'orders' && (
            <div className="web2-card rounded-2xl md:rounded-3xl border border-sky-200/80 shadow-md bg-slate-950 overflow-hidden">
              <div className="overflow-x-auto max-h-[580px] scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
                <table className="w-full text-left font-mono text-xs text-slate-200 border-collapse">
                  <thead>
                    <tr className="bg-slate-900/95 text-slate-400 font-bold border-b border-slate-800 text-[11px] uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md">
                      <th className="py-3 px-3.5">Time</th>
                      <th className="py-3 px-3">Order ID</th>
                      <th className="py-3 px-3">Symbol</th>
                      <th className="py-3 px-3">Side</th>
                      <th className="py-3 px-3">Type</th>
                      <th className="py-3 px-3 text-right">Qty</th>
                      <th className="py-3 px-3 text-right">Price</th>
                      <th className="py-3 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          No order history found in {isPaper ? 'Paper Trading' : 'FYERS Account'}.
                        </td>
                      </tr>
                    ) : (
                      orders.map((ord) => (
                        <tr key={ord.id} className="hover:bg-slate-900/80 transition-colors">
                          <td className="py-2.5 px-3.5 text-slate-400">
                            {ord.created_at.split(' ')[1] || ord.created_at}
                          </td>
                          <td className="py-2.5 px-3 text-sky-400 font-bold">
                            {ord.id}
                          </td>
                          <td className="py-2.5 px-3 text-white font-bold">
                            {ord.symbol}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-1.5 py-0.5 rounded font-bold ${
                              ord.side === 'BUY' ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                            }`}>
                              {ord.side}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">
                            {ord.order_type}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-white">
                            {ord.qty}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                            ₹{ord.executed_price ? ord.executed_price.toFixed(2) : ord.price.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              ord.status === 'COMPLETE' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                              ord.status === 'PENDING' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                              'bg-rose-950 text-rose-300 border border-rose-800'
                            }`}>
                              {ord.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
