import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let dataDir: string;
let db: ReturnType<(typeof import("./db"))["getDb"]>;
let getLeaderboard: (typeof import("./queries"))["getLeaderboard"];

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "rodada-leaderboard-"));
  process.env.DATA_DIR = dataDir;

  const dbModule = await import("./db");
  const queryModule = await import("./queries");
  db = dbModule.getDb();
  getLeaderboard = queryModule.getLeaderboard;
});

beforeEach(() => {
  db.exec(`
    DELETE FROM scores;
    DELETE FROM matches;
    DELETE FROM wallets;
  `);
});

afterAll(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe("getLeaderboard", () => {
  it("shows a verified signup before their first scored trade", () => {
    db.prepare(
      `INSERT INTO wallets (address, handle, status, venue, created_at)
       VALUES (?, ?, 'verified', 'kayen', ?)`
    ).run(
      "0x1111111111111111111111111111111111111111",
      "newtrader",
      "2026-07-24T10:00:00.000Z"
    );

    const board = getLeaderboard({ poolChz: 1_000 });

    expect(board.entries).toHaveLength(1);
    expect(board.entries[0]).toMatchObject({
      rank: 1,
      display: "newtrader",
      verified: true,
      points: 0,
      projectedChz: 0,
    });
    expect(board.wallets).toBe(0);
  });

  it("keeps scoring traders first and orders new signups newest first", () => {
    db.prepare(
      `INSERT INTO matches (
         id, slug, home, away, competition, kickoff_utc,
         window_start_utc, window_end_utc, tokens, pool_chz
       ) VALUES (1, 'arsenal-psg', 'Arsenal', 'PSG', 'Friendly', ?, ?, ?, ?, 1000)`
    ).run(
      "2026-07-26T18:00:00.000Z",
      "2026-07-26T15:00:00.000Z",
      "2026-07-26T21:00:00.000Z",
      JSON.stringify(["AFC", "PSG"])
    );

    const insertWallet = db.prepare(
      `INSERT INTO wallets (address, handle, status, venue, created_at)
       VALUES (?, ?, 'verified', 'kayen', ?)`
    );
    insertWallet.run(
      "0x2222222222222222222222222222222222222222",
      "scorer",
      "2026-07-24T08:00:00.000Z"
    );
    insertWallet.run(
      "0x3333333333333333333333333333333333333333",
      "earlybird",
      "2026-07-24T09:00:00.000Z"
    );
    insertWallet.run(
      "0x4444444444444444444444444444444444444444",
      "latestjoiner",
      "2026-07-24T10:00:00.000Z"
    );

    db.prepare(
      `INSERT INTO scores (
         match_id, address, net_taker_usd, maker_add_usd, swaps, points
       ) VALUES (1, ?, 250, 0, 3, 25)`
    ).run("0x2222222222222222222222222222222222222222");

    const board = getLeaderboard({ matchId: 1, poolChz: 1_000 });

    expect(board.entries.map((entry) => entry.display)).toEqual([
      "scorer",
      "latestjoiner",
      "earlybird",
    ]);
    expect(board.entries.map((entry) => entry.points)).toEqual([25, 0, 0]);
    expect(board.totalPoints).toBe(25);
    expect(board.payablePoints).toBe(25);
    expect(board.wallets).toBe(1);
  });

  it("never mixes an archived season into the live board", () => {
    const insertMatch = db.prepare(
      `INSERT INTO matches (
         id, slug, home, away, competition, kickoff_utc,
         window_start_utc, window_end_utc, tokens, pool_chz, season
       ) VALUES (?, ?, 'A', 'B', 'Cup', ?, ?, ?, ?, 1000, ?)`
    );
    // Same shape, two seasons: the retired preseason board and the live one.
    insertMatch.run(
      1, "old", "2026-07-19T18:00:00.000Z", "2026-07-19T15:00:00.000Z",
      "2026-07-19T21:00:00.000Z", JSON.stringify(["X"]), "preseason-2026"
    );
    insertMatch.run(
      2, "new", "2026-09-01T18:00:00.000Z", "2026-09-01T15:00:00.000Z",
      "2026-09-01T21:00:00.000Z", JSON.stringify(["X"]), "2026-pilot"
    );
    const score = db.prepare(
      `INSERT INTO scores (match_id, address, net_taker_usd, maker_add_usd, swaps, points)
       VALUES (?, ?, 0, 0, 1, ?)`
    );
    score.run(1, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 500); // preseason whale
    score.run(2, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", 7); // pilot season

    const live = getLeaderboard({ poolChz: 1_000 });
    expect(live.totalPoints).toBe(7);
    expect(live.entries.map((e) => e.address)).toEqual([
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ]);

    // The archive is still readable on request — retired, not deleted.
    const archive = getLeaderboard({ season: "preseason-2026", poolChz: 0 });
    expect(archive.totalPoints).toBe(500);
  });

  it("does not pay a lone verified wallet the whole pool", () => {
    db.prepare(
      `INSERT INTO matches (id, slug, home, away, competition, kickoff_utc,
         window_start_utc, window_end_utc, tokens, pool_chz)
       VALUES (1, 'm', 'A', 'B', 'Cup', ?, ?, ?, ?, 1000)`
    ).run(
      "2026-09-01T18:00:00.000Z", "2026-09-01T15:00:00.000Z",
      "2026-09-01T21:00:00.000Z", JSON.stringify(["X"])
    );
    db.prepare(
      "INSERT INTO wallets (address, handle, status) VALUES (?, 'solo', 'verified')"
    ).run("0x1111111111111111111111111111111111111111");
    const score = db.prepare(
      `INSERT INTO scores (match_id, address, net_taker_usd, maker_add_usd, swaps, points)
       VALUES (1, ?, 0, 0, 1, ?)`
    );
    score.run("0x1111111111111111111111111111111111111111", 10);
    score.run("0x9999999999999999999999999999999999999999", 90); // unverified

    const board = getLeaderboard({ matchId: 1, poolChz: 1_000 });
    const solo = board.entries.find((e) => e.display === "solo")!;
    expect(solo.projectedChz).toBeCloseTo(100, 6); // 10/100 × 1000, not 1000
    expect(board.unclaimedPoints).toBe(90);
  });
});
