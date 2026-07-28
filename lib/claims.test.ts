import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { buildClaimMessage, validateHandle, verifyClaimSignature } from "./claims";

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

describe("validateHandle", () => {
  it("accepts normal handles and trims them", () => {
    const r = validateHandle("  mengotrader10 ");
    expect(r).toEqual({ ok: true, handle: "mengotrader10" });
  });

  it("accepts non-ASCII letters", () => {
    expect(validateHandle("Comödia").ok).toBe(true);
  });

  it("rejects too-short and too-long handles", () => {
    expect(validateHandle("a").ok).toBe(false);
    expect(validateHandle("x".repeat(41)).ok).toBe(false);
  });

  it("allows a plain space but rejects control chars and the truncation glyph", () => {
    expect(validateHandle("blue north").ok).toBe(true);
    expect(validateHandle("hi\nthere").ok).toBe(false);
    expect(validateHandle("0x12…abcd").ok).toBe(false);
  });

  it("rejects address-lookalikes", () => {
    expect(validateHandle("0xdeadbeef").ok).toBe(false);
  });

  it("rejects reserved names case-insensitively", () => {
    expect(validateHandle("You").ok).toBe(false);
    expect(validateHandle("RODADA").ok).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(validateHandle(undefined).ok).toBe(false);
    expect(validateHandle(42).ok).toBe(false);
  });
});
