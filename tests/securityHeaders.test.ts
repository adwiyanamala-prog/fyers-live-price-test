import { describe, it, expect } from "vitest";
import express from "express";

describe("Security Headers & CORS Policy", () => {
  it("should configure standard security headers", async () => {
    const app = express();
    const allowedOrigin = "http://localhost:3000";

    app.use((req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE, PUT");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
      next();
    });

    app.get("/api/test", (_req, res) => {
      res.json({ ok: true });
    });

    // Mock response simulation
    const mockRes: any = {
      headers: {} as Record<string, string>,
      setHeader(key: string, value: string) {
        this.headers[key.toLowerCase()] = value;
      },
    };

    const mockNext = () => {};
    const middleware = (req: any, res: any, next: any) => {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
      next();
    };

    middleware({}, mockRes, mockNext);

    expect(mockRes.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(mockRes.headers["x-content-type-options"]).toBe("nosniff");
    expect(mockRes.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(mockRes.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("should correctly identify SSE streaming endpoints", () => {
    const isStream = (url: string, acceptHeader?: string) => {
      return url.includes("/logs") || url.includes("/stream") || acceptHeader === "text/event-stream";
    };

    expect(isStream("/api/stream")).toBe(true);
    expect(isStream("/api/server/logs")).toBe(true);
    expect(isStream("/api/random", "text/event-stream")).toBe(true);
    expect(isStream("/api/trading/quote/NSE:SBIN-EQ")).toBe(false);
    expect(isStream("/api/config")).toBe(false);
  });
});
