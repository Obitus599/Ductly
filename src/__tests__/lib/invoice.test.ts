import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getSupplierConfig,
  supplierTrnConfigured,
  buildInvoiceModel,
  type InvoiceRow,
} from "@/lib/invoice";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

const INVOICE: InvoiceRow = {
  invoice_number: "INV-000001",
  net_fils: 219600,
  vat_fils: 10980,
  total_fils: 230580,
  vat_rate: "5.00",
  currency: "aed",
  supplier_trn: "100123456700003",
  issued_at: "2026-06-04T08:00:00.000Z",
};

describe("supplier config", () => {
  afterEach(() => {
    delete process.env.SUPPLIER_TRN;
    delete process.env.SUPPLIER_NAME;
    delete process.env.SUPPLIER_ADDRESS;
  });

  it("falls back to obvious placeholders when env is unset", () => {
    const cfg = getSupplierConfig();
    expect(cfg.trn).toBe("TRN-PENDING");
    expect(supplierTrnConfigured()).toBe(false);
  });

  it("uses env values when set", () => {
    process.env.SUPPLIER_TRN = "100123456700003";
    process.env.SUPPLIER_NAME = "Ductly FZ-LLC";
    expect(getSupplierConfig().trn).toBe("100123456700003");
    expect(getSupplierConfig().name).toBe("Ductly FZ-LLC");
    expect(supplierTrnConfigured()).toBe(true);
  });
});

describe("buildInvoiceModel", () => {
  it("formats amounts and a pluralized line description", () => {
    const m = buildInvoiceModel(
      INVOICE,
      { plan: "signature", thermostats: 4, address: "Villa 12, Dubai" },
      { name: "Jane Doe", email: "jane@example.com", phone: "+971501234567" }
    );
    expect(m.invoiceNumber).toBe("INV-000001");
    expect(m.netDisplay).toBe("2,196.00");
    expect(m.vatDisplay).toBe("109.80");
    expect(m.totalDisplay).toBe("2,305.80");
    expect(m.vatRatePercent).toBe(5);
    expect(m.currency).toBe("AED");
    expect(m.customerName).toBe("Jane Doe");
    expect(m.customerContact).toBe("jane@example.com");
    expect(m.lineDescription).toBe("Duct Cleaning — Signature Plan (4 thermostats)");
  });

  it("uses singular 'thermostat' for one", () => {
    const m = buildInvoiceModel(
      { ...INVOICE },
      { plan: "elite", thermostats: 1, address: null },
      { name: null, email: null, phone: "+971500000000" }
    );
    expect(m.lineDescription).toBe("Duct Cleaning — Elite Plan (1 thermostat)");
    expect(m.customerName).toBe("Customer");
    expect(m.customerContact).toBe("+971500000000");
  });

  it("snapshots the invoice's TRN over live config", () => {
    process.env.SUPPLIER_TRN = "999999999999999";
    const m = buildInvoiceModel(INVOICE, { plan: "essential", thermostats: 2, address: null }, {});
    expect(m.supplier.trn).toBe("100123456700003"); // from the invoice row
    delete process.env.SUPPLIER_TRN;
  });
});

describe("renderInvoicePdf", () => {
  it("produces a non-empty PDF document", async () => {
    const m = buildInvoiceModel(
      INVOICE,
      { plan: "signature", thermostats: 4, address: "Villa 12, Jumeirah, Dubai" },
      { name: "Jane Doe", email: "jane@example.com", phone: "+971501234567" }
    );
    const bytes = await renderInvoicePdf(m);
    expect(bytes.length).toBeGreaterThan(500);
    // PDF magic number "%PDF"
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x25, 0x50, 0x44, 0x46]);
  });
});
