"use client";

import { useState } from "react";
import { Icon } from "@/components/Icons";

type FormState = "idle" | "sending" | "done" | "error";

export default function JoinPage() {
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string>("");

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
            A Liga já conta toda operação na Kayen dentro das janelas de rodada — sua carteira
            provavelmente já está pontuando. Reivindique-a para aparecer com seu nome na Artilharia
            e receber prêmios. Verificamos cada pedido manualmente nesta beta.
          </span>
          <span className="en">
            The League already counts every Kayen trade inside matchday windows — your wallet is
            probably already scoring. Claim it to appear under your name on the leaderboard and
            receive prizes. Every claim is verified manually during the beta.
          </span>
        </p>

        {state === "done" ? (
          <div className="panel" style={{ marginTop: 24 }}>
            <div className="ph">
              <Icon id="i-check" lg />
              <h3>
                <span className="pt">Pedido recebido</span>
                <span className="en">Claim received</span>
              </h3>
            </div>
            <p className="gapline">
              <span className="pt">
                Vamos confirmar que a carteira é sua e seu nome entra na Artilharia. Enquanto isso,
                toda operação na janela já pontua — a contagem é retroativa à janela inteira.
              </span>
              <span className="en">
                We&apos;ll confirm the wallet is yours and your name goes up on the leaderboard.
                Meanwhile every trade in the window already scores — counting covers the whole
                window retroactively.
              </span>
            </p>
          </div>
        ) : (
          <form className="joinform" onSubmit={submit}>
            <label>
              <span className="pt">Como você quer aparecer na Artilharia</span>
              <span className="en">How you want to appear on the leaderboard</span>
              <input name="handle" required minLength={2} maxLength={40} placeholder="mengotrader10" />
            </label>
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
              <span className="pt">Contato — WhatsApp ou Telegram (opcional, para prêmios)</span>
              <span className="en">Contact — WhatsApp or Telegram (optional, for prizes)</span>
              <input name="contact" maxLength={80} placeholder="+55 …" />
            </label>
            {state === "error" ? (
              <p className="formerror">
                <span className="pt">Não deu: {error}</span>
                <span className="en">Failed: {error}</span>
              </p>
            ) : null}
            <button className="btn primary" type="submit" disabled={state === "sending"}>
              <Icon id="i-wallet" />
              <span className="pt">{state === "sending" ? "Enviando…" : "Reivindicar carteira"}</span>
              <span className="en">{state === "sending" ? "Sending…" : "Claim wallet"}</span>
            </button>
          </form>
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
