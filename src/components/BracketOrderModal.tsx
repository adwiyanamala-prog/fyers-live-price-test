import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Zap,
  ShieldAlert,
  ShieldCheck,
  Target,
  AlertTriangle,
  Scale,
  Settings,
  Lock,
  Unlock,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { soundAlerts, sendDesktopNotification } from '../utils/audioAlerts';
import {
  getRiskConfig,
  saveRiskConfig,
  isKillSwitchActive,
  resetKillSwitch,
  validateOrderRisk,
  RiskConfig,
  RiskValidationResult
} from '../utils/riskConfig';

export interface BracketOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  currentPrice: number;
  strategyName?: string;
  winRate?: string;
  dayLow?: number;
  dayHigh?: number;
  vwap?: number;
  bid?: number;
  ask?: number;
  onOrderSuccess?: (msg: string) => void;
}

export const BracketOrderModal: React.FC<BracketOrderModalProps> = ({
  isOpen,
  onClose,
  symbol,
  currentPrice,
  strategyName = 'High-Probability Swing',
  winRate = '70% Win',
  dayLow,
  dayHigh,
  vwap,
  bid,
  ask,
  onOrderSuccess,
}) => {
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [limitPrice, setLimitPrice] = useState<number>(currentPrice || 100);
  const [riskBudget, setRiskBudget] = useState<number>(5000);
  const [customRisk, setCustomRisk] = useState<string>('5000');
  const [isPaper, setIsPaper] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Risk Engine State
  const [riskConfig, setRiskConfig] = useState<RiskConfig>(getRiskConfig());
  const [showRiskSettings, setShowRiskSettings] = useState<boolean>(false);
  const [showRiskChecks, setShowRiskChecks] = useState<boolean>(true);
  const [liveConfirmOpen, setLiveConfirmOpen] = useState<boolean>(false);
  const [killSwitchState, setKillSwitchState] = useState<{ active: boolean; reason?: string }>(isKillSwitchActive());

  // Strategy-Derived Stop Loss calculation
  const calculatedStopLoss = useMemo(() => {
    const entry = orderType === 'LIMIT' ? limitPrice : currentPrice;
    if (strategyName.includes('Wyckoff') && dayLow && dayLow < entry) {
      return Number((dayLow * 0.998).toFixed(2));
    }
    if (strategyName.includes('Gap') && vwap && vwap < entry) {
      return Number((vwap * 0.994).toFixed(2));
    }
    if (strategyName.includes('RSI') && dayLow && dayLow < entry) {
      return Number((dayLow * 0.995).toFixed(2));
    }
    // Default 1.5% technical swing stop
    return Number((entry * 0.985).toFixed(2));
  }, [strategyName, currentPrice, limitPrice, orderType, dayLow, vwap]);

  const [stopLoss, setStopLoss] = useState<number>(calculatedStopLoss);

  // Sync SL when symbol or price updates
  useEffect(() => {
    setLimitPrice(currentPrice);
    setStopLoss(calculatedStopLoss);
    setRiskConfig(getRiskConfig());
    setKillSwitchState(isKillSwitchActive());
  }, [currentPrice, calculatedStopLoss, symbol, isOpen]);

  const entryPrice = orderType === 'LIMIT' ? limitPrice : currentPrice;
  const riskPerShare = Math.max(0.1, entryPrice - stopLoss);

  // Targets: 2R (Target 1) and 3.5R (Target 2)
  const target1 = Number((entryPrice + (riskPerShare * 2.0)).toFixed(2));
  const target2 = Number((entryPrice + (riskPerShare * 3.5)).toFixed(2));

  // Position Sizing: Risk Budget / Risk per Share
  const calculatedQty = useMemo(() => {
    const budget = Number(customRisk) || riskBudget;
    return Math.max(1, Math.floor(budget / riskPerShare));
  }, [customRisk, riskBudget, riskPerShare]);

  const [qty, setQty] = useState<number>(calculatedQty);

  useEffect(() => {
    setQty(calculatedQty);
  }, [calculatedQty]);

  const totalInvestment = Number((entryPrice * qty).toFixed(2));
  const totalMaxRisk = Number((riskPerShare * qty).toFixed(2));
  const estimatedGainT1 = Number(((target1 - entryPrice) * (qty * 0.5)).toFixed(2));
  const estimatedGainT2 = Number(((target2 - entryPrice) * (qty * 0.5)).toFixed(2));
  const totalPotentialProfit = Number((estimatedGainT1 + estimatedGainT2).toFixed(2));
  const rewardRiskRatio = (totalPotentialProfit / Math.max(1, totalMaxRisk)).toFixed(1);

  // Validate Order Against Pre-Trade Risk Engine
  const riskValidation: RiskValidationResult = useMemo(() => {
    return validateOrderRisk({
      symbol,
      entryPrice,
      stopLossPrice: stopLoss,
      target1Price: target1,
      quantity: qty,
      riskBudget: Number(customRisk) || riskBudget,
      bid,
      ask,
    });
  }, [symbol, entryPrice, stopLoss, target1, qty, customRisk, riskBudget, bid, ask, killSwitchState]);

  if (!isOpen) return null;

  const handleExecuteInitiate = () => {
    if (!riskValidation.canExecute) {
      setErrorMsg(riskValidation.errors[0] || 'Risk limits breached. Order cannot be executed.');
      return;
    }

    if (!isPaper && riskConfig.requireLiveConfirm) {
      setLiveConfirmOpen(true);
    } else {
      executeOrder();
    }
  };

  const executeOrder = async () => {
    try {
      setSubmitting(true);
      setErrorMsg(null);
      setLiveConfirmOpen(false);

      const res = await fetch('/api/trading/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          side: 'BUY',
          orderType,
          product: 'INTRADAY',
          qty,
          price: entryPrice,
          triggerPrice: null,
          stopLoss,
          takeProfit: target1,
          isPaper,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to place bracket order');
      }

      setSuccessMsg(`✅ ${isPaper ? 'Paper' : 'Live FYERS'} Bracket Order Executed: ${qty} shares of ${symbol} @ ₹${entryPrice}`);
      soundAlerts.playOrderSuccessChime();
      sendDesktopNotification(`Order Executed: ${symbol}`, {
        body: `${isPaper ? 'Paper' : 'Live'} Bracket: ${qty} shares @ ₹${entryPrice}. Target: ₹${target1}, SL: ₹${stopLoss}`,
      });
      onOrderSuccess?.(`Executed ${strategyName} on ${symbol}`);
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 2000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Execution error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetKillSwitch = () => {
    resetKillSwitch();
    setKillSwitchState({ active: false });
    setErrorMsg(null);
  };

  const handleSaveRiskLimits = (newLimits: Partial<RiskConfig>) => {
    const updated = saveRiskConfig(newLimits);
    setRiskConfig(updated);
    setShowRiskSettings(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-100 font-sans">
        
        {/* Header Strip */}
        <div className="p-5 bg-gradient-to-r from-slate-900 via-emerald-950/40 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white font-mono">{symbol}</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
                  {winRate}
                </span>
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span>{strategyName}</span>
                <span>•</span>
                <span className="text-emerald-400 font-mono font-bold">LTP: ₹{currentPrice.toFixed(2)}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowRiskSettings(!showRiskSettings)}
              title="Risk Engine Safeguards"
              className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                showRiskSettings 
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border-slate-700'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer border border-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Kill-Switch Warning Banner */}
        {killSwitchState.active && (
          <div className="bg-rose-950/90 border-b border-rose-800 p-3 px-5 flex items-center justify-between text-xs text-rose-200 animate-in slide-in-from-top duration-200">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-rose-400 shrink-0" />
              <div>
                <span className="font-bold">TRADING HALTED (Kill-Switch Active): </span>
                <span>{killSwitchState.reason}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetKillSwitch}
              className="px-2.5 py-1 rounded-lg bg-rose-800 hover:bg-rose-700 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Unlock className="w-3 h-3" />
              <span>Reset Lock</span>
            </button>
          </div>
        )}

        {/* Risk Settings Drawer */}
        {showRiskSettings && (
          <div className="bg-slate-950 border-b border-slate-800 p-4 space-y-3 text-xs animate-in slide-in-from-top duration-150">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-400 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4" />
                <span>Pre-Trade Risk Safeguards</span>
              </span>
              <span className="text-[10px] text-slate-400">Institutional Hard Limits</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 text-[10px] block mb-1">Max Capital / Order (₹)</label>
                <input
                  type="number"
                  defaultValue={riskConfig.maxOrderValue}
                  onBlur={(e) => handleSaveRiskLimits({ maxOrderValue: Number(e.target.value) })}
                  className="w-full bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 font-mono text-white text-xs"
                />
              </div>
              <div>
                <label className="text-slate-400 text-[10px] block mb-1">Max Risk / Trade (₹)</label>
                <input
                  type="number"
                  defaultValue={riskConfig.maxRiskPerTrade}
                  onBlur={(e) => handleSaveRiskLimits({ maxRiskPerTrade: Number(e.target.value) })}
                  className="w-full bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 font-mono text-white text-xs"
                />
              </div>
              <div>
                <label className="text-slate-400 text-[10px] block mb-1">Daily Loss Kill-Switch (₹)</label>
                <input
                  type="number"
                  defaultValue={riskConfig.maxDailyLoss}
                  onBlur={(e) => handleSaveRiskLimits({ maxDailyLoss: Number(e.target.value) })}
                  className="w-full bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 font-mono text-white text-xs"
                />
              </div>
              <div>
                <label className="text-slate-400 text-[10px] block mb-1">Min Reward:Risk Ratio</label>
                <input
                  type="number"
                  step="0.1"
                  defaultValue={riskConfig.minRewardToRisk}
                  onBlur={(e) => handleSaveRiskLimits({ minRewardToRisk: Number(e.target.value) })}
                  className="w-full bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 font-mono text-white text-xs"
                />
              </div>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[72vh]">
          
          {/* Paper vs Live Mode Toggle */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
            <div className="flex items-center gap-2 text-xs">
              <Scale className="w-4 h-4 text-sky-400" />
              <span className="font-bold text-slate-300">Execution Route</span>
            </div>
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setIsPaper(true)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isPaper ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Paper Mode
              </button>
              <button
                type="button"
                onClick={() => setIsPaper(false)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  !isPaper ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Live FYERS
              </button>
            </div>
          </div>

          {/* Risk Budget Selector */}
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-2">
              <span className="flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>Max Risk Capital Allocation</span>
              </span>
              <span className="font-mono text-amber-400">₹{totalMaxRisk.toLocaleString()} Risked</span>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {[2000, 5000, 10000, 25000].map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    setRiskBudget(b);
                    setCustomRisk(String(b));
                  }}
                  className={`py-1.5 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer ${
                    Number(customRisk) === b
                      ? 'bg-amber-500/20 text-amber-300 border-amber-400'
                      : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  ₹{(b / 1000).toFixed(0)}k
                </button>
              ))}
            </div>
            <input
              type="number"
              value={customRisk}
              onChange={(e) => setCustomRisk(e.target.value)}
              placeholder="Custom risk in INR..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Order Configuration: Entry, SL, Targets */}
          <div className="grid grid-cols-3 gap-3 p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 font-mono text-xs">
            {/* Entry */}
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-bold block mb-1">Entry Price</span>
              <input
                type="number"
                step="0.05"
                value={entryPrice}
                onChange={(e) => setLimitPrice(Number(e.target.value))}
                className="w-full bg-slate-900 px-2 py-1.5 rounded-lg border border-slate-700 font-bold text-sky-400"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                {orderType === 'MARKET' ? 'Market Fill' : 'Limit'}
              </span>
            </div>

            {/* Stop Loss */}
            <div>
              <span className="text-rose-400 text-[10px] uppercase font-bold block mb-1">Stop Loss (SL)</span>
              <input
                type="number"
                step="0.05"
                value={stopLoss}
                onChange={(e) => setStopLoss(Number(e.target.value))}
                className="w-full bg-rose-950/30 px-2 py-1.5 rounded-lg border border-rose-800/80 font-bold text-rose-300"
              />
              <span className="text-[10px] text-rose-400/80 mt-1 block">
                -{(((entryPrice - stopLoss) / entryPrice) * 100).toFixed(1)}%
              </span>
            </div>

            {/* Target 1 (2R) */}
            <div>
              <span className="text-emerald-400 text-[10px] uppercase font-bold block mb-1">Target 1 (2R)</span>
              <div className="w-full bg-emerald-950/30 px-2 py-1.5 rounded-lg border border-emerald-800/80 font-bold text-emerald-300">
                ₹{target1}
              </div>
              <span className="text-[10px] text-emerald-400/80 mt-1 block">
                +{(((target1 - entryPrice) / entryPrice) * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Sizing & Risk-Reward Summary Box */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Position Size:</span>
              <span className="font-mono font-bold text-white text-sm">{qty} Shares</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Total Capital Required:</span>
              <span className="font-mono font-bold text-slate-200">₹{totalInvestment.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Estimated Target 1 (50% exit):</span>
              <span className="font-mono font-bold text-emerald-400">+₹{estimatedGainT1.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Estimated Target 2 (50% runner @ 3.5R):</span>
              <span className="font-mono font-bold text-emerald-400">+₹{estimatedGainT2.toLocaleString()}</span>
            </div>
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-sm font-bold">
              <span className="text-amber-300">Reward / Risk (R:R):</span>
              <span className="font-mono font-black text-amber-400">1 : {rewardRiskRatio} R</span>
            </div>
          </div>

          {/* Pre-Trade Risk Checks Strip */}
          <div className="rounded-2xl bg-slate-950/70 border border-slate-800/80 p-3 space-y-2">
            <div 
              onClick={() => setShowRiskChecks(!showRiskChecks)}
              className="flex items-center justify-between cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className={`w-4 h-4 ${riskValidation.canExecute ? 'text-emerald-400' : 'text-rose-400'}`} />
                <span className="text-xs font-bold text-slate-300">Pre-Trade Risk Safeguards</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase font-mono ${
                  riskValidation.canExecute 
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' 
                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                }`}>
                  {riskValidation.canExecute ? 'All Passed' : 'Violations Found'}
                </span>
              </div>
              {showRiskChecks ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
            </div>

            {showRiskChecks && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-[11px]">
                {riskValidation.checks.map(chk => (
                  <div 
                    key={chk.id}
                    className={`p-2 rounded-xl border flex flex-col justify-between ${
                      chk.status === 'passed' 
                        ? 'bg-slate-900/60 border-slate-800 text-slate-300' 
                        : chk.status === 'warning'
                        ? 'bg-amber-950/30 border-amber-800/60 text-amber-200'
                        : 'bg-rose-950/40 border-rose-800/80 text-rose-200'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold mb-1">
                      <span>{chk.name}</span>
                      <span className={`text-[9px] uppercase px-1.5 py-0.2 rounded ${
                        chk.status === 'passed' ? 'bg-emerald-900/40 text-emerald-300' :
                        chk.status === 'warning' ? 'bg-amber-900/40 text-amber-300' : 'bg-rose-900/40 text-rose-300'
                      }`}>
                        {chk.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono opacity-80">
                      <span>{chk.valueText}</span>
                      <span>{chk.limitText}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Warning and Error Messages */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-medium flex items-center gap-2 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {riskValidation.warnings.length > 0 && !errorMsg && (
            <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{riskValidation.warnings[0]}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

        </div>

        {/* Action Footer */}
        <div className="p-5 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleExecuteInitiate}
            disabled={submitting || qty <= 0 || !riskValidation.canExecute}
            className={`flex-1 py-2.5 px-5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer ${
              !riskValidation.canExecute 
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' 
                : isPaper
                ? 'bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-500 hover:from-sky-500 hover:to-indigo-500 text-white shadow-sky-600/30'
                : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/30'
            }`}
          >
            <Zap className={`w-4 h-4 fill-current ${submitting ? 'animate-spin' : ''}`} />
            <span>
              {submitting 
                ? 'Placing Bracket Order...' 
                : !riskValidation.canExecute 
                ? 'Execution Blocked by Risk Engine'
                : `Execute 1-Click Bracket (${isPaper ? 'Paper' : 'Live FYERS'})`}
            </span>
          </button>
        </div>

      </div>

      {/* Live Confirmation Modal Gate */}
      {liveConfirmOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-amber-600/80 rounded-2xl max-w-md w-full p-5 space-y-4 text-slate-100 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/40">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-black text-white">Confirm Real-Money Live Order</h4>
                <p className="text-xs text-amber-400">Direct Broker Execution via FYERS Cloud API</p>
              </div>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Symbol:</span>
                <span className="font-bold text-white">{symbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Quantity:</span>
                <span className="font-bold text-white">{qty} Shares</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Est. Total Investment:</span>
                <span className="font-bold text-white">₹{totalInvestment.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Stop Loss:</span>
                <span className="font-bold text-rose-400">₹{stopLoss}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Target 1:</span>
                <span className="font-bold text-emerald-400">₹{target1}</span>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              This order will immediately route to your FYERS trading account. Ensure sufficient margin is available.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setLiveConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={executeOrder}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-600/30"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Confirm & Place Live Order</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
