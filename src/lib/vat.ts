/**
 * VAT helpers — single source of truth for UAE VAT (5%) math.
 *
 * Ductly prices are quoted NET (VAT-exclusive): the displayed plan price
 * is the pre-tax amount and 5% VAT is added on top at checkout. The
 * customer pays net + VAT; the FTA tax invoice itemises both.
 *
 * Every money figure is handled in integer fils (1 AED = 100 fils) to
 * avoid floating-point drift — conversion to an AED string happens only
 * at display time.
 */
export const VAT_RATE_PERCENT = 5;
const VAT_RATE = VAT_RATE_PERCENT / 100;

export interface VatBreakdown {
  /** Pre-tax amount, integer fils. */
  netFils: number;
  /** VAT amount, integer fils. */
  vatFils: number;
  /** net + vat, integer fils — the amount actually charged. */
  totalFils: number;
  /** VAT rate as a whole-number percent (5). */
  vatRatePercent: number;
}

/**
 * Compute the VAT breakdown for a NET (VAT-exclusive) amount.
 * VAT is rounded to the nearest fils (FTA rounding to 2 dp).
 */
export function vatFromNet(netFils: number): VatBreakdown {
  const net = Math.round(netFils);
  const vat = Math.round(net * VAT_RATE);
  return {
    netFils: net,
    vatFils: vat,
    totalFils: net + vat,
    vatRatePercent: VAT_RATE_PERCENT,
  };
}

/**
 * Decompose a GROSS (VAT-inclusive) amount into net + VAT. Used to
 * back-fill an invoice from a known total (e.g. a legacy booking whose
 * stored figure is the all-in price). net = round(gross / 1.05).
 */
export function vatFromGross(grossFils: number): VatBreakdown {
  const gross = Math.round(grossFils);
  const net = Math.round(gross / (1 + VAT_RATE));
  return {
    netFils: net,
    vatFils: gross - net,
    totalFils: gross,
    vatRatePercent: VAT_RATE_PERCENT,
  };
}

/**
 * Convert integer fils to a grouped AED string with two decimals, e.g.
 * 230580 → "2,305.80". No currency symbol — callers prefix "AED".
 * Grouping is done by regex (not Intl) so output is identical across
 * Node ICU builds — see the same rationale in dispatch-format.ts.
 */
export function filsToAedString(fils: number): string {
  const negative = fils < 0;
  const abs = Math.abs(Math.round(fils));
  const dirhams = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = dirhams.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}.${cents.toString().padStart(2, "0")}`;
}
