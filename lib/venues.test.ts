import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { listingProblems, sumHtxKlines, sumMbCandles, CEX_LISTINGS, CEX_VENUE_LABEL, VENUE_TRADE_URL, venuesForTokens, type CexVenue } from "./cex";
import { dexPoolProblems, sumOhlcvUsd, DEX_POOLS, type OhlcvRow } from "./dexvol";

describe("CEX listings config", () => {
  it("has no unknown tokens, duplicate insts or unknown quotes", () => {
    expect(listingProblems()).toEqual([]);
  });

  it("every listed venue has a label and a trade URL builder", () => {
    for (const venues of Object.values(CEX_LISTINGS)) {
      for (const venue of Object.keys(venues) as CexVenue[]) {
        expect(CEX_VENUE_LABEL[venue]).toBeTruthy();
        const inst = venues[venue]![0].inst;
        expect(VENUE_TRADE_URL[venue](inst)).toMatch(/^https:\/\//);
      }
    }
  });

  it("venuesForTokens unions venues across tokens without duplicates", () => {
    const venues = venuesForTokens(["PSG", "MENGO"]);
    expect(new Set(venues).size).toBe(venues.length);
    expect(venues).toContain("binance");
    expect(venues).toContain("okx");
    expect(venues).toContain("mercadobitcoin");
    expect(venuesForTokens(["SPAIN"])).toEqual([]); // Chiliz + Solana only
  });
});

describe("venue brand directory", () => {
  it("every directory entry points at a logo file that exists in public/", async () => {
    const { existsSync } = await import("node:fs");
    const { venueDirectory, venueLogoForSource } = await import("./venuebrand");
    const rows = venueDirectory();
    expect(rows.length).toBeGreaterThanOrEqual(11); // Kayen + 8 CEXs + Solana + Base
    expect(rows[0]).toMatchObject({ key: "kayen", scored: true });
    for (const row of rows) {
      expect(row.url).toMatch(/^https:\/\//);
      expect(existsSync(join(process.cwd(), "public", row.logo))).toBe(true);
    }
    // Every source the volume layer can write resolves to a logo.
    for (const source of ["chiliz", "cex:binance", "cex:mercadobitcoin", "solana:meteora", "base:aerodrome"]) {
      const logo = venueLogoForSource(source);
      expect(logo, source).toBeTruthy();
      expect(existsSync(join(process.cwd(), "public", logo!))).toBe(true);
    }
  });
});

describe("DEX pool registry", () => {
  it("has no unknown tokens, duplicate or malformed pools", () => {
    expect(dexPoolProblems()).toEqual([]);
  });

  it("covers Solana and Base", () => {
    const networks = new Set(DEX_POOLS.map((p) => p.network));
    expect(networks).toContain("solana");
    expect(networks).toContain("base");
  });
});

describe("window summers", () => {
  it("sumHtxKlines counts only candles opening inside the window", () => {
    const rows = [
      { id: 1000, vol: 100, count: 5 }, // before
      { id: 2000, vol: 40, count: 2 }, // inside
      { id: 2500, vol: 60, count: 3 }, // inside
      { id: 4000, vol: 999, count: 9 }, // after
    ];
    const { quoteVol, trades } = sumHtxKlines(rows, 2_000_000, 3_000_000);
    expect(quoteVol).toBe(100);
    expect(trades).toBe(5);
  });

  it("sumMbCandles approximates quote volume as base × close inside the window", () => {
    const candles = {
      t: [100, 200, 300],
      c: ["2.0", "3.0", "4.0"],
      v: ["10", "10", "10"],
    };
    // window covers t=200 only
    const { quoteVol } = sumMbCandles(candles, 150_000, 250_000);
    expect(quoteVol).toBe(30);
  });

  it("sumOhlcvUsd sums the USD volume column inside the window", () => {
    const rows: OhlcvRow[] = [
      [3000, 1, 1, 1, 1, 50], // after
      [2000, 1, 1, 1, 1, 20], // inside
      [1500, 1, 1, 1, 1, 30], // inside (boundary: start is inclusive)
      [1000, 1, 1, 1, 1, 99], // before
    ];
    expect(sumOhlcvUsd(rows, 1_500_000, 2_500_000)).toBe(50);
  });
});

describe("venue_volume migration", () => {
  let dataDir: string;

  beforeAll(() => {
    dataDir = mkdtempSync(join(tmpdir(), "rodada-venues-"));
    process.env.DATA_DIR = dataDir;
    // The static ./cex import above already chain-loaded ./config with the
    // REAL cwd DATA_DIR baked in. Reset the module registry so the dynamic
    // import("./db") below re-evaluates config against the temp dir — without
    // this, getDb() opens (and migrates) the developer's local data/rodada.db.
    vi.resetModules();
  });

  afterAll(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("copies legacy cex_volume rows into venue_volume and drops the old table", async () => {
    // Build a legacy-shaped DB by hand, then let getDb() migrate it.
    const Database = (await import("better-sqlite3")).default;
    const raw = new Database(join(dataDir, "rodada.db"));
    raw.exec(`
      CREATE TABLE matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE,
        home TEXT NOT NULL, away TEXT NOT NULL, competition TEXT NOT NULL,
        kickoff_utc TEXT NOT NULL, window_start_utc TEXT NOT NULL, window_end_utc TEXT NOT NULL,
        featured INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'scheduled',
        tokens TEXT NOT NULL, pool_chz INTEGER NOT NULL DEFAULT 0, chz_usd REAL, scored_at TEXT
      );
      CREATE TABLE cex_volume (
        match_id INTEGER NOT NULL, venue TEXT NOT NULL, token TEXT NOT NULL,
        inst TEXT NOT NULL, quote_usd REAL NOT NULL DEFAULT 0,
        trades INTEGER NOT NULL DEFAULT 0, updated_at TEXT,
        PRIMARY KEY (match_id, inst)
      );
      INSERT INTO matches (slug, home, away, competition, kickoff_utc, window_start_utc, window_end_utc, tokens)
        VALUES ('m1', 'A', 'B', 'Cup', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T02:00:00Z', '["PSG"]');
      INSERT INTO cex_volume VALUES (1, 'binance', 'PSG', 'PSGTRY', 123.45, 7, '2026-01-01T01:00:00Z');
      INSERT INTO cex_volume VALUES (1, 'okx', 'MENGO', 'MENGO-USDT', 67.8, 0, '2026-01-01T01:00:00Z');
    `);
    raw.close();

    const { getDb } = await import("./db");
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM venue_volume ORDER BY source")
      .all() as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      source: "cex:binance",
      venue: "binance",
      chain: null,
      inst: "PSGTRY",
      quote: "TRY",
      quote_usd: 123.45,
      trades: 7,
    });
    expect(rows[1]).toMatchObject({ source: "cex:okx", inst: "MENGO-USDT", quote: "USDT" });
    const legacy = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cex_volume'")
      .get();
    expect(legacy).toBeUndefined();
    db.close();
  });
});
