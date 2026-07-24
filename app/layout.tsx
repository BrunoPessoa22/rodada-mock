import type { Metadata } from "next";
import Link from "next/link";
import { IconSprite, Icon } from "@/components/Icons";
import "./globals.css";

export const metadata: Metadata = {
  title: "Matchday Markets — Trade the match. Share the pot.",
  description:
    "Trade your club's fan token on match day, wherever you already trade. Matchday Markets measures, scores, and pays — it never executes, never holds custody, never recommends.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <IconSprite />
        <header className="site-header">
          <div className="wrap">
            <div className="topbar">
              <Link href="/" className="brand">
                <span className="mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 3 5 6.5v5c0 5.2 3.58 10 7 11.2 3.42-1.2 7-6 7-11.2v-5L12 3z" />
                    <path d="m9 12 2.2 2.2L15 10.5" />
                  </svg>
                </span>
                <span className="wordmark">Matchday Markets</span>
                <span className="prod">Rodada · beta</span>
              </Link>
              <nav className="mainnav" aria-label="Main">
                <Link href="/#pot">Prize pot</Link>
                <Link href="/#match">Match</Link>
                <Link href="/#board">Leaderboard</Link>
                <Link href="/regras">Rules</Link>
              </nav>
              <div className="right">
                <Link className="btn primary sm" href="/entrar">
                  <Icon id="i-wallet" />
                  Join Rodada
                </Link>
              </div>
            </div>
          </div>
        </header>
        {children}
        <footer>
          <div className="wrap">
            <div className="stack">
              <span>
                Product: <b>Matchday Markets</b>
              </span>
              <span>
                On-chain counting: <b>Kayen · Chiliz Chain</b>
              </span>
              <span>
                Open scoring:{" "}
                <a href="https://github.com/BrunoPessoa22/rodada-mock/blob/main/lib/scoring.ts">
                  lib/scoring.ts
                </a>
              </span>
            </div>
            <p>
              Live beta — the leaderboard counts real trades on Kayen (Chiliz Chain) inside matchday
              windows; CEX partners coming next. Matchday Markets does not execute orders, does not
              hold custody, and does not provide investment advice. It does not operate betting and
              never pays out on sporting results. Fan Tokens are utility assets and prices fluctuate.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
