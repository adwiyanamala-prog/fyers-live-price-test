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
  Landmark,
  Star,
  Edit3,
  X,
  PieChart,
  Calculator,
  Receipt,
  BarChart2,
  Percent
} from 'lucide-react';
import { StockWatchlist } from './StockWatchlist';
import { TradingViewChartModal } from './TradingViewChartModal';

export interface HoldingItem {
  symbol: string;
  qty: number;
  avg_price: number;
  investedValue: number;
  currentLtp: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  dayChange?: number;
  dayChangePct?: number;
}

export interface Position {
  id?: string;
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
  initialSide?: 'BUY' | 'SELL';
  availableSymbols: string[];
}

export const TradingDashboard: React.FC<TradingDashboardProps> = ({
  initialSymbol,
  initialPrice,
  initialSide,
  availableSymbols,
}) => {
  // Order Ticket States
  const [selectedSymbol, setSelectedSymbol] = useState<string>(initialSymbol || 'NSE:IDEA-EQ');
  const [side, setSide] = useState<'BUY' | 'SELL'>(initialSide || 'BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT' | 'SL'>('MARKET');
  const [product, setProduct] = useState<'INTRADAY' | 'CNC'>('INTRADAY');
  const [qty, setQty] = useState<number>(1);
  const [price, setPrice] = useState<number | string>(initialPrice || 15.5);
  const [triggerPrice, setTriggerPrice] = useState<number>(0);
  const [isPaper, setIsPaper] = useState<boolean>(true);
  
  // Real-time Selected Symbol Quote
  const [liveQuote, setLiveQuote] = useState<LiveSymbolQuote | null>(null);
  const [quoteFlash, setQuoteFlash] = useState<'up' | 'down' | null>(null);
  const prevLtpRef = useRef<number | null>(null);
  const orderTypeRef = useRef(orderType);

  useEffect(() => {
    orderTypeRef.current = orderType;
  }, [orderType]);

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

  // Positions, Orders & Holdings
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [holdings, setHoldings] = useState<HoldingItem[]>([]);
  const [holdingsOverall, setHoldingsOverall] = useState<{
    total_invested: number;
    total_current: number;
    total_pl: number;
    pnl_percentage: number;
  } | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [orderLoading, setOrderLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'positions' | 'orders' | 'holdings' | 'watchlist'>('positions');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string; action?: 'switch_paper' } | null>(null);

  // Chart modal integration for any position or holding
  const [chartModalSymbol, setChartModalSymbol] = useState<string | null>(null);
  const [chartModalPrice, setChartModalPrice] = useState<number | undefined>(undefined);

  // Statutory Tax & Brokerage Calculator State
  const [calcTradeType, setCalcTradeType] = useState<'EQUITY_DELIVERY' | 'EQUITY_INTRADAY'>('EQUITY_DELIVERY');
  const [calcBuyPrice, setCalcBuyPrice] = useState<number>(36.50);
  const [calcSellPrice, setCalcSellPrice] = useState<number>(42.00);
  const [calcQty, setCalcQty] = useState<number>(500);
  const [calcResult, setCalcResult] = useState<any>(null);
  const [calcLoading, setCalcLoading] = useState<boolean>(false);

  // Fetch Charges Estimation
  const fetchChargesEstimate = async (tType: string, buyP: number, sellP: number, q: number) => {
    try {
      setCalcLoading(true);
      const res = await fetch(`/api/trading/charges-calculator?tradeType=${tType}&buyPrice=${buyP}&sellPrice=${sellP}&qty=${q}`);
      if (res.ok) {
        setCalcResult(await res.json());
      }
    } catch (err) {
      console.warn("Failed to calculate charges:", err);
    } finally {
      setCalcLoading(false);
    }
  };

  useEffect(() => {
    fetchChargesEstimate(calcTradeType, calcBuyPrice, calcSellPrice, calcQty);
  }, [calcTradeType, calcBuyPrice, calcSellPrice, calcQty]);

  // Sync initial symbol if changed from outside
  useEffect(() => {
    if (initialSymbol) {
      setSelectedSymbol(initialSymbol);
      if (initialPrice) setPrice(initialPrice);
      if (initialSide) setSide(initialSide);
    }
  }, [initialSymbol, initialPrice, initialSide]);

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

        // ONLY automatically sync price if user is placing a MARKET order
        // Never overwrite user-entered Limit Price or SL trigger
        if (orderTypeRef.current === 'MARKET') {
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

  // Fetch Positions, Orders, Holdings & Funds
  const fetchTradingData = async () => {
    try {
      setLoading(true);
      const [posRes, ordRes, fundRes, holdRes] = await Promise.all([
        fetch(`/api/trading/positions?isPaper=${isPaper}`),
        fetch(`/api/trading/orders?isPaper=${isPaper}`),
        fetch(`/api/trading/funds?isPaper=${isPaper}`),
        fetch(`/api/trading/holdings?isPaper=${isPaper}`),
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
      if (holdRes.ok) {
        const holdData = await holdRes.json();
        setHoldings(holdData.holdings || []);
        setHoldingsOverall(holdData.overall || null);
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

  const [reconcileNotice, setReconcileNotice] = useState<string | null>(null);

  const handleCancelOrder = async (orderId: string) => {
    try {
      setLoading(true);
      const res = await fetch('/api/trading/order/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, isPaper }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel order');
      setFeedback({ type: 'success', message: `Order ${orderId} cancelled.` });
      fetchTradingData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to cancel order' });
    } finally {
      setLoading(false);
    }
  };

  // Modify Order state
  const [modifyingOrder, setModifyingOrder] = useState<OrderItem | null>(null);
  const [modQty, setModQty] = useState<number>(1);
  const [modPrice, setModPrice] = useState<number>(0);
  const [modTriggerPrice, setModTriggerPrice] = useState<number>(0);
  const [modOrderType, setModOrderType] = useState<'LIMIT' | 'MARKET' | 'SL'>('LIMIT');
  const [modLoading, setModLoading] = useState<boolean>(false);
  const [modError, setModError] = useState<string | null>(null);

  const openModifyModal = (ord: OrderItem) => {
    setModifyingOrder(ord);
    setModQty(ord.qty);
    setModPrice(ord.price || 0);
    setModTriggerPrice(ord.trigger_price || 0);
    const validTypes: ('LIMIT' | 'MARKET' | 'SL')[] = ['LIMIT', 'MARKET', 'SL'];
    const ordType = (ord.order_type === 'SL-M' ? 'SL' : ord.order_type) as ('LIMIT' | 'MARKET' | 'SL');
    setModOrderType(validTypes.includes(ordType) ? ordType : 'LIMIT');
    setModError(null);
  };

  const handleModifyOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modifyingOrder) return;
    try {
      setModLoading(true);
      setModError(null);
      const res = await fetch('/api/trading/order/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: modifyingOrder.id,
          qty: Number(modQty),
          price: modOrderType === 'MARKET' ? 0 : Number(modPrice),
          triggerPrice: modOrderType === 'SL' ? Number(modTriggerPrice) : 0,
          orderType: modOrderType,
          isPaper,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to modify order');
      setFeedback({ type: 'success', message: `Order ${modifyingOrder.id} successfully modified!` });
      setModifyingOrder(null);
      fetchTradingData();
    } catch (err: any) {
      setModError(err.message || 'Failed to modify order');
    } finally {
      setModLoading(false);
    }
  };

  const handleReconcile = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/trading/reconcile?isPaper=${isPaper}`);
      if (res.ok) {
        const data = await res.json();
        setReconcileNotice(`Reconciled: ${data.pendingOrders} Pending | ${data.filledOrders} Filled`);
        fetchTradingData();
        setTimeout(() => setReconcileNotice(null), 4000);
      }
    } catch (err) {
      console.error('Reconciliation error:', err);
    } finally {
      setLoading(false);
    }
  };

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
          price: orderType === 'MARKET' ? (liveQuote?.ltp || Number(price) || 0) : (Number(price) || 0),
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
          const isAlgoRestricted = data.code === -50 || (typeof data.message === 'string' && data.message.toLowerCase().includes('algo orders'));
          setFeedback({
            type: 'error',
            message: isAlgoRestricted
              ? `FYERS Broker Rejection: Algo orders restricted for this App [Code: -50]. Your FYERS App ID lacks Order Placement permissions on myapi.fyers.in. Switch to Paper Trading to trade safely with real-time quotes!`
              : `FYERS Broker Rejection: ${data.message || 'Order rejected by broker (Insufficient Funds / Margin Rule)'} ${data.code ? `[Code: ${data.code}]` : ''}`,
            action: isAlgoRestricted ? 'switch_paper' : undefined,
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
  const numericPrice = Number(price) || 0;
  const currentPrice = liveQuote?.ltp || numericPrice || 1000;
  const effectivePrice = orderType === 'MARKET' ? currentPrice : (numericPrice > 0 ? numericPrice : currentPrice);
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

              {/* Symbol Input & Quick Presets */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">Stock Symbol</label>
                  <span className="text-[10px] text-slate-500 font-medium">Quick Test Stocks:</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    { sym: 'NSE:SIGACHI-EQ', label: 'SIGACHI (~₹38)' },
                    { sym: 'NSE:IDEA-EQ', label: 'IDEA (~₹15.5)' },
                    { sym: 'NSE:YESBANK-EQ', label: 'YESBANK (~₹20)' },
                    { sym: 'NSE:TATASTEEL-EQ', label: 'TATASTEEL (~₹150)' },
                    { sym: 'NSE:SBIN-EQ', label: 'SBIN (~₹800)' },
                    { sym: 'NSE:RELIANCE-EQ', label: 'RELIANCE (~₹1310)' },
                  ].map((item) => (
                    <button
                      key={item.sym}
                      type="button"
                      onClick={() => {
                        setSelectedSymbol(item.sym);
                      }}
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                        selectedSymbol === item.sym
                          ? 'bg-sky-700 text-white border-sky-700 font-bold shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-sky-50 hover:border-sky-300'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g. NSE:IDEA-EQ"
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
                      if (t === 'MARKET' && liveQuote?.ltp) {
                        setPrice(liveQuote.ltp);
                      } else if (t === 'LIMIT' && (price === '' || price === 0) && liveQuote?.ltp) {
                        setPrice(liveQuote.ltp);
                      }
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
                      <button type="button" onClick={() => setQty(1)} className="px-1.5 py-0.5 bg-slate-100 hover:bg-sky-100 rounded text-sky-700 font-bold cursor-pointer">1</button>
                      <button type="button" onClick={() => setQty(2)} className="px-1.5 py-0.5 bg-slate-100 hover:bg-sky-100 rounded text-sky-700 font-bold cursor-pointer">2</button>
                      <button type="button" onClick={() => setQty(5)} className="px-1.5 py-0.5 bg-slate-100 hover:bg-sky-100 rounded text-sky-700 font-bold cursor-pointer">5</button>
                      <button type="button" onClick={() => setQty(10)} className="px-1.5 py-0.5 bg-slate-100 hover:bg-sky-100 rounded text-sky-700 font-bold cursor-pointer">10</button>
                      <button type="button" onClick={() => setQty(25)} className="px-1.5 py-0.5 bg-slate-100 hover:bg-sky-100 rounded text-sky-700 font-bold cursor-pointer">25</button>
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
                      {orderType === 'MARKET' ? 'Market Price (Auto)' : 'Limit Price (₹)'}
                    </label>
                    {liveQuote?.ltp && orderType !== 'MARKET' && (
                      <button
                        type="button"
                        onClick={() => setPrice(liveQuote.ltp)}
                        className="text-[10px] text-sky-600 hover:text-sky-800 hover:underline font-mono cursor-pointer flex items-center gap-0.5"
                        title="Click to copy current LTP into Limit Price"
                      >
                        = LTP ({liveQuote.ltp})
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.05"
                    disabled={orderType === 'MARKET'}
                    value={orderType === 'MARKET' ? (liveQuote?.ltp ?? price) : price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder={liveQuote?.ltp ? String(liveQuote.ltp) : "e.g. 38.50"}
                    className={`w-full px-3 py-2 rounded-xl border font-mono text-xs focus:outline-none focus:border-sky-500 ${
                      orderType === 'MARKET' ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed' : 'bg-white border-slate-300'
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
                <div className={`p-3 rounded-xl text-xs flex flex-col gap-2 ${
                  feedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  <div className="flex items-start gap-2">
                    {feedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <span className="leading-relaxed">{feedback.message}</span>
                  </div>
                  {feedback.action === 'switch_paper' && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsPaper(true);
                        setFeedback({
                          type: 'success',
                          message: 'Switched to Paper Trading Mode! You can now place simulated trades against live FYERS quotes with zero broker restrictions.',
                        });
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs cursor-pointer shadow-sm transition-all self-start ml-6"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Switch to Paper Trading (Safe Mode)
                    </button>
                  )}
                </div>
              )}

            </form>

          </div>

          {/* Quick Stock Watchlist */}
          <StockWatchlist
            layout="compact"
            selectedSymbol={selectedSymbol}
            title="Quick Watchlist (1-Click Trade)"
            onSelectForTrade={(sym, ltp, targetSide) => {
              setSelectedSymbol(sym);
              if (targetSide) setSide(targetSide);
              if (ltp) setPrice(ltp);
            }}
          />

        </div>

        {/* Right: Positions & Order Book (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          
          {/* Sub Navigation: Positions vs Order Book */}
          <div className="flex items-center justify-between gap-2">
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
              <button
                type="button"
                onClick={() => setActiveTab('holdings')}
                className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'holdings'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PieChart className="w-3.5 h-3.5" />
                <span>Holdings ({holdings.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('watchlist')}
                className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'watchlist'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                <span>Watchlist</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {reconcileNotice && (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200 animate-in fade-in">
                  {reconcileNotice}
                </span>
              )}
              <button
                type="button"
                onClick={handleReconcile}
                disabled={loading}
                className="px-2.5 py-1.5 rounded-xl bg-white text-slate-700 hover:text-sky-700 border border-sky-200 text-xs font-bold transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                title="Reconcile order state with broker"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Reconcile</span>
              </button>
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
                            <td className="py-3 px-3.5 font-bold text-white">
                              {pos.symbol}
                            </td>
                            <td className="py-3 px-3">
                              <span className={`px-2 py-0.5 rounded-md font-bold ${
                                pos.side === 'BUY' ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                              }`}>
                                {pos.side}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-white">
                              {pos.qty}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-slate-300">
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
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setChartModalSymbol(pos.symbol);
                                    setChartModalPrice(pos.currentLtp);
                                  }}
                                  className="p-1.5 rounded-lg text-xs font-bold bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800 transition-all cursor-pointer shadow-xs"
                                  title="Open Interactive Candlestick Chart"
                                >
                                  <BarChart2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSquareOff(pos.id || pos.symbol)}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-900/80 hover:bg-rose-800 text-rose-200 border border-rose-700 transition-all cursor-pointer shadow-xs"
                                  title="Exit this position at market price"
                                >
                                  Exit
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
                      <th className="py-3 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-500">
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
                              ord.status === 'PENDING' ? 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse' :
                              'bg-rose-950 text-rose-300 border border-rose-800'
                            }`}>
                              {ord.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {ord.status === 'PENDING' ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openModifyModal(ord)}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-900/80 hover:bg-sky-800 text-sky-200 border border-sky-700 cursor-pointer transition-colors shadow-xs flex items-center gap-1"
                                  title="Modify quantity, price, or type of this pending order"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>Modify</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancelOrder(ord.id)}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-900/80 hover:bg-rose-800 text-rose-200 border border-rose-700 cursor-pointer transition-colors shadow-xs"
                                  title="Cancel this pending order"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-600 text-[10px]">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab: Holdings Portfolio & Indian Tax/Brokerage Estimator */}
          {activeTab === 'holdings' && (
            <div className="flex flex-col gap-4 animate-in fade-in duration-200">
              {/* 1. Portfolio Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Invested</span>
                  <span className="text-base sm:text-lg font-black font-mono text-white mt-1">
                    ₹{holdingsOverall ? holdingsOverall.total_invested.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5">{holdings.length} Long Delivery Positions</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Current Valuation</span>
                  <span className="text-base sm:text-lg font-black font-mono text-sky-400 mt-1">
                    ₹{holdingsOverall ? holdingsOverall.total_current.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5">Real-time FYERS LTP</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Unrealized P&L</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className={`text-base sm:text-lg font-black font-mono ${(holdingsOverall?.total_pl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {(holdingsOverall?.total_pl ?? 0) >= 0 ? '+' : ''}₹{holdingsOverall ? holdingsOverall.total_pl.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                    </span>
                  </div>
                  <span className={`text-[11px] font-bold ${(holdingsOverall?.pnl_percentage ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {(holdingsOverall?.pnl_percentage ?? 0) >= 0 ? '+' : ''}{holdingsOverall?.pnl_percentage.toFixed(2)}% Overall
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Brokerage Rate</span>
                  <span className="text-base sm:text-lg font-black font-mono text-emerald-400 mt-1">
                    ₹0 Delivery
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5">FYERS Free Equity Delivery</span>
                </div>
              </div>

              {/* 2. Holdings Table */}
              <div className="web2-card rounded-2xl md:rounded-3xl border border-sky-200/80 shadow-md bg-slate-950 overflow-hidden">
                <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-sky-400" />
                    <span className="font-bold text-xs text-white uppercase tracking-wider font-mono">
                      Dematerialized Delivery Holdings ({holdings.length})
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                    Enriched with genuine FYERS cloud quotes
                  </span>
                </div>

                <div className="overflow-x-auto max-h-[380px] scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
                  <table className="w-full text-left font-mono text-xs text-slate-200 border-collapse">
                    <thead>
                      <tr className="bg-slate-900/95 text-slate-400 font-bold border-b border-slate-800 text-[11px] uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md">
                        <th className="py-3 px-3.5">Scrip</th>
                        <th className="py-3 px-3 text-right">Holding Qty</th>
                        <th className="py-3 px-3 text-right">Avg Cost</th>
                        <th className="py-3 px-3 text-right">Live LTP</th>
                        <th className="py-3 px-3 text-right">Invested Val</th>
                        <th className="py-3 px-3 text-right">Current Val</th>
                        <th className="py-3 px-3 text-right">P&L (₹ & %)</th>
                        <th className="py-3 px-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[12px]">
                      {holdings.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-500">
                            No equity delivery holdings found. Buy with product type CNC (Cash & Carry) to accumulate holdings.
                          </td>
                        </tr>
                      ) : (
                        holdings.map((h) => {
                          const isPos = h.pnl >= 0;
                          return (
                            <tr key={h.symbol} className="hover:bg-slate-900/80 transition-colors">
                              <td className="py-3 px-3.5">
                                <div className="font-bold text-white">{h.symbol}</div>
                                <div className="text-[10px] text-slate-400">Equity Delivery</div>
                              </td>
                              <td className="py-3 px-3 text-right font-bold text-white">
                                {h.qty.toLocaleString('en-IN')}
                              </td>
                              <td className="py-3 px-3 text-right font-bold text-slate-300">
                                ₹{h.avg_price.toFixed(2)}
                              </td>
                              <td className="py-3 px-3 text-right font-bold text-sky-300">
                                ₹{h.currentLtp.toFixed(2)}
                              </td>
                              <td className="py-3 px-3 text-right font-bold text-slate-400">
                                ₹{h.investedValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-3 px-3 text-right font-bold text-slate-200">
                                ₹{h.currentValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className={`py-3 px-3 text-right font-extrabold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                                <div>{isPos ? '+' : ''}₹{h.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                                <div className="text-[10px] opacity-80">{isPos ? '+' : ''}{h.pnlPercent.toFixed(2)}%</div>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setChartModalSymbol(h.symbol);
                                      setChartModalPrice(h.currentLtp);
                                    }}
                                    className="p-1.5 rounded-lg text-xs font-bold bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800 transition-all cursor-pointer shadow-xs"
                                    title="Open Candlestick Chart"
                                  >
                                    <BarChart2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedSymbol(h.symbol);
                                      setPrice(h.currentLtp);
                                      setSide('SELL');
                                    }}
                                    className="px-2 py-1 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer shadow-xs"
                                    title="Pre-fill trade ticket to sell or add"
                                  >
                                    Trade
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCalcTradeType('EQUITY_DELIVERY');
                                      setCalcBuyPrice(h.avg_price);
                                      setCalcSellPrice(h.currentLtp);
                                      setCalcQty(h.qty);
                                    }}
                                    className="p-1.5 rounded-lg text-xs font-bold bg-amber-950/60 hover:bg-amber-900 text-amber-300 border border-amber-800 transition-all cursor-pointer shadow-xs"
                                    title="Load into Tax & Regulatory Charges Estimator"
                                  >
                                    <Calculator className="w-3.5 h-3.5" />
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

              {/* 3. Interactive Indian Statutory Taxes & Brokerage Estimator Card */}
              <div className="web2-card rounded-2xl md:rounded-3xl border border-sky-200/80 shadow-md bg-slate-900 p-4 sm:p-5 text-slate-100 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white font-mono flex items-center gap-2">
                        Indian Regulatory Charges & Tax Estimator
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-700 font-bold">
                          SEBI / NSE Compliant
                        </span>
                      </h3>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        Itemized breakdown of STT, Stamp Duty, GST 18%, Exchange fees & Net Realized P&L
                      </p>
                    </div>
                  </div>

                  {/* Trade Type Selector */}
                  <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono font-bold">
                    <button
                      type="button"
                      onClick={() => setCalcTradeType('EQUITY_DELIVERY')}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        calcTradeType === 'EQUITY_DELIVERY'
                          ? 'bg-emerald-600 text-white shadow-xs font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Delivery (CNC - ₹0 Brok)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalcTradeType('EQUITY_INTRADAY')}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        calcTradeType === 'EQUITY_INTRADAY'
                          ? 'bg-sky-600 text-white shadow-xs font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Intraday (MIS - ₹20 Max)
                    </button>
                  </div>
                </div>

                {/* Interactive Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono mb-1">
                      Buy Price (₹)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      value={calcBuyPrice}
                      onChange={(e) => setCalcBuyPrice(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono mb-1">
                      Sell Price (₹)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      value={calcSellPrice}
                      onChange={(e) => setCalcSellPrice(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono mb-1">
                      Quantity (Shares)
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={calcQty}
                      onChange={(e) => setCalcQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                {/* Charges Itemized Breakdown Receipt */}
                {calcResult && (
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-xs flex flex-col gap-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 border-b border-slate-800/80 pb-3">
                      <div>
                        <span className="text-slate-500 text-[10px] block">FYERS Brokerage</span>
                        <span className="font-bold text-slate-200">₹{calcResult.charges.brokerage.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">STT / CTT</span>
                        <span className="font-bold text-slate-200">₹{calcResult.charges.stt.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">Exchange Turnover</span>
                        <span className="font-bold text-slate-200">₹{calcResult.charges.exchangeTurnoverFee.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">Stamp Duty</span>
                        <span className="font-bold text-slate-200">₹{calcResult.charges.stampDuty.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">SEBI Charges</span>
                        <span className="font-bold text-slate-200">₹{calcResult.charges.sebiCharges.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">GST (18%)</span>
                        <span className="font-bold text-slate-200">₹{calcResult.charges.gst.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Net Take-Home P&L Callout */}
                    <div className="flex items-center justify-between gap-4 flex-wrap pt-1">
                      <div className="flex items-center gap-4 flex-wrap">
                        <div>
                          <span className="text-slate-400 text-[11px] block">Total Statutory Taxes & Brokerage:</span>
                          <span className="font-extrabold text-rose-400 text-sm">
                            -₹{calcResult.charges.totalCharges.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[11px] block">Gross P&L:</span>
                          <span className={`font-bold text-sm ${calcResult.grossPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {calcResult.grossPnl >= 0 ? '+' : ''}₹{calcResult.grossPnl.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[11px] block">Breakeven Price:</span>
                          <span className="font-bold text-amber-300 text-sm">
                            ₹{calcResult.breakevenPrice.toFixed(2)} (+₹{calcResult.breakevenDifference}/share)
                          </span>
                        </div>
                      </div>

                      <div className="px-4 py-2 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700 flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Net Realized P&L:</span>
                        <span className={`text-base sm:text-lg font-black font-mono ${calcResult.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {calcResult.netPnl >= 0 ? '+' : ''}₹{calcResult.netPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 4: Full Watchlist */}
          {activeTab === 'watchlist' && (
            <StockWatchlist
              layout="full"
              selectedSymbol={selectedSymbol}
              title="Full Market Watchlist"
              onSelectForTrade={(sym, ltp, targetSide) => {
                setSelectedSymbol(sym);
                if (targetSide) setSide(targetSide);
                if (ltp) setPrice(ltp);
              }}
            />
          )}

        </div>

      </div>

      {/* Modify Order Modal */}
      {modifyingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-900 border border-sky-400/40 rounded-3xl shadow-2xl overflow-hidden font-sans">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-800/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-sky-600/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">Modify Pending Order</h3>
                  <div className="text-[10px] text-slate-400 font-mono">ID: {modifyingOrder.id} • {isPaper ? 'Paper Trading' : 'Live FYERS'}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModifyingOrder(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleModifyOrder} className="p-5 flex flex-col gap-4">
              {/* Order Info Badge */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Symbol</span>
                  <span className="font-bold text-white font-mono">{modifyingOrder.symbol}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block text-[10px]">Side</span>
                  <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                    modifyingOrder.side === 'BUY' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                  }`}>
                    {modifyingOrder.side}
                  </span>
                </div>
              </div>

              {/* Order Type */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Order Type</label>
                <select
                  value={modOrderType}
                  onChange={(e) => setModOrderType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                >
                  <option value="LIMIT">LIMIT (Buy/Sell at specified price)</option>
                  <option value="MARKET">MARKET (Execute at current market LTP)</option>
                  <option value="SL">SL (Stop-Loss with Trigger Price)</option>
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Quantity (Shares)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={modQty}
                  onChange={(e) => setModQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              {/* Limit Price */}
              {modOrderType !== 'MARKET' && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Price (₹)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={modPrice}
                    onChange={(e) => setModPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                    required
                  />
                </div>
              )}

              {/* Trigger Price if SL */}
              {modOrderType === 'SL' && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Trigger Price (₹)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={modTriggerPrice}
                    onChange={(e) => setModTriggerPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                    required
                  />
                </div>
              )}

              {/* Traded Value preview */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 font-mono text-xs flex justify-between text-slate-400">
                <span>Total Traded Value:</span>
                <span className="font-bold text-white">₹{(modQty * (modOrderType === 'MARKET' ? (liveQuote?.ltp || 0) : modPrice)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>

              {modError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{modError}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModifyingOrder(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 font-bold text-xs cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modLoading}
                  className="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-60"
                >
                  {modLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive Candlestick Chart Modal for Holdings and Positions */}
      {chartModalSymbol && (
        <TradingViewChartModal
          isOpen={!!chartModalSymbol}
          onClose={() => setChartModalSymbol(null)}
          symbol={chartModalSymbol}
          currentPrice={chartModalPrice}
          onSelectForTrade={(sym, p) => {
            setSelectedSymbol(sym);
            setPrice(p);
            setChartModalSymbol(null);
          }}
        />
      )}

    </div>
  );
};
