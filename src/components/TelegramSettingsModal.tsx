import React, { useState, useEffect } from 'react';
import {
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Zap,
  Activity,
  Bell,
  X,
  Copy,
  Check,
  TrendingUp,
  Sliders,
  Sparkles
} from 'lucide-react';

interface TelegramSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TelegramConfig {
  botToken: string;
  allowedChatIds: string[];
  alertsEnabled: boolean;
  smartMoneyAlerts: boolean;
  orderAlerts: boolean;
  defaultTradingMode: 'paper' | 'live';
  isRunning: boolean;
  botUsername: string;
}

export const TelegramSettingsModal: React.FC<TelegramSettingsModalProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showToken, setShowToken] = useState<boolean>(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const [tokenInput, setTokenInput] = useState<string>('');
  const [chatIdsInput, setChatIdsInput] = useState<string>('');
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(true);
  const [smartMoneyAlerts, setSmartMoneyAlerts] = useState<boolean>(true);
  const [orderAlerts, setOrderAlerts] = useState<boolean>(true);
  const [defaultMode, setDefaultMode] = useState<'paper' | 'live'>('paper');

  const [statusData, setStatusData] = useState<TelegramConfig | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/telegram/status');
      if (res.ok) {
        const data: TelegramConfig = await res.json();
        setStatusData(data);
        setTokenInput(data.botToken || '');
        setChatIdsInput((data.allowedChatIds || []).join(', '));
        setAlertsEnabled(data.alertsEnabled);
        setSmartMoneyAlerts(data.smartMoneyAlerts);
        setOrderAlerts(data.orderAlerts);
        setDefaultMode(data.defaultTradingMode || 'paper');
      }
    } catch (err) {
      console.error('Failed to fetch Telegram status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setTestResult(null);
    }
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const chatIds = chatIdsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: tokenInput.trim(),
          allowedChatIds: chatIds,
          alertsEnabled,
          smartMoneyAlerts,
          orderAlerts,
          defaultTradingMode: defaultMode,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: data.message || 'Telegram Bot connected and configuration saved successfully!',
        });
        await fetchStatus();
      } else {
        setTestResult({
          success: false,
          message: data.detail || data.error || data.message || 'Failed to save configuration',
        });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || 'Network error saving configuration' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestPing = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({ success: true, message: '🎉 Test notification successfully delivered to your Telegram!' });
      } else {
        setTestResult({
          success: false,
          message: data.error || data.detail || 'Could not deliver test notification. Check token and Chat ID.',
        });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || 'Error triggering test message' });
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(text);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-gradient-to-r from-sky-500/10 via-indigo-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500 text-white flex items-center justify-center shadow-md shadow-sky-500/25">
              <Send className="w-5 h-5 -rotate-12 translate-x-[-1px] translate-y-[-1px]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Telegram Station & Alerts</h2>
                {statusData?.isRunning ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    @{statusData.botUsername || 'Active'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                    Disconnected
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Trade, monitor positions, check quotes & get institutional alerts from Telegram
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick Setup Guide Accordion */}
          <div className="bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-900/60 rounded-xl p-4 text-xs text-sky-900 dark:text-sky-200 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-sky-700 dark:text-sky-300">
              <Sparkles className="w-4 h-4 text-sky-500" />
              <span>3-Step Telegram Setup:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-600 dark:text-slate-300 ml-1">
              <li>
                Open{' '}
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-sky-600 dark:text-sky-400 underline inline-flex items-center gap-0.5"
                >
                  @BotFather <ExternalLink className="w-3 h-3" />
                </a>{' '}
                on Telegram, send <code className="bg-white/80 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">/newbot</code>, and copy your <b>Bot Token</b>.
              </li>
              <li>
                Open{' '}
                <a
                  href="https://t.me/userinfobot"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-sky-600 dark:text-sky-400 underline inline-flex items-center gap-0.5"
                >
                  @userinfobot <ExternalLink className="w-3 h-3" />
                </a>{' '}
                to get your numeric <b>Chat ID</b> (e.g. <code>123456789</code>).
              </li>
              <li>Paste credentials below and click <b>Save & Connect</b>.</li>
            </ol>
          </div>

          {/* Test / Error Result Toast */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 transition-all ${
                testResult.success
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 font-medium">{testResult.message}</div>
            </div>
          )}

          {/* Configuration Form */}
          <div className="space-y-4">
            {/* Bot Token */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Telegram Bot Token
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Allowed Chat IDs */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Authorized Telegram Chat IDs <span className="text-slate-400 font-normal">(Comma-separated for multiple users)</span>
              </label>
              <input
                type="text"
                value={chatIdsInput}
                onChange={(e) => setChatIdsInput(e.target.value)}
                placeholder="e.g. 581239841, 982341201"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                🔒 Security Guard: Only messages from these Chat IDs can execute trades, cancel orders, or control the daemon.
              </p>
            </div>

            {/* Trading Mode & Notification Settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {/* Default Mode */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Default Trading Mode
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDefaultMode('paper')}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                      defaultMode === 'paper'
                        ? 'bg-sky-500 text-white shadow-sm'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    📝 Paper Trading
                  </button>
                  <button
                    type="button"
                    onClick={() => setDefaultMode('live')}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                      defaultMode === 'live'
                        ? 'bg-rose-500 text-white shadow-sm'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    ⚠️ Real FYERS Live
                  </button>
                </div>
              </div>

              {/* Push Alerts Toggles */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 space-y-2">
                <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Instant Telegram Push Alerts
                </span>
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={orderAlerts}
                    onChange={(e) => setOrderAlerts(e.target.checked)}
                    className="rounded text-sky-500 focus:ring-sky-400"
                  />
                  <span>Order Fills, Rejections & Square-offs</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smartMoneyAlerts}
                    onChange={(e) => setSmartMoneyAlerts(e.target.checked)}
                    className="rounded text-sky-500 focus:ring-sky-400"
                  />
                  <span>Smart Money Institutional Footprint Alerts</span>
                </label>
              </div>
            </div>
          </div>

          {/* Interactive Telegram Commands Cheat Sheet */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800/90 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span>Available Commands on Telegram</span>
              <span className="text-[10px] text-slate-400 font-normal">Click command to copy</span>
            </div>
            <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {[
                { cmd: '/start', desc: 'Main interactive menu & keypad' },
                { cmd: '/funds', desc: 'Available margin, equity & balance' },
                { cmd: '/positions', desc: 'Active positions with [Square Off]' },
                { cmd: '/orders', desc: 'Open orderbook with [Cancel]' },
                { cmd: '/quote SBIN', desc: 'Live quote, VWAP & bid/ask spread' },
                { cmd: '/buy SBIN 10', desc: 'Place market/limit buy order' },
                { cmd: '/sell SBIN 10', desc: 'Place market/limit sell order' },
                { cmd: '/squareoff SBIN', desc: 'Exit position for ticker' },
                { cmd: '/squareoff_all', desc: 'Emergency panic square off all' },
                { cmd: '/smartmoney', desc: 'Institutional block orders trail' },
                { cmd: '/top', desc: 'Top gainers & losers screener' },
                { cmd: '/export', desc: 'EOD Parquet archive & cloud sync' },
                { cmd: '/mode live', desc: 'Toggle paper/live trading mode' },
                { cmd: '/daemon status', desc: 'Control market streaming process' },
              ].map((item) => (
                <div
                  key={item.cmd}
                  onClick={() => copyToClipboard(item.cmd)}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-sky-50 dark:hover:bg-sky-950/40 cursor-pointer border border-transparent hover:border-sky-200 dark:hover:border-sky-800 transition-colors"
                >
                  <div className="font-mono text-[11px] font-bold text-sky-600 dark:text-sky-400">
                    {item.cmd}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <span>{item.desc}</span>
                    {copiedCmd === item.cmd ? (
                      <Check className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3 text-slate-300 dark:text-slate-600 opacity-60" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleTestPing}
            disabled={testing || !statusData?.isRunning}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {testing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-500" />
            ) : (
              <Send className="w-3.5 h-3.5 text-sky-500" />
            )}
            Send Test Message
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white shadow-md shadow-sky-500/25 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Save & Connect
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
