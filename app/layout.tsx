import type { Metadata } from "next";
import Link from "next/link";
import { IconSprite } from "@/components/Icons";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rodada — Fan Token Trading League",
  description:
    "Trade the match. Share the pot. Connect once, trade eligible Fan Tokens inside published match windows, and earn a share of the weekly reward pool.",
};

function BrandMark() {
  return (
    <div
      style={{
        width: 38,
        height: 38,
        borderRadius: 11,
        background: "var(--blue-ink)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: 4,
          background: "var(--lime-500)",
        }}
      />
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="ft-typo" style={{ ["--sig" as string]: "var(--lime-500)", ["--sig-ink" as string]: "var(--lime-ink)", ["--sig-soft" as string]: "var(--lime-50)" }}>
        <IconSprite />
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            background: "rgba(255,255,255,.86)",
            backdropFilter: "saturate(180%) blur(12px)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              maxWidth: 1200,
              margin: "0 auto",
              padding: "0 40px",
              height: 80,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 32,
            }}
          >
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 12, color: "inherit" }}>
              <BrandMark />
              <div style={{ lineHeight: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: ".01em" }}>Rodada</div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 9,
                    letterSpacing: ".14em",
                    color: "var(--fg-muted)",
                    textTransform: "uppercase",
                    marginTop: 3,
                  }}
                >
                  Fan Token Trading League
                </div>
              </div>
            </Link>
            <nav
              className="rd-nav"
              style={{ display: "flex", alignItems: "center", gap: 30, fontSize: 14, fontWeight: 500 }}
              aria-label="Main"
            >
              <Link href="/#pot" style={{ color: "var(--brand)", fontWeight: 600 }}>
                Weekly pot
              </Link>
              <Link href="/#match" style={{ color: "var(--fg)" }}>
                Matches
              </Link>
              <Link href="/#board" style={{ color: "var(--fg)" }}>
                Leaderboard
              </Link>
              <Link href="/regras" style={{ color: "var(--fg)" }}>
                How it works
              </Link>
            </nav>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <Link href="/entrar" style={{ color: "var(--fg)", fontSize: 14, fontWeight: 500 }}>
                Sign in
              </Link>
              <Link
                href="/entrar"
                className="btn primary"
                style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
              >
                Join this week
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M7 17 17 7" />
                  <path d="M7 7h10v10" />
                </svg>
              </Link>
            </div>
          </div>
        </header>
        {children}
        <footer style={{ borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
          <div
            style={{
              maxWidth: 1200,
              margin: "0 auto",
              padding: "32px 40px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 24,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  background: "var(--blue-ink)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "none",
                }}
              >
                <div
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: 3,
                    background: "var(--lime-500)",
                  }}
                />
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-muted)", maxWidth: 440 }}>
                Rodada measures eligible activity. It never executes trades or holds user funds.
              </span>
            </div>
            <div style={{ display: "flex", gap: 24, fontSize: 13, fontWeight: 500 }}>
              <Link href="/regras" style={{ color: "var(--fg-muted)" }}>
                Eligibility
              </Link>
              <Link href="/regras" style={{ color: "var(--fg-muted)" }}>
                Scoring
              </Link>
              <Link href="/regras" style={{ color: "var(--fg-muted)" }}>
                Data policy
              </Link>
              <Link href="/regras" style={{ color: "var(--fg-muted)" }}>
                Prize rules
              </Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
