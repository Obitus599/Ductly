import { describe, it, expect } from "vitest";
import { vatFromNet, vatFromGross, filsToAedString, VAT_RATE_PERCENT } from "@/lib/vat";

describe("vatFromNet (VAT-exclusive)", () => {
  it("adds 5% on top of the net amount (Signature 4× = 2196)", () => {
    expect(vatFromNet(219600)).toEqual({
      netFils: 219600,
      vatFils: 10980,
      totalFils: 230580,
      vatRatePercent: 5,
    });
  });

  it("computes Elite 1× (649) → 681.45 total", () => {
    expect(vatFromNet(64900)).toEqual({
      netFils: 64900,
      vatFils: 3245,
      totalFils: 68145,
      vatRatePercent: 5,
    });
  });

  it("rounds VAT to the nearest fils", () => {
    // 110 fils × 5% = 5.5 → 6
    expect(vatFromNet(110).vatFils).toBe(6);
    // 101 fils × 5% = 5.05 → 5
    expect(vatFromNet(101).vatFils).toBe(5);
  });

  it("handles zero", () => {
    expect(vatFromNet(0)).toEqual({ netFils: 0, vatFils: 0, totalFils: 0, vatRatePercent: 5 });
  });
});

describe("vatFromGross (VAT-inclusive back-fill)", () => {
  it("decomposes a gross total into net + VAT that sum back", () => {
    const b = vatFromGross(230580);
    expect(b.totalFils).toBe(230580);
    expect(b.netFils + b.vatFils).toBe(230580);
    expect(b.netFils).toBe(219600);
    expect(b.vatFils).toBe(10980);
  });
});

describe("filsToAedString", () => {
  it("formats with thousands grouping and two decimals", () => {
    expect(filsToAedString(230580)).toBe("2,305.80");
    expect(filsToAedString(64900)).toBe("649.00");
    expect(filsToAedString(0)).toBe("0.00");
    expect(filsToAedString(5)).toBe("0.05");
    expect(filsToAedString(1234567)).toBe("12,345.67");
  });

  it("handles negatives (e.g. refund lines)", () => {
    expect(filsToAedString(-230580)).toBe("-2,305.80");
  });
});

describe("VAT_RATE_PERCENT", () => {
  it("is 5", () => {
    expect(VAT_RATE_PERCENT).toBe(5);
  });
});
