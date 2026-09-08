// Institutional Risk Engine & Pre-Trade Safeguards Configuration

export interface RiskConfig {
  maxRiskPerTrade: number;     // Max risk budget allowed per trade in INR (default: ₹10,000)
  maxOrderValue: number;       // Max single order capital allocation in INR (default: ₹2,00,000)
  maxDailyLoss: number;        // Emergency Kill-switch triggers if cumulative daily loss exceeds this (default: ₹25,000)
  maxSpreadPct: number;        // Max allowable bid-ask spread % (default: 0.8%)
  minRewardToRisk: number;     // Minimum acceptable reward-to-risk ratio (default: 1.5)
  maxQuantityCap: number;      // Hard ceiling on share count to prevent fat-finger extra zeros (default: 50,000 shares)
  requireLiveConfirm: boolean; // Require explicit two-step confirmation on real-money orders
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxRiskPerTrade: 10000,
  maxOrderValue: 200000,
  maxDailyLoss: 25000,
  maxSpreadPct: 0.8,
  minRewardToRisk: 1.5,
  maxQuantityCap: 50000,
  requireLiveConfirm: true,
};

const RISK_CONFIG_STORAGE_KEY = 'fyers_risk_config_v1';
const KILL_SWITCH_STORAGE_KEY = 'fyers_kill_switch_active_v1';
const DAILY_PNL_STORAGE_KEY = 'fyers_daily_pnl_tracker_v1';

export function getRiskConfig(): RiskConfig {
  try {
    const saved = localStorage.getItem(RISK_CONFIG_STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_RISK_CONFIG, ...JSON.parse(saved) };
    }
  } catch (err) {
    console.warn('Failed to parse risk config from storage:', err);
  }
  return { ...DEFAULT_RISK_CONFIG };
}

export function saveRiskConfig(config: Partial<RiskConfig>): RiskConfig {
  try {
    const current = getRiskConfig();
    const updated = { ...current, ...config };
    localStorage.setItem(RISK_CONFIG_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to save risk config:', err);
    return DEFAULT_RISK_CONFIG;
  }
}

// ============================================================================
// DAILY KILL-SWITCH & P&L TRACKING
// ============================================================================
export interface DailyPnlState {
  date: string;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  tradeCount: number;
}

export function getDailyPnlState(): DailyPnlState {
  const today = new Date().toISOString().split('T')[0];
  try {
    const saved = localStorage.getItem(DAILY_PNL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.date === today) {
        return parsed;
      }
    }
  } catch {}
  return {
    date: today,
    realizedPnl: 0,
    unrealizedPnl: 0,
    totalPnl: 0,
    tradeCount: 0,
  };
}

export function recordTradePnl(pnlDelta: number): DailyPnlState {
  const current = getDailyPnlState();
  const updated: DailyPnlState = {
    ...current,
    realizedPnl: Number((current.realizedPnl + pnlDelta).toFixed(2)),
    totalPnl: Number((current.totalPnl + pnlDelta).toFixed(2)),
    tradeCount: current.tradeCount + 1,
  };
  try {
    localStorage.setItem(DAILY_PNL_STORAGE_KEY, JSON.stringify(updated));
  } catch {}

  // Check if daily loss breached
  const config = getRiskConfig();
  if (updated.totalPnl <= -Math.abs(config.maxDailyLoss)) {
    triggerKillSwitch(`Daily loss limit breached: -₹${Math.abs(updated.totalPnl).toLocaleString('en-IN')} (Limit: ₹${config.maxDailyLoss.toLocaleString('en-IN')})`);
  }

  return updated;
}

export function isKillSwitchActive(): { active: boolean; reason?: string } {
  try {
    const raw = localStorage.getItem(KILL_SWITCH_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.active) {
        return { active: true, reason: parsed.reason };
      }
    }
  } catch {}
  return { active: false };
}

export function triggerKillSwitch(reason: string): void {
  try {
    localStorage.setItem(KILL_SWITCH_STORAGE_KEY, JSON.stringify({
      active: true,
      reason,
      timestamp: new Date().toISOString(),
    }));
  } catch {}
}

export function resetKillSwitch(): void {
  try {
    localStorage.removeItem(KILL_SWITCH_STORAGE_KEY);
  } catch {}
}

// ============================================================================
// PRE-TRADE RISK VALIDATION
// ============================================================================
export interface RiskCheckItem {
  id: string;
  name: string;
  status: 'passed' | 'warning' | 'failed';
  message: string;
  valueText: string;
  limitText: string;
}

export interface RiskValidationResult {
  canExecute: boolean;
  errors: string[];
  warnings: string[];
  checks: RiskCheckItem[];
}

export function validateOrderRisk(params: {
  symbol: string;
  entryPrice: number;
  stopLossPrice: number;
  target1Price: number;
  quantity: number;
  riskBudget: number;
  bid?: number;
  ask?: number;
}): RiskValidationResult {
  const config = getRiskConfig();
  const ks = isKillSwitchActive();

  const totalCapital = params.quantity * params.entryPrice;
  const riskPerShare = Math.max(0.01, params.entryPrice - params.stopLossPrice);
  const totalActualRisk = params.quantity * riskPerShare;
  const rewardPerShare = Math.max(0, params.target1Price - params.entryPrice);
  const rrRatio = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0;

  const checks: RiskCheckItem[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Emergency Kill-Switch Check
  if (ks.active) {
    errors.push(`KILL-SWITCH ACTIVE: ${ks.reason || 'Trading halted'}`);
    checks.push({
      id: 'kill_switch',
      name: 'Emergency Kill-Switch',
      status: 'failed',
      message: ks.reason || 'Daily drawdown limit hit. Trading halted.',
      valueText: 'LOCKED',
      limitText: 'Unlocked',
    });
  } else {
    checks.push({
      id: 'kill_switch',
      name: 'Emergency Kill-Switch',
      status: 'passed',
      message: 'Account risk normal. No kill-switch active.',
      valueText: 'NORMAL',
      limitText: 'Unlocked',
    });
  }

  // 2. Max Capital Allocation (Fat-Finger Guard)
  if (totalCapital > config.maxOrderValue) {
    const msg = `Order value ₹${Math.round(totalCapital).toLocaleString('en-IN')} exceeds max ceiling of ₹${config.maxOrderValue.toLocaleString('en-IN')}`;
    errors.push(msg);
    checks.push({
      id: 'capital_cap',
      name: 'Capital Allocation',
      status: 'failed',
      message: msg,
      valueText: `₹${Math.round(totalCapital).toLocaleString('en-IN')}`,
      limitText: `Max ₹${config.maxOrderValue.toLocaleString('en-IN')}`,
    });
  } else if (totalCapital > config.maxOrderValue * 0.8) {
    const msg = `Order value reaches ${Math.round((totalCapital / config.maxOrderValue) * 100)}% of single-order cap`;
    warnings.push(msg);
    checks.push({
      id: 'capital_cap',
      name: 'Capital Allocation',
      status: 'warning',
      message: msg,
      valueText: `₹${Math.round(totalCapital).toLocaleString('en-IN')}`,
      limitText: `Max ₹${config.maxOrderValue.toLocaleString('en-IN')}`,
    });
  } else {
    checks.push({
      id: 'capital_cap',
      name: 'Capital Allocation',
      status: 'passed',
      message: 'Within safe allocation ceiling',
      valueText: `₹${Math.round(totalCapital).toLocaleString('en-IN')}`,
      limitText: `Max ₹${config.maxOrderValue.toLocaleString('en-IN')}`,
    });
  }

  // 3. Max Quantity Cap Check
  if (params.quantity > config.maxQuantityCap) {
    const msg = `Quantity ${params.quantity.toLocaleString('en-IN')} exceeds fat-finger max quantity cap of ${config.maxQuantityCap.toLocaleString('en-IN')} shares`;
    errors.push(msg);
    checks.push({
      id: 'qty_cap',
      name: 'Quantity Cap',
      status: 'failed',
      message: msg,
      valueText: `${params.quantity.toLocaleString('en-IN')} shs`,
      limitText: `Max ${config.maxQuantityCap.toLocaleString('en-IN')}`,
    });
  } else {
    checks.push({
      id: 'qty_cap',
      name: 'Quantity Cap',
      status: 'passed',
      message: 'Quantity within acceptable limits',
      valueText: `${params.quantity.toLocaleString('en-IN')} shs`,
      limitText: `Max ${config.maxQuantityCap.toLocaleString('en-IN')}`,
    });
  }

  // 4. Max Risk Budget Check
  if (totalActualRisk > config.maxRiskPerTrade * 1.05) {
    const msg = `Actual risk ₹${Math.round(totalActualRisk).toLocaleString('en-IN')} breaches max risk cap ₹${config.maxRiskPerTrade.toLocaleString('en-IN')}`;
    errors.push(msg);
    checks.push({
      id: 'risk_cap',
      name: 'Risk Budget',
      status: 'failed',
      message: msg,
      valueText: `₹${Math.round(totalActualRisk).toLocaleString('en-IN')}`,
      limitText: `Max ₹${config.maxRiskPerTrade.toLocaleString('en-IN')}`,
    });
  } else {
    checks.push({
      id: 'risk_cap',
      name: 'Risk Budget',
      status: 'passed',
      message: 'Risk per trade within budget',
      valueText: `₹${Math.round(totalActualRisk).toLocaleString('en-IN')}`,
      limitText: `Max ₹${config.maxRiskPerTrade.toLocaleString('en-IN')}`,
    });
  }

  // 5. Bid-Ask Spread / Slippage Check
  if (params.bid && params.ask && params.ask > 0) {
    const spreadPct = ((params.ask - params.bid) / params.ask) * 100;
    if (spreadPct > config.maxSpreadPct) {
      const msg = `Bid-ask spread (${spreadPct.toFixed(2)}%) exceeds threshold of ${config.maxSpreadPct}%. High market slippage risk!`;
      warnings.push(msg);
      checks.push({
        id: 'spread_check',
        name: 'Liquidity / Spread',
        status: 'warning',
        message: msg,
        valueText: `${spreadPct.toFixed(2)}%`,
        limitText: `Max ${config.maxSpreadPct}%`,
      });
    } else {
      checks.push({
        id: 'spread_check',
        name: 'Liquidity / Spread',
        status: 'passed',
        message: 'Healthy tight spread',
        valueText: `${spreadPct.toFixed(2)}%`,
        limitText: `Max ${config.maxSpreadPct}%`,
      });
    }
  }

  // 6. Reward-to-Risk Ratio Check
  if (rrRatio < config.minRewardToRisk) {
    const msg = `R:R ratio is ${rrRatio.toFixed(2)}:1 (minimum recommended is ${config.minRewardToRisk}:1)`;
    warnings.push(msg);
    checks.push({
      id: 'rr_check',
      name: 'Reward to Risk',
      status: 'warning',
      message: msg,
      valueText: `${rrRatio.toFixed(2)}:1`,
      limitText: `Min ${config.minRewardToRisk}:1`,
    });
  } else {
    checks.push({
      id: 'rr_check',
      name: 'Reward to Risk',
      status: 'passed',
      message: 'Excellent statistical expectancy',
      valueText: `${rrRatio.toFixed(2)}:1`,
      limitText: `Min ${config.minRewardToRisk}:1`,
    });
  }

  return {
    canExecute: errors.length === 0,
    errors,
    warnings,
    checks,
  };
}
