import Database from "better-sqlite3";
import fs from "node:fs";
import { ACTIVE_SEASON_DEFAULT, DATA_DIR, DB_PATH, POT_DEFAULTS, PRESEASON } from "./config";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  slug             TEXT NOT NULL UNIQUE,
  home             TEXT NOT NULL,
  away             TEXT NOT NULL,
  competition      TEXT NOT NULL,
  kickoff_utc      TEXT NOT NULL,
  window_start_utc TEXT NOT NULL,
  window_end_utc   TEXT NOT NULL,
  featured         INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | live | scored
  tokens           TEXT NOT NULL,                     -- JSON array of token symbols counted
  pool_chz         INTEGER NOT NULL DEFAULT 0,
  chz_usd          REAL,
  scored_at        TEXT,
  season           TEXT                               -- season this match's points belong to.
                                                      -- The public board only ever shows ONE
                                                      -- season (settings.active_season), so a
                                                      -- scoring-rule change retires the old board
                                                      -- into an archive instead of silently
                                                      -- mixing two formulas in one table.
);

CREATE TABLE IF NOT EXISTS wallets (
  address     TEXT PRIMARY KEY,                       -- lowercase 0x…
  handle      TEXT,
  venue       TEXT,
  contact     TEXT,
  status      TEXT NOT NULL DEFAULT 'unclaimed',      -- unclaimed | verified
  identity_id TEXT,                                   -- primary address of the KYC identity this
                                                      -- wallet belongs to; NULL = its own identity.
                                                      -- Flows net per identity BEFORE the formula,
                                                      -- so splitting across self-owned wallets can't
                                                      -- farm the volume unlock or PnL% denominator.
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS claims (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  address    TEXT NOT NULL,
  handle     TEXT NOT NULL,
  venue      TEXT,
  contact    TEXT,
  status     TEXT NOT NULL DEFAULT 'pending',        -- pending | approved | rejected
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS scores (
  match_id       INTEGER NOT NULL REFERENCES matches(id),
  address        TEXT NOT NULL,
  gross_buy_usd  REAL NOT NULL DEFAULT 0,
  gross_sell_usd REAL NOT NULL DEFAULT 0,
  net_taker_usd  REAL NOT NULL DEFAULT 0,            -- signed: buys − sells
  maker_add_usd  REAL NOT NULL DEFAULT 0,            -- net liquidity added, floored at 0
  swaps          INTEGER NOT NULL DEFAULT 0,
  points         REAL NOT NULL DEFAULT 0,
  provisional    INTEGER NOT NULL DEFAULT 1,
  updated_at     TEXT,
  PRIMARY KEY (match_id, address)
);

CREATE TABLE IF NOT EXISTS claim_nonces (
  nonce      TEXT PRIMARY KEY,
  address    TEXT NOT NULL,
  handle     TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS venue_volume (
  match_id   INTEGER NOT NULL REFERENCES matches(id),
  source     TEXT NOT NULL,                            -- cex:binance | solana:meteora | base:aerodrome…
  venue      TEXT NOT NULL,                            -- binance | okx | gate | meteora | aerodrome…
  chain      TEXT,                                     -- NULL for CEX; solana | base for on-chain
  token      TEXT NOT NULL,                            -- league symbol (MENGO, BAR…)
  inst       TEXT NOT NULL,                            -- exchange pair OR pool address
  quote      TEXT NOT NULL,                            -- explicit quote asset (USDT, BRL, USDC…)
  quote_usd  REAL NOT NULL DEFAULT 0,                  -- window volume in USD
  trades     INTEGER NOT NULL DEFAULT 0,               -- 0 where the venue doesn't expose counts
  updated_at TEXT,
  PRIMARY KEY (match_id, source, inst)                 -- source in the PK: the same inst string
                                                       -- exists on several venues (PSGUSDT is
                                                       -- Binance, MEXC and Bitget)
);

CREATE TABLE IF NOT EXISTS index_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  match_id INTEGER,
  level    TEXT NOT NULL,
  msg      TEXT NOT NULL,
  data     TEXT
);

CREATE TABLE IF NOT EXISTS payouts (
  scope       TEXT NOT NULL,                         -- match slug, or 'season'
  address     TEXT NOT NULL,                         -- identity primary wallet (full)
  handle      TEXT NOT NULL,
  points      REAL NOT NULL DEFAULT 0,
  chz         REAL NOT NULL DEFAULT 0,               -- pro-rata CHZ owed
  computed_at TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'computed',      -- computed | paid
  tx_hash     TEXT,                                  -- set when disbursed on-chain
  PRIMARY KEY (scope, address)
);

CREATE TABLE IF NOT EXISTS cex_keys (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  address        TEXT NOT NULL,                      -- verified wallet this key is bound to
  venue          TEXT NOT NULL,                      -- binance | okx
  api_key_enc    TEXT NOT NULL,                      -- AES-256-GCM, AAD = venue|address
  api_secret_enc TEXT NOT NULL,
  passphrase_enc TEXT,                               -- OKX only
  key_last4      TEXT NOT NULL,                      -- shown in UI + signed message; never the key
  status         TEXT NOT NULL DEFAULT 'verified',   -- verified | invalid (auto-revoked)
  perms          TEXT,                               -- venue's own permission readout at last check
  last_error     TEXT,
  last_checked_at TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(address, venue)                             -- one key per venue per wallet; attach replaces
);

CREATE TABLE IF NOT EXISTS cexkey_nonces (
  nonce      TEXT PRIMARY KEY,
  address    TEXT NOT NULL,
  venue      TEXT NOT NULL,
  action     TEXT NOT NULL,                          -- attach | revoke
  key_last4  TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS keyed_cex_volume (
  match_id   INTEGER NOT NULL REFERENCES matches(id),
  address    TEXT NOT NULL,
  venue      TEXT NOT NULL,
  token      TEXT NOT NULL,
  inst       TEXT NOT NULL,
  buy_usd    REAL NOT NULL DEFAULT 0,                -- window fills, quote converted to USD
  sell_usd   REAL NOT NULL DEFAULT 0,
  trades     INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  PRIMARY KEY (match_id, address, venue, inst)
);

CREATE INDEX IF NOT EXISTS idx_scores_address ON scores(address);
CREATE INDEX IF NOT EXISTS idx_claims_status  ON claims(status);
CREATE INDEX IF NOT EXISTS idx_keyed_cex_addr ON keyed_cex_volume(address);
`;

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  seedSettings(db);
  return db;
}

/**
 * Additive, idempotent migrations for DBs created before a column existed.
 * CREATE TABLE IF NOT EXISTS never alters an existing table, so new columns
 * have to be added by hand here.
 */
function migrate(d: Database.Database) {
  const cols = (table: string): Set<string> =>
    new Set((d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
  if (!cols("wallets").has("identity_id")) {
    d.exec("ALTER TABLE wallets ADD COLUMN identity_id TEXT");
  }
  if (!cols("matches").has("frozen_prices")) {
    // JSON map { pairAddress: wchzPerTokenWei } captured at finalization so a
    // rescore of a scored match reproduces the same inventory marks.
    d.exec("ALTER TABLE matches ADD COLUMN frozen_prices TEXT");
  }
  if (!cols("matches").has("season")) {
    // Every match that predates the column was scored under the RETIRED
    // Jul-2026 formula (points = 2·√|net taker USD|), which the current
    // profit-only rules cannot reproduce — and whose inventory marks were
    // never frozen, so a rescore would re-price July flow at today's
    // reserves. Those boards are archived as a preseason, never mixed into
    // the live season and never payable. See docs/preseason.md.
    d.exec("ALTER TABLE matches ADD COLUMN season TEXT");
    d.prepare("UPDATE matches SET season = ? WHERE season IS NULL").run(PRESEASON);
  }
  // cex_volume → venue_volume: the multi-venue layer generalizes the old
  // CEX-only table (adds source/chain/quote, and puts source in the PK because
  // inst strings collide across venues). Legacy rows were only ever Binance
  // (SYMBOLUSDT/SYMBOLTRY) and OKX (SYM-QUOTE), so the quote backfill below is
  // exhaustive; anything unrecognized keeps quote 'USD?' and its stored USD
  // total, which is all the display layer reads.
  const hasLegacyCex = (
    d
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cex_volume'")
      .get() as { name: string } | undefined
  )?.name;
  if (hasLegacyCex) {
    const legacyQuote = (inst: string): string => {
      if (inst.includes("-")) return inst.split("-")[1] ?? "USD?";
      const m = inst.match(/(USDT|USDC|TRY)$/);
      return m ? m[1] : "USD?";
    };
    const rows = d.prepare("SELECT * FROM cex_volume").all() as {
      match_id: number;
      venue: string;
      token: string;
      inst: string;
      quote_usd: number;
      trades: number;
      updated_at: string | null;
    }[];
    const insert = d.prepare(
      `INSERT OR IGNORE INTO venue_volume (match_id, source, venue, chain, token, inst, quote, quote_usd, trades, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`
    );
    const copyAndDrop = d.transaction(() => {
      for (const r of rows) {
        insert.run(
          r.match_id,
          `cex:${r.venue}`,
          r.venue,
          r.token,
          r.inst,
          legacyQuote(r.inst),
          r.quote_usd,
          r.trades,
          r.updated_at
        );
      }
      d.exec("DROP TABLE cex_volume");
    });
    copyAndDrop();
  }
}

/**
 * Online SQLite backup into DATA_DIR/backups, pruned to the newest 14 files.
 * Runs from the indexer loop once a day; a failed backup must never take the
 * indexer down, so callers catch.
 */
export async function backupDb(): Promise<string> {
  const dir = `${DATA_DIR}/backups`;
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const file = `${dir}/rodada-${stamp}.db`;
  await getDb().backup(file);
  const keep = 14;
  const backups = fs
    .readdirSync(dir)
    .filter((f) => /^rodada-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - keep))) {
    fs.rmSync(`${dir}/${old}`);
  }
  return file;
}

function seedSettings(d: Database.Database) {
  const insert = d.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(POT_DEFAULTS)) insert.run(key, value);
  // funding_verified: '1' only once a real, funded prize source is confirmed —
  // gates the "Funding verified" badge so the UI never claims funding it lacks.
  insert.run("funding_verified", "0");
  // season_pool_chz: the CHZ actually committed to the season board's pro-rata
  // projection when no single match is active. 0 until funded.
  insert.run("season_pool_chz", "0");
  // active_season: the ONLY season the public board reads. Matches created from
  // the admin console inherit it; anything from an earlier season is archive.
  insert.run("active_season", ACTIVE_SEASON_DEFAULT);
}

export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, value);
}

export function logIndex(level: "info" | "warn" | "error", msg: string, matchId?: number, data?: unknown): void {
  getDb()
    .prepare("INSERT INTO index_log (match_id, level, msg, data) VALUES (?, ?, ?, ?)")
    .run(matchId ?? null, level, msg, data === undefined ? null : JSON.stringify(data));
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, matchId, data }));
}
