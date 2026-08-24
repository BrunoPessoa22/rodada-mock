/**
 * Read-only exchange connections — the per-trader CEX attribution layer.
 *
 * A player binds a READ-ONLY API key to their verified wallet with the same
 * signature ritual as claiming: challenge → personal_sign → verify. The server
 * then proves the key is read-only against the exchange's OWN permission
 * endpoint before storing anything, and re-proves it on every collection run —
 * a key that gains trade or withdraw rights after connecting is auto-revoked.
 *
 * Compliance posture this file enforces (do not weaken any of these):
 *   - REJECT any key that can trade, withdraw or transfer. Deny-by-default:
 *     a Binance permission flag we've never seen counts as a reason to reject.
 *   - The league never sends an order and never holds funds. This module has
 *     no POST paths to any exchange — signed GETs only.
 *   - Secrets are AES-256-GCM encrypted at rest (CEX_KEY_SECRET env), bound
 *     to their row via AAD, and never logged (log venue + last4 only).
 *   - Data minimization: we read fills ONLY for league pairs, ONLY inside
 *     match windows. Disconnecting deletes the credentials immediately.
 *   - Keyed volume is DISPLAY/attribution data. It must not touch scoring.ts:
 *     scored CEX flow is a season-roll + counsel decision (see docs/preseason.md).
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { getDb, logIndex } from "./db";
import { CEX_LISTINGS, quoteUsdRate, type CexListing } from "./cex";
import type { MatchRow } from "./queries";

/** Venues that support keyed read-only connections today. */
export const KEYED_VENUES = ["binance", "okx"] as const;
export type KeyedVenue = (typeof KEYED_VENUES)[number];

export const KEYED_VENUE_LABEL: Record<KeyedVenue, string> = {
  binance: "Binance",
  okx: "OKX",
};

/** Where the user creates the key — deep link, never the venue homepage. */
export const VENUE_API_PAGE: Record<KeyedVenue, string> = {
  binance: "https://www.binance.com/en/my/settings/api-management",
  okx: "https://www.okx.com/account/my-api",
};

export function isKeyedVenue(v: unknown): v is KeyedVenue {
  return typeof v === "string" && (KEYED_VENUES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Encryption at rest
// ---------------------------------------------------------------------------

/**
 * 32-byte hex master key. Read per call (not module load) so tests and env
 * rotation behave; absence disables the whole feature — endpoints answer 503
 * and the UI explains itself, same pattern as WC_PROJECT_ID.
 */
function masterKey(): Buffer | null {
  const hex = process.env.CEX_KEY_SECRET ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  return Buffer.from(hex, "hex");
}

export function cexConnectEnabled(): boolean {
  return masterKey() !== null;
}

/** AAD binds a ciphertext to its row — a value copied to another row won't open. */
function aadFor(address: string, venue: string): Buffer {
  return Buffer.from(`${venue}|${address.toLowerCase()}`);
}

export function encryptSecret(plain: string, address: string, venue: string): string {
  const key = masterKey();
  if (!key) throw new Error("CEX_KEY_SECRET not configured");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aadFor(address, venue));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${ct.toString("hex")}`;
}

export function decryptSecret(stored: string, address: string, venue: string): string {
  const key = masterKey();
  if (!key) throw new Error("CEX_KEY_SECRET not configured");
  const [v, ivHex, tagHex, ctHex] = stored.split(":");
  if (v !== "v1" || !ivHex || !tagHex || !ctHex) throw new Error("malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAAD(aadFor(address, venue));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]).toString(
    "utf8"
  );
}

// ---------------------------------------------------------------------------
// Signed challenge messages (mirrors lib/claims.ts buildClaimMessage)
// ---------------------------------------------------------------------------

export type CexKeyAction = "attach" | "revoke";

export function buildCexKeyMessage(
  action: CexKeyAction,
  venue: KeyedVenue,
  address: string,
  keyLast4: string,
  nonce: string
): string {
  const label = KEYED_VENUE_LABEL[venue];
  const lines =
    action === "attach"
      ? [
          `I authorize a READ-ONLY connection of my ${label} account (API key ending ${keyLast4}) to this wallet's league profile.`,
          `Autorizo uma conexão SOMENTE-LEITURA da minha conta ${label} (chave API final ${keyLast4}) ao meu perfil na liga.`,
          "",
          "This connection can never trade or withdraw. / Esta conexão nunca pode negociar ou sacar.",
        ]
      : [
          `I revoke the ${label} connection (API key ending ${keyLast4}) from this wallet's league profile.`,
          `Revogo a conexão ${label} (chave API final ${keyLast4}) do meu perfil na liga.`,
        ];
  return [
    "Trading League — Chiliz Fan Tokens",
    "",
    ...lines,
    "",
    "Domain: trading.brunopessoa.com",
    "Chain: Chiliz (88888)",
    `Wallet: ${address.toLowerCase()}`,
    `Action: ${action}-cex`,
    `Venue: ${venue}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Exchange clients — signed READ endpoints only
// ---------------------------------------------------------------------------

export interface CexCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string; // OKX only
}

const fetchOpts = () => ({ signal: AbortSignal.timeout(15_000), cache: "no-store" as const });

async function binanceSignedGet(
  path: string,
  params: Record<string, string>,
  creds: CexCredentials
): Promise<{ status: number; body: unknown }> {
  const qs = new URLSearchParams({
    ...params,
    recvWindow: "10000",
    timestamp: String(Date.now()),
  }).toString();
  const signature = createHmac("sha256", creds.apiSecret).update(qs).digest("hex");
  const res = await fetch(`https://api.binance.com${path}?${qs}&signature=${signature}`, {
    ...fetchOpts(),
    headers: { "X-MBX-APIKEY": creds.apiKey },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function okxSignedGet(
  path: string,
  query: string,
  creds: CexCredentials
): Promise<{ status: number; body: unknown }> {
  const ts = new Date().toISOString();
  const requestPath = query ? `${path}?${query}` : path;
  const sign = createHmac("sha256", creds.apiSecret)
    .update(`${ts}GET${requestPath}`)
    .digest("base64");
  const res = await fetch(`https://www.okx.com${requestPath}`, {
    ...fetchOpts(),
    headers: {
      "OK-ACCESS-KEY": creds.apiKey,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": ts,
      "OK-ACCESS-PASSPHRASE": creds.passphrase ?? "",
      "Content-Type": "application/json",
    },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ---------------------------------------------------------------------------
// Read-only verification — the compliance gate
// ---------------------------------------------------------------------------

export type ReadOnlyCheck =
  | { ok: true; perms: string }
  | { ok: false; reason: string; transient: boolean };

/**
 * Binance flags that are ALLOWED to be true on a connected key. Everything
 * else that is boolean-true — including flags added by Binance after this file
 * was written — rejects the key. `ipRestrict` is a restriction, not a power.
 */
const BINANCE_ALLOWED_TRUE = new Set(["enableReading", "enableFixReadOnly", "ipRestrict"]);

export function evaluateBinanceRestrictions(body: unknown): ReadOnlyCheck {
  if (typeof body !== "object" || body === null) {
    return { ok: false, reason: "unexpected response from Binance", transient: true };
  }
  const rec = body as Record<string, unknown>;
  if (rec.enableReading !== true) {
    return { ok: false, reason: "the key does not have Read permission enabled", transient: false };
  }
  for (const [flag, value] of Object.entries(rec)) {
    if (value === true && !BINANCE_ALLOWED_TRUE.has(flag)) {
      return {
        ok: false,
        reason: `the key has "${flag}" enabled — create a new key with ONLY "Enable Reading" checked`,
        transient: false,
      };
    }
  }
  const perms = Object.entries(rec)
    .filter(([, v]) => v === true)
    .map(([k]) => k)
    .sort()
    .join(",");
  return { ok: true, perms };
}

export function evaluateOkxPerm(perm: unknown): ReadOnlyCheck {
  if (typeof perm !== "string" || perm.length === 0) {
    return { ok: false, reason: "unexpected response from OKX", transient: true };
  }
  const parts = perm.split(",").map((p) => p.trim().toLowerCase());
  if (parts.includes("trade") || parts.includes("withdraw")) {
    return {
      ok: false,
      reason: `the key has "${parts.filter((p) => p !== "read_only").join(", ")}" permission — create a new key with ONLY "Read" checked`,
      transient: false,
    };
  }
  if (!parts.includes("read_only")) {
    return { ok: false, reason: "the key does not have Read permission", transient: false };
  }
  return { ok: true, perms: perm };
}

/**
 * Ask the exchange itself what the key can do. Auth failures (bad key/secret/
 * passphrase, deleted key) are definitive; network trouble and 5xx/429 are
 * transient and must never auto-revoke a stored key.
 */
export async function checkReadOnly(
  venue: KeyedVenue,
  creds: CexCredentials
): Promise<ReadOnlyCheck> {
  try {
    if (venue === "binance") {
      const { status, body } = await binanceSignedGet("/sapi/v1/account/apiRestrictions", {}, creds);
      if (status === 200) return evaluateBinanceRestrictions(body);
      const msg =
        (typeof body === "object" && body !== null && (body as { msg?: string }).msg) || `HTTP ${status}`;
      if (status === 401 || status === 400 || status === 403) {
        return { ok: false, reason: `Binance rejected the key: ${msg}`, transient: false };
      }
      return { ok: false, reason: `Binance unavailable: ${msg}`, transient: true };
    }
    const { status, body } = await okxSignedGet("/api/v5/account/config", "", creds);
    const rec = (typeof body === "object" && body !== null ? body : {}) as {
      code?: string;
      msg?: string;
      data?: { perm?: string }[];
    };
    if (status === 200 && rec.code === "0") return evaluateOkxPerm(rec.data?.[0]?.perm);
    const msg = rec.msg || `HTTP ${status}`;
    if (status === 401 || rec.code === "50111" || rec.code === "50113" || rec.code === "50105") {
      return { ok: false, reason: `OKX rejected the key: ${msg}`, transient: false };
    }
    return { ok: false, reason: `OKX unavailable: ${msg}`, transient: true };
  } catch (error) {
    return { ok: false, reason: `network error: ${String(error)}`, transient: true };
  }
}

// ---------------------------------------------------------------------------
// Key store
// ---------------------------------------------------------------------------

export interface CexKeyRow {
  id: number;
  address: string;
  venue: KeyedVenue;
  api_key_enc: string;
  api_secret_enc: string;
  passphrase_enc: string | null;
  key_last4: string;
  status: string;
  perms: string | null;
}

export function saveKey(
  address: string,
  venue: KeyedVenue,
  creds: CexCredentials,
  perms: string
): void {
  const lower = address.toLowerCase();
  getDb()
    .prepare(
      `INSERT INTO cex_keys (address, venue, api_key_enc, api_secret_enc, passphrase_enc, key_last4, status, perms, last_checked_at)
       VALUES (?, ?, ?, ?, ?, ?, 'verified', ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
       ON CONFLICT(address, venue) DO UPDATE SET
         api_key_enc = excluded.api_key_enc, api_secret_enc = excluded.api_secret_enc,
         passphrase_enc = excluded.passphrase_enc, key_last4 = excluded.key_last4,
         status = 'verified', perms = excluded.perms, last_error = NULL,
         last_checked_at = excluded.last_checked_at`
    )
    .run(
      lower,
      venue,
      encryptSecret(creds.apiKey, lower, venue),
      encryptSecret(creds.apiSecret, lower, venue),
      creds.passphrase ? encryptSecret(creds.passphrase, lower, venue) : null,
      creds.apiKey.slice(-4),
      perms
    );
}

/** Disconnect = the credentials cease to exist. Aggregated window volume stays. */
export function deleteKey(address: string, venue: KeyedVenue): boolean {
  const res = getDb()
    .prepare("DELETE FROM cex_keys WHERE address = ? AND venue = ?")
    .run(address.toLowerCase(), venue);
  return res.changes > 0;
}

export function listConnections(
  address: string
): { venue: KeyedVenue; keyLast4: string; status: string }[] {
  return (
    getDb()
      .prepare("SELECT venue, key_last4, status FROM cex_keys WHERE address = ? ORDER BY venue")
      .all(address.toLowerCase()) as { venue: KeyedVenue; key_last4: string; status: string }[]
  ).map((r) => ({ venue: r.venue, keyLast4: r.key_last4, status: r.status }));
}

function decryptRow(row: CexKeyRow): CexCredentials {
  return {
    apiKey: decryptSecret(row.api_key_enc, row.address, row.venue),
    apiSecret: decryptSecret(row.api_secret_enc, row.address, row.venue),
    passphrase: row.passphrase_enc
      ? decryptSecret(row.passphrase_enc, row.address, row.venue)
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Fills — signed reads of the player's own trades, league pairs only
// ---------------------------------------------------------------------------

export interface FillsAggregate {
  inst: string;
  quote: string;
  buyQuote: number; // in quote currency
  sellQuote: number;
  trades: number;
}

/** Hard page caps so one account can never wedge the loop. Hitting a cap is logged. */
const BINANCE_PAGE_LIMIT = 1000;
const BINANCE_MAX_PAGES = 10;
const OKX_PAGE_LIMIT = 100;
const OKX_MAX_PAGES = 20;

export async function fetchBinanceFills(
  creds: CexCredentials,
  listing: CexListing,
  startMs: number,
  endMs: number
): Promise<FillsAggregate> {
  const agg: FillsAggregate = { inst: listing.inst, quote: listing.quote, buyQuote: 0, sellQuote: 0, trades: 0 };
  let cursor = startMs;
  for (let page = 0; page < BINANCE_MAX_PAGES; page++) {
    const { status, body } = await binanceSignedGet(
      "/api/v3/myTrades",
      {
        symbol: listing.inst,
        startTime: String(cursor),
        endTime: String(endMs),
        limit: String(BINANCE_PAGE_LIMIT),
      },
      creds
    );
    if (status !== 200 || !Array.isArray(body)) {
      throw new Error(`binance myTrades ${listing.inst} HTTP ${status}`);
    }
    const rows = body as { quoteQty: string; isBuyer: boolean; time: number }[];
    for (const t of rows) {
      const q = Number(t.quoteQty);
      if (!Number.isFinite(q)) continue;
      if (t.isBuyer) agg.buyQuote += q;
      else agg.sellQuote += q;
      agg.trades += 1;
    }
    if (rows.length < BINANCE_PAGE_LIMIT) return agg;
    // Full page: advance past the last fill's timestamp. Ascending order per API.
    cursor = rows[rows.length - 1].time + 1;
    if (page === BINANCE_MAX_PAGES - 1) {
      logIndex("warn", `binance fills page cap hit for ${listing.inst} — window undercounted`);
    }
  }
  return agg;
}

export async function fetchOkxFills(
  creds: CexCredentials,
  listing: CexListing,
  startMs: number,
  endMs: number
): Promise<FillsAggregate> {
  const agg: FillsAggregate = { inst: listing.inst, quote: listing.quote, buyQuote: 0, sellQuote: 0, trades: 0 };
  let after = ""; // billId cursor — OKX returns newest-first, `after` pages older
  for (let page = 0; page < OKX_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      instType: "SPOT",
      instId: listing.inst,
      begin: String(startMs),
      end: String(endMs),
      limit: String(OKX_PAGE_LIMIT),
    });
    if (after) params.set("after", after);
    const { status, body } = await okxSignedGet("/api/v5/trade/fills-history", params.toString(), creds);
    const rec = (typeof body === "object" && body !== null ? body : {}) as {
      code?: string;
      msg?: string;
      data?: { billId: string; side: string; fillPx: string; fillSz: string }[];
    };
    if (status !== 200 || rec.code !== "0" || !Array.isArray(rec.data)) {
      throw new Error(`okx fills ${listing.inst}: ${rec.msg ?? `HTTP ${status}`}`);
    }
    for (const f of rec.data) {
      const q = Number(f.fillPx) * Number(f.fillSz);
      if (!Number.isFinite(q)) continue;
      if (f.side === "buy") agg.buyQuote += q;
      else agg.sellQuote += q;
      agg.trades += 1;
    }
    if (rec.data.length < OKX_PAGE_LIMIT) return agg;
    after = rec.data[rec.data.length - 1].billId;
    if (page === OKX_MAX_PAGES - 1) {
      logIndex("warn", `okx fills page cap hit for ${listing.inst} — window undercounted`);
    }
  }
  return agg;
}

// ---------------------------------------------------------------------------
// Collector — piggybacks the indexer's venue-refresh cadence
// ---------------------------------------------------------------------------

function openMatches(now = new Date()): MatchRow[] {
  const iso = now.toISOString();
  return getDb()
    .prepare(
      "SELECT * FROM matches WHERE window_start_utc <= ? AND window_end_utc >= ? AND status <> 'scored'"
    )
    .all(iso, iso) as MatchRow[];
}

/**
 * For every verified key: re-prove read-only (auto-revoke on a definitive
 * failure), then pull the player's own fills for each league pair the venue
 * lists among the open match's tokens. Per-key failures are logged and never
 * take the loop down.
 */
export async function refreshDueKeyedCex(now = new Date()): Promise<void> {
  if (!cexConnectEnabled()) return;
  const matches = openMatches(now);
  if (matches.length === 0) return;
  const keys = getDb()
    .prepare("SELECT * FROM cex_keys WHERE status = 'verified'")
    .all() as CexKeyRow[];
  if (keys.length === 0) return;

  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO keyed_cex_volume (match_id, address, venue, token, inst, buy_usd, sell_usd, trades, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     ON CONFLICT(match_id, address, venue, inst) DO UPDATE SET
       buy_usd = excluded.buy_usd, sell_usd = excluded.sell_usd,
       trades = excluded.trades, updated_at = excluded.updated_at`
  );

  for (const row of keys) {
    let creds: CexCredentials;
    try {
      creds = decryptRow(row);
    } catch (error) {
      logIndex("error", `cexkeys: cannot decrypt ${row.venue} key …${row.key_last4}`, undefined, {
        error: String(error),
      });
      continue;
    }

    const check = await checkReadOnly(row.venue, creds);
    if (!check.ok && !check.transient) {
      // The key stopped being read-only (or stopped being valid). Kill it —
      // the league must never hold a credential with more power than "read".
      db.prepare(
        "UPDATE cex_keys SET status = 'invalid', last_error = ?, last_checked_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?"
      ).run(check.reason, row.id);
      logIndex("warn", `cexkeys: auto-revoked ${row.venue} key …${row.key_last4}`, undefined, {
        reason: check.reason,
      });
      continue;
    }
    if (!check.ok) {
      logIndex("warn", `cexkeys: transient check failure ${row.venue} …${row.key_last4}`, undefined, {
        reason: check.reason,
      });
      continue; // don't collect on a key we couldn't re-verify this run
    }
    db.prepare(
      "UPDATE cex_keys SET last_checked_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), last_error = NULL WHERE id = ?"
    ).run(row.id);

    for (const match of matches) {
      const tokens = JSON.parse(match.tokens) as string[];
      const startMs = new Date(match.window_start_utc).getTime();
      const endMs = Math.min(new Date(match.window_end_utc).getTime(), now.getTime());
      for (const token of tokens) {
        const listings = CEX_LISTINGS[token]?.[row.venue] ?? [];
        for (const listing of listings) {
          try {
            const fills =
              row.venue === "binance"
                ? await fetchBinanceFills(creds, listing, startMs, endMs)
                : await fetchOkxFills(creds, listing, startMs, endMs);
            if (fills.trades === 0) continue;
            const rate = await quoteUsdRate(listing.quote);
            if (rate === null) {
              logIndex("warn", `cexkeys: no USD rate for ${listing.quote}, skipping ${listing.inst}`);
              continue;
            }
            upsert.run(
              match.id,
              row.address,
              row.venue,
              token,
              listing.inst,
              fills.buyQuote * rate,
              fills.sellQuote * rate,
              fills.trades
            );
          } catch (error) {
            logIndex(
              "warn",
              `cexkeys: fills failed ${row.venue} ${listing.inst} …${row.key_last4}`,
              match.id,
              { error: String(error) }
            );
          }
        }
      }
    }
  }
}
