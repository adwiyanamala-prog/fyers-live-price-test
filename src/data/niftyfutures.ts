import { StockSymbol } from './nifty500';

export const RAW_NIFTY_FUTURES_SYMBOLS: StockSymbol[] = [
  // Core Index Futures
  { symbol: "NSE:NIFTY26SEPFUT", ticker: "NIFTY-I (SEP)", name: "Nifty 50 Sep Future", sector: "Nifty Futures" },
  { symbol: "NSE:NIFTY26OCTFUT", ticker: "NIFTY-II (OCT)", name: "Nifty 50 Oct Future", sector: "Nifty Futures" },
  { symbol: "NSE:NIFTY26NOVFUT", ticker: "NIFTY-III (NOV)", name: "Nifty 50 Nov Future", sector: "Nifty Futures" },
  { symbol: "NSE:NIFTY50-INDEX", ticker: "NIFTY 50", name: "Nifty 50 Spot Index", sector: "Index" },

  // Bank Nifty Futures
  { symbol: "NSE:BANKNIFTY26SEPFUT", ticker: "BANKNIFTY-I (SEP)", name: "Bank Nifty Sep Future", sector: "Bank Nifty Futures" },
  { symbol: "NSE:BANKNIFTY26OCTFUT", ticker: "BANKNIFTY-II (OCT)", name: "Bank Nifty Oct Future", sector: "Bank Nifty Futures" },

  // Other Major Index Futures
  { symbol: "NSE:FINNIFTY26SEPFUT", ticker: "FINNIFTY-I", name: "Fin Nifty Sep Future", sector: "Index Futures" },
  { symbol: "NSE:MIDCPNIFTY26SEPFUT", ticker: "MIDCPNIFTY-I", name: "Midcap Nifty Sep Future", sector: "Index Futures" },

  // Core Nifty 50 Heavyweight Stock Futures
  { symbol: "NSE:RELIANCE26SEPFUT", ticker: "RELIANCE-FUT", name: "Reliance Industries Sep Future", sector: "Stock Futures" },
  { symbol: "NSE:HDFCBANK26SEPFUT", ticker: "HDFCBANK-FUT", name: "HDFC Bank Sep Future", sector: "Stock Futures" },
  { symbol: "NSE:ICICIBANK26SEPFUT", ticker: "ICICIBANK-FUT", name: "ICICI Bank Sep Future", sector: "Stock Futures" },
  { symbol: "NSE:TCS26SEPFUT", ticker: "TCS-FUT", name: "TCS Sep Future", sector: "Stock Futures" },
  { symbol: "NSE:INFY26SEPFUT", ticker: "INFY-FUT", name: "Infosys Sep Future", sector: "Stock Futures" },
  { symbol: "NSE:SBIN26SEPFUT", ticker: "SBIN-FUT", name: "State Bank of India Sep Future", sector: "Stock Futures" },
  { symbol: "NSE:BHARTIARTL26SEPFUT", ticker: "BHARTIARTL-FUT", name: "Bharti Airtel Sep Future", sector: "Stock Futures" },
  { symbol: "NSE:ITC26SEPFUT", ticker: "ITC-FUT", name: "ITC Ltd. Sep Future", sector: "Stock Futures" },
  { symbol: "NSE:LT26SEPFUT", ticker: "LT-FUT", name: "Larsen & Toubro Sep Future", sector: "Stock Futures" },
  { symbol: "NSE:TATAMOTORS26SEPFUT", ticker: "TATAMOTORS-FUT", name: "Tata Motors Sep Future", sector: "Stock Futures" },
  { symbol: "NSE:AXISBANK26SEPFUT", ticker: "AXISBANK-FUT", name: "Axis Bank Sep Future", sector: "Stock Futures" },
  { symbol: "NSE:KOTAKBANK26SEPFUT", ticker: "KOTAKBANK-FUT", name: "Kotak Mahindra Bank Sep Future", sector: "Stock Futures" },
  { symbol: "NSE:MARUTI26SEPFUT", ticker: "MARUTI-FUT", name: "Maruti Suzuki Sep Future", sector: "Stock Futures" },
  { symbol: "NSE:SUNPHARMA26SEPFUT", ticker: "SUNPHARMA-FUT", name: "Sun Pharma Sep Future", sector: "Stock Futures" },
  { symbol: "NSE:BAJFINANCE26SEPFUT", ticker: "BAJFINANCE-FUT", name: "Bajaj Finance Sep Future", sector: "Stock Futures" },
];

export const NIFTY_FUTURES_SYMBOLS: StockSymbol[] = RAW_NIFTY_FUTURES_SYMBOLS.filter(
  (item, index, self) => index === self.findIndex((t) => t.symbol === item.symbol)
);
