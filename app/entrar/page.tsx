"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icons";

type FormState = "idle" | "sending" | "done" | "error";
type SigState = "idle" | "signing" | "verified" | "error";
type SigPath = "browser" | "socios" | null;

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const CHILIZ_CHAIN_ID = 88888;

/**
 * Reown (WalletConnect) Cloud project id — free, from dashboard.reown.com.
 * Fetched from /api/config at runtime (server env WC_PROJECT_ID) so enabling
 * or rotating it is an env change + restart, not a rebuild; when unset the
 * Socios path explains itself instead of silently breaking.
 */
let wcProjectIdPromise: Promise<string> | null = null;
function getWcProjectId(): Promise<string> {
  if (!wcProjectIdPromise) {
    wcProjectIdPromise = fetch("/api/config")
      .then((res) => (res.ok ? res.json() : { wcProjectId: "" }))
      .then((body: { wcProjectId?: string }) => body.wcProjectId ?? "")
      .catch(() => {
        wcProjectIdPromise = null; // transient network failure — retry next click
        return "";
      });
  }
  return wcProjectIdPromise;
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
  const [sigPath, setSigPath] = useState<SigPath>(null);
  const [sigError, setSigError] = useState<string>("");
  const [sigHandle, setSigHandle] = useState<string>("");
  const [sigContact, setSigContact] = useState<string>("");
  const [verifiedAs, setVerifiedAs] = useState<{ handle: string; address: string } | null>(null);
  // One WalletConnect provider per page load — re-init would drop the pairing.
  const wcProviderRef = useRef<{
    accounts: string[];
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
  } | null>(null);

  useEffect(() => {
    const walletAvailable = typeof window !== "undefined" && !!window.ethereum;
    setHasWallet(walletAvailable);
    setManualOpen(false);
    setWalletChecked(true);
  }, []);

  /**
   * Shared claim runner: challenge → sign → verify. Both connect paths feed it
   * their own address + signer, so the server-side flow is identical whether
   * the signature came from a browser extension or the Socios.com app.
   */
  async function runClaim(address: string, sign: (message: string) => Promise<string>) {
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

    const signature = await sign(challenge.message);

    const verifyRes = await fetch("/api/claims/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nonce: challenge.nonce,
        signature,
        contact: sigContact.trim() || undefined,
      }),
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
  }

  function requireHandle(): boolean {
    if (sigHandle.trim().length >= 2) return true;
    setSigError("choose a username first");
    setSigState("error");
    return false;
  }

  async function claimWithBrowserWallet() {
    if (!requireHandle()) return;
    if (!window.ethereum) {
      setSigError("no browser wallet detected");
      setSigState("error");
      return;
    }
    setSigPath("browser");
    setSigState("signing");
    setSigError("");
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const address = accounts?.[0];
      if (!address) throw new Error("no account");
      await runClaim(address, async (message) => {
        return (await window.ethereum!.request({
          method: "personal_sign",
          params: [toHexMessage(message), address],
        })) as string;
      });
    } catch (err) {
      setSigError(err instanceof Error ? err.message : "wallet error");
      setSigState("error");
    }
  }

  /**
   * Socios.com app path: WalletConnect v2 pairing on Chiliz Chain. The modal
   * shows a QR code — scan it from the Socios.com app's wallet (or any other
   * WalletConnect wallet holding your fan tokens) and approve one free
   * signature. Nothing else is requested: personal_sign only, no transaction.
   */
  async function claimWithSocios() {
    if (!requireHandle()) return;
    const projectId = await getWcProjectId();
    if (!projectId) {
      setSigError(
        "Socios connect is being enabled — use a browser wallet or manual verification meanwhile"
      );
      setSigState("error");
      return;
    }
    setSigPath("socios");
    setSigState("signing");
    setSigError("");
    try {
      if (!wcProviderRef.current) {
        const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
        wcProviderRef.current = await EthereumProvider.init({
          projectId,
          chains: [CHILIZ_CHAIN_ID],
          showQrModal: true,
          methods: ["personal_sign"],
          events: ["accountsChanged", "chainChanged"],
          rpcMap: { [CHILIZ_CHAIN_ID]: "https://rpc.chiliz.com" },
          metadata: {
            name: "Trading League",
            description: "Fan Token Trading League — trade the match, share the pot.",
            url: "https://trading.brunopessoa.com",
            icons: ["https://trading.brunopessoa.com/icon.svg"],
          },
        });
      }
      const provider = wcProviderRef.current;
      if (provider.accounts.length === 0) await provider.connect();
      const address = provider.accounts[0];
      if (!address) throw new Error("no account approved in the wallet app");
      await runClaim(address, async (message) => {
        return (await provider.request({
          method: "personal_sign",
          params: [toHexMessage(message), address],
        })) as string;
      });
    } catch (err) {
      // A closed modal surfaces as a rejection — keep the message human.
      const raw = err instanceof Error ? err.message : "wallet error";
      setSigError(/reject|cancel|closed/i.test(raw) ? "connection cancelled in the app" : raw);
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

              <form
                className="join-action"
                onSubmit={(event) => {
                  event.preventDefault();
                  claimWithBrowserWallet();
                }}
              >
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

                <label>
                  Contact for prizes — WhatsApp or Telegram (optional)
                  <input
                    placeholder="+55 …"
                    value={sigContact}
                    maxLength={80}
                    autoComplete="off"
                    onChange={(event) => setSigContact(event.target.value)}
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
                    {sigState === "signing" && sigPath === "browser"
                      ? "Confirm in your wallet…"
                      : "Sign with browser wallet"}
                  </button>
                ) : walletChecked ? (
                  <div className="wallet-missing">
                    No browser wallet detected — connect the Socios.com app below, open this page in
                    your wallet browser, or use manual verification.
                  </div>
                ) : (
                  <p className="join-proof">Checking for your wallet…</p>
                )}

                <button
                  className="btn secondary"
                  type="button"
                  disabled={sigState === "signing"}
                  onClick={claimWithSocios}
                >
                  <Icon id="i-zap" />
                  {sigState === "signing" && sigPath === "socios"
                    ? "Approve in the Socios.com app…"
                    : "Connect Socios.com app"}
                </button>

                <p className="join-proof">
                  One free signature · no transaction · no gas. Socios connect uses WalletConnect —
                  scan the QR with the wallet inside your Socios.com app.
                </p>
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
                        <option value="gate">Gate</option>
                        <option value="mexc">MEXC</option>
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
            Choose how the league verifies your trades
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
                Live now · Chiliz Chain · browser wallet or the Socios.com app · sign a message, no
                approval
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
                Read-only API — OKX · Binance next. Meanwhile CEX, Solana and Base volume is tracked
                venue-wide on the matchday board.
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
