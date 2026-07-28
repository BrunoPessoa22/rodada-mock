import { verifyMessage } from "viem";
import { getClient } from "./chain";

/**
 * The exact message a wallet signs to claim its leaderboard spot. English-first
 * (the product is English-only) with a Portuguese line for BR signers; the nonce
 * binds the signature to one claim attempt, so it can never be replayed.
 */
export function buildClaimMessage(handle: string, address: string, nonce: string): string {
  return [
    "Rodada — Fan Token Trading League",
    "",
    `I confirm I am "${handle}" and this wallet is mine.`,
    `Eu confirmo que sou "${handle}" e esta carteira é minha.`,
    "",
    `Wallet: ${address.toLowerCase()}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

/** Names that would let a handle impersonate the UI or another role. */
const RESERVED_HANDLES = new Set(["you", "rodada", "admin", "official", "system", "support"]);
/** Letters (any script), digits, spaces, and _ . - only — blocks control chars,
 * the `…` truncation glyph, and emoji that could spoof the address format. */
const HANDLE_RE = /^[\p{L}\p{N} _.\-]{2,40}$/u;

/**
 * Validate a leaderboard handle: length, charset, address-lookalike and reserved
 * names. Returns the trimmed handle or a user-facing error. Uniqueness is checked
 * separately at the DB layer (case-insensitive against verified handles).
 */
export function validateHandle(
  raw: unknown
): { ok: true; handle: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "handle must be text" };
  const handle = raw.trim();
  if (handle.length < 2 || handle.length > 40) {
    return { ok: false, error: "handle must be 2-40 characters" };
  }
  if (!HANDLE_RE.test(handle)) {
    return { ok: false, error: "handle may only contain letters, numbers, spaces, _ . -" };
  }
  if (/^0x[0-9a-f]/i.test(handle)) {
    return { ok: false, error: "handle cannot look like a wallet address" };
  }
  if (RESERVED_HANDLES.has(handle.toLowerCase())) {
    return { ok: false, error: "that handle is reserved — pick another" };
  }
  return { ok: true, handle };
}

/**
 * Signature check: pure EOA recovery first (no RPC), then the on-chain path
 * (ERC-1271/6492) for smart-contract wallets.
 */
export async function verifyClaimSignature(
  address: `0x${string}`,
  message: string,
  signature: `0x${string}`
): Promise<boolean> {
  try {
    if (await verifyMessage({ address, message, signature })) return true;
  } catch {
    /* malformed for pure recovery — try the contract path */
  }
  try {
    return await getClient().verifyMessage({ address, message, signature });
  } catch {
    return false;
  }
}
