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
  it("splits the pool pro-rata over verified identities only", () => {
    const s = computeSettlement({ slug: "m1" });
    expect(s.poolChz).toBe(1000);
    // Unverified C's 60 points don't dilute the payout: payable = 30 + 10 = 40.
    expect(s.payablePoints).toBe(40);
    const byHandle = Object.fromEntries(s.rows.map((r) => [r.handle, r.chz]));
    expect(byHandle.alice).toBeCloseTo(750, 6); // 30/40 × 1000
    expect(byHandle.bob).toBeCloseTo(250, 6); // 10/40 × 1000
    expect(s.rows.some((r) => r.address === C)).toBe(false);
    // Allocated CHZ never exceeds the pool.
    const total = s.rows.reduce((sum, r) => sum + r.chz, 0);
    expect(total).toBeLessThanOrEqual(1000 + 1e-6);
  });

  it("emits full addresses in the settlement CSV (needed to actually pay)", () => {
    const csv = settlementCsv(computeSettlement({ slug: "m1" }));
    expect(csv.split("\n")[0]).toBe("scope,address,handle,points,chz");
    expect(csv).toContain(A);
    expect(csv).toContain("750.0000");
  });

  it("persists computed payouts idempotently", () => {
    const s = computeSettlement({ slug: "m1" });
    expect(recordSettlement(s)).toBe(2);
    recordSettlement(s); // re-run replaces, doesn't duplicate
    const n = (db.prepare("SELECT COUNT(*) AS n FROM payouts WHERE scope = 'm1'").get() as { n: number }).n;
    expect(n).toBe(2);
  });
});
