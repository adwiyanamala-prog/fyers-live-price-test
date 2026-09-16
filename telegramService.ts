import { Bot, Context } from "node-telegram-bot-api";
import dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config();

// ============================================================================
// INTERFACES & BRIDGE CONTRACT
// ============================================================================
export interface TelegramQuote {
  symbol: string;
  ltp: number;
  change: number;
  pChange: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  volume: number;
  vwap: number;
  bid: number;
  ask: number;
  spread: number;
  timestamp: number;
  isRealFyers?: boolean;
}

export interface TelegramOrderParams {
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  orderType: "MARKET" | "LIMIT" | "SL";
  product: "CNC" | "INTRADAY" | "MARGIN";
  price?: number;
  triggerPrice?: number;
  isPaper: boolean;
}

export interface TelegramBotBridge {
  getQuotes: (symbols: string[]) => Promise<Map<string, TelegramQuote>>;
  getQuote: (symbol: string) => Promise<TelegramQuote | null>;
  getFunds: (isPaper: boolean) => Promise<any>;
  getPositions: (isPaper: boolean) => Promise<any[]>;
  getOrders: (isPaper: boolean) => Promise<any[]>;
  placeOrder: (params: TelegramOrderParams) => Promise<{ success: boolean; orderId?: string; message: string; data?: any }>;
  cancelOrder: (orderId: string, isPaper: boolean) => Promise<{ success: boolean; message: string }>;
  squareOffPosition: (symbol: string, isPaper: boolean) => Promise<{ success: boolean; message: string }>;
  squareOffAll: (isPaper: boolean) => Promise<{ success: boolean; closedCount: number; message: string }>;
  getHoldings: () => Promise<any>;
  getSmartMoney: (limit?: number) => Promise<any[]>;
  getTopMovers: () => Promise<{ gainers: any[]; losers: any[] }>;
  getDaemonStatus: () => { active: boolean; pid: number | null; subscribedCount: number };
  setDaemonActive: (active: boolean) => Promise<{ success: boolean; message: string }>;
  getSystemStatus: () => Promise<{
    uptime: number;
    memoryMB: number;
    cachedSymbolsCount: number;
    totalTicks: number;
    activeMode: "live" | "paper";
  }>;
}

export interface TelegramBotConfig {
  botToken: string;
  allowedChatIds: string[];
  alertsEnabled: boolean;
  smartMoneyAlerts: boolean;
  orderAlerts: boolean;
  defaultTradingMode: "paper" | "live";
}

// ============================================================================
// TELEGRAM SERVICE SINGLETON
// ============================================================================
class TelegramService {
  private bot: Bot | null = null;
  private bridge: TelegramBotBridge | null = null;
  private config: TelegramBotConfig = {
    botToken: "",
    allowedChatIds: [],
    alertsEnabled: true,
    smartMoneyAlerts: true,
    orderAlerts: true,
    defaultTradingMode: "paper",
  };
  private botUsername: string = "";
  private isRunning: boolean = false;
  private pendingTradeConfirmations = new Map<string, { params: TelegramOrderParams; createdAt: number }>();

  constructor() {
    this.reloadConfig();
  }

  public reloadConfig() {
    const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
    const rawChatIds = (process.env.TELEGRAM_CHAT_ID || "").trim();
    const allowedChatIds = rawChatIds
      ? rawChatIds.split(",").map((id) => id.trim()).filter(Boolean)
      : [];

    const alertsEnabled = process.env.TELEGRAM_ALERTS_ENABLED !== "false";
    const smartMoneyAlerts = process.env.TELEGRAM_SMART_MONEY_ALERTS !== "false";
    const orderAlerts = process.env.TELEGRAM_ORDER_ALERTS !== "false";
    const defaultTradingMode = (process.env.TELEGRAM_DEFAULT_MODE === "live" ? "live" : "paper") as "paper" | "live";

    this.config = {
      botToken: token,
      allowedChatIds,
      alertsEnabled,
      smartMoneyAlerts,
      orderAlerts,
      defaultTradingMode,
    };
  }

  public getConfig(): TelegramBotConfig & { isRunning: boolean; botUsername: string } {
    return {
      ...this.config,
      isRunning: this.isRunning,
      botUsername: this.botUsername,
    };
  }

  public setBridge(bridge: TelegramBotBridge) {
    this.bridge = bridge;
  }

  public async initBot(bridge?: TelegramBotBridge): Promise<{ success: boolean; message: string }> {
    if (bridge) {
      this.bridge = bridge;
    }
    this.reloadConfig();

    if (!this.config.botToken) {
      console.log("[TELEGRAM] No TELEGRAM_BOT_TOKEN found in environment. Telegram bot is idle.");
      return { success: false, message: "No TELEGRAM_BOT_TOKEN configured." };
    }

    try {
      if (this.bot && this.isRunning) {
        this.stopBot();
      }

      console.log("[TELEGRAM] Initializing Telegram bot with provided token...");
      this.bot = new Bot(this.config.botToken);

      // Verify token with getMe
      const me = await this.bot.api.getMe();
      this.botUsername = me.username || me.first_name || "FYERSBot";
      console.log(`[TELEGRAM] Bot verified successfully: @${this.botUsername} (ID: ${me.id})`);

      // Setup security middleware and commands
      this.setupHandlers();

      // Start long polling asynchronously
      this.bot.startPolling().catch((err) => {
        console.error("[TELEGRAM] Long polling error:", err);
      });
      this.isRunning = true;

      // Broadcast startup notice to primary chat if configured
      if (this.config.allowedChatIds.length > 0 && this.config.alertsEnabled) {
        this.sendAlert(
          `🟢 <b>FYERS Trading Station Online</b>\n` +
          `Connected to @${this.botUsername}\n` +
          `Default Mode: <b>${this.config.defaultTradingMode.toUpperCase()}</b>\n` +
          `Type /start or /help for interactive trading controls.`
        ).catch(() => {});
      }

      return { success: true, message: `Connected as @${this.botUsername}` };
    } catch (err: any) {
      console.error("[TELEGRAM] Failed to initialize Telegram bot:", err?.message || err);
      this.isRunning = false;
      return { success: false, message: err?.message || "Failed to initialize bot" };
    }
  }

  public stopBot() {
    if (this.bot) {
      try {
        this.bot.stop();
      } catch (err) {
        console.warn("[TELEGRAM] Error stopping bot:", err);
      }
      this.bot = null;
    }
    this.isRunning = false;
    console.log("[TELEGRAM] Bot polling stopped.");
  }

  // ============================================================================
  // SECURITY & AUTHORIZATION CHECK
  // ============================================================================
  private isAuthorized(chatId?: number | string): boolean {
    if (!chatId) return false;
    const strId = String(chatId);
    if (this.config.allowedChatIds.length === 0) {
      // If no allowedChatIds specified, deny all and show chat ID to help user set it up
      return false;
    }
    return this.config.allowedChatIds.includes(strId);
  }

  private authCheck(ctx: Context): boolean {
    const chatId = ctx.chatId;
    if (!this.isAuthorized(chatId)) {
      const replyMsg =
        `⛔ <b>Access Denied: Unauthorized Account</b>\n\n` +
        `Your Telegram Chat ID is: <code>${chatId}</code>\n\n` +
        `To authorize your account, add this Chat ID to <code>TELEGRAM_CHAT_ID</code> in your <code>.env</code> file or through the web workstation settings modal.`;
      ctx.reply(replyMsg, { parse_mode: "HTML" }).catch(() => {});
      return false;
    }
    return true;
  }

  // ============================================================================
  // COMMAND & CALLBACK HANDLERS
  // ============================================================================
  private setupHandlers() {
    if (!this.bot) return;

    // Start / Help / Menu
    this.bot.command(["start", "help", "menu"], async (ctx) => {
      if (!this.authCheck(ctx)) return;
      await this.sendMainMenu(ctx);
    });

    // Funds / Balance
    this.bot.command(["funds", "balance", "margin"], async (ctx) => {
      if (!this.authCheck(ctx)) return;
      const args = (ctx.match || "").toString().trim().toLowerCase();
      const isPaper = args === "live" ? false : args === "paper" ? true : this.config.defaultTradingMode === "paper";
      await this.handleFundsCommand(ctx, isPaper);
    });

    // Positions
    this.bot.command(["positions", "pos"], async (ctx) => {
      if (!this.authCheck(ctx)) return;
      const args = (ctx.match || "").toString().trim().toLowerCase();
      const isPaper = args === "live" ? false : args === "paper" ? true : this.config.defaultTradingMode === "paper";
      await this.handlePositionsCommand(ctx, isPaper);
    });

    // Orders
    this.bot.command(["orders", "orderbook"], async (ctx) => {
      if (!this.authCheck(ctx)) return;
      const args = (ctx.match || "").toString().trim().toLowerCase();
      const isPaper = args === "live" ? false : args === "paper" ? true : this.config.defaultTradingMode === "paper";
      await this.handleOrdersCommand(ctx, isPaper);
    });

    // Quote / Price
    this.bot.command(["quote", "q", "price"], async (ctx) => {
      if (!this.authCheck(ctx)) return;
      const sym = (ctx.match || "").toString().trim();
      await this.handleQuoteCommand(ctx, sym);
    });

    // Watchlist
    this.bot.command(["watchlist", "wl"], async (ctx) => {
      if (!this.authCheck(ctx)) return;
      await this.handleWatchlistCommand(ctx);
    });

    // Top Gainers / Screener
    this.bot.command(["top", "screener", "gainers", "movers"], async (ctx) => {
      if (!this.authCheck(ctx)) return;
      await this.handleTopMoversCommand(ctx);
    });

    // Smart Money
    this.bot.command(["smartmoney", "sm", "radar"], async (ctx) => {
      if (!this.authCheck(ctx)) return;
      await this.handleSmartMoneyCommand(ctx);
    });

    // Buy
    this.bot.command("buy", async (ctx) => {
      if (!this.authCheck(ctx)) return;
      const rawArgs = (ctx.match || "").toString().trim();
      await this.handleTradeOrderCommand(ctx, "BUY", rawArgs);
    });

    // Sell
    this.bot.command("sell", async (ctx) => {
      if (!this.authCheck(ctx)) return;
      const rawArgs = (ctx.match || "").toString().trim();
      await this.handleTradeOrderCommand(ctx, "SELL", rawArgs);
    });

    // Cancel Order
    this.bot.command("cancel", async (ctx) => {
      if (!this.authCheck(ctx)) return;
      const orderId = (ctx.match || "").toString().trim();
      if (!orderId) {
        return ctx.reply("⚠️ Please specify an order ID: <code>/cancel &lt;order_id&gt;</code>", { parse_mode: "HTML" });
      }
      await this.handleCancelOrder(ctx, orderId, this.config.defaultTradingMode === "paper");
    });

    // Square Off Symbol
    this.bot.command("squareoff", async (ctx) => {
      if (!this.authCheck(ctx)) return;
      const sym = (ctx.match || "").toString().trim();
      if (!sym) {
        return ctx.reply("⚠️ Please specify symbol to square off: <code>/squareoff NSE:SBIN-EQ</code>", { parse_mode: "HTML" });
      }
      await this.handleSquareOffSymbol(ctx, sym, this.config.defaultTradingMode === "paper");
    });

    // Square Off All (Emergency)
    this.bot.command(["squareoff_all", "panic"], async (ctx) => {
      if (!this.authCheck(ctx)) return;
      await this.handleSquareOffAllPrompt(ctx);
    });

    // Holdings
    this.bot.command("holdings", async (ctx) => {
      if (!this.authCheck(ctx)) return;
      await this.handleHoldingsCommand(ctx);
    });

    // Daemon
    this.bot.command("daemon", async (ctx) => {
      if (!this.authCheck(ctx)) return;
      const arg = (ctx.match || "").toString().trim().toLowerCase();
      await this.handleDaemonCommand(ctx, arg);
    });

    // Status / System
    this.bot.command(["status", "sys", "health"], async (ctx) => {
      if (!this.authCheck(ctx)) return;
      await this.handleStatusCommand(ctx);
    });

    // Trading Mode Toggle
    this.bot.command("mode", async (ctx) => {
      if (!this.authCheck(ctx)) return;
      const target = (ctx.match || "").toString().trim().toLowerCase();
      if (target === "live" || target === "paper") {
        this.config.defaultTradingMode = target;
        return ctx.reply(`⚙️ Default Telegram trading mode switched to: <b>${target.toUpperCase()}</b>`, { parse_mode: "HTML" });
      }
      return ctx.reply(
        `Current trading mode: <b>${this.config.defaultTradingMode.toUpperCase()}</b>\n` +
        `To switch, use: <code>/mode paper</code> or <code>/mode live</code>`,
        { parse_mode: "HTML" }
      );
    });

    // Callback Query Handler (Inline Keyboards)
    this.bot.on("callback_query", async (ctx) => {
      if (!this.authCheck(ctx)) return;
      const data = ctx.callbackQuery?.data || "";
      try {
        await ctx.answerCallbackQuery();
      } catch {}
      await this.handleCallbackQuery(ctx, data);
    });
  }

  // ============================================================================
  // INTERACTIVE UI & COMMAND IMPLEMENTATIONS
  // ============================================================================
  private async sendMainMenu(ctx: Context) {
    const mode = this.config.defaultTradingMode.toUpperCase();
    const welcome =
      `🏛️ <b>FYERS Trading Station & Market Terminal</b>\n` +
      `Mode: <b>${mode}</b> | Daemon: <b>${this.bridge?.getDaemonStatus().active ? "🟢 ACTIVE" : "⚪ IDLE"}</b>\n\n` +
      `<b>Direct Commands:</b>\n` +
      `• <code>/quote &lt;symbol&gt;</code> — Live quote & spread\n` +
      `• <code>/buy &lt;symbol&gt; &lt;qty&gt; [price] [cnc|intraday]</code>\n` +
      `• <code>/sell &lt;symbol&gt; &lt;qty&gt; [price] [cnc|intraday]</code>\n` +
      `• <code>/cancel &lt;order_id&gt;</code> — Cancel order\n` +
      `• <code>/squareoff &lt;symbol&gt;</code> — Close position\n` +
      `• <code>/mode [paper|live]</code> — Switch default mode\n\n` +
      `<i>Tap a button below for instant workstation access:</i>`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: "💰 Funds & Margin", callback_data: `menu_funds_${this.config.defaultTradingMode}` },
          { text: "📊 Open Positions", callback_data: `menu_positions_${this.config.defaultTradingMode}` },
        ],
        [
          { text: "📋 Order Book", callback_data: `menu_orders_${this.config.defaultTradingMode}` },
          { text: "⭐ Watchlist", callback_data: "menu_watchlist" },
        ],
        [
          { text: "🚀 Top Movers", callback_data: "menu_top" },
          { text: "🐋 Smart Money", callback_data: "menu_smartmoney" },
        ],
        [
          { text: "⚡ Daemon Control", callback_data: "menu_daemon" },
          { text: "ℹ️ System Health", callback_data: "menu_status" },
        ],
        [
          { text: "🚨 Square Off All Positions", callback_data: `confirm_sq_all_prompt_${this.config.defaultTradingMode}` },
        ],
      ],
    };

    await ctx.reply(welcome, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  }

  private async handleFundsCommand(ctx: Context, isPaper: boolean) {
    if (!this.bridge) {
      return ctx.reply("⚠️ Bridge connection to server not established.");
    }
    try {
      const funds = await this.bridge.getFunds(isPaper);
      const total = Number(funds.totalBalance || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
      const avail = Number(funds.availableBalance || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
      const used = Number(funds.utilizedAmount || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
      const pnl = Number(funds.realizedPnl || 0);
      const pnlStr = (pnl >= 0 ? "+" : "") + pnl.toLocaleString("en-IN", { maximumFractionDigits: 2 });

      const text =
        `💰 <b>Account Funds (${isPaper ? "PAPER TRADING" : "REAL FYERS BROKER"})</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `• <b>Total Balance:</b> ₹${total}\n` +
        `• <b>Available Margin:</b> ₹${avail}\n` +
        `• <b>Utilized Margin:</b> ₹${used}\n` +
        `• <b>Realized P&L:</b> <b>₹${pnlStr}</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: isPaper ? "Switch to Live Funds" : "Switch to Paper Funds", callback_data: `menu_funds_${isPaper ? "live" : "paper"}` },
            { text: "🔄 Refresh", callback_data: `menu_funds_${isPaper ? "paper" : "live"}` },
          ],
        ],
      };

      await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
    } catch (err: any) {
      ctx.reply(`❌ Failed to fetch funds: ${err?.message || err}`);
    }
  }

  private async handlePositionsCommand(ctx: Context, isPaper: boolean) {
    if (!this.bridge) return ctx.reply("⚠️ Bridge connection to server not established.");
    try {
      const positions = await this.bridge.getPositions(isPaper);
      if (!positions || positions.length === 0) {
        return ctx.reply(
          `📊 <b>Positions (${isPaper ? "PAPER" : "LIVE"})</b>\n\n` +
          `No open positions currently active.`,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "🔄 Refresh", callback_data: `menu_positions_${isPaper ? "paper" : "live"}` }]
              ]
            }
          }
        );
      }

      let totalPnl = 0;
      let text = `📊 <b>Open Positions (${isPaper ? "PAPER" : "LIVE"})</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      const actionButtons: Array<Array<{ text: string; callback_data: string }>> = [];

      for (const pos of positions) {
        const symbol = pos.symbol || pos.segment;
        const qty = Number(pos.qty || pos.netQty || 0);
        if (qty === 0) continue;
        const buyAvg = Number(pos.avg_price || pos.buyAvg || 0);
        const ltp = Number(pos.ltp || buyAvg);
        const pnl = Number(pos.pnl || (ltp - buyAvg) * qty);
        totalPnl += pnl;

        const pnlIcon = pnl >= 0 ? "🟢" : "🔴";
        const pnlFormatted = (pnl >= 0 ? "+" : "") + pnl.toFixed(2);

        text +=
          `<b>${symbol}</b>\n` +
          `Qty: <b>${qty}</b> | Avg: ₹${buyAvg.toFixed(2)} | LTP: ₹${ltp.toFixed(2)}\n` +
          `P&L: ${pnlIcon} <b>₹${pnlFormatted}</b>\n\n`;

        actionButtons.push([
          { text: `🔴 Square Off ${symbol.replace("NSE:", "").replace("-EQ", "")}`, callback_data: `sq_${symbol}_${isPaper ? "paper" : "live"}` },
        ]);
      }

      text += `━━━━━━━━━━━━━━━━━━━━\n`;
      text += `<b>Total Net P&L:</b> ${totalPnl >= 0 ? "🟢" : "🔴"} <b>₹${(totalPnl >= 0 ? "+" : "") + totalPnl.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</b>`;

      actionButtons.push([
        { text: "🔄 Refresh", callback_data: `menu_positions_${isPaper ? "paper" : "live"}` },
        { text: "🚨 Square Off All", callback_data: `confirm_sq_all_prompt_${isPaper ? "paper" : "live"}` },
      ]);

      await ctx.reply(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: actionButtons } });
    } catch (err: any) {
      ctx.reply(`❌ Failed to fetch positions: ${err?.message || err}`);
    }
  }

  private async handleOrdersCommand(ctx: Context, isPaper: boolean) {
    if (!this.bridge) return ctx.reply("⚠️ Bridge connection to server not established.");
    try {
      const orders = await this.bridge.getOrders(isPaper);
      if (!orders || orders.length === 0) {
        return ctx.reply(
          `📋 <b>Orders (${isPaper ? "PAPER" : "LIVE"})</b>\n\n` +
          `No open or executed orders found for today.`,
          { parse_mode: "HTML" }
        );
      }

      let text = `📋 <b>Order Book (${isPaper ? "PAPER" : "LIVE"})</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      const actionButtons: Array<Array<{ text: string; callback_data: string }>> = [];

      for (const ord of orders.slice(0, 10)) {
        const id = ord.order_id || ord.id;
        const sym = (ord.symbol || "").replace("NSE:", "").replace("-EQ", "");
        const side = ord.side || (ord.transaction_type === 1 ? "BUY" : "SELL");
        const qty = ord.qty || ord.quantity;
        const price = ord.price || ord.limitPrice || 0;
        const status = ord.status || "OPEN";

        const sideIcon = side === "BUY" ? "🟢" : "🔴";
        text +=
          `${sideIcon} <b>${side} ${sym}</b> (Qty: ${qty})\n` +
          `Price: ₹${price} | Status: <b>${status}</b>\n` +
          `ID: <code>${id}</code>\n\n`;

        if (status === "OPEN" || status === "PENDING" || status === "TRIGGER PENDING") {
          actionButtons.push([
            { text: `❌ Cancel #${String(id).slice(-6)}`, callback_data: `cancel_${id}_${isPaper ? "paper" : "live"}` },
          ]);
        }
      }

      actionButtons.push([{ text: "🔄 Refresh", callback_data: `menu_orders_${isPaper ? "paper" : "live"}` }]);

      await ctx.reply(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: actionButtons } });
    } catch (err: any) {
      ctx.reply(`❌ Failed to fetch orders: ${err?.message || err}`);
    }
  }

  private async handleQuoteCommand(ctx: Context, symInput: string) {
    if (!this.bridge) return ctx.reply("⚠️ Bridge connection to server not established.");
    if (!symInput) {
      return ctx.reply(
        `⚠️ <b>Please specify a symbol</b>\n` +
        `Examples:\n` +
        `• <code>/quote RELIANCE</code>\n` +
        `• <code>/quote NSE:SBIN-EQ</code>\n` +
        `• <code>/q INFY</code>`,
        { parse_mode: "HTML" }
      );
    }

    let symbol = symInput.toUpperCase().trim();
    if (!symbol.startsWith("NSE:") && !symbol.startsWith("BSE:") && !symbol.startsWith("MCX:")) {
      symbol = `NSE:${symbol}-EQ`;
    }

    try {
      const q = await this.bridge.getQuote(symbol);
      if (!q) {
        return ctx.reply(`⚠️ No quote data available for symbol <code>${symbol}</code>. Make sure it is monitored.`, { parse_mode: "HTML" });
      }

      const pChange = q.pChange || (q.prevClose > 0 ? ((q.ltp - q.prevClose) / q.prevClose) * 100 : 0);
      const isUp = pChange >= 0;
      const changeSign = isUp ? "+" : "";

      const text =
        `📈 <b>${symbol}</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `• <b>LTP:</b> ₹${q.ltp.toFixed(2)} (${changeSign}${pChange.toFixed(2)}%)\n` +
        `• <b>Change:</b> ${changeSign}₹${q.change.toFixed(2)}\n` +
        `• <b>High / Low:</b> ₹${q.high.toFixed(2)} / ₹${q.low.toFixed(2)}\n` +
        `• <b>Open / Prev Close:</b> ₹${q.open.toFixed(2)} / ₹${q.prevClose.toFixed(2)}\n` +
        `• <b>VWAP:</b> ₹${(q.vwap || q.ltp).toFixed(2)}\n` +
        `• <b>Volume:</b> ${(q.volume || 0).toLocaleString("en-IN")}\n` +
        `• <b>Bid / Ask:</b> ₹${q.bid.toFixed(2)} / ₹${q.ask.toFixed(2)} (Spread: ₹${q.spread.toFixed(2)})\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `<i>Source: ${q.isRealFyers ? "FYERS Live WebSocket" : "Cached Ticks"}</i>`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: `🟢 Buy ${symbol.replace("NSE:", "").replace("-EQ", "")}`, callback_data: `quick_buy_${symbol}` },
            { text: `🔴 Sell ${symbol.replace("NSE:", "").replace("-EQ", "")}`, callback_data: `quick_sell_${symbol}` },
          ],
          [
            { text: "🔄 Refresh Quote", callback_data: `quote_${symbol}` },
          ],
        ],
      };

      await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
    } catch (err: any) {
      ctx.reply(`❌ Failed to fetch quote for ${symbol}: ${err?.message || err}`);
    }
  }

  private async handleWatchlistCommand(ctx: Context) {
    if (!this.bridge) return ctx.reply("⚠️ Bridge connection to server not established.");
    try {
      const quotesMap = await this.bridge.getQuotes([]);
      if (!quotesMap || quotesMap.size === 0) {
        return ctx.reply("⭐ Watchlist is currently empty. Add symbols in the web dashboard.", { parse_mode: "HTML" });
      }

      let text = `⭐ <b>Monitored Watchlist (${quotesMap.size} Tickers)</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      let count = 0;
      for (const [sym, q] of Array.from(quotesMap.entries())) {
        if (count >= 15) break;
        const cleanSym = sym.replace("NSE:", "").replace("-EQ", "").padEnd(10, " ");
        const pChange = q.pChange || 0;
        const sign = pChange >= 0 ? "+" : "";
        const icon = pChange >= 0 ? "🟢" : "🔴";
        text += `${icon} <code>${cleanSym}</code> ₹${q.ltp.toFixed(2)} (${sign}${pChange.toFixed(2)}%)\n`;
        count++;
      }
      text += `━━━━━━━━━━━━━━━━━━━━`;

      const keyboard = {
        inline_keyboard: [
          [{ text: "🔄 Refresh Watchlist", callback_data: "menu_watchlist" }],
        ],
      };

      await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
    } catch (err: any) {
      ctx.reply(`❌ Failed to load watchlist: ${err?.message || err}`);
    }
  }

  private async handleTopMoversCommand(ctx: Context) {
    if (!this.bridge) return ctx.reply("⚠️ Bridge connection to server not established.");
    try {
      const { gainers, losers } = await this.bridge.getTopMovers();
      let text = `🚀 <b>Top Market Movers</b>\n━━━━━━━━━━━━━━━━━━━━\n`;

      text += `<b>Top Gainers:</b>\n`;
      for (const g of gainers.slice(0, 5)) {
        const sym = (g.symbol || "").replace("NSE:", "").replace("-EQ", "");
        text += `🟢 <b>${sym}</b>: ₹${Number(g.ltp || 0).toFixed(2)} (+${Number(g.pChange || 0).toFixed(2)}%)\n`;
      }

      text += `\n<b>Top Losers:</b>\n`;
      for (const l of losers.slice(0, 5)) {
        const sym = (l.symbol || "").replace("NSE:", "").replace("-EQ", "");
        text += `🔴 <b>${sym}</b>: ₹${Number(l.ltp || 0).toFixed(2)} (${Number(l.pChange || 0).toFixed(2)}%)\n`;
      }
      text += `━━━━━━━━━━━━━━━━━━━━`;

      await ctx.reply(text, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "🔄 Refresh Movers", callback_data: "menu_top" }]],
        },
      });
    } catch (err: any) {
      ctx.reply(`❌ Failed to fetch top movers: ${err?.message || err}`);
    }
  }

  private async handleSmartMoneyCommand(ctx: Context) {
    if (!this.bridge) return ctx.reply("⚠️ Bridge connection to server not established.");
    try {
      const items = await this.bridge.getSmartMoney(8);
      if (!items || items.length === 0) {
        return ctx.reply("🐋 <b>Smart Money Radar</b>\n\nNo recent block footprint trades recorded yet.", { parse_mode: "HTML" });
      }

      let text = `🐋 <b>Smart Money Radar & Institutional Trail</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      for (const it of items) {
        const sym = (it.symbol || "").replace("NSE:", "").replace("-EQ", "");
        const side = it.side || "BUY";
        const icon = side === "BUY" ? "🟢 ACCUMULATION" : "🔴 DISTRIBUTION";
        const valLakhs = it.value_lakhs ? `${Number(it.value_lakhs).toFixed(1)}L` : `₹${Number(it.trade_value || 0).toLocaleString("en-IN")}`;
        const score = it.score ? `[Score: ${it.score}]` : "";

        text +=
          `<b>${sym}</b> — ${icon} ${score}\n` +
          `Value: <b>₹${valLakhs}</b> | Volume: ${(it.volume || 0).toLocaleString("en-IN")} | Price: ₹${it.ltp || it.price}\n\n`;
      }
      text += `━━━━━━━━━━━━━━━━━━━━`;

      await ctx.reply(text, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "🔄 Refresh Smart Money", callback_data: "menu_smartmoney" }]],
        },
      });
    } catch (err: any) {
      ctx.reply(`❌ Failed to fetch smart money footprints: ${err?.message || err}`);
    }
  }

  // Parse: /buy NSE:SBIN-EQ 10 750 CNC live
  private async handleTradeOrderCommand(ctx: Context, side: "BUY" | "SELL", rawArgs: string) {
    if (!rawArgs) {
      return ctx.reply(
        `⚠️ <b>Usage:</b>\n<code>/${side.toLowerCase()} &lt;symbol&gt; &lt;qty&gt; [price] [cnc|intraday] [paper|live]</code>\n\n` +
        `<b>Examples:</b>\n` +
        `• <code>/${side.toLowerCase()} SBIN 10</code> (Market order in paper mode)\n` +
        `• <code>/${side.toLowerCase()} RELIANCE 5 2950 CNC</code> (Limit order)\n` +
        `• <code>/${side.toLowerCase()} NSE:TCS-EQ 10 MKT INTRADAY live</code>`,
        { parse_mode: "HTML" }
      );
    }

    const parts = rawArgs.split(/\s+/).filter(Boolean);
    let sym = parts[0].toUpperCase();
    if (!sym.startsWith("NSE:") && !sym.startsWith("BSE:")) {
      sym = `NSE:${sym}-EQ`;
    }

    const qty = parseInt(parts[1], 10);
    if (isNaN(qty) || qty <= 0) {
      return ctx.reply("⚠️ Invalid quantity. Must be a positive integer.");
    }

    let price: number | undefined = undefined;
    let orderType: "MARKET" | "LIMIT" = "MARKET";
    let product: "CNC" | "INTRADAY" = "INTRADAY";
    let isPaper = this.config.defaultTradingMode === "paper";

    for (let i = 2; i < parts.length; i++) {
      const p = parts[i].toUpperCase();
      if (p === "MKT" || p === "MARKET") {
        orderType = "MARKET";
      } else if (!isNaN(parseFloat(p))) {
        price = parseFloat(p);
        orderType = "LIMIT";
      } else if (p === "CNC" || p === "DELIVERY") {
        product = "CNC";
      } else if (p === "INTRADAY" || p === "MIS") {
        product = "INTRADAY";
      } else if (p === "PAPER") {
        isPaper = true;
      } else if (p === "LIVE") {
        isPaper = false;
      }
    }

    const confirmKey = `order_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const orderParams: TelegramOrderParams = {
      symbol: sym,
      side,
      qty,
      orderType,
      product,
      price,
      isPaper,
    };

    this.pendingTradeConfirmations.set(confirmKey, {
      params: orderParams,
      createdAt: Date.now(),
    });

    const sideIcon = side === "BUY" ? "🟢 BUY" : "🔴 SELL";
    const modeBadge = isPaper ? "📝 PAPER MODE" : "⚠️ REAL FYERS BROKER";

    const promptText =
      `📋 <b>Confirm Order Placement (${modeBadge})</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• <b>Action:</b> ${sideIcon}\n` +
      `• <b>Symbol:</b> <code>${sym}</code>\n` +
      `• <b>Quantity:</b> ${qty} shares\n` +
      `• <b>Type:</b> ${orderType} ${price ? `@ ₹${price.toFixed(2)}` : ""}\n` +
      `• <b>Product:</b> ${product}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Do you want to submit this order?`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: "✅ Submit Order", callback_data: `exec_${confirmKey}` },
          { text: "❌ Abort", callback_data: `abort_${confirmKey}` },
        ],
      ],
    };

    await ctx.reply(promptText, { parse_mode: "HTML", reply_markup: keyboard });
  }

  private async executeConfirmedOrder(ctx: Context, confirmKey: string) {
    const item = this.pendingTradeConfirmations.get(confirmKey);
    this.pendingTradeConfirmations.delete(confirmKey);

    if (!item) {
      return ctx.reply("⚠️ Order confirmation expired or invalid.");
    }

    if (!this.bridge) return ctx.reply("⚠️ Bridge connection to server not established.");

    try {
      const res = await this.bridge.placeOrder(item.params);
      if (res.success) {
        const icon = item.params.side === "BUY" ? "🟢" : "🔴";
        const msg =
          `✅ <b>Order Placed Successfully</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `• <b>Order ID:</b> <code>${res.orderId || "OK"}</code>\n` +
          `• <b>Action:</b> ${icon} ${item.params.side} ${item.params.symbol}\n` +
          `• <b>Qty:</b> ${item.params.qty} | <b>Type:</b> ${item.params.orderType}\n` +
          `• <b>Mode:</b> ${item.params.isPaper ? "Paper Trading" : "Real FYERS"}\n` +
          `━━━━━━━━━━━━━━━━━━━━`;
        await ctx.reply(msg, { parse_mode: "HTML" });
      } else {
        await ctx.reply(`❌ Order rejected: ${res.message}`, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      ctx.reply(`❌ Error executing order: ${err?.message || err}`);
    }
  }

  private async handleCancelOrder(ctx: Context, orderId: string, isPaper: boolean) {
    if (!this.bridge) return ctx.reply("⚠️ Bridge connection to server not established.");
    try {
      const res = await this.bridge.cancelOrder(orderId, isPaper);
      if (res.success) {
        await ctx.reply(`✅ Order <code>${orderId}</code> cancelled successfully.`, { parse_mode: "HTML" });
      } else {
        await ctx.reply(`❌ Could not cancel order: ${res.message}`, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      ctx.reply(`❌ Error: ${err?.message || err}`);
    }
  }

  private async handleSquareOffSymbol(ctx: Context, symbol: string, isPaper: boolean) {
    if (!this.bridge) return ctx.reply("⚠️ Bridge connection to server not established.");
    try {
      const res = await this.bridge.squareOffPosition(symbol, isPaper);
      if (res.success) {
        await ctx.reply(`✅ Position for <b>${symbol}</b> squared off successfully (${isPaper ? "Paper" : "Live"}).`, { parse_mode: "HTML" });
      } else {
        await ctx.reply(`❌ Square-off failed: ${res.message}`, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      ctx.reply(`❌ Error squaring off: ${err?.message || err}`);
    }
  }

  private async handleSquareOffAllPrompt(ctx: Context) {
    const isPaper = this.config.defaultTradingMode === "paper";
    const prompt =
      `🚨 <b>EMERGENCY SQUARE OFF ALL POSITIONS</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Are you sure you want to market square-off ALL open positions in <b>${isPaper ? "PAPER" : "REAL LIVE FYERS"}</b> mode?\n\n` +
      `This action cannot be undone!`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: "⚠️ YES, SQUARE OFF ALL NOW", callback_data: `exec_sq_all_${isPaper ? "paper" : "live"}` },
        ],
        [
          { text: "❌ Cancel / Abort", callback_data: "abort_sq_all" },
        ],
      ],
    };

    await ctx.reply(prompt, { parse_mode: "HTML", reply_markup: keyboard });
  }

  private async executeSquareOffAll(ctx: Context, isPaper: boolean) {
    if (!this.bridge) return ctx.reply("⚠️ Bridge connection to server not established.");
    try {
      const res = await this.bridge.squareOffAll(isPaper);
      if (res.success) {
        await ctx.reply(
          `✅ <b>Emergency Square-Off Complete</b>\nClosed ${res.closedCount} positions (${isPaper ? "Paper" : "Live"}).`,
          { parse_mode: "HTML" }
        );
      } else {
        await ctx.reply(`❌ Square-off all failed: ${res.message}`, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      ctx.reply(`❌ Error: ${err?.message || err}`);
    }
  }

  private async handleHoldingsCommand(ctx: Context) {
    if (!this.bridge) return ctx.reply("⚠️ Bridge connection to server not established.");
    try {
      const data = await this.bridge.getHoldings();
      const holdings = data?.holdings || [];
      if (holdings.length === 0) {
        return ctx.reply("💼 No holdings found in your FYERS account.", { parse_mode: "HTML" });
      }

      let text = `💼 <b>FYERS Portfolio Holdings (${holdings.length} Assets)</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      let totalInvested = 0;
      let totalCurrent = 0;

      for (const h of holdings.slice(0, 10)) {
        const sym = (h.symbol || "").replace("NSE:", "").replace("-EQ", "");
        const qty = h.quantity || h.holdings;
        const buyAvg = h.costPrice || h.buyAvg || 0;
        const ltp = h.ltp || buyAvg;
        const invested = qty * buyAvg;
        const current = qty * ltp;
        const pnl = current - invested;
        totalInvested += invested;
        totalCurrent += current;

        const icon = pnl >= 0 ? "🟢" : "🔴";
        text +=
          `<b>${sym}</b> (Qty: ${qty})\n` +
          `Invested: ₹${invested.toFixed(0)} | Value: ₹${current.toFixed(0)} | P&L: ${icon} <b>₹${(pnl >= 0 ? "+" : "") + pnl.toFixed(0)}</b>\n\n`;
      }

      const totalPnl = totalCurrent - totalInvested;
      text += `━━━━━━━━━━━━━━━━━━━━\n`;
      text += `• Total Invested: ₹${totalInvested.toLocaleString("en-IN", { maximumFractionDigits: 0 })}\n`;
      text += `• Current Value: ₹${totalCurrent.toLocaleString("en-IN", { maximumFractionDigits: 0 })}\n`;
      text += `• Total Portfolio P&L: ${totalPnl >= 0 ? "🟢" : "🔴"} <b>₹${(totalPnl >= 0 ? "+" : "") + totalPnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</b>`;

      await ctx.reply(text, { parse_mode: "HTML" });
    } catch (err: any) {
      ctx.reply(`❌ Failed to fetch holdings: ${err?.message || err}`);
    }
  }

  private async handleDaemonCommand(ctx: Context, arg: string) {
    if (!this.bridge) return ctx.reply("⚠️ Bridge connection to server not established.");
    try {
      if (arg === "start" || arg === "on") {
        const res = await this.bridge.setDaemonActive(true);
        return ctx.reply(`⚡ ${res.message}`, { parse_mode: "HTML" });
      }
      if (arg === "stop" || arg === "off") {
        const res = await this.bridge.setDaemonActive(false);
        return ctx.reply(`⚡ ${res.message}`, { parse_mode: "HTML" });
      }

      const status = this.bridge.getDaemonStatus();
      const text =
        `⚡ <b>Market Data Streaming Daemon</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `• <b>Status:</b> ${status.active ? "🟢 RUNNING" : "⚪ STOPPED"}\n` +
        `• <b>Process PID:</b> ${status.pid || "None"}\n` +
        `• <b>Subscribed Symbols:</b> ${status.subscribedCount}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Use <code>/daemon start</code> or <code>/daemon stop</code> to control.`;

      const keyboard = {
        inline_keyboard: [
          [
            status.active
              ? { text: "🛑 Stop Daemon", callback_data: "daemon_stop" }
              : { text: "▶️ Start Daemon", callback_data: "daemon_start" },
            { text: "🔄 Refresh", callback_data: "menu_daemon" },
          ],
        ],
      };

      await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
    } catch (err: any) {
      ctx.reply(`❌ Error in daemon command: ${err?.message || err}`);
    }
  }

  private async handleStatusCommand(ctx: Context) {
    if (!this.bridge) return ctx.reply("⚠️ Bridge connection to server not established.");
    try {
      const sys = await this.bridge.getSystemStatus();
      const daemon = this.bridge.getDaemonStatus();
      const hours = Math.floor(sys.uptime / 3600);
      const minutes = Math.floor((sys.uptime % 3600) / 60);

      const text =
        `ℹ️ <b>FYERS Station & Supervisor Health</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `• <b>Server Uptime:</b> ${hours}h ${minutes}m\n` +
        `• <b>Node Memory:</b> ${sys.memoryMB} MB\n` +
        `• <b>Market Daemon:</b> ${daemon.active ? "🟢 ACTIVE" : "⚪ INACTIVE"}\n` +
        `• <b>Cached Quotes:</b> ${sys.cachedSymbolsCount} tickers\n` +
        `• <b>Database Ticks:</b> ${sys.totalTicks.toLocaleString("en-IN")}\n` +
        `• <b>Active Mode:</b> <b>${this.config.defaultTradingMode.toUpperCase()}</b>\n` +
        `• <b>Telegram Alerts:</b> ${this.config.alertsEnabled ? "🟢 ON" : "⚪ OFF"}\n` +
        `━━━━━━━━━━━━━━━━━━━━`;

      await ctx.reply(text, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "🔄 Refresh", callback_data: "menu_status" }]],
        },
      });
    } catch (err: any) {
      ctx.reply(`❌ Failed to get system status: ${err?.message || err}`);
    }
  }

  private async handleCallbackQuery(ctx: Context, data: string) {
    if (data === "menu_funds_paper" || data === "menu_funds_live") {
      const isPaper = data.endsWith("paper");
      return this.handleFundsCommand(ctx, isPaper);
    }
    if (data === "menu_positions_paper" || data === "menu_positions_live") {
      const isPaper = data.endsWith("paper");
      return this.handlePositionsCommand(ctx, isPaper);
    }
    if (data === "menu_orders_paper" || data === "menu_orders_live") {
      const isPaper = data.endsWith("paper");
      return this.handleOrdersCommand(ctx, isPaper);
    }
    if (data === "menu_watchlist") {
      return this.handleWatchlistCommand(ctx);
    }
    if (data === "menu_top") {
      return this.handleTopMoversCommand(ctx);
    }
    if (data === "menu_smartmoney") {
      return this.handleSmartMoneyCommand(ctx);
    }
    if (data === "menu_daemon") {
      return this.handleDaemonCommand(ctx, "");
    }
    if (data === "menu_status") {
      return this.handleStatusCommand(ctx);
    }
    if (data === "daemon_start") {
      return this.handleDaemonCommand(ctx, "start");
    }
    if (data === "daemon_stop") {
      return this.handleDaemonCommand(ctx, "stop");
    }
    if (data.startsWith("quote_")) {
      const sym = data.replace("quote_", "");
      return this.handleQuoteCommand(ctx, sym);
    }
    if (data.startsWith("quick_buy_")) {
      const sym = data.replace("quick_buy_", "");
      return this.handleTradeOrderCommand(ctx, "BUY", `${sym} 1`);
    }
    if (data.startsWith("quick_sell_")) {
      const sym = data.replace("quick_sell_", "");
      return this.handleTradeOrderCommand(ctx, "SELL", `${sym} 1`);
    }
    if (data.startsWith("sq_")) {
      // sq_<symbol>_<mode>
      const parts = data.split("_");
      const isPaper = parts[parts.length - 1] === "paper";
      const symbol = parts.slice(1, -1).join("_");
      return this.handleSquareOffSymbol(ctx, symbol, isPaper);
    }
    if (data.startsWith("cancel_")) {
      // cancel_<id>_<mode>
      const parts = data.split("_");
      const isPaper = parts[parts.length - 1] === "paper";
      const id = parts.slice(1, -1).join("_");
      return this.handleCancelOrder(ctx, id, isPaper);
    }
    if (data.startsWith("confirm_sq_all_prompt_")) {
      return this.handleSquareOffAllPrompt(ctx);
    }
    if (data.startsWith("exec_sq_all_")) {
      const isPaper = data.endsWith("paper");
      return this.executeSquareOffAll(ctx, isPaper);
    }
    if (data === "abort_sq_all") {
      return ctx.reply("❌ Emergency square-off cancelled.", { parse_mode: "HTML" });
    }
    if (data.startsWith("exec_order_")) {
      const key = data.replace("exec_", "");
      return this.executeConfirmedOrder(ctx, key);
    }
    if (data.startsWith("abort_order_")) {
      const key = data.replace("abort_", "");
      this.pendingTradeConfirmations.delete(key);
      return ctx.reply("❌ Order aborted.", { parse_mode: "HTML" });
    }
  }

  // ============================================================================
  // PUSH NOTIFICATION DISPATCHERS
  // ============================================================================
  public async sendAlert(text: string, keyboard?: any): Promise<boolean> {
    if (!this.bot || !this.isRunning || !this.config.alertsEnabled) return false;
    if (this.config.allowedChatIds.length === 0) return false;

    let sentAny = false;
    for (const chatId of this.config.allowedChatIds) {
      try {
        await this.bot.api.sendMessage({
          chat_id: Number(chatId) || chatId,
          text,
          parse_mode: "HTML",
          reply_markup: keyboard,
        });
        sentAny = true;
      } catch (err: any) {
        console.warn(`[TELEGRAM] Failed to send alert to chat ${chatId}:`, err?.message || err);
      }
    }
    return sentAny;
  }

  public async notifyOrderEvent(event: {
    orderId: string;
    symbol: string;
    side: "BUY" | "SELL" | string;
    qty: number;
    price: number;
    status: string;
    isPaper: boolean;
    reason?: string;
  }) {
    if (!this.config.orderAlerts) return;
    const icon = event.status === "FILLED" ? "🎉" : event.status === "REJECTED" ? "❌" : "📋";
    const sideIcon = event.side === "BUY" ? "🟢" : "🔴";
    const mode = event.isPaper ? "Paper" : "REAL FYERS";

    const text =
      `${icon} <b>Order Event: ${event.status} (${mode})</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• <b>Action:</b> ${sideIcon} ${event.side} <b>${event.symbol}</b>\n` +
      `• <b>Quantity:</b> ${event.qty} | <b>Price:</b> ₹${Number(event.price || 0).toFixed(2)}\n` +
      `• <b>Order ID:</b> <code>${event.orderId}</code>\n` +
      (event.reason ? `• <b>Note:</b> <i>${event.reason}</i>\n` : "") +
      `━━━━━━━━━━━━━━━━━━━━`;

    await this.sendAlert(text);
  }

  public async notifySmartMoneyAlert(event: {
    symbol: string;
    side: string;
    volume: number;
    valueLakhs: number;
    ltp: number;
    institutionScore?: number;
  }) {
    if (!this.config.smartMoneyAlerts) return;
    const icon = event.side === "BUY" ? "🟢 INSTITUTIONAL BUY" : "🔴 INSTITUTIONAL SELL";
    const scoreStr = event.institutionScore ? ` (Score: ${event.institutionScore})` : "";

    const text =
      `🐋 <b>SMART MONEY ALERT: ${event.symbol}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• <b>Signal:</b> ${icon}${scoreStr}\n` +
      `• <b>Block Value:</b> <b>₹${event.valueLakhs.toFixed(2)} Lakhs</b>\n` +
      `• <b>Volume:</b> ${event.volume.toLocaleString("en-IN")} shares\n` +
      `• <b>Execution LTP:</b> ₹${event.ltp.toFixed(2)}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `<i>Detected by Smart Money Radar Engine</i>`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: `📊 View ${event.symbol.replace("NSE:", "").replace("-EQ", "")} Quote`, callback_data: `quote_${event.symbol}` },
        ],
      ],
    };

    await this.sendAlert(text, keyboard);
  }

  public async notifyDaemonAlert(status: "started" | "stopped" | "error", details?: string) {
    const icon = status === "started" ? "🟢" : status === "stopped" ? "⚪" : "⚠️";
    const text =
      `${icon} <b>Market Daemon Notice: ${status.toUpperCase()}</b>\n` +
      (details ? `<i>${details}</i>\n` : "") +
      `Time: ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}`;

    await this.sendAlert(text);
  }
}

export const telegramService = new TelegramService();
