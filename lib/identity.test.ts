import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mergeFlowsByIdentity, scoreWindow, type WalletFlow } from "./scoring";

let dataDir: string;
let db: ReturnType<(typeof import("./db"))["getDb"]>;
let resolveIdentities: (typeof import("./indexer"))["resolveIdentities"];
let identityPOST: (typeof import("../app/api/admin/identity/route"))["POST"];

const ADMIN = "identity-test-token"; // must match vitest.config test.env.ADMIN_TOKEN
const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const D = "0x4444444444444444444444444444444444444444";

const linkReq = (address: string, identityId: string | null) =>
  new Request("https://x/api/admin/identity", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN}` },
    body: JSON.stringify({ address, identityId }),
  });

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "rodada-identity-"));
  process.env.DATA_DIR = dataDir;
  db = (await import("./db")).getDb();
  resolveIdentities = (await import("./indexer")).resolveIdentities;
  identityPOST = (await import("../app/api/admin/identity/route")).POST;
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

describe("admin/identity keeps the graph flat (single-hop resolution is safe)", () => {
  it("rejects linking to a target that is itself linked (no chains)", async () => {
    // B → A (A is a root).
    expect((await identityPOST(linkReq(B, A))).status).toBe(200);
    // Now try D → B: B is not a root, must be rejected.
    const res = await identityPOST(linkReq(D, B));
    expect(res.status).toBe(409);
    expect((db.prepare("SELECT identity_id FROM wallets WHERE address = ?").get(D) as { identity_id: string | null } | undefined)?.identity_id ?? null).toBeNull();
  });

  it("rejects making a root a leaf (no cycles / re-parenting a root)", async () => {
    // B → A makes A a root with a dependent.
    expect((await identityPOST(linkReq(B, A))).status).toBe(200);
    // A → B would create a cycle; reject.
    const res = await identityPOST(linkReq(A, B));
    expect(res.status).toBe(409);
    expect((db.prepare("SELECT identity_id FROM wallets WHERE address = ?").get(A) as { identity_id: string | null } | undefined)?.identity_id ?? null).toBeNull();
  });

  it("allows unlinking (identityId null) unconditionally", async () => {
    expect((await identityPOST(linkReq(B, A))).status).toBe(200);
    expect((await identityPOST(linkReq(B, null))).status).toBe(200);
    expect((db.prepare("SELECT identity_id FROM wallets WHERE address = ?").get(B) as { identity_id: string | null } | undefined)?.identity_id ?? null).toBeNull();
  });
});
