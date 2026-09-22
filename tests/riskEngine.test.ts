import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validateOrderRisk,
  DEFAULT_RISK_CONFIG,
  triggerKillSwitch,
  resetKillSwitch,
  calculateMaxQty,
} from '../src/utils/riskConfig';

// Mock localStorage for node environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('Institutional Pre-Trade Risk Engine', () => {
  beforeEach(() => {
    localStorage.clear();
    resetKillSwitch();
  });

  it('should approve an order meeting all risk parameters', () => {
    const result = validateOrderRisk({
      symbol: 'NSE:RELIANCE-EQ',
      entryPrice: 1300,
      stopLossPrice: 1280, // 20 pts risk
      target1Price: 1340,  // 40 pts reward (2.0 R:R)
      quantity: 50,        // Total capital: 65,000 <= 200,000 max
      riskBudget: 5000,    // Total risk: 1,000 <= 5000 budget
      bid: 1299.8,
      ask: 1300.2,
    });

    expect(result.canExecute).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should block orders when the emergency kill-switch is active', () => {
    triggerKillSwitch('Daily loss limit exceeded');

    const result = validateOrderRisk({
      symbol: 'NSE:TCS-EQ',
      entryPrice: 3500,
      stopLossPrice: 3450,
      target1Price: 3600,
      quantity: 10,
      riskBudget: 2000,
    });

    expect(result.canExecute).toBe(false);
    expect(result.errors.some((e) => e.includes('KILL-SWITCH ACTIVE'))).toBe(true);
  });

  it('should reject orders exceeding the maximum capital allocation limit', () => {
    const result = validateOrderRisk({
      symbol: 'NSE:INFY-EQ',
      entryPrice: 1800,
      stopLossPrice: 1780,
      target1Price: 1850,
      quantity: 200, // Total order value: 3,60,000 > default 2,00,000 ceiling
      riskBudget: 10000,
    });

    expect(result.canExecute).toBe(false);
    expect(result.errors.some((e) => e.includes('exceeds max ceiling'))).toBe(true);
  });

  it('should enforce the fat-finger quantity ceiling', () => {
    const result = validateOrderRisk({
      symbol: 'NSE:IDEA-EQ',
      entryPrice: 15,
      stopLossPrice: 14,
      target1Price: 17,
      quantity: 60000, // Exceeds default 50,000 share cap
      riskBudget: 10000,
    });

    expect(result.canExecute).toBe(false);
    expect(result.errors.some((e) => e.includes('exceeds fat-finger'))).toBe(true);
  });

  it('should warn when the reward-to-risk ratio is below the minimum threshold', () => {
    const result = validateOrderRisk({
      symbol: 'NSE:SBIN-EQ',
      entryPrice: 800,
      stopLossPrice: 790, // Risk = 10 pts
      target1Price: 810,  // Reward = 10 pts (R:R = 1.0 < 1.5 min)
      quantity: 50,
      riskBudget: 5000,
    });

    expect(result.warnings.some((w) => w.includes('R:R ratio is'))).toBe(true);
  });

  it('should warn when the bid-ask spread is abnormally wide', () => {
    const result = validateOrderRisk({
      symbol: 'NSE:ILLIQUID-EQ',
      entryPrice: 100,
      stopLossPrice: 95,
      target1Price: 110,
      quantity: 50,
      riskBudget: 1000,
      bid: 98,
      ask: 102, // Spread = 4 pts on 100 = 4.0% > 0.8% max
    });

    expect(result.warnings.some((w) => w.includes('Bid-ask spread'))).toBe(true);
  });

  it('should calculate safe position size matching the risk budget', () => {
    // Risk budget = 2000, Entry = 100, Stop Loss = 95 (5 pts risk/share)
    // Max shares by risk = 2000 / 5 = 400 shares
    // 400 * 100 = 40,000 capital (well within 2,00,000 ceiling)
    const safeQty = calculateMaxQty(100, 95, 2000);
    expect(safeQty).toBe(400);
  });
});
