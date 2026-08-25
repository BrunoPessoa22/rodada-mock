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

/**
 * Venues that support keyed read-only connections today. Membership bar: the
 * venue must expose an endpoint that returns the SUBMITTED KEY's permissions,
 * so read-only is provable before storage. Verified 2026-08-25 against
 * official docs: Binance (apiRestrictions), OKX (account/config perm), Bitget
 * (spot/account/info authorities), HTX (v2/user/api-key permission).
 * Gate, MEXC, Upbit and Mercado Bitcoin have NO such endpoint — a key's
 * scopes are set in their UI but unreadable via API, so they stay
 * tracked-only. Probing a write and expecting 403 is not an acceptable
 * substitute. Re-verify docs before adding any venue here.
 */
export const KEYED_VENUES = ["binance", "okx", "bitget", "htx"] as const;
export type KeyedVenue = (typeof KEYED_VENUES)[number];

export const KEYED_VENUE_LABEL: Record<KeyedVenue, string> = {
  binance: "Binance",
  okx: "OKX",
  bitget: "Bitget",
  htx: "HTX",
};

/** Where the user creates the key — deep link, never the venue homepage. */
export const VENUE_API_PAGE: Record<KeyedVenue, string> = {
  binance: "https://www.binance.com/en/my/settings/api-management",
  okx: "https://www.okx.com/account/my-api",
  bitget: "https://www.bitget.com/account/newapi",
  htx: "https://www.htx.com/apikey/",
};

/** Venues whose keys carry a user-set passphrase beyond key + secret. */
const PASSPHRASE_VENUES: readonly KeyedVenue[] = ["okx", "bitget"];
export function venueNeedsPassphrase(venue: KeyedVenue): boolean {
  return PASSPHRASE_VENUES.includes(venue);
}

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

async function bitgetSignedGet(
  path: string,
  query: string,
  creds: CexCredentials
): Promise<{ status: number; body: unknown }> {
  const ts = String(Date.now());
  const requestPath = query ? `${path}?${query}` : path;
  const sign = createHmac("sha256", creds.apiSecret)
    .update(`${ts}GET${requestPath}`)
    .digest("base64");
  const res = await fetch(`https://api.bitget.com${requestPath}`, {
    ...fetchOpts(),
    headers: {
      "ACCESS-KEY": creds.apiKey,
      "ACCESS-SIGN": sign,
      "ACCESS-TIMESTAMP": ts,
      "ACCESS-PASSPHRASE": creds.passphrase ?? "",
      "Content-Type": "application/json",
      locale: "en-US",
    },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/**
 * HTX signature v2: canonical sorted URL-encoded query (auth params included),
 * prehash "GET\n{host}\n{path}\n{query}", HMAC-SHA256 → Base64 appended as
 * the Signature param. Timestamp is UTC ISO8601 to the second, no ms, no Z.
 */
async function htxSignedGet(
  path: string,
  params: Record<string, string>,
  creds: CexCredentials
): Promise<{ status: number; body: unknown }> {
  const host = "api.huobi.pro";
  const all: Record<string, string> = {
    ...params,
    AccessKeyId: creds.apiKey,
    SignatureMethod: "HmacSHA256",
    SignatureVersion: "2",
    Timestamp: new Date().toISOString().slice(0, 19),
  };
  const canonical = Object.keys(all)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(all[k])}`)
    .join("&");
  const sign = createHmac("sha256", creds.apiSecret)
    .update(`GET\n${host}\n${path}\n${canonical}`)
    .digest("base64");
  const res = await fetch(`https://${host}${path}?${canonical}&Signature=${encodeURIComponent(sign)}`, {
    ...fetchOpts(),
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
  // Deny-by-default: any permission that isn't read_only — including one OKX
  // invents later — rejects the key.
  const extra = parts.filter((p) => p !== "read_only");
  if (extra.length > 0) {
    return {
      ok: false,
      reason: `the key has "${extra.join(", ")}" permission — create a new key with ONLY "Read" checked`,
      transient: false,
    };
  }
  if (!parts.includes("read_only")) {
    return { ok: false, reason: "the key does not have Read permission", transient: false };
  }
  return { ok: true, perms: perm };
}

/** Bitget: `authorities` from /api/v2/spot/account/info must be exactly ["readonly"]. */
export function evaluateBitgetAuthorities(authorities: unknown): ReadOnlyCheck {
  if (!Array.isArray(authorities)) {
    return { ok: false, reason: "unexpected response from Bitget", transient: true };
  }
  const parts = authorities.map((a) => String(a).trim().toLowerCase());
  const extra = parts.filter((p) => p !== "readonly");
  if (extra.length > 0) {
    return {
      ok: false,
      reason: `the key has "${extra.join(", ")}" permission — create a new Read-only key`,
      transient: false,
    };
  }
  if (!parts.includes("readonly")) {
    return { ok: false, reason: "the key does not have Read permission", transient: false };
  }
  return { ok: true, perms: parts.join(",") };
}

/**
 * HTX: `permission` from /v2/user/api-key is a comma list where readOnly is
 * the base; anything beyond it rejects. validDays is surfaced in the stored
 * perms because non-IP-bound HTX keys expire after 90 days.
 */
export function evaluateHtxPermission(permission: unknown, validDays?: number): ReadOnlyCheck {
  if (typeof permission !== "string" || permission.length === 0) {
    return { ok: false, reason: "unexpected response from HTX", transient: true };
  }
  const parts = permission.split(",").map((p) => p.trim().toLowerCase());
  const extra = parts.filter((p) => p !== "readonly");
  if (extra.length > 0) {
    return {
      ok: false,
      reason: `the key has "${extra.join(", ")}" permission — create a new key with ONLY read access`,
      transient: false,
    };
  }
  if (!parts.includes("readonly")) {
    return { ok: false, reason: "the key does not have Read permission", transient: false };
  }
  const life = typeof validDays === "number" && validDays >= 0 ? ` (expires in ${validDays}d)` : "";
  return { ok: true, perms: `${permission}${life}` };
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
      const rec = (typeof body === "object" && body !== null ? body : {}) as {
        code?: number;
        msg?: string;
      };
      const msg = rec.msg || `HTTP ${status}`;
      // -1021 = our clock outside recvWindow. That is OUR problem, never the
      // key's — treating it as definitive would auto-revoke every healthy key.
      if (rec.code === -1021) {
        return { ok: false, reason: `Binance clock skew: ${msg}`, transient: true };
      }
      if (status === 401 || status === 400 || status === 403) {
        return { ok: false, reason: `Binance rejected the key: ${msg}`, transient: false };
      }
      return { ok: false, reason: `Binance unavailable: ${msg}`, transient: true };
    }
    if (venue === "okx") {
      const { status, body } = await okxSignedGet("/api/v5/account/config", "", creds);
      const rec = (typeof body === "object" && body !== null ? body : {}) as {
        code?: string;
        msg?: string;
        data?: { perm?: string }[];
      };
      if (status === 200 && rec.code === "0") return evaluateOkxPerm(rec.data?.[0]?.perm);
      const msg = rec.msg || `HTTP ${status}`;
      // 50102 = timestamp expired — clock skew, same rule as Binance -1021.
      if (rec.code === "50102") {
        return { ok: false, reason: `OKX clock skew: ${msg}`, transient: true };
      }
      if (status === 401 || rec.code === "50111" || rec.code === "50113" || rec.code === "50105") {
        return { ok: false, reason: `OKX rejected the key: ${msg}`, transient: false };
      }
      return { ok: false, reason: `OKX unavailable: ${msg}`, transient: true };
    }
    if (venue === "bitget") {
      const { status, body } = await bitgetSignedGet("/api/v2/spot/account/info", "", creds);
      const rec = (typeof body === "object" && body !== null ? body : {}) as {
        code?: string;
        msg?: string;
        data?: { authorities?: unknown };
      };
      if (status === 200 && rec.code === "00000") {
        return evaluateBitgetAuthorities(rec.data?.authorities);
      }
      // No verified error-code table for Bitget auth failures — only a real
      // permission readout may be definitive, so nothing here can auto-revoke.
      return {
        ok: false,
        reason: `Bitget rejected the request: ${rec.msg ?? `HTTP ${status}`}`,
        transient: true,
      };
    }
    // htx — two-step: uid, then the key's own permission record.
    const uidRes = await htxSignedGet("/v2/user/uid", {}, creds);
    const uidRec = (typeof uidRes.body === "object" && uidRes.body !== null ? uidRes.body : {}) as {
      code?: number;
      message?: string;
      data?: number;
    };
    if (uidRes.status !== 200 || uidRec.code !== 200 || uidRec.data === undefined) {
      return {
        ok: false,
        reason: `HTX rejected the request: ${uidRec.message ?? `HTTP ${uidRes.status}`}`,
        transient: true, // same rule as Bitget: only a permission readout may revoke
      };
    }
    const keyRes = await htxSignedGet(
      "/v2/user/api-key",
      { uid: String(uidRec.data), accessKey: creds.apiKey },
      creds
    );
    const keyRec = (typeof keyRes.body === "object" && keyRes.body !== null ? keyRes.body : {}) as {
      code?: number;
      message?: string;
      data?: { accessKey?: string; permission?: string; validDays?: number }[];
    };
    if (keyRes.status === 200 && keyRec.code === 200 && Array.isArray(keyRec.data)) {
      const row = keyRec.data.find((k) => k.accessKey === creds.apiKey) ?? keyRec.data[0];
      return evaluateHtxPermission(row?.permission, row?.validDays);
    }
    return {
      ok: false,
      reason: `HTX rejected the request: ${keyRec.message ?? `HTTP ${keyRes.status}`}`,
      transient: true,
    };
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

const BITGET_PAGE_LIMIT = 100;
const BITGET_MAX_PAGES = 20;

export async function fetchBitgetFills(
  creds: CexCredentials,
  listing: CexListing,
  startMs: number,
  endMs: number
): Promise<FillsAggregate> {
  const agg: FillsAggregate = { inst: listing.inst, quote: listing.quote, buyQuote: 0, sellQuote: 0, trades: 0 };
  let idLessThan = ""; // tradeId cursor — pages older records
  for (let page = 0; page < BITGET_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      symbol: listing.inst,
      startTime: String(startMs),
      endTime: String(endMs),
      limit: String(BITGET_PAGE_LIMIT),
    });
    if (idLessThan) params.set("idLessThan", idLessThan);
    const { status, body } = await bitgetSignedGet("/api/v2/spot/trade/fills", params.toString(), creds);
    const rec = (typeof body === "object" && body !== null ? body : {}) as {
      code?: string;
      msg?: string;
      data?: { tradeId: string; side: string; amount: string }[];
    };
    if (status !== 200 || rec.code !== "00000" || !Array.isArray(rec.data)) {
      throw new Error(`bitget fills ${listing.inst}: ${rec.msg ?? `HTTP ${status}`}`);
    }
    for (const f of rec.data) {
      const q = Number(f.amount); // quote value of the fill, per Bitget docs
      if (!Number.isFinite(q)) continue;
      if (f.side === "buy") agg.buyQuote += q;
      else agg.sellQuote += q;
      agg.trades += 1;
    }
    if (rec.data.length < BITGET_PAGE_LIMIT) return agg;
    idLessThan = rec.data[rec.data.length - 1].tradeId;
    if (page === BITGET_MAX_PAGES - 1) {
      logIndex("warn", `bitget fills page cap hit for ${listing.inst} — window undercounted`);
    }
  }
  return agg;
}

/** HTX allows a 48h query window at most — a match window is walked in slices. */
const HTX_WINDOW_MS = 48 * 3600 * 1000;
const HTX_PAGE_LIMIT = 500;

export async function fetchHtxFills(
  creds: CexCredentials,
  listing: CexListing,
  startMs: number,
  endMs: number
): Promise<FillsAggregate> {
  const agg: FillsAggregate = { inst: listing.inst, quote: listing.quote, buyQuote: 0, sellQuote: 0, trades: 0 };
  for (let ws = startMs; ws < endMs; ws += HTX_WINDOW_MS) {
    const we = Math.min(ws + HTX_WINDOW_MS, endMs);
    const { status, body } = await htxSignedGet(
      "/v1/order/matchresults",
      {
        symbol: listing.inst,
        "start-time": String(ws),
        "end-time": String(we),
        size: String(HTX_PAGE_LIMIT),
      },
      creds
    );
    const rec = (typeof body === "object" && body !== null ? body : {}) as {
      status?: string;
      "err-msg"?: string;
      data?: { price: string; "filled-amount": string; type: string }[];
    };
    if (status !== 200 || rec.status !== "ok" || !Array.isArray(rec.data)) {
      throw new Error(`htx fills ${listing.inst}: ${rec["err-msg"] ?? `HTTP ${status}`}`);
    }
    for (const f of rec.data) {
      const q = Number(f.price) * Number(f["filled-amount"]); // base qty × price
      if (!Number.isFinite(q)) continue;
      if (f.type.startsWith("buy")) agg.buyQuote += q;
      else agg.sellQuote += q;
      agg.trades += 1;
    }
    if (rec.data.length >= HTX_PAGE_LIMIT) {
      logIndex("warn", `htx fills size cap hit for ${listing.inst} — 48h slice undercounted`);
    }
  }
  return agg;
}

/** One fills fetcher per keyed venue — the collector dispatches through this. */
const VENUE_FILLS: Record<
  KeyedVenue,
  (creds: CexCredentials, listing: CexListing, startMs: number, endMs: number) => Promise<FillsAggregate>
> = {
  binance: fetchBinanceFills,
  okx: fetchOkxFills,
  bitget: fetchBitgetFills,
  htx: fetchHtxFills,
};

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
            const fills = await VENUE_FILLS[row.venue](creds, listing, startMs, endMs);
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
