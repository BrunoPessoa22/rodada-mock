"use client";

import { useCallback, useEffect, useState } from "react";

interface Claim {
  id: number;
  address: string;
  handle: string;
  venue: string | null;
  contact: string | null;
  status: string;
  created_at: string;
}

interface Match {
  id: number;
  slug: string;
  home: string;
  away: string;
  competition: string;
  kickoff_utc: string;
  window_start_utc: string;
  window_end_utc: string;
  featured: number;
  status: string;
  tokens: string[];
  pool_chz: number;
  chz_usd: number | null;
  scored_at: string | null;
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState(false);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [log, setLog] = useState<string>("");

  useEffect(() => {
    const stored = sessionStorage.getItem("rodada-admin-token");
    if (stored) {
      setToken(stored);
      setSaved(true);
    }
  }, []);

  const auth = useCallback(
    (): Record<string, string> => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  const refresh = useCallback(async () => {
    const [claimsRes, matchesRes] = await Promise.all([
      fetch("/api/admin/claims", { headers: auth() }),
      fetch("/api/matches"),
    ]);
    if (claimsRes.ok) setClaims(((await claimsRes.json()) as { claims: Claim[] }).claims);
    else setLog(`claims: HTTP ${claimsRes.status}`);
    if (matchesRes.ok) setMatches(((await matchesRes.json()) as { matches: Match[] }).matches);
  }, [auth]);

  useEffect(() => {
    if (saved) void refresh();
  }, [saved, refresh]);

  async function act(id: number, action: "approve" | "reject") {
    const res = await fetch("/api/admin/claims", {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ id, action }),
    });
    setLog(`${action} #${id}: HTTP ${res.status} ${JSON.stringify(await res.json())}`);
    void refresh();
  }

  async function rescore(slug: string) {
    setLog(`rescoring ${slug}…`);
    const res = await fetch("/api/admin/rescore", {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ slug }),
    });
    setLog(`rescore ${slug}: HTTP ${res.status} ${JSON.stringify(await res.json())}`);
    void refresh();
  }

  async function saveMatch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const body = {
      slug: f.get("slug"),
      home: f.get("home"),
      away: f.get("away"),
      competition: f.get("competition"),
      kickoff_utc: f.get("kickoff_utc"),
      window_start_utc: f.get("window_start_utc"),
      window_end_utc: f.get("window_end_utc"),
      featured: f.get("featured") === "on",
      pool_chz: Number(f.get("pool_chz") ?? 0),
      tokens: String(f.get("tokens") ?? "")
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean),
    };
    const res = await fetch("/api/admin/matches", {
      method: "POST",
      headers: auth(),
      body: JSON.stringify(body),
    });
    setLog(`match: HTTP ${res.status} ${JSON.stringify(await res.json())}`);
    void refresh();
  }

  if (!saved) {
    return (
      <main className="wrap">
        <section style={{ maxWidth: 420, margin: "60px auto" }}>
          <h2>Admin</h2>
          <form
            className="adminform"
            onSubmit={(e) => {
              e.preventDefault();
              sessionStorage.setItem("rodada-admin-token", token);
              setSaved(true);
            }}
          >
            <input
              type="password"
              placeholder="admin token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button className="btn primary" type="submit">
              Sign in
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="wrap" style={{ paddingBottom: 60 }}>
      <div className="sechead" style={{ marginTop: 30 }}>
        <h2>Admin</h2>
        <button
          className="btn secondary sm"
          onClick={() => {
            sessionStorage.removeItem("rodada-admin-token");
            setSaved(false);
          }}
        >
          sair
        </button>
      </div>
      {log ? <p className="gapline mono" style={{ fontSize: 12 }}>{log}</p> : null}

      <div className="admingrid">
        <div className="panel">
          <div className="ph">
            <h3>Claims</h3>
          </div>
          {claims.length === 0 ? <p className="gapline">nenhum</p> : null}
          {claims.map((c) => (
            <div className="adminrow" key={c.id}>
              <span>
                <b>{c.handle}</b> <span className="mono">{c.address.slice(0, 10)}…</span>
                <br />
                <span className="mono">
                  {c.status} · {c.venue ?? "—"} · {c.contact ?? "—"}
                </span>
              </span>
              {c.status === "pending" ? (
                <span style={{ display: "flex", gap: 6 }}>
                  <button className="btn primary sm" onClick={() => act(c.id, "approve")}>
                    ok
                  </button>
                  <button className="btn secondary sm" onClick={() => act(c.id, "reject")}>
                    não
                  </button>
                </span>
              ) : null}
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="ph">
            <h3>Rodadas</h3>
          </div>
          {matches.map((m) => (
            <div className="adminrow" key={m.id}>
              <span>
                <b>{m.slug}</b> {m.featured ? "★" : ""}
                <br />
                <span className="mono">
                  {m.status} · {m.window_start_utc} → {m.window_end_utc} · {m.tokens.join(",")} ·{" "}
                  {m.pool_chz} CHZ{m.scored_at ? ` · scored ${m.scored_at}` : ""}
                </span>
              </span>
              <button className="btn secondary sm" onClick={() => rescore(m.slug)}>
                rescore
              </button>
            </div>
          ))}
          <form className="adminform" onSubmit={saveMatch}>
            <input name="slug" placeholder="slug (upsert key)" required />
            <input name="home" placeholder="home" required />
            <input name="away" placeholder="away" required />
            <input name="competition" placeholder="competition" required />
            <input name="kickoff_utc" placeholder="kickoff 2026-07-19T19:00:00Z" required />
            <input name="window_start_utc" placeholder="window start (ISO Z)" required />
            <input name="window_end_utc" placeholder="window end (ISO Z)" required />
            <input name="tokens" placeholder="tokens: ARG,SPAIN" required />
            <input name="pool_chz" placeholder="pool CHZ" type="number" defaultValue={0} />
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" name="featured" /> featured (display only)
            </label>
            <button className="btn primary sm" type="submit">
              salvar rodada
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
