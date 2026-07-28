import { describe, expect, it } from "vitest";
import { clientIp } from "./ratelimit";

const req = (headers: Record<string, string>) => new Request("https://x", { headers });

describe("clientIp (default 1 trusted proxy hop)", () => {
  it("takes the rightmost XFF entry — the proxy-observed client, not a spoof", () => {
    // Attacker prepends a fake IP; Traefik appends the real peer on the right.
    const ip = clientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }));
    expect(ip).toBe("203.0.113.9");
  });

  it("handles a single-entry XFF", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip then 'unknown'", () => {
    expect(clientIp(req({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(req({}))).toBe("unknown");
  });
});
