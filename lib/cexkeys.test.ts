import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCexKeyMessage,
  checkReadOnly,
  decryptSecret,
  encryptSecret,
  evaluateBinanceRestrictions,
  evaluateBitgetAuthorities,
  evaluateHtxPermission,
  evaluateOkxPerm,
  fetchBinanceFills,
  fetchBitgetFills,
  fetchHtxFills,
  fetchOkxFills,
  cexConnectEnabled,
  venueNeedsPassphrase,
} from "./cexkeys";

const ADDR = "0xAbCd000000000000000000000000000000001234";
const CREDS = { apiKey: "key-0000000000abcd", apiSecret: "secret-000000000000" };

beforeEach(() => {
  process.env.CEX_KEY_SECRET = "a".repeat(64);
});
afterEach(() => {
  delete process.env.CEX_KEY_SECRET;
  vi.unstubAllGlobals();
});

describe("feature flag", () => {
  it("is off without a well-formed master key", () => {
    delete process.env.CEX_KEY_SECRET;
    expect(cexConnectEnabled()).toBe(false);
    process.env.CEX_KEY_SECRET = "too-short";
    expect(cexConnectEnabled()).toBe(false);
    process.env.CEX_KEY_SECRET = "a".repeat(64);
    expect(cexConnectEnabled()).toBe(true);
  });
});

describe("encryption at rest", () => {
  it("round-trips and binds ciphertext to its row via AAD", () => {
    const ct = encryptSecret("my-api-secret", ADDR, "binance");
    expect(ct).not.toContain("my-api-secret");
    expect(decryptSecret(ct, ADDR, "binance")).toBe("my-api-secret");
    // Same ciphertext under another venue or address must NOT open.
    expect(() => decryptSecret(ct, ADDR, "okx")).toThrow();
    expect(() => decryptSecret(ct, "0x" + "9".repeat(40), "binance")).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const ct = encryptSecret("payload", ADDR, "okx");
    const parts = ct.split(":");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("00") ? "11" : "00");
    expect(() => decryptSecret(parts.join(":"), ADDR, "okx")).toThrow();
  });
});

describe("evaluateBinanceRestrictions — deny by default", () => {
  const readOnly = { ipRestrict: false, enableReading: true, enableSpotAndMarginTrading: false, enableWithdrawals: false, enableMargin: false, enableFutures: false };

  it("accepts a pure read-only key", () => {
    const res = evaluateBinanceRestrictions(readOnly);
    expect(res.ok).toBe(true);
  });

  it("rejects trading, withdrawals, and UNKNOWN future flags", () => {
    for (const flag of ["enableSpotAndMarginTrading", "enableWithdrawals", "enableSomeFutureThing"]) {
      const res = evaluateBinanceRestrictions({ ...readOnly, [flag]: true });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.transient).toBe(false);
        expect(res.reason).toContain(flag);
      }
    }
  });

  it("rejects a key without read permission", () => {
    const res = evaluateBinanceRestrictions({ ...readOnly, enableReading: false });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.transient).toBe(false);
  });

  it("treats garbage responses as transient, never as approval", () => {
    const res = evaluateBinanceRestrictions(null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.transient).toBe(true);
  });
});

describe("evaluateOkxPerm", () => {
  it("accepts read_only and rejects anything else, unknown perms included", () => {
    expect(evaluateOkxPerm("read_only").ok).toBe(true);
    for (const perm of ["read_only,trade", "trade", "withdraw,read_only", "read_only,some_new_perm"]) {
      const res = evaluateOkxPerm(perm);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.transient).toBe(false);
    }
  });
});

describe("evaluateBitgetAuthorities", () => {
  it("accepts exactly [readonly], rejects extras and empty, garbage is transient", () => {
    expect(evaluateBitgetAuthorities(["readonly"]).ok).toBe(true);
    for (const auth of [["readonly", "trade"], ["trade"], ["readonly", "withdraw"], []]) {
      const res = evaluateBitgetAuthorities(auth);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.transient).toBe(false);
    }
    const garbage = evaluateBitgetAuthorities(undefined);
    expect(garbage.ok).toBe(false);
    if (!garbage.ok) expect(garbage.transient).toBe(true);
  });
});

describe("evaluateHtxPermission", () => {
  it("accepts readOnly (with expiry surfaced) and rejects wider permission lists", () => {
    const ok = evaluateHtxPermission("readOnly", 62);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.perms).toContain("62d");
    for (const perm of ["readOnly,trade", "readOnly,trade,withdraw"]) {
      const res = evaluateHtxPermission(perm);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.transient).toBe(false);
    }
    const garbage = evaluateHtxPermission(undefined);
    expect(garbage.ok).toBe(false);
    if (!garbage.ok) expect(garbage.transient).toBe(true);
  });
});

describe("venueNeedsPassphrase", () => {
  it("OKX and Bitget need one; Binance and HTX do not", () => {
    expect(venueNeedsPassphrase("okx")).toBe(true);
    expect(venueNeedsPassphrase("bitget")).toBe(true);
    expect(venueNeedsPassphrase("binance")).toBe(false);
    expect(venueNeedsPassphrase("htx")).toBe(false);
  });
});

describe("buildCexKeyMessage", () => {
  it("names the venue, key tail, wallet and nonce the user signs for", () => {
    const msg = buildCexKeyMessage("attach", "okx", ADDR, "cd12", "nonce123");
    expect(msg).toContain("READ-ONLY");
    expect(msg).toContain("OKX");
    expect(msg).toContain("cd12");
    expect(msg).toContain(ADDR.toLowerCase());
    expect(msg).toContain("Action: attach-cex");
    expect(msg).toContain("Nonce: nonce123");
    const revoke = buildCexKeyMessage("revoke", "binance", ADDR, "cd12", "n2");
    expect(revoke).toContain("Action: revoke-cex");
    expect(revoke).toContain("I revoke");
  });
});

describe("checkReadOnly over the wire", () => {
  it("binance: 200 + restrictions → verdict from the payload", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ enableReading: true, enableWithdrawals: false }), { status: 200 })
    );
    const res = await checkReadOnly("binance", CREDS);
    expect(res.ok).toBe(true);
  });

  it("binance: auth failure is definitive, 5xx is transient", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ code: -2014, msg: "API-key format invalid." }), { status: 401 })
    );
    const auth = await checkReadOnly("binance", CREDS);
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.transient).toBe(false);

    vi.stubGlobal("fetch", async () => new Response("oops", { status: 503 }));
    const down = await checkReadOnly("binance", CREDS);
    expect(down.ok).toBe(false);
    if (!down.ok) expect(down.transient).toBe(true);
  });

  it("clock skew is transient on both venues — must never auto-revoke", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ code: -1021, msg: "Timestamp outside recvWindow." }), {
        status: 400,
      })
    );
    const b = await checkReadOnly("binance", CREDS);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.transient).toBe(true);

    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ code: "50102", msg: "Timestamp expired" }), { status: 401 })
    );
    const o = await checkReadOnly("okx", { ...CREDS, passphrase: "p" });
    expect(o.ok).toBe(false);
    if (!o.ok) expect(o.transient).toBe(true);
  });

  it("okx: perm string decides; network errors are transient", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ code: "0", data: [{ perm: "read_only,trade" }] }), { status: 200 })
    );
    const res = await checkReadOnly("okx", { ...CREDS, passphrase: "p" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.transient).toBe(false);

    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNRESET");
    });
    const net = await checkReadOnly("okx", { ...CREDS, passphrase: "p" });
    expect(net.ok).toBe(false);
    if (!net.ok) expect(net.transient).toBe(true);
  });
});

describe("fills aggregation", () => {
  const listing = { inst: "PSGUSDT", quote: "USDT" };

  it("binance: sums buys and sells separately and paginates full pages by time", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      quoteQty: "1.5",
      isBuyer: i % 2 === 0,
      time: 1000 + i,
    }));
    const page2 = [{ quoteQty: "10", isBuyer: false, time: 3000 }];
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string | URL) => {
      calls.push(String(url));
      return new Response(JSON.stringify(calls.length === 1 ? page1 : page2), { status: 200 });
    });
    const agg = await fetchBinanceFills(CREDS, listing, 0, 10_000);
    expect(agg.trades).toBe(1001);
    expect(agg.buyQuote).toBeCloseTo(500 * 1.5);
    expect(agg.sellQuote).toBeCloseTo(500 * 1.5 + 10);
    // Second request must start past the last fill of page 1.
    expect(calls[1]).toContain("startTime=2000");
  });

  it("okx: computes quote value from px×sz and paginates with the billId cursor", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      billId: String(9000 - i),
      side: "buy",
      fillPx: "2",
      fillSz: "3",
    }));
    const page2 = [{ billId: "100", side: "sell", fillPx: "4", fillSz: "5" }];
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string | URL) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({ code: "0", data: calls.length === 1 ? page1 : page2 }),
        { status: 200 }
      );
    });
    const agg = await fetchOkxFills({ ...CREDS, passphrase: "p" }, { inst: "PSG-USDT", quote: "USDT" }, 0, 10_000);
    expect(agg.trades).toBe(101);
    expect(agg.buyQuote).toBeCloseTo(100 * 6);
    expect(agg.sellQuote).toBeCloseTo(20);
    expect(calls[1]).toContain("after=8901");
  });

  it("binance: a non-200 page throws instead of undercounting silently", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 418 }));
    await expect(fetchBinanceFills(CREDS, listing, 0, 1000)).rejects.toThrow("HTTP 418");
  });

  it("bitget: uses the quote-value amount field and pages with idLessThan", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      tradeId: String(5000 - i),
      side: i % 2 === 0 ? "buy" : "sell",
      amount: "2.5",
    }));
    const page2 = [{ tradeId: "10", side: "buy", amount: "7" }];
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string | URL) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({ code: "00000", data: calls.length === 1 ? page1 : page2 }),
        { status: 200 }
      );
    });
    const agg = await fetchBitgetFills(
      { ...CREDS, passphrase: "p" },
      { inst: "PSGUSDT", quote: "USDT" },
      0,
      10_000
    );
    expect(agg.trades).toBe(101);
    expect(agg.buyQuote).toBeCloseTo(50 * 2.5 + 7);
    expect(agg.sellQuote).toBeCloseTo(50 * 2.5);
    expect(calls[1]).toContain("idLessThan=4901");
  });

  it("htx: walks the window in 48h slices and derives side from the type prefix", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string | URL) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({
          status: "ok",
          data: [
            { price: "2", "filled-amount": "3", type: "buy-limit" },
            { price: "4", "filled-amount": "1", type: "sell-market" },
          ],
        }),
        { status: 200 }
      );
    });
    const H48 = 48 * 3600 * 1000;
    const agg = await fetchHtxFills(CREDS, { inst: "psgusdt", quote: "USDT" }, 0, H48 + 3600_000);
    // 60h span → two slices: [0, 48h] and [48h, 49h].
    expect(calls.length).toBe(2);
    expect(decodeURIComponent(calls[0])).toContain(`end-time=${H48}`);
    expect(decodeURIComponent(calls[1])).toContain(`start-time=${H48}`);
    expect(agg.trades).toBe(4);
    expect(agg.buyQuote).toBeCloseTo(2 * 6);
    expect(agg.sellQuote).toBeCloseTo(2 * 4);
  });
});
