import { filsToAedString } from "@/lib/vat";

/**
 * FTA tax-invoice data model (#8). The supplier identity comes from env
 * — drop in the real values once the TRN is issued. Until then the
 * placeholders make the wiring testable without producing a "valid"
 * invoice (TRN-PENDING is intentionally obvious).
 */
export interface SupplierConfig {
  name: string;
  trn: string;
  address: string;
}

export function getSupplierConfig(): SupplierConfig {
  return {
    // Defaults are the registered supplier details; env overrides win.
    // CONFIRM the exact registered legal-name spelling before invoices go
    // live. TRN intentionally stays a placeholder until provided.
    name: process.env.SUPPLIER_NAME || "Ductly Technical Service",
    trn: process.env.SUPPLIER_TRN || "TRN-PENDING",
    address:
      process.env.SUPPLIER_ADDRESS ||
      "Royal House, Office M13, Hor Al Anz East, Dubai, UAE",
  };
}

/** True once a real TRN has been configured. */
export function supplierTrnConfigured(): boolean {
  return Boolean(process.env.SUPPLIER_TRN);
}

export interface InvoiceRow {
  invoice_number: string;
  net_fils: number;
  vat_fils: number;
  total_fils: number;
  vat_rate: number | string;
  currency: string;
  supplier_trn: string | null;
  issued_at: string;
}

export interface InvoiceBooking {
  plan: string | null;
  thermostats: number | null;
  address: string | null;
}

export interface InvoiceModel {
  invoiceNumber: string;
  issuedAt: string;
  supplier: SupplierConfig;
  customerName: string;
  customerContact: string;
  customerAddress: string;
  lineDescription: string;
  netDisplay: string;
  vatDisplay: string;
  totalDisplay: string;
  vatRatePercent: number;
  currency: string;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Assemble the render-ready invoice model from DB rows. */
export function buildInvoiceModel(
  invoice: InvoiceRow,
  booking: InvoiceBooking,
  customer: { name?: string | null; email?: string | null; phone?: string | null }
): InvoiceModel {
  const planName = booking.plan ? `${titleCase(booking.plan)} Plan` : "Duct Cleaning";
  const therms = booking.thermostats ?? 1;
  const lineDescription = `Duct Cleaning — ${planName} (${therms} thermostat${therms === 1 ? "" : "s"})`;

  return {
    invoiceNumber: invoice.invoice_number,
    issuedAt: invoice.issued_at,
    // The invoice snapshots the TRN at issue time; fall back to live env
    // config for display if an older row predates the snapshot.
    supplier: {
      ...getSupplierConfig(),
      trn: invoice.supplier_trn || getSupplierConfig().trn,
    },
    customerName: customer.name || "Customer",
    customerContact: customer.email || customer.phone || "",
    customerAddress: booking.address || "",
    lineDescription,
    netDisplay: filsToAedString(invoice.net_fils),
    vatDisplay: filsToAedString(invoice.vat_fils),
    totalDisplay: filsToAedString(invoice.total_fils),
    vatRatePercent: Math.round(Number(invoice.vat_rate)),
    currency: (invoice.currency || "aed").toUpperCase(),
  };
}
