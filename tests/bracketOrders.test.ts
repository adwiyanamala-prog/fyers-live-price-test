import { describe, it, expect } from 'vitest';

/**
 * Pure Trailing Stop-Loss Ratchet Logic (Used in Bracket Orders)
 */
export function updateTrailingStopLoss(params: {
  side: 'BUY' | 'SELL';
  currentLtp: number;
  currentSl: number;
  trailStep: number;     // e.g. every ₹2 favorable move
  trailAmount: number;   // adjust SL by ₹2
  referencePrice: number;// price at which last trail occurred
}): { newSl: number; newRefPrice: number; trailed: boolean } {
  const { side, currentLtp, currentSl, trailStep, trailAmount, referencePrice } = params;

  if (side === 'BUY') {
    // For long positions: price moves up, SL ratchets upwards
    const priceGain = currentLtp - referencePrice;
    if (priceGain >= trailStep) {
      const steps = Math.floor(priceGain / trailStep);
      const newSl = currentSl + steps * trailAmount;
      const newRefPrice = referencePrice + steps * trailStep;
      return { newSl, newRefPrice, trailed: true };
    }
  } else {
    // For short positions: price moves down, SL ratchets downwards
    const priceDrop = referencePrice - currentLtp;
    if (priceDrop >= trailStep) {
      const steps = Math.floor(priceDrop / trailStep);
      const newSl = currentSl - steps * trailAmount;
      const newRefPrice = referencePrice - steps * trailStep;
      return { newSl, newRefPrice, trailed: true };
    }
  }

  return { newSl: currentSl, newRefPrice: referencePrice, trailed: false };
}

/**
 * Bracket Order Execution Trigger Evaluator
 */
export function checkBracketOrderTrigger(params: {
  side: 'BUY' | 'SELL';
  currentLtp: number;
  stopLossPrice: number;
  targetPrice: number;
}): 'TP_HIT' | 'SL_HIT' | 'HOLD' {
  const { side, currentLtp, stopLossPrice, targetPrice } = params;

  if (side === 'BUY') {
    if (currentLtp >= targetPrice) return 'TP_HIT';
    if (currentLtp <= stopLossPrice) return 'SL_HIT';
  } else {
    // Short position
    if (currentLtp <= targetPrice) return 'TP_HIT';
    if (currentLtp >= stopLossPrice) return 'SL_HIT';
  }

  return 'HOLD';
}

describe('Bracket Order Execution & Trailing Stop-Loss Engine', () => {
  it('should trigger TP_HIT when LTP hits or crosses target profit price for BUY position', () => {
    const status = checkBracketOrderTrigger({
      side: 'BUY',
      currentLtp: 105.5,
      stopLossPrice: 95.0,
      targetPrice: 105.0,
    });
    expect(status).toBe('TP_HIT');
  });

  it('should trigger SL_HIT when LTP breaches stop-loss price for BUY position', () => {
    const status = checkBracketOrderTrigger({
      side: 'BUY',
      currentLtp: 94.8,
      stopLossPrice: 95.0,
      targetPrice: 110.0,
    });
    expect(status).toBe('SL_HIT');
  });

  it('should trigger TP_HIT when LTP hits or falls below target price for SELL (Short) position', () => {
    const status = checkBracketOrderTrigger({
      side: 'SELL',
      currentLtp: 490,
      stopLossPrice: 520,
      targetPrice: 500,
    });
    expect(status).toBe('TP_HIT');
  });

  it('should trigger SL_HIT when LTP surges above stop-loss price for SELL (Short) position', () => {
    const status = checkBracketOrderTrigger({
      side: 'SELL',
      currentLtp: 525,
      stopLossPrice: 520,
      targetPrice: 480,
    });
    expect(status).toBe('SL_HIT');
  });

  it('should ratchet Stop-Loss upward when price progresses in favor of a BUY position', () => {
    const result = updateTrailingStopLoss({
      side: 'BUY',
      currentLtp: 105,       // +5 move from 100
      currentSl: 95,
      trailStep: 2,          // Trail every 2 pts
      trailAmount: 2,        // Move SL up by 2 pts
      referencePrice: 100,
    });

    expect(result.trailed).toBe(true);
    // 5 pts / 2 pts step = 2 steps (4 pts move)
    expect(result.newSl).toBe(99);
    expect(result.newRefPrice).toBe(104);
  });

  it('should not lower Stop-Loss if price retraces downwards after trailing for BUY position', () => {
    const result = updateTrailingStopLoss({
      side: 'BUY',
      currentLtp: 98,       // Retraced below reference
      currentSl: 95,
      trailStep: 2,
      trailAmount: 2,
      referencePrice: 100,
    });

    expect(result.trailed).toBe(false);
    expect(result.newSl).toBe(95);
  });
});
