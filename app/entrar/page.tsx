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
  const [walletChecked, setWalletChecked] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [sigState, setSigState] = useState<SigState>("idle");
  const [sigError, setSigError] = useState<string>("");
  const [sigHandle, setSigHandle] = useState<string>("");
  const [verifiedAs, setVerifiedAs] = useState<{ handle: string; address: string } | null>(null);

  useEffect(() => {
    const walletAvailable = typeof window !== "undefined" && !!window.ethereum;
    setHasWallet(walletAvailable);
    setManualOpen(!walletAvailable);
    setWalletChecked(true);
  }, []);

  async function claimWithSignature(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    if (sigHandle.trim().length < 2) {
      setError("choose a username first");
      setState("error");
      return;
    }
    const form = new FormData(event.currentTarget);
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: sigHandle.trim(),
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
      <section style={{ maxWidth: 640, margin: "0 auto", paddingBottom: 72 }}>
        <div className="sechead" style={{ marginTop: 48 }}>
          <div>
            <span className="eyebrow">Free entry</span>
            <h2>Join this week</h2>
          </div>
        </div>
        <p className="secsub">
          Choose your username, sign one free message, and appear on the leaderboard instantly at
          zero points. Then trade inside the match window to move up.
        </p>

        {sigState === "verified" && verifiedAs ? (
          <div className="panel join-success" aria-live="polite">
            <div className="ph">
              <Icon id="i-check" lg />
              <h3>You&apos;re on the leaderboard</h3>
            </div>
            <p className="gapline">
              <b>{verifiedAs.handle}</b> is live at zero points. Your trades inside the next match
              window move you up the table.
            </p>
            <a className="btn primary" href="/#board" style={{ marginTop: 16 }}>
              View my name on the leaderboard
            </a>
          </div>
        ) : state === "done" ? (
          <div className="panel join-success" aria-live="polite">
            <div className="ph">
              <Icon id="i-check" lg />
              <h3>Claim received</h3>
            </div>
            <p className="gapline">
              We&apos;ll confirm that the wallet is yours. Once approved, <b>{sigHandle}</b> joins
              the leaderboard; your in-window trades keep counting.
            </p>
          </div>
        ) : (
          <>
            <div className="panel join-primary">
              <div className="ph">
                <Icon id="i-wallet" lg />
                <h3>Choose your name. Join the table.</h3>
              </div>

              <div className="join-loop" aria-label="Join flow">
                <span>Username</span>
                <i aria-hidden="true">→</i>
                <span>Sign once</span>
                <i aria-hidden="true">→</i>
                <strong>Live · 0 pts</strong>
              </div>

              <form className="join-action" onSubmit={claimWithSignature}>
                <label>
                  Your leaderboard username
                  <input
                    placeholder="mengotrader10"
                    value={sigHandle}
                    required
                    minLength={2}
                    maxLength={40}
                    autoComplete="nickname"
                    onChange={(event) => setSigHandle(event.target.value)}
                  />
                </label>

                {sigState === "error" ? (
                  <p className="formerror" aria-live="polite">
                    Couldn&apos;t join: {sigError}
                  </p>
                ) : null}

                {walletChecked && hasWallet ? (
                  <button className="btn primary" type="submit" disabled={sigState === "signing"}>
                    <Icon id="i-wallet" />
                    {sigState === "signing"
                      ? "Confirm in your wallet…"
                      : "Join league & appear on leaderboard"}
                  </button>
                ) : walletChecked ? (
                  <div className="wallet-missing">
                    Wallet not detected. Open this page in your wallet browser or use manual
                    verification below.
                  </div>
                ) : (
                  <p className="join-proof">Checking for your wallet…</p>
                )}

                <p className="join-proof">One free signature · no transaction · no gas</p>
              </form>
            </div>

            {walletChecked ? (
              <details
                className="manual-claim"
                open={manualOpen}
                onToggle={(event) => setManualOpen(event.currentTarget.open)}
              >
                <summary>
                  <span>Can&apos;t sign with this wallet?</span>
                  <span className="badge low">manual review</span>
                </summary>
                <div className="manual-claim-body">
                  <p>
                    Use this only for wallets held in another app or custodian. Your username above
                    carries over; send the address so we can confirm ownership.
                  </p>
                  <form className="joinform" onSubmit={submit}>
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
                    {state === "error" ? (
                      <p className="formerror" aria-live="polite">
                        Couldn&apos;t submit: {error}
                      </p>
                    ) : null}
                    <button className="btn secondary" type="submit" disabled={state === "sending"}>
                      {state === "sending" ? "Sending…" : "Submit for manual review"}
                    </button>
                  </form>
                </div>
              </details>
            ) : null}
          </>
        )}

        <div className="panel dark" style={{ marginTop: 28 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,.55)",
              marginBottom: 12,
            }}
          >
            Open to everyone
          </div>
          <h3 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 700 }}>
            Choose how Rodada verifies your trades
          </h3>
          <p
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "rgba(255,255,255,.6)",
              margin: "0 0 18px",
              lineHeight: 1.55,
            }}
          >
            No deposit and no entry fee. Connect once, then keep trading where you already trade.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                background: "rgba(255,255,255,.06)",
                border: "1px solid rgba(255,255,255,.1)",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 15, color: "#fff" }}>Verify a wallet</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.55)", marginTop: 2 }}>
                Live now · Kayen / Chiliz Chain · sign a message, no approval
              </div>
            </div>
            <div
              style={{
                background: "rgba(255,255,255,.06)",
                border: "1px solid rgba(255,255,255,.1)",
                borderRadius: 12,
                padding: 16,
                opacity: 0.8,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 15, color: "#fff" }}>
                Connect a CEX account
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.55)", marginTop: 2 }}>
                Read-only API — OKX · Binance next
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
