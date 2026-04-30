import { escapeHtml } from "@/lib/patient-invoice-print";
import {
  fetchReceiptLogoAsDataUrl,
  receiptLogoImgHtml,
  formatReceiptDateOnly,
  pharmacyA5PosReceiptStyles,
  receiptPrintMastheadExtraLinesHtml,
  receiptPrintA5FooterContactHtml,
} from "@/lib/receipt-print-theme";

export type PurchaseReceiptPrintLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  unitLabel?: string;
};

export type PurchaseReceiptPrintPayload = {
  id: number;
  purchaseDate: string;
  supplierLabel: string;
  branchName?: string | null;
  paymentMethodLabel?: string | null;
  recordedBy?: string | null;
  lines: PurchaseReceiptPrintLine[];
  totalAmount: number;
  notes?: string | null;
};

/** List/detail row shape from GET /api/pharmacy/purchases (include items). */
export type PurchaseApiRowForReceipt = {
  id: number;
  purchaseDate: string;
  totalAmount: number;
  notes?: string | null;
  branch: { id: number; name: string } | null;
  supplier: { id: number; name: string } | null;
  createdBy: { name: string | null } | null;
  paymentMethod: {
    id: number;
    name: string;
    account: { id: number; name: string; type: string };
  } | null;
  items: {
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    purchaseUnit?: string;
    product: { id: number; name: string; code: string };
  }[];
};

export function purchaseApiRowToPrintPayload(p: PurchaseApiRowForReceipt): PurchaseReceiptPrintPayload {
  const lines: PurchaseReceiptPrintLine[] = p.items.map((it) => ({
    name: `${it.product.name}${it.product.code ? ` (${it.product.code})` : ""}`.trim(),
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    totalAmount: it.totalAmount,
    unitLabel: it.purchaseUnit && it.purchaseUnit !== "pcs" ? it.purchaseUnit : undefined,
  }));
  const paymentLabel = p.paymentMethod
    ? `${p.paymentMethod.name} — ${p.paymentMethod.account.name}`
    : null;
  return {
    id: p.id,
    purchaseDate: p.purchaseDate,
    supplierLabel: p.supplier?.name?.trim() ? p.supplier.name : "No supplier",
    branchName: p.branch?.name ?? null,
    paymentMethodLabel: paymentLabel,
    recordedBy: p.createdBy?.name ?? null,
    lines,
    totalAmount: p.totalAmount,
    notes: p.notes ?? null,
  };
}

/**
 * Print a pharmacy stock purchase receipt (same A5 template as POS sale receipt).
 */
export async function printPurchaseReceipt(payload: PurchaseReceiptPrintPayload): Promise<void> {
  const subtotal = payload.lines.reduce((s, l) => s + l.totalAmount, 0);
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
  const purchaseNoDisplay = String(payload.id).padStart(7, "0");
  const purchaseDateStr = formatReceiptDateOnly(payload.purchaseDate);

  const paymentBlock =
    payload.paymentMethodLabel && String(payload.paymentMethodLabel).trim()
      ? `<p class="billed-extra">Payment: ${escapeHtml(String(payload.paymentMethodLabel).trim())}</p>`
      : "";
  const recordedBlock =
    payload.recordedBy && String(payload.recordedBy).trim()
      ? `<p class="billed-extra">Recorded by: ${escapeHtml(String(payload.recordedBy).trim())}</p>`
      : "";

  const notesBlock =
    payload.notes && String(payload.notes).trim()
      ? `<p class="notes-body">${escapeHtml(String(payload.notes).trim())}</p>`
      : `<p class="notes-body">Stock purchase receipt — retain for inventory and accounting records. For questions, use the clinic contact below.</p>`;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Purchase #${payload.id}</title>
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
        <h1 class="receipt-title">Purchase receipt</h1>
        <div class="meta-lines">
          <div><span class="lbl">Purchase #:</span>${purchaseNoDisplay}</div>
          <div><span class="lbl">Purchase date:</span>${purchaseDateStr}</div>
        </div>
      </div>
    </div>

    <section class="billed" aria-label="Supplier">
      <h2>Supplier</h2>
      <p class="billed-name">${escapeHtml(payload.supplierLabel)}</p>
      ${paymentBlock}
      ${recordedBlock}
    </section>

    <table class="items">
      <thead>
        <tr>
          <th>Qty</th>
          <th>Description</th>
          <th class="num">Unit cost</th>
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

  const img = printWindow.document.querySelector(".logo-box img");
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
