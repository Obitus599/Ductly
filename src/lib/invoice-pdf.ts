import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { InvoiceModel } from "@/lib/invoice";

/**
 * Render an FTA-compliant tax invoice to a PDF byte array using pdf-lib
 * (pure JS, standard embedded fonts — no font-file dependency, so it is
 * safe under Next's standalone output). A4 portrait.
 */
const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 50;
const INK = rgb(0.24, 0.24, 0.24);
const MUTED = rgb(0.55, 0.56, 0.6);
const LINE = rgb(0.9, 0.9, 0.9);
const TEAL = rgb(0.36, 0.55, 0.5);

function formatIssueDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dubai",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return iso;
  }
}

export async function renderInvoicePdf(m: InvoiceModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4.w, A4.h]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const right = A4.w - MARGIN;
  let y = A4.h - MARGIN;

  const text = (
    s: string,
    x: number,
    yy: number,
    size: number,
    f: PDFFont = font,
    color = INK
  ) => page.drawText(s, { x, y: yy, size, font: f, color });

  const textRight = (
    s: string,
    xr: number,
    yy: number,
    size: number,
    f: PDFFont = font,
    color = INK
  ) => text(s, xr - f.widthOfTextAtSize(s, size), yy, size, f, color);

  const hr = (yy: number, p: PDFPage = page) =>
    p.drawLine({ start: { x: MARGIN, y: yy }, end: { x: right, y: yy }, thickness: 1, color: LINE });

  // ── Header ─────────────────────────────────────────────
  text(m.supplier.name, MARGIN, y, 20, bold, TEAL);
  textRight("TAX INVOICE", right, y, 18, bold);
  y -= 18;
  textRight(`${m.invoiceNumber}`, right, y, 11, font, MUTED);
  y -= 16;

  for (const line of m.supplier.address.split(/\n|,\s*/).filter(Boolean)) {
    text(line.trim(), MARGIN, y, 9, font, MUTED);
    y -= 12;
  }
  text(`TRN: ${m.supplier.trn}`, MARGIN, y, 9, bold, INK);
  y -= 22;
  hr(y);
  y -= 24;

  // ── Bill-to + meta ─────────────────────────────────────
  const metaY = y;
  text("BILL TO", MARGIN, y, 9, bold, MUTED);
  y -= 14;
  text(m.customerName, MARGIN, y, 11, bold);
  y -= 13;
  if (m.customerContact) {
    text(m.customerContact, MARGIN, y, 9, font, MUTED);
    y -= 12;
  }
  for (const line of (m.customerAddress || "").split(/\n|,\s*/).filter(Boolean).slice(0, 3)) {
    text(line.trim(), MARGIN, y, 9, font, MUTED);
    y -= 12;
  }

  // Meta column (right)
  let my = metaY;
  textRight("Invoice No.", right - 90, my, 9, bold, MUTED);
  textRight(m.invoiceNumber, right, my, 9, font);
  my -= 14;
  textRight("Issue Date", right - 90, my, 9, bold, MUTED);
  textRight(formatIssueDate(m.issuedAt), right, my, 9, font);
  my -= 14;
  textRight("Currency", right - 90, my, 9, bold, MUTED);
  textRight(m.currency, right, my, 9, font);

  y = Math.min(y, my) - 24;

  // ── Line items table ───────────────────────────────────
  const colDesc = MARGIN;
  const colAmt = right;
  hr(y);
  y -= 16;
  text("DESCRIPTION", colDesc, y, 9, bold, MUTED);
  textRight(`AMOUNT (${m.currency})`, colAmt, y, 9, bold, MUTED);
  y -= 8;
  hr(y);
  y -= 20;

  text(m.lineDescription, colDesc, y, 10, font);
  textRight(m.netDisplay, colAmt, y, 10, font);
  y -= 24;
  hr(y);
  y -= 20;

  // ── Totals ─────────────────────────────────────────────
  const labelX = right - 200;
  textRight("Subtotal (excl. VAT)", labelX, y, 10, font, MUTED);
  textRight(m.netDisplay, colAmt, y, 10, font);
  y -= 16;
  textRight(`VAT (${m.vatRatePercent}%)`, labelX, y, 10, font, MUTED);
  textRight(m.vatDisplay, colAmt, y, 10, font);
  y -= 8;
  page.drawLine({ start: { x: labelX - 10, y }, end: { x: right, y }, thickness: 1, color: LINE });
  y -= 18;
  textRight("Total", labelX, y, 12, bold);
  textRight(`${m.currency} ${m.totalDisplay}`, colAmt, y, 12, bold, TEAL);

  // ── Footer ─────────────────────────────────────────────
  text("This is a tax invoice issued under UAE VAT law.", MARGIN, MARGIN + 24, 8, font, MUTED);
  text(`${m.supplier.name} · TRN ${m.supplier.trn}`, MARGIN, MARGIN + 12, 8, font, MUTED);

  return pdf.save();
}
