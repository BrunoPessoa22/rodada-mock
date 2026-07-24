"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icons";

type FormState = "idle" | "sending" | "done" | "error";
type SigState = "idle" | "signing" | "verified" | "error";

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

function toHexMessage(message: string): string {
  return (
    "0x" +
    Array.from(new TextEncoder().encode(message), (b) => b.toString(16).padStart(2, "0")).join("")
  );
}

export default function JoinPage() {
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string>("");
  const [hasWallet, setHasWallet] = useState(false);
  const [sigState, setSigState] = useState<SigState>("idle");
  const [sigError, setSigError] = useState<string>("");
  const [sigHandle, setSigHandle] = useState<string>("");
  const [verifiedAs, setVerifiedAs] = useState<{ handle: string; address: string } | null>(null);

  useEffect(() => {
    setHasWallet(typeof window !== "undefined" && !!window.ethereum);
  }, []);

  async function claimWithSignature() {
    if (!window.ethereum || sigHandle.trim().length < 2) {
      setSigError("handle");
      setSigState("error");
      return;
    }
    setSigState("signing");
    setSigError("");
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const address = accounts?.[0];
      if (!address) throw new Error("no account");

      const challengeRes = await fetch("/api/claims/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, handle: sigHandle.trim() }),
      });
      const challenge = (await challengeRes.json()) as {
        nonce?: string;
        message?: string;
        error?: string;
      };
      if (!challengeRes.ok || !challenge.nonce || !challenge.message) {
        throw new Error(challenge.error ?? "challenge failed");
      }

      const signature = (await window.ethereum.request({
        method: "personal_sign",
        params: [toHexMessage(challenge.message), address],
      })) as string;

      const verifyRes = await fetch("/api/claims/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce: challenge.nonce, signature }),
      });
      const verify = (await verifyRes.json()) as {
        ok?: boolean;
        handle?: string;
        address?: string;
        error?: string;
      };
      if (!verifyRes.ok || !verify.ok) throw new Error(verify.error ?? "verification failed");

      setVerifiedAs({ handle: verify.handle ?? sigHandle, address: verify.address ?? address });
      setSigState("verified");
    } catch (err) {
      setSigError(err instanceof Error ? err.message : "wallet error");
      setSigState("error");
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: form.get("handle"),
          address: (form.get("address") as string)?.trim(),
          venue: form.get("venue"),
          contact: form.get("contact"),
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "error");
        setState("error");
        return;
      }
      setState("done");
    } catch {
      setError("network");
      setState("error");
    }
  }

  return (
    <main className="wrap">
      <section style={{ maxWidth: 640, margin: "0 auto" }}>
        <div className="sechead" style={{ marginTop: 40 }}>
          <div>
            <span className="eyebrow">Free entry</span>
            <h2>Join Rodada</h2>
          </div>
        </div>
        <p className="secsub">
          Matchday Markets already counts every Kayen trade inside matchday windows — your wallet is
          probably already scoring. Claim it to appear under your name on the leaderboard and
          receive prizes. Every claim is verified manually during the beta.
        </p>

        {sigState === "verified" && verifiedAs ? (
          <div className="panel" style={{ marginTop: 24 }}>
            <div className="ph">
              <Icon id="i-check" lg />
              <h3>Wallet verified</h3>
            </div>
            <p className="gapline">
              Signature confirmed — <b>{verifiedAs.handle}</b> is now this wallet&apos;s name on the
              leaderboard. Every trade you make in the window already scores.
            </p>
          </div>
        ) : hasWallet && state !== "done" ? (
          <div className="panel" style={{ marginTop: 24 }}>
            <div className="ph">
              <Icon id="i-wallet" lg />
              <h3>Instant verification — sign with your wallet</h3>
            </div>
            <p className="gapline">
              No transaction, no cost: your wallet signs a message and that&apos;s it — only the key
              holder can. Your name goes up instantly.
            </p>
            <div className="adminform" style={{ maxWidth: 420 }}>
              <input
                placeholder="mengotrader10"
                value={sigHandle}
                maxLength={40}
                onChange={(e) => setSigHandle(e.target.value)}
              />
              {sigState === "error" ? <p className="formerror">Failed: {sigError}</p> : null}
              <button
                className="btn primary"
                onClick={claimWithSignature}
                disabled={sigState === "signing"}
              >
                <Icon id="i-wallet" />
                {sigState === "signing" ? "Waiting for signature…" : "Sign and verify"}
              </button>
            </div>
            <p className="gapline" style={{ marginTop: 14 }}>
              Wallet elsewhere (Socios, mobile)? Use the form below — manual verification.
            </p>
          </div>
        ) : null}

        {sigState === "verified" ? null : state === "done" ? (
          <div className="panel" style={{ marginTop: 24 }}>
            <div className="ph">
              <Icon id="i-check" lg />
              <h3>Claim received</h3>
            </div>
            <p className="gapline">
              We&apos;ll confirm the wallet is yours and your name goes up on the leaderboard.
              Meanwhile every trade in the window already scores — counting covers the whole window
              retroactively.
            </p>
          </div>
        ) : (
          <form className="joinform" onSubmit={submit}>
            <label>
              How you want to appear on the leaderboard
              <input name="handle" required minLength={2} maxLength={40} placeholder="mengotrader10" />
            </label>
            <label>
              Your Chiliz Chain wallet (0x…)
              <input
                name="address"
                required
                pattern="0x[0-9a-fA-F]{40}"
                placeholder="0x…"
                className="mono"
              />
            </label>
            <label>
              Where you trade today (optional)
              <select name="venue" defaultValue="">
                <option value="">—</option>
                <option value="kayen">Kayen</option>
                <option value="socios">Socios</option>
                <option value="mercado-bitcoin">Mercado Bitcoin</option>
                <option value="okx">OKX</option>
                <option value="binance">Binance</option>
                <option value="paribu">Paribu</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Contact — WhatsApp or Telegram (optional, for prizes)
              <input name="contact" maxLength={80} placeholder="+1 …" />
            </label>
            {state === "error" ? <p className="formerror">Failed: {error}</p> : null}
            <button className="btn primary" type="submit" disabled={state === "sending"}>
              <Icon id="i-wallet" />
              {state === "sending" ? "Sending…" : "Claim wallet"}
            </button>
          </form>
        )}

        <div className="panel dark" style={{ marginTop: 28 }}>
          <div className="ph">
            <Icon id="i-shield" lg />
            <h3>Choose how Rodada verifies your trades</h3>
          </div>
          <div className="verify-list">
            <div className="verify-item">
              <span className="mark">0x</span>
              <div className="t">
                <b>Wallet signature</b>
                <span>Live now · Kayen / Chiliz Chain</span>
              </div>
            </div>
            <div className="verify-item">
              <span className="mark">API</span>
              <div className="t">
                <b>Read-only exchange key</b>
                <span>OKX · Binance — no withdrawal rights, ever</span>
              </div>
            </div>
          </div>
        </div>

        <p className="gapline" style={{ marginTop: 28 }}>
          <b>Privacy:</b> the leaderboard shows only your chosen name. Unclaimed addresses appear
          truncated (0x12…abcd) — public Chiliz Chain data.
        </p>
      </section>
    </main>
  );
}
