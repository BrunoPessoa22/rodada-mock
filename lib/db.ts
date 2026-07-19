import Database from "better-sqlite3";
import fs from "node:fs";
import { DATA_DIR, DB_PATH, POT_DEFAULTS } from "./config";

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
  scored_at        TEXT
);

CREATE TABLE IF NOT EXISTS wallets (
  address     TEXT PRIMARY KEY,                       -- lowercase 0x…
  handle      TEXT,
  venue       TEXT,
  contact     TEXT,
  status      TEXT NOT NULL DEFAULT 'unclaimed',      -- unclaimed | verified
  identity_id TEXT,                                   -- primary address of the KYC identity this
                                                      -- wallet belongs to; NULL = its own identity.
                                                      -- Flows net per identity BEFORE the √, so
                                                      -- splitting across self-owned wallets can't
                                                      -- farm the concave curve.
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

CREATE TABLE IF NOT EXISTS index_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  match_id INTEGER,
  level    TEXT NOT NULL,
  msg      TEXT NOT NULL,
  data     TEXT
);

CREATE INDEX IF NOT EXISTS idx_scores_address ON scores(address);
CREATE INDEX IF NOT EXISTS idx_claims_status  ON claims(status);
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
}

function seedSettings(d: Database.Database) {
  const insert = d.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(POT_DEFAULTS)) insert.run(key, value);
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
