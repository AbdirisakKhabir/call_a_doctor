export type SaleReceiptPrintLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  unitLabel?: string;
};

export type SaleReceiptPrintPayload = {
  id: number;
  saleDate: string;
  customerLabel: string;
  paymentMethod?: string;
  /** Shown under the logo on the letterhead when present */
  branchName?: string | null;
  lines: SaleReceiptPrintLine[];
  discount: number;
  totalAmount: number;
  notes?: string | null;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

import {
  fetchReceiptLogoAsDataUrl,
  receiptLogoImgHtml,
  getReceiptLogoAbsoluteUrl,
  RECEIPT_LOGO_PUBLIC_PATH,
  formatReceiptDateOnly,
  pharmacyA5PosReceiptStyles,
  receiptPrintMastheadExtraLinesHtml,
  receiptPrintA5FooterContactHtml,
} from "@/lib/receipt-print-theme";

export { getReceiptLogoAbsoluteUrl, RECEIPT_LOGO_PUBLIC_PATH, formatReceiptDateOnly };

/**
 * Opens a print dialog for a pharmacy / visit billing receipt (A5, letterhead, stamp space).
 * Embeds the logo as a data URL so it prints even when the preview window would otherwise load images too late.
 */
export async function printSaleReceipt(payload: SaleReceiptPrintPayload): Promise<void> {
  const subtotal = payload.lines.reduce((s, l) => s + l.totalAmount, 0);
  const disc = Math.max(0, payload.discount ?? 0);
  const logoDataUrl = await fetchReceiptLogoAsDataUrl();
  const logoImgInner = receiptLogoImgHtml(logoDataUrl);

  const rowsHtml = payload.lines
    .map(
      (l) => `
        <tr>
          <td class="qty">${l.quantity}${l.unitLabel ? ` ${escapeHtml(l.unitLabel)}` : ""}</td>
          <td class="desc">${escapeHtml(l.name)}</td>
          <td class="num">$${l.unitPrice.toFixed(2)}</td>
          <td class="num strong">$${l.totalAmount.toFixed(2)}</td>
        </tr>`
    )
    .join("");

  const branchLine1 =
    payload.branchName && String(payload.branchName).trim()
      ? escapeHtml(String(payload.branchName).trim())
      : "Main clinic";
  const receiptNoDisplay = String(payload.id).padStart(7, "0");
  const receiptDateStr = formatReceiptDateOnly(payload.saleDate);
  const paymentLine =
    payload.paymentMethod && String(payload.paymentMethod).trim()
      ? `<p class="billed-extra">Payment: ${escapeHtml(String(payload.paymentMethod).trim())}</p>`
      : "";
  const notesBlock =
    payload.notes && String(payload.notes).trim()
      ? `<p class="notes-body">${escapeHtml(String(payload.notes).trim())}</p>`
      : `<p class="notes-body">Thank you for choosing Call a Doctor. Please retain this receipt for your records. For service or billing questions, use the clinic contact below.</p>`;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Receipt #${payload.id}</title>
  <style>${pharmacyA5PosReceiptStyles()}</style>
</head>
<body>
  <div class="sheet">
    <header class="top-header">
      <div class="company-block">
        <p class="company-name">Call a Doctor</p>
        <p class="company-line">${branchLine1}</p>
        ${receiptPrintMastheadExtraLinesHtml()}
      </div>
      <div class="logo-box" aria-label="Clinic logo">
        ${logoImgInner}
      </div>
    </header>

    <div class="title-band">
      <div class="title-right">
        <h1 class="receipt-title">Receipt</h1>
        <div class="meta-lines">
          <div><span class="lbl">Receipt #:</span>${receiptNoDisplay}</div>
          <div><span class="lbl">Receipt date:</span>${receiptDateStr}</div>
        </div>
      </div>
    </div>

    <section class="billed" aria-label="Bill to">
      <h2>Billed To</h2>
      <p class="billed-name">${escapeHtml(payload.customerLabel)}</p>
      ${paymentLine}
    </section>

    <table class="items">
      <thead>
        <tr>
          <th>Qty</th>
          <th>Description</th>
          <th class="num">Unit Price</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || `<tr><td colspan="4" style="text-align:center;color:#667085;padding:12px;">No line detail</td></tr>`}
      </tbody>
    </table>

    <div class="table-rule" aria-hidden="true"></div>

    <div class="totals">
      ${
        payload.lines.length > 0
          ? `<div class="totals-row"><span class="lbl">Subtotal</span><span>$${subtotal.toFixed(2)}</span></div>`
          : ""
      }
      ${
        disc > 0
          ? `<div class="totals-row"><span class="lbl">Discount</span><span>−$${disc.toFixed(2)}</span></div>`
          : ""
      }
      <div class="totals-row totals-grand">
        <span class="lbl">Total (USD)</span>
        <span>$${payload.totalAmount.toFixed(2)}</span>
      </div>
    </div>

    <div class="footer-spacer"></div>

    <footer class="footer">
      <h3 class="notes-heading">Notes</h3>
      ${notesBlock}
      ${receiptPrintA5FooterContactHtml(branchLine1)}
    </footer>
  </div>
</body>
</html>
    `);
  printWindow.document.close();

  const schedulePrint = () => {
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  if (logoDataUrl) {
    requestAnimationFrame(() => setTimeout(schedulePrint, 150));
    return;
  }

  const img = printWindow.document.querySelector(".masthead img");
  if (img instanceof HTMLImageElement) {
    const done = () => schedulePrint();
    if (img.complete && img.naturalHeight > 0) {
      setTimeout(schedulePrint, 150);
      return;
    }
    img.onload = () => setTimeout(done, 50);
    img.onerror = done;
    setTimeout(done, 3000);
    return;
  }

  schedulePrint();
}

/** Shape returned by GET /api/pharmacy/sales/[id] (subset). */
export type SaleApiDetailForReceipt = {
  id: number;
  saleDate: string;
  totalAmount: number;
  discount: number;
  paymentMethod: string;
  customerType: string;
  outreachOnCredit?: boolean;
  notes?: string | null;
  branch?: { name: string } | null;
  patient: { name: string; patientCode: string } | null;
  outreachTeam?: { name: string } | null;
  depositTransaction?: { id: number } | null;
  createdBy?: { name: string | null } | null;
  items?: {
    quantity: number;
    saleUnit: string;
    unitPrice: number;
    totalAmount: number;
    product: { name: string; code: string } | null;
    service?: { id: number; name: string } | null;
  }[];
};

export function customerLabelFromSaleApi(
  s: Pick<SaleApiDetailForReceipt, "customerType" | "patient" | "outreachTeam" | "outreachOnCredit">
): string {
  if (s.customerType === "lab") return "Lab (to lab inventory)";
  if (s.customerType === "outreach" && s.outreachTeam) {
    let label = `Outreach — ${s.outreachTeam.name}`;
    if (s.outreachOnCredit) label += " (credit)";
    return label;
  }
  if (s.customerType === "patient" && s.patient) {
    return `${s.patient.name} (${s.patient.patientCode})`;
  }
  return "Walking";
}

/** Customer line as printed on receipts (name only for patients; no patient code). */
export function customerLabelForReceiptPrint(
  s: Pick<SaleApiDetailForReceipt, "customerType" | "patient" | "outreachTeam" | "outreachOnCredit">
): string {
  if (s.customerType === "lab") return "Lab (to lab inventory)";
  if (s.customerType === "outreach" && s.outreachTeam) {
    let label = s.outreachTeam.name;
    if (s.outreachOnCredit) label += " (credit)";
    return label;
  }
  if (s.customerType === "patient" && s.patient) return s.patient.name;
  return "Walking customer";
}

export function saleApiDetailToPrintPayload(s: SaleApiDetailForReceipt): SaleReceiptPrintPayload {
  const items = s.items ?? [];
  const lines: SaleReceiptPrintLine[] = items.map((line) => {
    const name =
      line.service?.name ??
      (line.product ? `${line.product.name}${line.product.code ? ` (${line.product.code})` : ""}`.trim() : "Line item");
    return {
      name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      totalAmount: line.totalAmount,
      unitLabel: line.saleUnit && line.saleUnit !== "pcs" ? line.saleUnit : undefined,
    };
  });
  return {
    id: s.id,
    saleDate: s.saleDate,
    customerLabel: customerLabelForReceiptPrint(s),
    paymentMethod: s.paymentMethod,
    branchName: s.branch?.name ?? null,
    lines,
    discount: s.discount ?? 0,
    totalAmount: s.totalAmount,
    notes: s.notes ?? null,
  };
}
