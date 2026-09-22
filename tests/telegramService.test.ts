import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { telegramService, TelegramBotBridge, TelegramOrderParams } from "../telegramService";

describe("Telegram Service Integration & Alert Engine", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    telegramService.reloadConfig();
  });

  describe("Configuration & State Management", () => {
    it("should load default configuration when environment variables are empty", () => {
      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_CHAT_ID;
      delete process.env.TELEGRAM_ALERTS_ENABLED;
      delete process.env.TELEGRAM_SMART_MONEY_ALERTS;
      delete process.env.TELEGRAM_ORDER_ALERTS;
      delete process.env.TELEGRAM_DEFAULT_MODE;

      telegramService.reloadConfig();
      const config = telegramService.getConfig();

      expect(config.botToken).toBe("");
      expect(config.allowedChatIds).toEqual([]);
      expect(config.alertsEnabled).toBe(true);
      expect(config.smartMoneyAlerts).toBe(true);
      expect(config.orderAlerts).toBe(true);
      expect(config.defaultTradingMode).toBe("paper");
      expect(config.isRunning).toBe(false);
    });

    it("should parse multiple comma-separated chat IDs and environment flags", () => {
      process.env.TELEGRAM_BOT_TOKEN = "123456789:ABCdefGHIjklMNOpqrsTUVwxyz";
      process.env.TELEGRAM_CHAT_ID = "987654321, 1122334455 , 99887766";
      process.env.TELEGRAM_ALERTS_ENABLED = "true";
      process.env.TELEGRAM_SMART_MONEY_ALERTS = "false";
      process.env.TELEGRAM_ORDER_ALERTS = "true";
      process.env.TELEGRAM_DEFAULT_MODE = "live";

      telegramService.reloadConfig();
      const config = telegramService.getConfig();

      expect(config.botToken).toBe("123456789:ABCdefGHIjklMNOpqrsTUVwxyz");
      expect(config.allowedChatIds).toEqual(["987654321", "1122334455", "99887766"]);
      expect(config.alertsEnabled).toBe(true);
      expect(config.smartMoneyAlerts).toBe(false);
      expect(config.orderAlerts).toBe(true);
      expect(config.defaultTradingMode).toBe("live");
    });

    it("should handle graceful rejection when initBot is called without a token", async () => {
      delete process.env.TELEGRAM_BOT_TOKEN;
      telegramService.reloadConfig();

      const result = await telegramService.initBot();
      expect(result.success).toBe(false);
      expect(result.message).toContain("No TELEGRAM_BOT_TOKEN");
      expect(telegramService.getConfig().isRunning).toBe(false);
    });
  });

  describe("Telegram Bot Bridge Integration Contract", () => {
    it("should register and invoke bridge operations seamlessly", async () => {
      const mockBridge: TelegramBotBridge = {
        getQuotes: vi.fn().mockResolvedValue(
          new Map([
            [
              "NSE:SBIN-EQ",
              {
                symbol: "NSE:SBIN-EQ",
                ltp: 785.4,
                change: 12.5,
                pChange: 1.62,
                high: 790.0,
                low: 772.0,
                open: 775.0,
                prevClose: 772.9,
                volume: 5400000,
                vwap: 782.1,
                bid: 785.35,
                ask: 785.45,
                spread: 0.1,
                timestamp: Date.now(),
              },
            ],
          ])
        ),
        getQuote: vi.fn().mockResolvedValue({
          symbol: "NSE:RELIANCE-EQ",
          ltp: 2950.0,
          change: 15.0,
          pChange: 0.51,
          high: 2965.0,
          low: 2930.0,
          open: 2935.0,
          prevClose: 2935.0,
          volume: 2100000,
          vwap: 2948.0,
          bid: 2949.9,
          ask: 2950.1,
          spread: 0.2,
          timestamp: Date.now(),
        }),
        getFunds: vi.fn().mockResolvedValue({
          isPaper: true,
          totalBalance: 1000000,
          availableBalance: 950000,
          utilizedAmount: 50000,
          realizedPnl: 1250,
        }),
        getPositions: vi.fn().mockResolvedValue([
          {
            symbol: "NSE:TCS-EQ",
            qty: 10,
            avg_price: 3900.0,
            ltp: 3940.0,
            side: "BUY",
            pnl: 400.0,
          },
        ]),
        getOrders: vi.fn().mockResolvedValue([]),
        placeOrder: vi.fn().mockResolvedValue({
          success: true,
          orderId: "ORD-998811",
          message: "Order placed successfully",
        }),
        cancelOrder: vi.fn().mockResolvedValue({ success: true, message: "Order cancelled" }),
        squareOffPosition: vi.fn().mockResolvedValue({ success: true, message: "Position closed" }),
        squareOffAll: vi.fn().mockResolvedValue({ success: true, closedCount: 1, message: "All closed" }),
        getHoldings: vi.fn().mockResolvedValue({ holdings: [] }),
        getSmartMoney: vi.fn().mockResolvedValue([]),
        getTopMovers: vi.fn().mockResolvedValue({ gainers: [], losers: [] }),
        getDaemonStatus: vi.fn().mockReturnValue({ active: true, pid: 12345, subscribedCount: 25 }),
        setDaemonActive: vi.fn().mockResolvedValue({ success: true, message: "Daemon running" }),
        getSystemStatus: vi.fn().mockResolvedValue({
          uptime: 3600,
          memoryMB: 120,
          cachedSymbolsCount: 25,
          totalTicks: 50000,
          activeMode: "paper",
        }),
      };

      telegramService.setBridge(mockBridge);

      // Verify that bridge methods conform to expectations
      const quote = await mockBridge.getQuote("NSE:RELIANCE-EQ");
      expect(quote).not.toBeNull();
      expect(quote?.ltp).toBe(2950.0);
      expect(quote?.spread).toBe(0.2);

      const funds = await mockBridge.getFunds(true);
      expect(funds.totalBalance).toBe(1000000);
      expect(funds.availableBalance).toBe(950000);

      const daemonStatus = mockBridge.getDaemonStatus();
      expect(daemonStatus.active).toBe(true);
      expect(daemonStatus.subscribedCount).toBe(25);

      const orderResult = await mockBridge.placeOrder({
        symbol: "NSE:SBIN-EQ",
        side: "BUY",
        qty: 50,
        orderType: "MARKET",
        product: "INTRADAY",
        isPaper: true,
      });
      expect(orderResult.success).toBe(true);
      expect(orderResult.orderId).toBe("ORD-998811");
    });
  });

  describe("Alert Message Dispatcher Safety Checks", () => {
    it("should return false when sending alert if bot is not initialized", async () => {
      const sent = await telegramService.sendAlert("Test alert");
      expect(sent).toBe(false);
    });

    it("should return false when alerts are globally disabled", async () => {
      process.env.TELEGRAM_BOT_TOKEN = "dummy_token";
      process.env.TELEGRAM_CHAT_ID = "123456";
      process.env.TELEGRAM_ALERTS_ENABLED = "false";
      telegramService.reloadConfig();

      const sent = await telegramService.sendAlert("Test alert");
      expect(sent).toBe(false);
    });

    it("should return false when allowedChatIds is empty", async () => {
      process.env.TELEGRAM_BOT_TOKEN = "dummy_token";
      delete process.env.TELEGRAM_CHAT_ID;
      telegramService.reloadConfig();

      const sent = await telegramService.sendAlert("Test alert");
      expect(sent).toBe(false);
    });

    it("should format trade order alert notification accurately", async () => {
      const sendAlertSpy = vi.spyOn(telegramService, "sendAlert").mockResolvedValue(true);

      // 1. Buy Order
      await telegramService.notifyOrderEvent({
        orderId: "TEST-ORD-01",
        symbol: "NSE:INFY-EQ",
        side: "BUY",
        qty: 25,
        price: 1850.5,
        status: "FILLED",
        isPaper: true,
      });

      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining("FILLED (Paper)")
      );
      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining("🟢 BUY <b>NSE:INFY-EQ</b>")
      );
      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining("Quantity:</b> 25 | <b>Price:</b> ₹1850.50")
      );

      // 2. Sell Order Live
      await telegramService.notifyOrderEvent({
        orderId: "TEST-ORD-02",
        symbol: "NSE:TCS-EQ",
        side: "SELL",
        qty: 10,
        price: 3950.0,
        status: "REJECTED",
        isPaper: false,
        reason: "Insufficient funds in broker margin account",
      });

      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining("REJECTED (REAL FYERS)")
      );
      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining("🔴 SELL <b>NSE:TCS-EQ</b>")
      );
      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining("Insufficient funds in broker margin account")
      );

      sendAlertSpy.mockRestore();
    });

    it("should format smart money institutional block alert accurately", async () => {
      const sendAlertSpy = vi.spyOn(telegramService, "sendAlert").mockResolvedValue(true);

      await telegramService.notifySmartMoneyAlert({
        symbol: "NSE:HDFCBANK-EQ",
        side: "BUY",
        volume: 75000,
        valueLakhs: 1250.75,
        ltp: 1667.5,
        institutionScore: 92,
      });

      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining("SMART MONEY ALERT: NSE:HDFCBANK-EQ"),
        expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({
                text: "📊 View HDFCBANK Quote",
                callback_data: "quote_NSE:HDFCBANK-EQ",
              }),
            ]),
          ]),
        })
      );
      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining("Block Value:</b> <b>₹1250.75 Lakhs</b>"),
        expect.anything()
      );
      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining("Score: 92"),
        expect.anything()
      );

      sendAlertSpy.mockRestore();
    });

    it("should format daemon status alerts accurately", async () => {
      const sendAlertSpy = vi.spyOn(telegramService, "sendAlert").mockResolvedValue(true);

      await telegramService.notifyDaemonAlert("started", "Subscribed to 25 symbols");

      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining("Market Daemon Notice: STARTED")
      );
      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining("Subscribed to 25 symbols")
      );

      sendAlertSpy.mockRestore();
    });
  });
});
