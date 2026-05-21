import { describe, it, expect } from "vitest";
import {
  buildMapsLink,
  formatSlotForDispatch,
  addressQuality,
} from "./dispatch-format";

describe("buildMapsLink", () => {
  it("uses place_id when available", () => {
    const link = buildMapsLink(
      { place_id: "ChIJ_jK6XlBoXz4RxoMJlb3Z5lQ", lat: 25.07, lng: 55.14 },
      "Marina Tower 3"
    );
    expect(link).toContain("query_place_id=ChIJ");
    expect(link).toContain("Marina%20Tower%203");
  });

  it("falls back to lat/lng when place_id missing", () => {
    const link = buildMapsLink(
      { lat: 25.0772, lng: 55.139 },
      "Marina Tower 3"
    );
    expect(link).toContain("query=25.0772,55.139");
    expect(link).not.toContain("query_place_id");
  });

  it("falls back to text query when no coords or place_id", () => {
    const link = buildMapsLink(null, "Marina Tower 3, Dubai");
    expect(link).toContain("query=Marina%20Tower%203%2C%20Dubai");
  });

  it("rejects malformed place_id values", () => {
    const link = buildMapsLink({ place_id: "not-a-real-id" }, "fallback");
    expect(link).not.toContain("query_place_id");
    expect(link).toContain("query=fallback");
  });

  it("handles empty address_details object", () => {
    const link = buildMapsLink({}, "Some Address");
    expect(link).toContain("query=Some%20Address");
  });
});

describe("formatSlotForDispatch", () => {
  it("formats UAE time as human-readable", () => {
    // 10:00 AM UAE = 06:00 UTC
    const formatted = formatSlotForDispatch("2026-04-21T06:00:00Z");
    expect(formatted).toMatch(/Tue 21 Apr,\s*10:00 AM/);
  });

  it("returns input unchanged on invalid date", () => {
    expect(formatSlotForDispatch("not-a-date")).toBe("not-a-date");
  });

  it("handles midnight UAE correctly", () => {
    // 00:00 UAE = previous day 20:00 UTC
    const formatted = formatSlotForDispatch("2026-04-20T20:00:00Z");
    expect(formatted).toMatch(/12:00 AM/);
  });

  it("handles noon UAE correctly", () => {
    // 12:00 UAE = 08:00 UTC
    const formatted = formatSlotForDispatch("2026-04-21T08:00:00Z");
    expect(formatted).toMatch(/12:00 PM/);
  });

  it("formats 1 PM (post-noon hour) correctly", () => {
    // 13:00 UAE = 09:00 UTC
    const formatted = formatSlotForDispatch("2026-04-21T09:00:00Z");
    expect(formatted).toMatch(/1:00 PM/);
  });

  it("formats 11 PM correctly", () => {
    // 23:00 UAE = 19:00 UTC
    const formatted = formatSlotForDispatch("2026-04-21T19:00:00Z");
    expect(formatted).toMatch(/11:00 PM/);
  });
});

describe("addressQuality", () => {
  it("returns verified when lat and lng are numbers", () => {
    expect(addressQuality({ lat: 25.07, lng: 55.14 })).toBe("verified");
  });

  it("returns unverified when lat is missing", () => {
    expect(addressQuality({ lng: 55.14 })).toBe("unverified");
  });

  it("returns unverified when lng is missing", () => {
    expect(addressQuality({ lat: 25.07 })).toBe("unverified");
  });

  it("returns unverified for null input", () => {
    expect(addressQuality(null)).toBe("unverified");
  });

  it("returns unverified when lat is a string", () => {
    expect(addressQuality({ lat: "25.07", lng: 55.14 })).toBe("unverified");
  });
});
