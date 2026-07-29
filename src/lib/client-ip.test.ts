import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { getClientIp } from "./client-ip";

function req(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost:3000/api/anything", { headers });
}

afterEach(() => {
  delete process.env.TRUSTED_PROXY_HOPS;
});

describe("getClientIp", () => {
  it("returns the single forwarded address behind one proxy", () => {
    expect(getClientIp(req({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("takes the LAST hop, not the client-supplied leftmost entry", () => {
    // This is the whole point. Proxies APPEND what they saw, so with
    // `X-Forwarded-For: <attacker text>, <real client>` the leftmost value
    // is fully attacker-controlled. Keying rate limits on it let one
    // attacker mint unlimited buckets and bypass every throttle.
    expect(
      getClientIp(req({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" }))
    ).toBe("203.0.113.7");
  });

  it("is not fooled by a spoofed chain of many fake hops", () => {
    const spoofed = Array.from({ length: 20 }, (_, i) => `10.0.0.${i}`).join(", ");
    expect(
      getClientIp(req({ "x-forwarded-for": `${spoofed}, 198.51.100.9` }))
    ).toBe("198.51.100.9");
  });

  it("honours TRUSTED_PROXY_HOPS for a deeper trusted chain (e.g. CDN + nginx)", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(
      getClientIp(req({ "x-forwarded-for": "1.1.1.1, 203.0.113.7, 172.16.0.1" }))
    ).toBe("203.0.113.7");
  });

  it("clamps to the leftmost entry when the chain is shorter than the hop count", () => {
    process.env.TRUSTED_PROXY_HOPS = "5";
    expect(getClientIp(req({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("ignores a nonsense TRUSTED_PROXY_HOPS and falls back to 1 hop", () => {
    for (const bad of ["0", "-3", "abc", ""]) {
      process.env.TRUSTED_PROXY_HOPS = bad;
      expect(
        getClientIp(req({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" }))
      ).toBe("203.0.113.7");
    }
  });

  it("trims whitespace and skips empty chain entries", () => {
    expect(
      getClientIp(req({ "x-forwarded-for": " 1.1.1.1 ,, 203.0.113.7  " }))
    ).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when there is no forwarded chain", () => {
    expect(getClientIp(req({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("prefers the forwarded chain over x-real-ip", () => {
    expect(
      getClientIp(req({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.4" }))
    ).toBe("203.0.113.7");
  });

  it("returns 'unknown' when no address headers are present", () => {
    expect(getClientIp(req({}))).toBe("unknown");
  });
});
