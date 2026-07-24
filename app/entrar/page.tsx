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
  return "0x" + Array.from(new TextEncoder().encode(message), (b) => b.toString(16).padStart(2, "0")).join("");
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
        setError(body.error ?? "erro");
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
            <span className="eyebrow">
              <span className="pt">Entrada grátis</span>
              <span className="en">Free entry</span>
            </span>
            <h2>
              <span className="pt">Entrar na Liga</span>
              <span className="en">Join the League</span>
            </h2>
          </div>
        </div>
        <p className="secsub">
          <span className="pt">
            Escolha seu nome, assine uma mensagem grátis e apareça na Artilharia na hora com zero
            pontos. Depois, opere dentro da janela da partida para subir na tabela.
          </span>
          <span className="en">
            Choose your username, sign one free message, and appear on the leaderboard instantly at
            zero points. Then trade inside the match window to move up.
          </span>
        </p>

        {sigState === "verified" && verifiedAs ? (
          <div className="panel join-success" aria-live="polite">
            <div className="ph">
              <Icon id="i-check" lg />
              <h3>
                <span className="pt">Você entrou na Artilharia</span>
                <span className="en">You&apos;re on the leaderboard</span>
              </h3>
            </div>
            <p className="gapline">
              <span className="pt">
                <b>{verifiedAs.handle}</b> está ao vivo com zero pontos. Suas operações dentro da
                próxima janela fazem você subir na tabela.
              </span>
              <span className="en">
                <b>{verifiedAs.handle}</b> is live at zero points. Your trades inside the next match
                window move you up the table.
              </span>
            </p>
            <a className="btn primary" href="/#leaderboard">
              <span className="pt">Ver meu nome na tabela</span>
              <span className="en">View my name on the leaderboard</span>
            </a>
          </div>
        ) : state === "done" ? (
          <div className="panel join-success" aria-live="polite">
            <div className="ph">
              <Icon id="i-check" lg />
              <h3>
                <span className="pt">Pedido recebido</span>
                <span className="en">Claim received</span>
              </h3>
            </div>
            <p className="gapline">
              <span className="pt">
                Vamos confirmar que a carteira é sua. Depois da aprovação, <b>{sigHandle}</b> entra
                na Artilharia; suas operações na janela continuam sendo contadas.
              </span>
              <span className="en">
                We&apos;ll confirm that the wallet is yours. Once approved, <b>{sigHandle}</b> joins
                the leaderboard; your in-window trades keep counting.
              </span>
            </p>
          </div>
        ) : (
          <>
            <div className="panel join-primary">
              <div className="ph">
                <Icon id="i-wallet" lg />
                <h3>
                  <span className="pt">Escolha seu nome. Entre na tabela.</span>
                  <span className="en">Choose your name. Join the table.</span>
                </h3>
              </div>

              <div className="join-loop" aria-label="Join flow">
                <span>
                  <span className="pt">Nome</span>
                  <span className="en">Username</span>
                </span>
                <i aria-hidden="true">→</i>
                <span>
                  <span className="pt">Assine uma vez</span>
                  <span className="en">Sign once</span>
                </span>
                <i aria-hidden="true">→</i>
                <strong>
                  <span className="pt">Ao vivo · 0 pts</span>
                  <span className="en">Live · 0 pts</span>
                </strong>
              </div>

              <form className="join-action" onSubmit={claimWithSignature}>
                <label>
                  <span className="pt">Seu nome na Artilharia</span>
                  <span className="en">Your leaderboard username</span>
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
                    <span className="pt">Não foi possível entrar: {sigError}</span>
                    <span className="en">Couldn&apos;t join: {sigError}</span>
                  </p>
                ) : null}

                {walletChecked && hasWallet ? (
                  <button
                    className="btn primary"
                    type="submit"
                    disabled={sigState === "signing"}
                  >
                    <Icon id="i-wallet" />
                    <span className="pt">
                      {sigState === "signing"
                        ? "Confirme na carteira…"
                        : "Entrar na Liga e aparecer na tabela"}
                    </span>
                    <span className="en">
                      {sigState === "signing"
                        ? "Confirm in your wallet…"
                        : "Join league & appear on leaderboard"}
                    </span>
                  </button>
                ) : walletChecked ? (
                  <div className="wallet-missing">
                    <span className="pt">
                      Carteira não detectada. Abra esta página no navegador da sua carteira ou use a
                      verificação manual abaixo.
                    </span>
                    <span className="en">
                      Wallet not detected. Open this page in your wallet browser or use manual
                      verification below.
                    </span>
                  </div>
                ) : (
                  <p className="join-proof">
                    <span className="pt">Procurando sua carteira…</span>
                    <span className="en">Checking for your wallet…</span>
                  </p>
                )}

                <p className="join-proof">
                  <span className="pt">Uma assinatura grátis · sem transação · sem gas</span>
                  <span className="en">One free signature · no transaction · no gas</span>
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
                  <span>
                    <span className="pt">Não consegue assinar esta carteira?</span>
                    <span className="en">Can&apos;t sign with this wallet?</span>
                  </span>
                  <span className="badge low">
                    <span className="pt">análise manual</span>
                    <span className="en">manual review</span>
                  </span>
                </summary>
                <div className="manual-claim-body">
                  <p>
                    <span className="pt">
                      Use só para carteiras em outro app ou custodiante. Você já escolheu o nome
                      acima; envie o endereço para comprovarmos a posse.
                    </span>
                    <span className="en">
                      Use this only for wallets held in another app or custodian. Your username
                      above carries over; send the address so we can confirm ownership.
                    </span>
                  </p>
                  <form className="joinform" onSubmit={submit}>
                    <label>
                      <span className="pt">Sua carteira na Chiliz Chain (0x…)</span>
                      <span className="en">Your Chiliz Chain wallet (0x…)</span>
                      <input
                        name="address"
                        required
                        pattern="0x[0-9a-fA-F]{40}"
                        placeholder="0x…"
                        className="mono"
                      />
                    </label>
                    <label>
                      <span className="pt">Onde você opera hoje (opcional)</span>
                      <span className="en">Where you trade today (optional)</span>
                      <select name="venue" defaultValue="">
                        <option value="">—</option>
                        <option value="kayen">Kayen</option>
                        <option value="socios">Socios</option>
                        <option value="mercado-bitcoin">Mercado Bitcoin</option>
                        <option value="okx">OKX</option>
                        <option value="binance">Binance</option>
                        <option value="paribu">Paribu</option>
                        <option value="outro">Outro / other</option>
                      </select>
                    </label>
                    <label>
                      <span className="pt">
                        Contato — WhatsApp ou Telegram (opcional, para prêmios)
                      </span>
                      <span className="en">
                        Contact — WhatsApp or Telegram (optional, for prizes)
                      </span>
                      <input name="contact" maxLength={80} placeholder="+55 …" />
                    </label>
                    {state === "error" ? (
                      <p className="formerror" aria-live="polite">
                        <span className="pt">Não foi possível enviar: {error}</span>
                        <span className="en">Couldn&apos;t submit: {error}</span>
                      </p>
                    ) : null}
                    <button className="btn secondary" type="submit" disabled={state === "sending"}>
                      <span className="pt">
                        {state === "sending" ? "Enviando…" : "Enviar para análise manual"}
                      </span>
                      <span className="en">
                        {state === "sending" ? "Sending…" : "Submit for manual review"}
                      </span>
                    </button>
                  </form>
                </div>
              </details>
            ) : null}
          </>
        )}

        <p className="gapline" style={{ marginTop: 28 }}>
          <span className="pt">
            <b>Privacidade:</b> a Artilharia mostra só o nome escolhido. Endereços não reivindicados
            aparecem truncados (0x12…abcd) — são dados públicos da Chiliz Chain.
          </span>
          <span className="en">
            <b>Privacy:</b> the leaderboard shows only your chosen name. Unclaimed addresses appear
            truncated (0x12…abcd) — public Chiliz Chain data.
          </span>
        </p>
      </section>
    </main>
  );
}
