import { describe, it, expect } from 'vitest';

/**
 * Reusable helper mirroring SEBI / NSE statutory formula implemented in server.ts
 */
export function calculateTradingCharges(params: {
  tradeType: 'EQUITY_DELIVERY' | 'EQUITY_INTRADAY';
  buyPrice: number;
  sellPrice: number;
  qty: number;
}) {
  const { tradeType, buyPrice, sellPrice, qty } = params;
  const buyTurnover = buyPrice * qty;
  const sellTurnover = sellPrice * qty;
  const totalTurnover = buyTurnover + sellTurnover;
  const grossPnl = (sellPrice - buyPrice) * qty;

  let brokerage = 0;
  let stt = 0;
  let stampDuty = 0;

  if (tradeType === 'EQUITY_DELIVERY') {
    brokerage = 0; // FYERS zero brokerage for equity delivery
    stt = totalTurnover * 0.001; // 0.1% on buy & sell
    stampDuty = buyTurnover * 0.00015; // 0.015% on buy
  } else {
    // Intraday: ₹20 or 0.03% whichever is lower per order leg
    const buyBrok = Math.min(20, buyTurnover * 0.0003);
    const sellBrok = Math.min(20, sellTurnover * 0.0003);
    brokerage = buyBrok + sellBrok;
    stt = sellTurnover * 0.00025; // 0.025% on sell turnover
    stampDuty = buyTurnover * 0.00003; // 0.003% on buy
  }

  const exchangeTurnoverFee = totalTurnover * 0.0000297; // NSE 0.00297%
  const sebiCharges = totalTurnover * 0.000001; // ₹10 per crore
  const gst = (brokerage + exchangeTurnoverFee + sebiCharges) * 0.18; // 18% GST

  const totalCharges = brokerage + stt + exchangeTurnoverFee + sebiCharges + stampDuty + gst;
  const netPnl = grossPnl - totalCharges;
  const breakevenDifference = qty > 0 ? totalCharges / qty : 0;
  const breakevenPrice = buyPrice + breakevenDifference;

  return {
    buyTurnover: Number(buyTurnover.toFixed(2)),
    sellTurnover: Number(sellTurnover.toFixed(2)),
    totalTurnover: Number(totalTurnover.toFixed(2)),
    grossPnl: Number(grossPnl.toFixed(2)),
    brokerage: Number(brokerage.toFixed(2)),
    stt: Number(stt.toFixed(2)),
    stampDuty: Number(stampDuty.toFixed(2)),
    exchangeTurnoverFee: Number(exchangeTurnoverFee.toFixed(2)),
    sebiCharges: Number(sebiCharges.toFixed(2)),
    gst: Number(gst.toFixed(2)),
    totalCharges: Number(totalCharges.toFixed(2)),
    netPnl: Number(netPnl.toFixed(2)),
    breakevenPrice: Number(breakevenPrice.toFixed(2)),
    breakevenDifference: Number(breakevenDifference.toFixed(2)),
  };
}

describe('Indian Statutory Charges & Tax Estimator', () => {
  it('should enforce zero brokerage for Equity Delivery (CNC)', () => {
    const result = calculateTradingCharges({
      tradeType: 'EQUITY_DELIVERY',
      buyPrice: 100,
      sellPrice: 110,
      qty: 100,
    });

    expect(result.brokerage).toBe(0);
    expect(result.grossPnl).toBe(1000);
  });

  it('should calculate 0.1% STT on both buy and sell legs for Equity Delivery', () => {
    const result = calculateTradingCharges({
      tradeType: 'EQUITY_DELIVERY',
      buyPrice: 200,
      sellPrice: 220,
      qty: 50,
    });

    // Buy turnover = 10,000, Sell turnover = 11,000, Total = 21,000
    // STT = 21,000 * 0.001 = 21.00
    expect(result.totalTurnover).toBe(21000);
    expect(result.stt).toBe(21);
  });

  it('should cap Intraday brokerage at ₹20 per leg (max ₹40 round-trip)', () => {
    const result = calculateTradingCharges({
      tradeType: 'EQUITY_INTRADAY',
      buyPrice: 2500, // Large turnover: 2,50,000 buy leg
      sellPrice: 2550, // 2,55,000 sell leg
      qty: 100,
    });

    // 250000 * 0.0003 = 75, capped at 20
    // 255000 * 0.0003 = 76.5, capped at 20
    // Total brokerage = 40.00
    expect(result.brokerage).toBe(40);
  });

  it('should calculate STT only on the sell leg for Equity Intraday', () => {
    const result = calculateTradingCharges({
      tradeType: 'EQUITY_INTRADAY',
      buyPrice: 1000,
      sellPrice: 1050,
      qty: 100,
    });

    // Sell turnover = 1,05,000
    // Intraday STT = 1,05,000 * 0.00025 = 26.25
    expect(result.stt).toBe(26.25);
  });

  it('should apply 18% GST only on Brokerage, Exchange Turnover fee, and SEBI charges', () => {
    const result = calculateTradingCharges({
      tradeType: 'EQUITY_DELIVERY',
      buyPrice: 500,
      sellPrice: 550,
      qty: 100,
    });

    // Taxable services = Brokerage (0) + ExchangeTurnover + SebiCharges
    const taxableServices = result.brokerage + result.exchangeTurnoverFee + result.sebiCharges;
    const expectedGst = Number((taxableServices * 0.18).toFixed(2));
    expect(result.gst).toBeCloseTo(expectedGst, 1);
  });

  it('should accurately calculate breakeven price with positive breakeven difference', () => {
    const buyPrice = 100;
    const qty = 500;
    const result = calculateTradingCharges({
      tradeType: 'EQUITY_DELIVERY',
      buyPrice,
      sellPrice: 100, // At par
      qty,
    });

    expect(result.breakevenPrice).toBeGreaterThan(buyPrice);
    expect(result.breakevenDifference).toBeGreaterThan(0);
    expect(result.netPnl).toBe(-result.totalCharges);
  });
});
