import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { buildClaimMessage, verifyClaimSignature } from "./claims";

describe("wallet-signature claim", () => {
  it("accepts a signature from the claimed wallet", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const message = buildClaimMessage("mengotrader10", account.address, "abc123");
    const signature = await account.signMessage({ message });
    expect(await verifyClaimSignature(account.address, message, signature)).toBe(true);
  });

  it("rejects a signature from a different wallet", async () => {
    const claimer = privateKeyToAccount(generatePrivateKey());
    const attacker = privateKeyToAccount(generatePrivateKey());
    const message = buildClaimMessage("whale_impostor", claimer.address, "abc123");
    const signature = await attacker.signMessage({ message });
    expect(await verifyClaimSignature(claimer.address, message, signature)).toBe(false);
  });

  it("rejects a signature over a different handle — nonce/handle are bound", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const signed = await account.signMessage({
      message: buildClaimMessage("handle_a", account.address, "nonce1"),
    });
    const expected = buildClaimMessage("handle_b", account.address, "nonce1");
    expect(await verifyClaimSignature(account.address, expected, signed)).toBe(false);
  });

  it("rejects garbage signatures without throwing", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const message = buildClaimMessage("x", account.address, "n");
    expect(await verifyClaimSignature(account.address, message, "0xdeadbeef")).toBe(false);
  });
});
