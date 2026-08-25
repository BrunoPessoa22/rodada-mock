import Link from "next/link";

export const metadata = { title: "Data policy — Trading League" };

/**
 * What the league actually stores, mapped one-to-one to the DB schema in
 * lib/db.ts. Every claim on this page is checkable against that file — if a
 * column is added that holds personal data, this page must change with it.
 */
export default function PrivacyPage() {
  return (
    <main className="wrap">
      <section className="legal">
        <div className="sechead" style={{ marginTop: 48 }}>
          <div>
            <span className="eyebrow">Data policy</span>
            <h2>What we store, and why</h2>
          </div>
        </div>
        <p className="secsub">
          Short version: public blockchain data, the name you pick, and — only if you type it — one
          contact handle so a prize can reach you. Last updated 24 August 2026.
        </p>

        <h3>What we collect</h3>
        <ul>
          <li>
            <b>Public chain data.</b> Wallet addresses, swap and liquidity events, and the amounts
            in them, read from Chiliz Chain — and, for claimed wallets only, position data from
            vibe.trading&apos;s public HyperEVM records. This is already public and we do not make
            it more public than it is — the board shows unclaimed addresses truncated (0x12…abcd).
          </li>
          <li>
            <b>Your display name.</b> The handle you choose. It replaces your truncated address on
            the board. Choosing one is what makes you eligible for a prize.
          </li>
          <li>
            <b>A contact handle, only if you provide it.</b> A WhatsApp number or Telegram
            username, so we can reach you about a prize. It is optional, it is never shown on the
            board, and leaving it blank does not affect your score.
          </li>
          <li>
            <b>A signature record.</b> The one-time challenge you signed to prove the wallet is
            yours. It proves ownership; it cannot move funds.
          </li>
          <li>
            <b>A read-only exchange API key, only if you connect one.</b> Optional. Before storing
            it we ask the exchange itself what the key can do and refuse anything beyond
            &quot;read&quot;; we re-check on every collection run and disconnect the key
            automatically if its permissions ever widen. It is stored encrypted (AES-256-GCM),
            never logged, and used for exactly one thing: reading your own fan-token trades during
            match windows. Disconnecting on the join page deletes the key immediately; the
            aggregated match-window volume it already produced stays on the board, credential-free.
          </li>
        </ul>

        <h3>What we never collect</h3>
        <p>
          No private keys. No seed phrases. No withdrawal or spending permissions. No exchange
          credentials with trading rights — the exchange link accepts read-only API keys only, the
          exchange&apos;s own permission endpoint is the judge, and a key that gains trading rights
          later is dropped automatically. No documents, no selfies, no background tracking or
          advertising profiles across other sites.
        </p>

        <h3>What we do with it</h3>
        <p>
          Compute the leaderboard, show it, and pay prizes. That is the whole purpose. We do not
          sell personal data, and we do not share it for anyone else&apos;s marketing.
        </p>

        <h3>Who can see what</h3>
        <p>
          Public: your chosen handle, your points, your swap count, your net flow, and your
          estimated share. Not public: your contact handle and your full wallet address once you
          have claimed it — the public API truncates addresses.
        </p>

        <h3>How long we keep it</h3>
        <p>
          Scores and match records are kept as the league&apos;s competitive record. Contact details
          are kept while you take part and for as long as needed to settle prizes and meet
          accounting obligations, then deleted. A rejected claim&apos;s contact details are deleted
          when it is rejected.
        </p>

        <h3>Your rights</h3>
        <p>
          You can ask for a copy of what we hold about you, ask for it to be corrected, ask for your
          contact details to be deleted, or ask to be removed from the board. Removing your handle
          returns you to a truncated public address — it cannot erase the underlying blockchain
          activity, which is not ours to delete. Ask via the operator contact published with the
          current matchday announcement.
        </p>

        <h3>Where it lives</h3>
        <p>
          On a single server the operator controls, in one database, backed up daily. Third parties
          involved: the public Chiliz Chain RPC, public market-data endpoints for prices and venue
          volume, WalletConnect for the Socios.com sign-in flow, and — only if you connected a
          read-only key — signed read requests to your own account on the exchange you connected.
          None of them receive your contact details.
        </p>

        <h3>Cookies</h3>
        <p>
          The site sets no advertising or analytics cookies. Sign-in state is held in your own
          browser.
        </p>

        <div style={{ marginTop: 28, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn secondary" href="/terms">
            Terms
          </Link>
          <Link className="btn secondary" href="/prizes">
            Prize rules
          </Link>
        </div>
      </section>
    </main>
  );
}
