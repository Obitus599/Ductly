import { describe, it, expect } from "vitest";
import { normalizeUaePhone, isUaeMobile, formatUaePhone } from "./phone-uae";

describe("normalizeUaePhone", () => {
  it("normalizes the local 05x format to E.164", () => {
    expect(normalizeUaePhone("0503089244")).toBe("+971503089244");
  });

  it("normalizes bare NSN (no leading 0)", () => {
    expect(normalizeUaePhone("503089244")).toBe("+971503089244");
  });

  it("normalizes the +971 international format", () => {
    expect(normalizeUaePhone("+971503089244")).toBe("+971503089244");
  });

  it("normalizes 971 without the plus", () => {
    expect(normalizeUaePhone("971503089244")).toBe("+971503089244");
  });

  it("normalizes the 00971 access-code format", () => {
    expect(normalizeUaePhone("00971503089244")).toBe("+971503089244");
  });

  it("ignores spaces, dashes, and parens", () => {
    expect(normalizeUaePhone("+971 50 308 9244")).toBe("+971503089244");
    expect(normalizeUaePhone("050-308-9244")).toBe("+971503089244");
    expect(normalizeUaePhone(" (050) 308 9244 ")).toBe("+971503089244");
  });

  it("recovers from a doubled +971 0 prefix", () => {
    expect(normalizeUaePhone("+9710503089244")).toBe("+971503089244");
  });

  it("accepts every UAE mobile prefix", () => {
    for (const p of ["50", "52", "54", "55", "56", "58"]) {
      expect(normalizeUaePhone(`0${p}1234567`)).toBe(`+971${p}1234567`);
    }
  });

  it("rejects non-mobile / non-UAE numbers", () => {
    expect(normalizeUaePhone("042234567")).toBeNull(); // Dubai landline (04)
    expect(normalizeUaePhone("+14155552671")).toBeNull(); // US number
    expect(normalizeUaePhone("12")).toBeNull(); // too short
    expect(normalizeUaePhone("0501234")).toBeNull(); // too few digits
    expect(normalizeUaePhone("05012345678")).toBeNull(); // too many digits
    expect(normalizeUaePhone("")).toBeNull();
  });
});

describe("isUaeMobile", () => {
  it("mirrors normalizeUaePhone success/failure", () => {
    expect(isUaeMobile("0503089244")).toBe(true);
    expect(isUaeMobile("+971 50 308 9244")).toBe(true);
    expect(isUaeMobile("+14155552671")).toBe(false);
    expect(isUaeMobile("")).toBe(false);
  });
});

describe("formatUaePhone", () => {
  it("groups a valid number as +971 5x xxx xxxx", () => {
    expect(formatUaePhone("0503089244")).toBe("+971 50 308 9244");
    expect(formatUaePhone("+971503089244")).toBe("+971 50 308 9244");
  });

  it("returns the trimmed input untouched when invalid", () => {
    expect(formatUaePhone("  hello ")).toBe("hello");
    expect(formatUaePhone("+1415")).toBe("+1415");
  });
});
