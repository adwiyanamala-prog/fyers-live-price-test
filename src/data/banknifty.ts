import { StockSymbol } from './nifty500';

const RAW_BANK_NIFTY_SYMBOLS: StockSymbol[] = [
  // Index Symbols
  { symbol: "NSE:NIFTYBANK-INDEX", ticker: "BANKNIFTY", name: "Nifty Bank Index", sector: "Index" },
  { symbol: "NSE:BANKNIFTY-FUT", ticker: "BANKNIFTY-FUT", name: "Bank Nifty Futures", sector: "Futures" },
  
  // Bank Nifty Core Constituents (Equities)
  { symbol: "NSE:HDFCBANK-EQ", ticker: "HDFCBANK", name: "HDFC Bank Ltd.", sector: "Private Bank" },
  { symbol: "NSE:ICICIBANK-EQ", ticker: "ICICIBANK", name: "ICICI Bank Ltd.", sector: "Private Bank" },
  { symbol: "NSE:KOTAKBANK-EQ", ticker: "KOTAKBANK", name: "Kotak Mahindra Bank Ltd.", sector: "Private Bank" },
  { symbol: "NSE:AXISBANK-EQ", ticker: "AXISBANK", name: "Axis Bank Ltd.", sector: "Private Bank" },
  { symbol: "NSE:SBIN-EQ", ticker: "SBIN", name: "State Bank of India", sector: "PSU Bank" },
  { symbol: "NSE:INDUSINDBK-EQ", ticker: "INDUSINDBK", name: "IndusInd Bank Ltd.", sector: "Private Bank" },
  { symbol: "NSE:BANKBARODA-EQ", ticker: "BANKBARODA", name: "Bank of Baroda", sector: "PSU Bank" },
  { symbol: "NSE:PNB-EQ", ticker: "PNB", name: "Punjab National Bank", sector: "PSU Bank" },
  { symbol: "NSE:AUBANK-EQ", ticker: "AUBANK", name: "AU Small Finance Bank Ltd.", sector: "Small Finance Bank" },
  { symbol: "NSE:IDFCFIRSTB-EQ", ticker: "IDFCFIRSTB", name: "IDFC First Bank Ltd.", sector: "Private Bank" },
  { symbol: "NSE:FEDERALBNK-EQ", ticker: "FEDERALBNK", name: "Federal Bank Ltd.", sector: "Private Bank" },
  { symbol: "NSE:BANDHANBNK-EQ", ticker: "BANDHANBNK", name: "Bandhan Bank Ltd.", sector: "Private Bank" },

  // Bank Nifty Option Contracts
  { symbol: "NSE:BANKNIFTY51000CE", ticker: "BN 51000 CE", name: "Bank Nifty 51000 Call Option", sector: "Options" },
  { symbol: "NSE:BANKNIFTY51000PE", ticker: "BN 51000 PE", name: "Bank Nifty 51000 Put Option", sector: "Options" },
  { symbol: "NSE:BANKNIFTY51500CE", ticker: "BN 51500 CE", name: "Bank Nifty 51500 Call Option", sector: "Options" },
  { symbol: "NSE:BANKNIFTY51500PE", ticker: "BN 51500 PE", name: "Bank Nifty 51500 Put Option", sector: "Options" },
  { symbol: "NSE:BANKNIFTY52000CE", ticker: "BN 52000 CE", name: "Bank Nifty 52000 Call Option", sector: "Options" },
  { symbol: "NSE:BANKNIFTY52000PE", ticker: "BN 52000 PE", name: "Bank Nifty 52000 Put Option", sector: "Options" },
];

export const BANK_NIFTY_SYMBOLS: StockSymbol[] = RAW_BANK_NIFTY_SYMBOLS.filter(
  (item, index, self) => index === self.findIndex((t) => t.symbol === item.symbol)
);
