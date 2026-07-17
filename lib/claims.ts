import { verifyMessage } from "viem";
import { getClient } from "./chain";

/**
 * The exact message a wallet signs to claim its leaderboard spot. Bilingual so
 * the signer always understands what they are approving; the nonce binds the
 * signature to one claim attempt, so it can never be replayed.
 */
export function buildClaimMessage(handle: string, address: string, nonce: string): string {
  return [
    "Rodada — Liga do Trader de Fan Tokens",
    "",
    `Eu confirmo que sou "${handle}" e esta carteira é minha.`,
    `I confirm I am "${handle}" and this wallet is mine.`,
    "",
    `Wallet: ${address.toLowerCase()}`,
    `Nonce: ${nonce}`,
  ].join("\n");
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
