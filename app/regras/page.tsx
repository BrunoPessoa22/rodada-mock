import { Icon } from "@/components/Icons";

export const metadata = { title: "Regras — Rodada" };

export default function RulesPage() {
  return (
    <main className="wrap">
      <section style={{ maxWidth: 760, margin: "0 auto" }}>
        <div className="sechead" style={{ marginTop: 40 }}>
          <div>
            <span className="eyebrow">
              <span className="pt">Regras</span>
              <span className="en">Rules</span>
            </span>
            <h2>
              <span className="pt">Uma fórmula, todo mundo</span>
              <span className="en">One formula, everyone</span>
            </h2>
          </div>
        </div>
        <p className="secsub">
          <span className="pt">
            Opere o token do seu clube em dia de jogo, onde você já opera — suba na Artilharia e
            leve uma fatia de um pote que cresce todo dia. A Liga nunca executa ordens, nunca
            custodia fundos, nunca recomenda. Ela mede, pontua e paga.
          </span>
          <span className="en">
            Trade your club&apos;s token on match day, wherever you already trade — climb the
            leaderboard and take a share of a pot that grows every day. The League never executes
            trades, never holds funds, never recommends. It measures, scores, and pays.
          </span>
        </p>

        <div className="panel" style={{ marginTop: 26 }}>
          <div className="ph">
            <Icon id="i-scale" lg />
            <h3>
              <span className="pt">A fórmula</span>
              <span className="en">The formula</span>
            </h3>
          </div>
          <pre
            className="mono"
            style={{
              background: "var(--bg2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "14px 16px",
              fontSize: 13,
              overflowX: "auto",
            }}
          >
            {`pontos = √(seu fluxo LÍQUIDO de compra ou venda, em USD, na janela)
         × 2 em partidas em destaque
         × 2 se você está provendo liquidez em vez de tomar`}
          </pre>
          <p className="gapline" style={{ marginTop: 12 }}>
            <span className="pt">
              Três propriedades, escritas nas regras e garantidas no código: <b>ida-e-volta se
              anula</b> — compre e venda o mesmo tanto, pontue zero; <b>alavancagem não multiplica
              ponto</b> — colateral conta, nocional não; <b>o código de pontuação é público</b> —
              qualquer pessoa recalcula a Artilharia:{" "}
              <a href="https://github.com/BrunoPessoa22/rodada-mock/blob/main/lib/scoring.ts">
                lib/scoring.ts
              </a>
              .
            </span>
            <span className="en">
              Three properties, stated in the rules and enforced in code: <b>round-trips cancel</b>{" "}
              — buy and sell the same amount, score zero; <b>leverage doesn&apos;t multiply
              points</b> — collateral counts, notional doesn&apos;t; <b>the scoring code is
              public</b> — anyone can recompute the leaderboard:{" "}
              <a href="https://github.com/BrunoPessoa22/rodada-mock/blob/main/lib/scoring.ts">
                lib/scoring.ts
              </a>
              .
            </span>
          </p>
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <div className="ph">
            <Icon id="i-shield" lg />
            <h3>
              <span className="pt">Três regras que nunca quebramos</span>
              <span className="en">Three rules we never break</span>
            </h3>
          </div>
          <div className="rules3" style={{ marginTop: 8 }}>
            <div className="rule">
              <Icon id="i-check" />
              <span>
                <span className="pt">
                  <b>Pontos só por operação real e líquida.</b> Nunca damos capital semente a trader
                  — financiamos prêmios e rebates, não posições.
                </span>
                <span className="en">
                  <b>Points only for real, net trading.</b> No seed money to traders — ever. We fund
                  prizes and rebates, not positions.
                </span>
              </span>
            </div>
            <div className="rule">
              <Icon id="i-drop" />
              <span>
                <span className="pt">
                  <b>Nada de destaque em token raso.</b> Um piso público de profundidade decide —
                  protege o usuário de slippage e o influenciador de acusação de pump.
                </span>
                <span className="en">
                  <b>No featured match on a thin token.</b> A public depth threshold decides — it
                  protects users from slippage and KOLs from pump accusations.
                </span>
              </span>
            </div>
            <div className="rule">
              <Icon id="i-lock" />
              <span>
                <span className="pt">
                  <b>Prêmio segue pontos, nunca palpite.</b> A Liga nunca paga por resultado
                  esportivo. Competição de habilidade, não aposta.
                </span>
                <span className="en">
                  <b>Prizes follow points, never predictions.</b> The League never pays out on
                  sporting results. Skill competition, not betting.
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <div className="ph">
            <Icon id="i-trend" lg />
            <h3>
              <span className="pt">Onde a Liga conta hoje</span>
              <span className="en">Where the League counts today</span>
            </h3>
          </div>
          <p className="gapline">
            <span className="pt">
              <b>Kayen (Chiliz Chain)</b> — automático, on-chain, ao vivo nesta beta. Swaps líquidos
              e liquidez adicionada nos pools dos tokens da janela, atribuídos à carteira que
              assinou a transação. <b>Mercado Bitcoin · OKX · Paribu · Binance</b> — entram na
              sequência via chave de API somente-leitura que você conecta uma vez. <b>Vibe ·
              Socios</b> — integração direta em conversa.
            </span>
            <span className="en">
              <b>Kayen (Chiliz Chain)</b> — automatic, on-chain, live in this beta. Net swaps and
              added liquidity on the window&apos;s token pools, attributed to the wallet that signed
              the transaction. <b>Mercado Bitcoin · OKX · Paribu · Binance</b> — next, via a
              read-only API key you link once. <b>Vibe · Socios</b> — direct integration in
              discussion.
            </span>
          </p>
        </div>
      </section>
    </main>
  );
}
