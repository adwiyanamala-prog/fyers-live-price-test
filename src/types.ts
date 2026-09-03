export interface LogEntry {
  id: string;
  type: 'status' | 'tick' | 'error' | 'system';
  rawText: string;
  timestamp?: string;
  date?: string;
  time?: string;
  symbol?: string;
  ltp?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  quantity?: number;
  volume?: number;
  average?: number;
  change?: number;
  pChange?: number;
  bid?: number;
  ask?: number;
}

export interface SymbolSnapshot {
  symbol: string;
  ltp: number;
  prevLtp?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  quantity?: number;
  average?: number;
  change: number;
  pChange: number;
  volume: number;
  bid?: number;
  ask?: number;
  date?: string;
  time?: string;
  lastUpdated: string;
}

export interface CsvRecord {
  date: string;
  time: string;
  timestamp: string;
  symbol: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  ltp: number;
  quantity?: number;
  volume?: number;
  average?: number;
  bid?: number;
  ask?: number;
  change?: number;
  pChange?: number;
  tradeValue?: number;
  spread?: number;
}


