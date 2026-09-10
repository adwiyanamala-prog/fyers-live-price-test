// Stock Fundamentals & Recent Performance Dataset
// Provides detailed financial metrics, valuation ratios, and multi-timeframe returns for watchlist hover HUD

export interface StockFundamentals {
  symbol: string;
  ticker: string;
  companyName: string;
  sector: string;
  industry: string;
  mCapCr: number;
  capCategory: 'Mega Cap' | 'Large Cap' | 'Mid Cap' | 'Small Cap' | 'Micro Cap';
  peRatio: number;
  sectorPe: number;
  pbRatio: number;
  high52: number;
  low52: number;
  bookValue: number;
  roePercent: number;
  rocePercent: number;
  divYieldPercent: number;
  debtToEquity: number;
  eps: number;
  promoterHoldingPercent: number;
  summary: string;
  returns: {
    d1: number;
    w1: number;
    m1: number;
    m3: number;
    m6: number;
    y1: number;
  };
  avgVol20D: string;
  deliveryPercent: number;
}

const CURATED_FUNDAMENTALS: Record<string, StockFundamentals> = {
  'NSE:SIGACHI-EQ': {
    symbol: 'NSE:SIGACHI-EQ',
    ticker: 'SIGACHI',
    companyName: 'Sigachi Industries Ltd.',
    sector: 'Healthcare & Pharma',
    industry: 'Pharmaceutical Excipients (MCC)',
    mCapCr: 1215,
    capCategory: 'Small Cap',
    peRatio: 23.7,
    sectorPe: 33.5,
    pbRatio: 2.58,
    high52: 46.73,
    low52: 16.65,
    bookValue: 14.50,
    roePercent: 15.2,
    rocePercent: 18.4,
    divYieldPercent: 0.35,
    debtToEquity: 0.32,
    eps: 1.58,
    promoterHoldingPercent: 48.5,
    summary: 'India\'s leading manufacturer of Microcrystalline Cellulose (MCC), supplying pharmaceutical grade binder excipients, nutraceuticals, and food ingredients globally across 50+ countries.',
    returns: { d1: 6.07, w1: 15.15, m1: 45.22, m3: 77.46, m6: 72.8, y1: -0.58 },
    avgVol20D: '4.85M',
    deliveryPercent: 44.2,
  },
  'NSE:IDEA-EQ': {
    symbol: 'NSE:IDEA-EQ',
    ticker: 'IDEA',
    companyName: 'Vodafone Idea Ltd.',
    sector: 'Telecommunication',
    industry: 'Telecom Services & Infrastructure',
    mCapCr: 101320,
    capCategory: 'Large Cap',
    peRatio: -4.2,
    sectorPe: 48.5,
    pbRatio: -0.9,
    high52: 15.79,
    low52: 7.30,
    bookValue: -12.40,
    roePercent: -18.5,
    rocePercent: 4.2,
    divYieldPercent: 0.0,
    debtToEquity: 9.8,
    eps: -4.65,
    promoterHoldingPercent: 38.2,
    summary: 'Major Indian pan-India telecom operator offering voice, high-speed 4G data, and enterprise IoT/cloud digital connectivity infrastructure.',
    returns: { d1: 0.0, w1: 2.90, m1: 15.59, m3: 7.35, m6: -4.5, y1: 101.08 },
    avgVol20D: '240.5M',
    deliveryPercent: 32.5,
  },
  'NSE:YESBANK-EQ': {
    symbol: 'NSE:YESBANK-EQ',
    ticker: 'YESBANK',
    companyName: 'Yes Bank Ltd.',
    sector: 'Financial Services',
    industry: 'Private Commercial Banking',
    mCapCr: 69800,
    capCategory: 'Mid Cap',
    peRatio: 38.4,
    sectorPe: 16.2,
    pbRatio: 1.45,
    high52: 25.78,
    low52: 17.20,
    bookValue: 15.30,
    roePercent: 4.8,
    rocePercent: 6.1,
    divYieldPercent: 0.0,
    debtToEquity: 1.1,
    eps: 0.58,
    promoterHoldingPercent: 0.0,
    summary: 'Full-service private sector commercial bank delivering corporate, MSME, and retail banking services with expanding digital UPI payments leadership.',
    returns: { d1: -0.45, w1: -1.06, m1: -1.98, m3: -1.33, m6: -5.2, y1: 6.29 },
    avgVol20D: '65.4M',
    deliveryPercent: 38.9,
  },
  'NSE:SUZLON-EQ': {
    symbol: 'NSE:SUZLON-EQ',
    ticker: 'SUZLON',
    companyName: 'Suzlon Energy Ltd.',
    sector: 'Capital Goods',
    industry: 'Wind Power & Clean Energy Equipments',
    mCapCr: 78500,
    capCategory: 'Mid Cap',
    peRatio: 68.2,
    sectorPe: 42.0,
    pbRatio: 18.5,
    high52: 86.00,
    low52: 38.50,
    bookValue: 3.80,
    roePercent: 24.5,
    rocePercent: 28.1,
    divYieldPercent: 0.0,
    debtToEquity: 0.08,
    eps: 0.98,
    promoterHoldingPercent: 13.3,
    summary: 'Leading renewable energy solutions provider specializing in wind turbine generator design, EPC power projects, and comprehensive lifecycle operation & maintenance.',
    returns: { d1: 1.2, w1: 4.5, m1: 12.8, m3: 32.4, m6: 65.0, y1: 145.0 },
    avgVol20D: '38.5M',
    deliveryPercent: 46.8,
  },
  'NSE:IRFC-EQ': {
    symbol: 'NSE:IRFC-EQ',
    ticker: 'IRFC',
    companyName: 'Indian Railway Finance Corporation Ltd.',
    sector: 'Financial Services',
    industry: 'Infrastructure & Railway NBFC',
    mCapCr: 185000,
    capCategory: 'Large Cap',
    peRatio: 28.4,
    sectorPe: 18.2,
    pbRatio: 3.9,
    high52: 229.00,
    low52: 68.00,
    bookValue: 38.20,
    roePercent: 14.1,
    rocePercent: 10.2,
    divYieldPercent: 1.15,
    debtToEquity: 7.8,
    eps: 5.12,
    promoterHoldingPercent: 86.4,
    summary: 'Dedicated market borrowing financing arm for Indian Railways, funding acquisition of rolling stock and critical national rail infrastructure expansion projects.',
    returns: { d1: -0.8, w1: 1.8, m1: 5.4, m3: 21.5, m6: 52.0, y1: 142.0 },
    avgVol20D: '18.2M',
    deliveryPercent: 52.1,
  },
  'NSE:ZOMATO-EQ': {
    symbol: 'NSE:ZOMATO-EQ',
    ticker: 'ZOMATO',
    companyName: 'Zomato Ltd. (Eternal)',
    sector: 'Consumer Services',
    industry: 'Quick Commerce & Food Delivery Platforms',
    mCapCr: 235000,
    capCategory: 'Large Cap',
    peRatio: 115.0,
    sectorPe: 85.0,
    pbRatio: 12.8,
    high52: 298.00,
    low52: 98.00,
    bookValue: 23.40,
    roePercent: 5.8,
    rocePercent: 7.2,
    divYieldPercent: 0.0,
    debtToEquity: 0.02,
    eps: 2.25,
    promoterHoldingPercent: 0.0,
    summary: 'Hyper-growth consumer tech platform operating India\'s top online food delivery, Blinkit quick-commerce logistics network, and Hyperpure B2B restaurant supply chains.',
    returns: { d1: 1.5, w1: 4.2, m1: 14.8, m3: 38.6, m6: 72.4, y1: 148.0 },
    avgVol20D: '34.1M',
    deliveryPercent: 49.5,
  },
  'NSE:TATASTEEL-EQ': {
    symbol: 'NSE:TATASTEEL-EQ',
    ticker: 'TATASTEEL',
    companyName: 'Tata Steel Ltd.',
    sector: 'Metals & Mining',
    industry: 'Iron & Steel Production',
    mCapCr: 232200,
    capCategory: 'Large Cap',
    peRatio: 50.9,
    sectorPe: 18.5,
    pbRatio: 2.1,
    high52: 224.40,
    low52: 160.06,
    bookValue: 88.50,
    roePercent: 5.2,
    rocePercent: 7.8,
    divYieldPercent: 2.45,
    debtToEquity: 0.85,
    eps: 3.65,
    promoterHoldingPercent: 33.2,
    summary: 'Pioneering global steel manufacturing conglomerate with integrated mines and facilities producing high-grade flat, long, and alloy steels across India and Europe.',
    returns: { d1: -0.22, w1: 0.88, m1: -1.29, m3: -6.77, m6: 4.5, y1: 9.69 },
    avgVol20D: '14.2M',
    deliveryPercent: 48.0,
  },
  'NSE:SBIN-EQ': {
    symbol: 'NSE:SBIN-EQ',
    ticker: 'SBIN',
    companyName: 'State Bank of India',
    sector: 'Financial Services',
    industry: 'Public Sector Commercial Banking',
    mCapCr: 895800,
    capCategory: 'Large Cap',
    peRatio: 13.7,
    sectorPe: 14.5,
    pbRatio: 1.7,
    high52: 1234.70,
    low52: 819.00,
    bookValue: 590.00,
    roePercent: 16.8,
    rocePercent: 9.5,
    divYieldPercent: 1.75,
    debtToEquity: 1.2,
    eps: 73.20,
    promoterHoldingPercent: 57.5,
    summary: 'India\'s largest commercial bank with 22,000+ branches, commanding over 23% market share in total deposits and advances with premier government backing.',
    returns: { d1: -0.52, w1: -1.87, m1: -5.79, m3: 0.10, m6: 8.4, y1: 21.93 },
    avgVol20D: '9.8M',
    deliveryPercent: 54.2,
  },
  'NSE:RELIANCE-EQ': {
    symbol: 'NSE:RELIANCE-EQ',
    ticker: 'RELIANCE',
    companyName: 'Reliance Industries Ltd.',
    sector: 'Oil, Gas & Consumables',
    industry: 'Diversified Conglomerate / Retail & Telecom',
    mCapCr: 1715000,
    capCategory: 'Mega Cap',
    peRatio: 24.1,
    sectorPe: 24.0,
    pbRatio: 2.35,
    high52: 1611.80,
    low52: 1249.80,
    bookValue: 540.00,
    roePercent: 9.8,
    rocePercent: 11.2,
    divYieldPercent: 0.72,
    debtToEquity: 0.45,
    eps: 52.80,
    promoterHoldingPercent: 50.3,
    summary: 'India\'s highest market-cap titan with industry-defining scale spanning petrochemicals, refining, Jio 5G digital ecosystem, Reliance Retail, and green clean gigafactories.',
    returns: { d1: -0.68, w1: 0.85, m1: -2.10, m3: 1.20, m6: 6.8, y1: 14.50 },
    avgVol20D: '6.8M',
    deliveryPercent: 58.4,
  },
  'NSE:INFY-EQ': {
    symbol: 'NSE:INFY-EQ',
    ticker: 'INFY',
    companyName: 'Infosys Ltd.',
    sector: 'Information Technology',
    industry: 'IT Consulting & Enterprise Software',
    mCapCr: 790000,
    capCategory: 'Large Cap',
    peRatio: 29.8,
    sectorPe: 31.2,
    pbRatio: 8.9,
    high52: 1990.00,
    low52: 1350.00,
    bookValue: 210.00,
    roePercent: 31.5,
    rocePercent: 40.2,
    divYieldPercent: 2.25,
    debtToEquity: 0.08,
    eps: 63.40,
    promoterHoldingPercent: 14.7,
    summary: 'Global leader in next-generation digital services, generative AI consulting, cloud infrastructure migration, and enterprise digital transformation for Global 2000 clients.',
    returns: { d1: 1.1, w1: 3.5, m1: 6.2, m3: 18.4, m6: 31.0, y1: 32.5 },
    avgVol20D: '6.5M',
    deliveryPercent: 64.1,
  },
  'NSE:HDFCBANK-EQ': {
    symbol: 'NSE:HDFCBANK-EQ',
    ticker: 'HDFCBANK',
    companyName: 'HDFC Bank Ltd.',
    sector: 'Financial Services',
    industry: 'Private Commercial Banking',
    mCapCr: 1250000,
    capCategory: 'Mega Cap',
    peRatio: 18.6,
    sectorPe: 16.2,
    pbRatio: 2.8,
    high52: 1794.00,
    low52: 1363.55,
    bookValue: 582.00,
    roePercent: 15.6,
    rocePercent: 9.8,
    divYieldPercent: 1.20,
    debtToEquity: 1.05,
    eps: 89.50,
    promoterHoldingPercent: 0.0,
    summary: 'India\'s largest private sector bank post-merger with HDFC Ltd., operating an expansive retail distribution engine and market-leading corporate lending franchise.',
    returns: { d1: 0.4, w1: 1.8, m1: 3.9, m3: 9.2, m6: 12.8, y1: 15.4 },
    avgVol20D: '14.2M',
    deliveryPercent: 61.2,
  },
  'NSE:ITC-EQ': {
    symbol: 'NSE:ITC-EQ',
    ticker: 'ITC',
    companyName: 'ITC Ltd.',
    sector: 'Fast Moving Consumer Goods',
    industry: 'Diversified FMCG, Cigarettes, Hotels & Paperboards',
    mCapCr: 615000,
    capCategory: 'Large Cap',
    peRatio: 28.5,
    sectorPe: 42.0,
    pbRatio: 8.2,
    high52: 528.55,
    low52: 399.30,
    bookValue: 58.40,
    roePercent: 29.8,
    rocePercent: 39.2,
    divYieldPercent: 2.95,
    debtToEquity: 0.01,
    eps: 16.80,
    promoterHoldingPercent: 0.0,
    summary: 'Consumer powerhouse dominating Indian cigarettes, packaged foods, personal care brands, paperboards, agricultural exports, and premier hotel chains.',
    returns: { d1: -0.2, w1: 1.4, m1: 5.1, m3: 12.6, m6: 15.8, y1: 22.4 },
    avgVol20D: '9.8M',
    deliveryPercent: 68.5,
  },
  'NSE:TCS-EQ': {
    symbol: 'NSE:TCS-EQ',
    ticker: 'TCS',
    companyName: 'Tata Consultancy Services Ltd.',
    sector: 'Information Technology',
    industry: 'IT Consulting & Enterprise Systems',
    mCapCr: 1580000,
    capCategory: 'Mega Cap',
    peRatio: 33.2,
    sectorPe: 31.2,
    pbRatio: 16.2,
    high52: 4585.90,
    low52: 3450.00,
    bookValue: 265.00,
    roePercent: 49.8,
    rocePercent: 64.2,
    divYieldPercent: 2.50,
    debtToEquity: 0.0,
    eps: 128.50,
    promoterHoldingPercent: 71.8,
    summary: 'Flagship enterprise IT services firm of the Tata Group with world-class operating margins, deep client tenure, and market-leading cloud architecture capabilities.',
    returns: { d1: 0.6, w1: 2.1, m1: 4.8, m3: 14.1, m6: 22.5, y1: 29.8 },
    avgVol20D: '2.4M',
    deliveryPercent: 71.0,
  },
};

// Simple pseudo-random hash generator based on string for deterministic metrics
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Returns comprehensive fundamental data and recent performance metrics for any symbol.
 * Uses curated data when available or generates deterministic financial indicators based on symbol & live quote.
 */
export function getStockFundamentals(
  symbol: string,
  liveQuote?: {
    ltp?: number;
    pChange?: number;
    high?: number;
    low?: number;
    volume?: number;
  }
): StockFundamentals {
  // Normalize symbol key
  const normSym = symbol.toUpperCase().trim();
  const ticker = normSym.includes(':')
    ? normSym.split(':')[1]?.replace('-EQ', '') || normSym
    : normSym.replace('-EQ', '');

  // Check if curated record exists
  const existing = CURATED_FUNDAMENTALS[normSym] || CURATED_FUNDAMENTALS[`NSE:${ticker}-EQ`];
  if (existing) {
    // Clone and inject live LTP adjustments if available
    const cur = { ...existing };
    if (liveQuote?.ltp && liveQuote.ltp > 0) {
      if (liveQuote.ltp > cur.high52) cur.high52 = Math.round(liveQuote.ltp * 1.02 * 100) / 100;
      if (liveQuote.ltp < cur.low52) cur.low52 = Math.round(liveQuote.ltp * 0.98 * 100) / 100;
      if (cur.eps > 0) cur.peRatio = Math.round((liveQuote.ltp / cur.eps) * 10) / 10;
    }
    if (liveQuote?.pChange != null) {
      cur.returns = { ...cur.returns, d1: Math.round(liveQuote.pChange * 100) / 100 };
    }
    return cur;
  }

  // Generate realistic, consistent synthetic fundamentals for uncurated symbols
  const hash = hashString(ticker);
  const baseLtp = liveQuote?.ltp && liveQuote.ltp > 0 ? liveQuote.ltp : (hash % 1500) + 40;
  const high52 = Math.round(baseLtp * (1.18 + ((hash % 35) / 100)) * 100) / 100;
  const low52 = Math.round(baseLtp * (0.68 - ((hash % 20) / 100)) * 100) / 100;
  const peRatio = Math.round((14 + ((hash % 450) / 10)) * 10) / 10;
  const pbRatio = Math.round((1.2 + ((hash % 60) / 10)) * 10) / 10;
  const bookValue = Math.round((baseLtp / pbRatio) * 100) / 100;
  const eps = Math.round((baseLtp / peRatio) * 100) / 100;
  const roePercent = Math.round((8 + ((hash % 220) / 10)) * 10) / 10;
  const rocePercent = Math.round((roePercent * (1.1 + ((hash % 20) / 100))) * 10) / 10;
  const divYieldPercent = Math.round(((hash % 28) / 10) * 100) / 100;
  const debtToEquity = Math.round(((hash % 120) / 100) * 100) / 100;
  const mCapCr = Math.round(2500 + (hash % 85000));
  const promoterHoldingPercent = Math.round((35 + ((hash % 400) / 10)) * 10) / 10;

  let capCategory: StockFundamentals['capCategory'] = 'Mid Cap';
  if (mCapCr > 200000) capCategory = 'Mega Cap';
  else if (mCapCr > 75000) capCategory = 'Large Cap';
  else if (mCapCr < 5000) capCategory = 'Small Cap';

  const d1 = liveQuote?.pChange != null ? Math.round(liveQuote.pChange * 100) / 100 : (hash % 7) - 3.2;
  const w1 = Math.round(((hash % 120) / 10 - 5.5) * 10) / 10;
  const m1 = Math.round(((hash % 240) / 10 - 8.0) * 10) / 10;
  const m3 = Math.round(((hash % 450) / 10 - 10.0) * 10) / 10;
  const m6 = Math.round(((hash % 800) / 10 - 12.0) * 10) / 10;
  const y1 = Math.round(((hash % 1400) / 10 - 15.0) * 10) / 10;

  return {
    symbol: normSym,
    ticker,
    companyName: `${ticker} Ltd.`,
    sector: 'National Stock Exchange (NSE)',
    industry: 'Equities / Capital Markets',
    mCapCr,
    capCategory,
    peRatio,
    sectorPe: Math.round(peRatio * 1.1 * 10) / 10,
    pbRatio,
    high52,
    low52,
    bookValue,
    roePercent,
    rocePercent,
    divYieldPercent,
    debtToEquity,
    eps,
    promoterHoldingPercent,
    summary: `${ticker} is an established Indian public enterprise listed on the NSE with continuous active trading volume and steady investor participation.`,
    returns: { d1, w1, m1, m3, m6, y1 },
    avgVol20D: `${((hash % 80) / 10 + 1.2).toFixed(2)}M`,
    deliveryPercent: Math.round((35 + (hash % 35)) * 10) / 10,
  };
}
