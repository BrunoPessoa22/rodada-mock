import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let dataDir: string;
let db: ReturnType<(typeof import("./db"))["getDb"]>;
let computeSettlement: (typeof import("./settlement"))["computeSettlement"];
let recordSettlement: (typeof import("./settlement"))["recordSettlement"];
let settlementCsv: (typeof import("./settlement"))["settlementCsv"];

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const C = "0x3333333333333333333333333333333333333333"; // unverified scorer

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "rodada-settle-"));
  process.env.DATA_DIR = dataDir;
  db = (await import("./db")).getDb();
  const mod = await import("./settlement");
  computeSettlement = mod.computeSettlement;
  recordSettlement = mod.recordSettlement;
  settlementCsv = mod.settlementCsv;
});

beforeEach(() => {
  db.exec("DELETE FROM scores; DELETE FROM matches; DELETE FROM wallets; DELETE FROM payouts;");
  db.prepare(
    `INSERT INTO matches (id, slug, home, away, competition, kickoff_utc,
       window_start_utc, window_end_utc, tokens, pool_chz)
     VALUES (1, 'm1', 'A', 'B', 'Cup', ?, ?, ?, ?, 1000)`
  ).run(
    "2026-08-01T18:00:00.000Z",
    "2026-08-01T15:00:00.000Z",
    "2026-08-01T21:00:00.000Z",
    JSON.stringify(["X"])
  );
  const wallet = db.prepare(
    "INSERT INTO wallets (address, handle, status) VALUES (?, ?, ?)"
  );
  wallet.run(A, "alice", "verified");
  wallet.run(B, "bob", "verified");
  wallet.run(C, null, "unclaimed");
  const score = db.prepare(
    "INSERT INTO scores (match_id, address, points, net_taker_usd, maker_add_usd, swaps) VALUES (1, ?, ?, 0, 0, 1)"
  );
  score.run(A, 30);
  score.run(B, 10);
  score.run(C, 60); // unverified: appears on board but is NOT payable
});

afterAll(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe("computeSettlement", () => {
  it("pays each verified identity its share of ALL points on the board", () => {
    const s = computeSettlement({ slug: "m1" });
    expect(s.poolChz).toBe(1000);
    // Board total = 100 points (30 + 10 + 60); only 40 of them are payable.
    expect(s.payablePoints).toBe(40);
    const byHandle = Object.fromEntries(s.rows.map((r) => [r.handle, r.chz]));
    expect(byHandle.alice).toBeCloseTo(300, 6); // 30/100 × 1000
    expect(byHandle.bob).toBeCloseTo(100, 6); // 10/100 × 1000
    expect(s.rows.some((r) => r.address === C)).toBe(false);
    // Unverified C's 60 points are simply not paid — that 600 CHZ stays in the
    // pot. Renormalizing over the verified subset instead would hand alice and
    // bob the whole 1000 for having claimed a handle, which is how one early
    // signup ends up projected the entire season pool.
    const total = s.rows.reduce((sum, r) => sum + r.chz, 0);
    expect(total).toBeCloseTo(400, 6);
    expect(total).toBeLessThanOrEqual(1000 + 1e-6);
  });

  it("caps one verified identity's share at its own points share of the board", () => {
    // The pathological case: a single verified wallet with a tiny score sits on
    // a board dominated by unverified addresses. It must NOT collect the pool.
    db.prepare("UPDATE wallets SET status = 'unclaimed', handle = NULL WHERE address = ?").run(B);
    const s = computeSettlement({ slug: "m1" });
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].handle).toBe("alice");
    expect(s.rows[0].chz).toBeCloseTo(300, 6); // 30/100 × 1000 — not 1000
  });

  it("emits full addresses in the settlement CSV (needed to actually pay)", () => {
    const csv = settlementCsv(computeSettlement({ slug: "m1" }));
    expect(csv.split("\n")[0]).toBe("scope,address,handle,points,chz");
    expect(csv).toContain(A);
    expect(csv).toContain("300.0000");
  });

  it("persists computed payouts idempotently", () => {
    const s = computeSettlement({ slug: "m1" });
    expect(recordSettlement(s)).toBe(2);
    recordSettlement(s); // re-run replaces, doesn't duplicate
    const n = (db.prepare("SELECT COUNT(*) AS n FROM payouts WHERE scope = 'm1'").get() as { n: number }).n;
    expect(n).toBe(2);
  });

  it("never overwrites an already-paid row on re-settlement", () => {
    const s = computeSettlement({ slug: "m1" });
    recordSettlement(s);
    // Mark alice paid at the settled amount, with a tx hash.
    db.prepare(
      "UPDATE payouts SET status = 'paid', tx_hash = '0xabc', chz = 300 WHERE scope = 'm1' AND handle = 'alice'"
    ).run();
    // Bob trades more, alice's share would recompute lower — re-settle.
    db.prepare("UPDATE scores SET points = 40 WHERE address = ?").run(B);
    recordSettlement(computeSettlement({ slug: "m1" }));
    const alice = db
      .prepare("SELECT status, tx_hash, chz FROM payouts WHERE scope = 'm1' AND handle = 'alice'")
      .get() as { status: string; tx_hash: string; chz: number };
    expect(alice.status).toBe("paid");
    expect(alice.tx_hash).toBe("0xabc");
    expect(alice.chz).toBe(300); // untouched by the recompute
  });
});
