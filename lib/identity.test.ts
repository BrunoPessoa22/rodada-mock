import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mergeFlowsByIdentity, scoreWindow, type WalletFlow } from "./scoring";

let dataDir: string;
let db: ReturnType<(typeof import("./db"))["getDb"]>;
let resolveIdentities: (typeof import("./indexer"))["resolveIdentities"];

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "rodada-identity-"));
  process.env.DATA_DIR = dataDir;
  db = (await import("./db")).getDb();
  resolveIdentities = (await import("./indexer")).resolveIdentities;
});

beforeEach(() => {
  db.exec("DELETE FROM wallets;");
});

afterAll(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

const flow = (address: string, buy: number, mark: number): WalletFlow => ({
  address,
  grossBuyUsd: buy,
  grossSellUsd: 0,
  makerAddUsd: 0,
  makerRemoveUsd: 0,
  inventoryMarkUsd: mark,
  swaps: 1,
});

describe("identity linking (writer → resolveIdentities → merge)", () => {
  it("returns no remapping when nothing is linked", () => {
    const primary = "0x1111111111111111111111111111111111111111";
    const secondary = "0x2222222222222222222222222222222222222222";
    db.prepare("INSERT INTO wallets (address) VALUES (?), (?)").run(primary, secondary);
    const map = resolveIdentities(db, [primary, secondary]);
    expect(map.size).toBe(0);
  });

  it("collapses linked wallets so a split can't out-earn one wallet", () => {
    const primary = "0x1111111111111111111111111111111111111111";
    const secondary = "0x2222222222222222222222222222222222222222";
    // Two wallets, same person, $50 + $50 of profitable flow.
    db.prepare("INSERT INTO wallets (address, identity_id) VALUES (?, NULL)").run(primary);
    db.prepare("INSERT INTO wallets (address, identity_id) VALUES (?, ?)").run(secondary, primary);

    const flows = [flow(primary, 50, 60), flow(secondary, 50, 60)];
    const map = resolveIdentities(db, flows.map((f) => f.address));
    expect(map.get(secondary)).toBe(primary);

    const solo = scoreWindow(flows);
    const soloTotal = solo.reduce((s, w) => s + w.points, 0);

    const merged = scoreWindow(mergeFlowsByIdentity(flows, (a) => map.get(a) ?? a));
    expect(merged).toHaveLength(1);
    expect(merged[0].address).toBe(primary);
    // Merging removes the wallet-splitting edge (one big unlock < two small unlocks).
    expect(merged[0].points).toBeLessThanOrEqual(soloTotal + 1e-9);
  });
});
