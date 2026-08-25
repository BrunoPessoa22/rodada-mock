"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icons";

type FormState = "idle" | "sending" | "done" | "error";
type SigState = "idle" | "signing" | "verified" | "error";
type SigPath = "browser" | "socios" | null;

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  isMetaMask?: boolean;
  providers?: EthereumProvider[];
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const CHILIZ_CHAIN_ID = 88888;

/**
 * With several wallet extensions installed (MetaMask + Phantom/Rabby/…),
 * window.ethereum is whichever won the injection race and may expose the rest
 * under .providers. Clicking "sign" then talks to the wrong wallet — the popup
 * the user expects never opens and the throw is often a plain object, not an
 * Error. Prefer MetaMask explicitly when a multi-provider array exists.
 */
function pickInjectedProvider(): EthereumProvider | null {
  const eth = typeof window !== "undefined" ? window.ethereum : undefined;
  if (!eth) return null;
  if (Array.isArray(eth.providers) && eth.providers.length > 0) {
    return eth.providers.find((p) => p.isMetaMask) ?? eth.providers[0];
  }
  return eth;
}

/**
 * Wallets don't reliably throw Error instances — EIP-1193 rejections from some
 * providers arrive as plain {code, message} objects, which used to surface as
 * a useless "wallet error". Dig the reason out of whatever was thrown.
 */
function walletErrorMessage(err: unknown): string {
  let raw = "";
  if (err instanceof Error && err.message) raw = err.message;
  else if (typeof err === "object" && err !== null) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m) raw = m;
    else {
      const c = (err as { code?: unknown }).code;
      if (c !== undefined) raw = `wallet returned code ${String(c)}`;
    }
  } else if (typeof err === "string" && err) raw = err;
  if (!raw) {
    return "the wallet gave no reason — open the extension, check for a pending request, and try again";
  }
  // MetaMask queues connection requests; a second click while one waits throws
  // "already pending". Tell the user where the stuck request actually lives.
  if (/already pending/i.test(raw)) {
    return "your wallet already has a request waiting — click the wallet's toolbar icon, approve or dismiss it, then try again";
  }
  return raw;
}

/**
 * Runtime client config (/api/config): the Reown/WalletConnect project id and
 * which venues accept read-only key connections. Fetched at runtime so
 * enabling or rotating either is an env change + restart, not a rebuild; when
 * unset each path explains itself instead of silently breaking.
 */
interface ClientConfig {
  wcProjectId: string;
  cexConnect: string[];
}
let configPromise: Promise<ClientConfig> | null = null;
function getClientConfig(): Promise<ClientConfig> {
  if (!configPromise) {
    configPromise = fetch("/api/config")
      .then((res) => (res.ok ? res.json() : {}))
      .then((body: Partial<ClientConfig>) => ({
        wcProjectId: body.wcProjectId ?? "",
        cexConnect: Array.isArray(body.cexConnect) ? body.cexConnect : [],
      }))
      .catch(() => {
        configPromise = null; // transient network failure — retry next call
        return { wcProjectId: "", cexConnect: [] };
      });
  }
  return configPromise;
}

const CEX_LABEL: Record<string, string> = {
  binance: "Binance",
  okx: "OKX",
  bitget: "Bitget",
  htx: "HTX",
};
const CEX_API_PAGE: Record<string, string> = {
  binance: "https://www.binance.com/en/my/settings/api-management",
  okx: "https://www.okx.com/account/my-api",
  bitget: "https://www.bitget.com/account/newapi",
  htx: "https://www.htx.com/apikey/",
};
/** Venues whose keys carry a user-set passphrase beyond key + secret. */
const CEX_NEEDS_PASSPHRASE = new Set(["okx", "bitget"]);
/** Same self-hosted marks the landing venue wall uses (public/venues/). */
const CEX_LOGO: Record<string, string> = {
  binance: "/venues/binance.jpg",
  okx: "/venues/okx.png",
  gate: "/venues/gate.png",
  mexc: "/venues/mexc.jpg",
  bitget: "/venues/bitget.jpg",
  htx: "/venues/htx.png",
  upbit: "/venues/upbit.png",
  mercadobitcoin: "/venues/mercadobitcoin.png",
};

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

  // Read-only exchange connection flow
  const [cexVenues, setCexVenues] = useState<string[]>([]);
  const [cexVenue, setCexVenue] = useState<string>("okx");
  const [cexKey, setCexKey] = useState("");
  const [cexSecret, setCexSecret] = useState("");
  const [cexPass, setCexPass] = useState("");
  const [cexState, setCexState] = useState<
    "idle" | "signing" | "verifying" | "connected" | "error"
  >("idle");
  const [cexError, setCexError] = useState("");
  const [cexApiPage, setCexApiPage] = useState("");
  const [cexConnected, setCexConnected] = useState<{ venue: string; keyLast4: string } | null>(
    null
  );
  const [cexNotice, setCexNotice] = useState("");

  useEffect(() => {
    const walletAvailable = pickInjectedProvider() !== null;
    setHasWallet(walletAvailable);
    setManualOpen(false);
    setWalletChecked(true);
    // A wall tile's "Connect read-only" links here as /entrar?venue=X#cex —
    // land with that venue already selected.
    const wanted = new URLSearchParams(window.location.search).get("venue") ?? "";
    getClientConfig().then((config) => {
      setCexVenues(config.cexConnect);
      if (config.cexConnect.length > 0) {
        setCexVenue((current) => {
          if (wanted && config.cexConnect.includes(wanted)) return wanted;
          return config.cexConnect.includes(current) ? current : config.cexConnect[0];
        });
      }
    });
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

  interface Signer {
    address: string;
    sign(message: string): Promise<string>;
  }

  async function getBrowserSigner(): Promise<Signer> {
    const provider = pickInjectedProvider();
    if (!provider) throw new Error("no browser wallet detected");
    const accounts = (await provider.request({
      method: "eth_requestAccounts",
    })) as string[];
    const address = accounts?.[0];
    if (!address) throw new Error("no account approved in the wallet");
    return {
      address,
      sign: async (message) =>
        (await provider.request({
          method: "personal_sign",
          params: [toHexMessage(message), address],
        })) as string,
    };
  }

  /**
   * Socios.com app path: WalletConnect v2 pairing on Chiliz Chain. The modal
   * shows a QR code — scan it from the Socios.com app's wallet (or any other
   * WalletConnect wallet holding your fan tokens) and approve one free
   * signature. Nothing else is requested: personal_sign only, no transaction.
   */
  async function getSociosSigner(): Promise<Signer> {
    const { wcProjectId } = await getClientConfig();
    if (!wcProjectId) {
      throw new Error(
        "Socios connect is being enabled — use a browser wallet or manual verification meanwhile"
      );
    }
    if (!wcProviderRef.current) {
      const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
      wcProviderRef.current = await EthereumProvider.init({
        projectId: wcProjectId,
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
    return {
      address,
      sign: async (message) =>
        (await provider.request({
          method: "personal_sign",
          params: [toHexMessage(message), address],
        })) as string,
    };
  }

  async function claimWithBrowserWallet() {
    if (!requireHandle()) return;
    setSigPath("browser");
    setSigState("signing");
    setSigError("");
    try {
      const { address, sign } = await getBrowserSigner();
      await runClaim(address, sign);
    } catch (err) {
      setSigError(walletErrorMessage(err));
      setSigState("error");
    }
  }

  async function claimWithSocios() {
    if (!requireHandle()) return;
    setSigPath("socios");
    setSigState("signing");
    setSigError("");
    try {
      const { address, sign } = await getSociosSigner();
      await runClaim(address, sign);
    } catch (err) {
      // A closed modal surfaces as a rejection — keep the message human.
      const raw = walletErrorMessage(err);
      setSigError(/reject|cancel|closed/i.test(raw) ? "connection cancelled in the app" : raw);
      setSigState("error");
    }
  }

  /**
   * Attach a read-only exchange key: challenge → sign with the claimed wallet
   * → server verifies with the exchange that the key can ONLY read, then
   * stores it encrypted. The signed message names the venue and the key's
   * last 4 characters, so the approval in the wallet says exactly what happens.
   */
  async function connectCex(path: "browser" | "socios") {
    const key = cexKey.trim();
    const secret = cexSecret.trim();
    const pass = cexPass.trim();
    if (key.length < 8 || secret.length < 8) {
      setCexError("paste the API key and its secret first");
      setCexState("error");
      return;
    }
    if (CEX_NEEDS_PASSPHRASE.has(cexVenue) && !pass) {
      setCexError(`${CEX_LABEL[cexVenue] ?? cexVenue} keys need their passphrase`);
      setCexState("error");
      return;
    }
    setCexState("signing");
    setCexError("");
    setCexApiPage("");
    try {
      const signer = path === "browser" ? await getBrowserSigner() : await getSociosSigner();
      const challengeRes = await fetch("/api/cexkeys/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: signer.address,
          venue: cexVenue,
          action: "attach",
          keyLast4: key.slice(-4),
        }),
      });
      const challenge = (await challengeRes.json()) as {
        nonce?: string;
        message?: string;
        error?: string;
      };
      if (!challengeRes.ok || !challenge.nonce || !challenge.message) {
        throw new Error(challenge.error ?? "challenge failed");
      }
      const signature = await signer.sign(challenge.message);
      setCexState("verifying");
      const attachRes = await fetch("/api/cexkeys/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nonce: challenge.nonce,
          signature,
          apiKey: key,
          apiSecret: secret,
          passphrase: pass || undefined,
        }),
      });
      const attach = (await attachRes.json()) as {
        ok?: boolean;
        venue?: string;
        keyLast4?: string;
        error?: string;
        apiPage?: string;
      };
      if (!attachRes.ok || !attach.ok) {
        setCexApiPage(attach.apiPage ?? "");
        throw new Error(attach.error ?? "connection failed");
      }
      setCexConnected({ venue: attach.venue ?? cexVenue, keyLast4: attach.keyLast4 ?? key.slice(-4) });
      // Secrets have done their job — wipe them from component state.
      setCexKey("");
      setCexSecret("");
      setCexPass("");
      setCexState("connected");
    } catch (err) {
      const raw = walletErrorMessage(err);
      setCexError(/reject|cancel|closed/i.test(raw) ? "signature cancelled in the wallet" : raw);
      setCexState("error");
    }
  }

  /**
   * Revoke = the encrypted credentials are deleted server-side, immediately.
   * Works on any venue, not just one connected this session — a returning
   * user selects the venue and signs; the server 404s if nothing is attached.
   */
  async function disconnectCexVenue(venue: string, path: "browser" | "socios") {
    setCexState("signing");
    setCexError("");
    try {
      const signer = path === "browser" ? await getBrowserSigner() : await getSociosSigner();
      const challengeRes = await fetch("/api/cexkeys/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: signer.address, venue, action: "revoke" }),
      });
      const challenge = (await challengeRes.json()) as {
        nonce?: string;
        message?: string;
        error?: string;
      };
      if (!challengeRes.ok || !challenge.nonce || !challenge.message) {
        throw new Error(challenge.error ?? "challenge failed");
      }
      const signature = await signer.sign(challenge.message);
      const revokeRes = await fetch("/api/cexkeys/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce: challenge.nonce, signature }),
      });
      const revoke = (await revokeRes.json()) as { ok?: boolean; error?: string };
      if (!revokeRes.ok || !revoke.ok) throw new Error(revoke.error ?? "revoke failed");
      setCexConnected(null);
      setCexNotice(`${CEX_LABEL[venue] ?? venue} disconnected — the key was deleted.`);
      setCexState("idle");
    } catch (err) {
      const raw = walletErrorMessage(err);
      setCexError(/reject|cancel|closed/i.test(raw) ? "signature cancelled in the wallet" : raw);
      setCexState("error");
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
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 15, color: "#fff" }}>
                Connect a CEX account
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.55)", marginTop: 2 }}>
                {cexVenues.length > 0
                  ? `Live now · ${cexVenues.map((v) => CEX_LABEL[v] ?? v).join(" · ")} · read-only API key — connect below. Other venues stay tracked venue-wide on the matchday board.`
                  : "Read-only API connections are being enabled. Meanwhile CEX, Solana and Base volume is tracked venue-wide on the matchday board."}
              </div>
            </div>
          </div>
        </div>

        {cexVenues.length > 0 ? (
          <div className="panel" id="cex" style={{ marginTop: 28 }}>
            <div className="ph">
              <Icon id="i-lock" lg />
              <h3>Connect an exchange — read-only</h3>
            </div>
            <p className="gapline">
              Your own fan-token trades on the exchange count as verified volume during match
              windows. The league checks with the exchange that the key can <b>only read</b> — a
              key that can trade or withdraw is refused, and a connected key is disconnected
              automatically if its permissions ever change.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 8,
                marginTop: 14,
              }}
            >
              {[
                { icon: "i-lock", text: "Read-only, verified by the exchange" },
                { icon: "i-shield", text: "Stored encrypted, never logged" },
                { icon: "i-check", text: "Disconnect anytime — key is deleted" },
              ].map((chip) => (
                <span
                  key={chip.icon}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    background: "var(--bg-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--ink-soft)",
                  }}
                >
                  <Icon id={chip.icon} /> {chip.text}
                </span>
              ))}
            </div>

            {cexConnected ? (
              <div className="join-success" aria-live="polite">
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
                  {CEX_LOGO[cexConnected.venue] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={CEX_LOGO[cexConnected.venue]}
                      alt=""
                      width={36}
                      height={36}
                      style={{ borderRadius: 9 }}
                    />
                  ) : null}
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500, lineHeight: 1.55 }}>
                    <b>{CEX_LABEL[cexConnected.venue] ?? cexConnected.venue}</b> connected —
                    read-only verified (key ending {cexConnected.keyLast4}). Your league-pair
                    trades during match windows now count as verified volume.
                  </p>
                </div>
                {cexState === "error" ? (
                  <p className="formerror" aria-live="polite">
                    Couldn&apos;t disconnect: {cexError}
                  </p>
                ) : null}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={cexState === "signing"}
                    onClick={() =>
                      cexConnected &&
                      disconnectCexVenue(cexConnected.venue, hasWallet ? "browser" : "socios")
                    }
                  >
                    {cexState === "signing" ? "Confirm in your wallet…" : "Disconnect (sign to confirm)"}
                  </button>
                </div>
              </div>
            ) : (
              <form
                className="join-action"
                onSubmit={(event) => {
                  event.preventDefault();
                  connectCex(hasWallet ? "browser" : "socios");
                }}
              >
                <div
                  role="radiogroup"
                  aria-label="Exchange"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))",
                    gap: 10,
                  }}
                >
                  {cexVenues.map((v) => {
                    const selected = v === cexVenue;
                    return (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className="rd-elev"
                        onClick={() => {
                          setCexVenue(v);
                          setCexError("");
                          setCexApiPage("");
                          if (cexState === "error") setCexState("idle");
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "12px 14px",
                          background: selected ? "var(--bg-muted)" : "#fff",
                          border: selected ? "2px solid var(--brand)" : "1px solid var(--border)",
                          borderRadius: 12,
                          cursor: "pointer",
                          textAlign: "left",
                          font: "inherit",
                        }}
                      >
                        {CEX_LOGO[v] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={CEX_LOGO[v]} alt="" width={28} height={28} style={{ borderRadius: 8, flex: "none" }} />
                        ) : null}
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", fontWeight: 700, fontSize: 14, color: "var(--fg)" }}>
                            {CEX_LABEL[v] ?? v}
                          </span>
                          <span
                            style={{
                              display: "block",
                              fontSize: 11,
                              fontWeight: 600,
                              color: selected ? "var(--brand)" : "var(--fg-muted)",
                            }}
                          >
                            read-only key
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    <>
                      <a href={CEX_API_PAGE[cexVenue]} target="_blank" rel="noopener noreferrer">
                        Create an API key on {CEX_LABEL[cexVenue] ?? cexVenue} ↗
                      </a>{" "}
                      — tick <b>only &quot;Read&quot;</b>; leave trading and withdrawals off.
                      {cexVenue === "htx"
                        ? " HTX note: a key without an IP binding expires after 90 days."
                        : null}
                    </>,
                    <>Paste the key and secret below.</>,
                    <>
                      Sign once with the wallet you claimed with — the league then confirms with{" "}
                      {CEX_LABEL[cexVenue] ?? cexVenue} that the key can only read.
                    </>,
                  ].map((content, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <span
                        style={{
                          flex: "none",
                          width: 22,
                          height: 22,
                          borderRadius: 999,
                          background: "var(--brand)",
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginTop: 1,
                        }}
                      >
                        {i + 1}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-soft)", lineHeight: 1.55 }}>
                        {content}
                      </span>
                    </div>
                  ))}
                </div>

                <label>
                  API key
                  <input
                    value={cexKey}
                    onChange={(event) => setCexKey(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="mono"
                    placeholder="paste the API key"
                  />
                </label>
                <label>
                  API secret
                  <input
                    value={cexSecret}
                    onChange={(event) => setCexSecret(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    type="password"
                    className="mono"
                    placeholder="paste the secret"
                  />
                </label>
                {CEX_NEEDS_PASSPHRASE.has(cexVenue) ? (
                  <label>
                    Passphrase (set when you created the key)
                    <input
                      value={cexPass}
                      onChange={(event) => setCexPass(event.target.value)}
                      autoComplete="off"
                      type="password"
                      className="mono"
                      placeholder={`${CEX_LABEL[cexVenue] ?? cexVenue} API passphrase`}
                    />
                  </label>
                ) : null}

                {cexState === "error" ? (
                  <p className="formerror" aria-live="polite">
                    Couldn&apos;t connect: {cexError}
                    {cexApiPage ? (
                      <>
                        {" "}
                        <a href={cexApiPage} target="_blank" rel="noopener noreferrer">
                          Create a read-only key ↗
                        </a>
                      </>
                    ) : null}
                  </p>
                ) : null}

                <button
                  className="btn primary"
                  type="submit"
                  disabled={cexState === "signing" || cexState === "verifying"}
                >
                  <Icon id="i-lock" />
                  {cexState === "signing"
                    ? "Confirm in your wallet…"
                    : cexState === "verifying"
                      ? `Verifying with ${CEX_LABEL[cexVenue] ?? cexVenue}…`
                      : "Sign & verify read-only"}
                </button>
                {!hasWallet ? (
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={cexState === "signing" || cexState === "verifying"}
                    onClick={() => connectCex("socios")}
                  >
                    <Icon id="i-zap" />
                    Sign with the Socios.com app
                  </button>
                ) : null}

                {cexNotice ? (
                  <p className="join-proof" aria-live="polite">
                    <Icon id="i-check" /> {cexNotice}
                  </p>
                ) : null}
                <p className="join-proof" style={{ margin: 0 }}>
                  Requires a claimed username (top of this page). Connected{" "}
                  {CEX_LABEL[cexVenue] ?? cexVenue} before?{" "}
                  <button
                    type="button"
                    disabled={cexState === "signing" || cexState === "verifying"}
                    onClick={() => {
                      setCexNotice("");
                      disconnectCexVenue(cexVenue, hasWallet ? "browser" : "socios");
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      font: "inherit",
                      color: "var(--link)",
                      textDecoration: "underline",
                      cursor: "pointer",
                    }}
                  >
                    disconnect that key
                  </button>{" "}
                  — one signature, deleted immediately.
                </p>
              </form>
            )}
          </div>
        ) : null}

        <p className="gapline" style={{ marginTop: 28 }}>
          <b>Privacy:</b> the leaderboard shows only your chosen name. Unclaimed addresses appear
          truncated (0x12…abcd) — public Chiliz Chain data.
        </p>
      </section>
    </main>
  );
}
