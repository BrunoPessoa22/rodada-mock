import type { Metadata } from "next";
import Link from "next/link";
import { IconSprite, Icon } from "@/components/Icons";
import { LangTabs } from "@/components/LangTabs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rodada — Liga do Trader de Fan Tokens",
  description:
    "Opere o token do seu clube em dia de jogo, onde você já opera. A Liga mede, pontua e paga — nunca executa, nunca custodia, nunca recomenda.",
};

const LANG_BOOT = `try{if(localStorage.getItem('rodada-lang')==='en')document.documentElement.setAttribute('data-lang','en')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <script dangerouslySetInnerHTML={{ __html: LANG_BOOT }} />
      </head>
      <body>
        <IconSprite />
        <header className="wrap">
          <div className="topbar">
            <div className="brand">
              <span className="shield">
                <svg viewBox="0 0 24 24">
                  <path d="M12 3 5 6.5v5c0 5.2 3.58 10 7 11.2 3.42-1.2 7-6 7-11.2v-5L12 3z" />
                  <path d="m9 12 2.2 2.2L15 10.5" />
                </svg>
              </span>
              <span className="wordmark">Fan Token Intel</span>
              <span className="prod">
                <b>rodada</b> · brasil · beta
              </span>
            </div>
            <nav className="mainnav" aria-label="principal">
              <Link href="/#pote">
                <span className="pt">Pote</span>
                <span className="en">Prize pot</span>
              </Link>
              <Link href="/#jogao">
                <span className="pt">Jogão</span>
                <span className="en">Big match</span>
              </Link>
              <Link href="/regras">
                <span className="pt">Regras</span>
                <span className="en">Rules</span>
              </Link>
              <Link href="/proposal">
                <span className="pt">Proposta</span>
                <span className="en">Proposal</span>
              </Link>
            </nav>
            <div className="right">
              <LangTabs />
              <Link className="btn primary sm" href="/entrar">
                <Icon id="i-wallet" />
                <span className="pt">Entrar na Liga</span>
                <span className="en">Join the League</span>
              </Link>
            </div>
          </div>
        </header>
        {children}
        <footer>
          <div className="stack">
            <span>
              <span className="pt">Dados:</span>
              <span className="en">Data:</span> <b>Fan Token Intel</b>
            </span>
            <span>
              <span className="pt">Contagem on-chain:</span>
              <span className="en">On-chain counting:</span> <b>Kayen · Chiliz Chain</b>
            </span>
            <span>
              <span className="pt">Scoring aberto:</span>
              <span className="en">Open scoring:</span>{" "}
              <a href="https://github.com/BrunoPessoa22/rodada-mock/blob/main/lib/scoring.ts">
                lib/scoring.ts
              </a>
            </span>
          </div>
          <p>
            <span className="pt">
              Beta ao vivo — a Artilharia conta operações reais na Kayen (Chiliz Chain) dentro das
              janelas de rodada; parceiros CEX em breve. A Liga não executa ordens, não custodia
              ativos e não faz recomendação de investimento. A Rodada não opera apostas e nunca paga
              por resultado esportivo. Fan Tokens™ são ativos de utilidade e seus preços variam.
            </span>
            <span className="en">
              Live beta — the leaderboard counts real trades on Kayen (Chiliz Chain) inside matchday
              windows; CEX partners coming next. The League does not execute orders, does not hold
              custody and does not provide investment advice. Rodada does not operate betting and
              never pays out on sporting results. Fan Tokens™ are utility assets and prices
              fluctuate.
            </span>
          </p>
        </footer>
      </body>
    </html>
  );
}
