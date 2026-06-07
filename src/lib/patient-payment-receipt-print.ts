import { escapeHtml } from "@/lib/patient-invoice-print";
import {
  fetchReceiptLogoAsDataUrl,
  receiptLogoImgHtml,
  formatReceiptDateOnly,
  pharmacyA5PosReceiptStyles,
  receiptHeaderPaymentContactBarsHtml,
} from "@/lib/receipt-print-theme";
import { patientPaymentCategoryLabel } from "@/lib/patient-payment-utils";

export type PatientPaymentReceiptPayload = {
  id: number;
  createdAt: string;
  patientCode: string;
  patientName: string;
  patientPhone?: string | null;
  category: string;
  amount: number;
  discount: number;
  paymentMethodName: string | null;
  recordedByName: string | null;
  notes: string | null;
  labOrderId: number | null;
  /** Branch line under clinic name (same letterhead as POS / appointment receipt). */
  branchName?: string | null;
};

const RECEIPT_TITLE = "Payment receipt";

export async function printPatientPaymentReceipt(payload: PatientPaymentReceiptPayload): Promise<void> {
  const logoDataUrl = await fetchReceiptLogoAsDataUrl();
  const logoImgInner = receiptLogoImgHtml(logoDataUrl);

  const ref = String(payload.id).padStart(7, "0");
  const dateStr = formatReceiptDateOnly(payload.createdAt);
  const amt = payload.amount ?? 0;
  const disc = Math.max(0, payload.discount ?? 0);
  const total = amt + disc;
  const catLabel = patientPaymentCategoryLabel(payload.category);

  const branchLine1 =
    payload.branchName && String(payload.branchName).trim()
      ? escapeHtml(String(payload.branchName).trim())
      : "Main clinic";

  const descParts = [escapeHtml(catLabel)];
  if (payload.labOrderId != null) {
    descParts.push(`<span style="color:#667085;font-size:8.5pt">Lab order #${payload.labOrderId}</span>`);
  }
  const lineDesc = descParts.join(" · ");

  const tableRows: string[] = [];
  if (amt > 0) {
    tableRows.push(`<tr>
          <td class="qty">1</td>
          <td class="desc">${lineDesc}</td>
          <td class="num">$${amt.toFixed(2)}</td>
          <td class="num strong">$${amt.toFixed(2)}</td>
        </tr>`);
    if (disc > 0) {
      tableRows.push(`<tr>
          <td class="qty">1</td>
          <td class="desc">Discount / write-off</td>
          <td class="num">$0.00</td>
          <td class="num strong">$${disc.toFixed(2)}</td>
        </tr>`);
    }
  } else if (disc > 0) {
    tableRows.push(`<tr>
          <td class="qty">1</td>
          <td class="desc">${lineDesc}</td>
          <td class="num">$0.00</td>
          <td class="num strong">$${disc.toFixed(2)}</td>
        </tr>`);
  } else {
    tableRows.push(`<tr>
          <td class="qty">1</td>
          <td class="desc">${lineDesc}</td>
          <td class="num">$0.00</td>
          <td class="num strong">$0.00</td>
        </tr>`);
  }

  const rowsHtml =
    tableRows.length > 0
      ? tableRows.join("")
      : `<tr><td colspan="4" style="text-align:center;color:#667085;padding:12px;">No line detail</td></tr>`;

  const paymentLine =
    payload.paymentMethodName && String(payload.paymentMethodName).trim()
      ? `<p class="billed-extra">Payment: ${escapeHtml(String(payload.paymentMethodName).trim())}</p>`
      : amt <= 0 && disc > 0
        ? `<p class="billed-extra">Cash: $0.00 (discount / write-off only)</p>`
        : "";

  const byBlock =
    payload.recordedByName && String(payload.recordedByName).trim()
      ? `<p class="billed-extra">Received by: ${escapeHtml(String(payload.recordedByName).trim())}</p>`
      : "";

  const phoneBlock =
    payload.patientPhone && String(payload.patientPhone).trim()
      ? `<p class="billed-extra">${escapeHtml(String(payload.patientPhone).trim())}</p>`
      : "";

  const notesLine =
    payload.notes && String(payload.notes).trim()
      ? `<p class="billed-extra">${escapeHtml(String(payload.notes).trim())}</p>`
      : "";

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Payment #${escapeHtml(ref)}</title>
  <style>${pharmacyA5PosReceiptStyles()}</style>
</head>
<body>
  <div class="sheet">
    <header class="top-header">
      <div class="company-block">
        <p class="company-name">Call a Doctor</p>
        <p class="company-line">${branchLine1}</p>
        ${receiptHeaderPaymentContactBarsHtml()}
      </div>
      <div class="logo-box" aria-label="Clinic logo">${logoImgInner}</div>
    </header>

    <div class="title-band">
      <div class="title-right">
        <h1 class="receipt-title">${escapeHtml(RECEIPT_TITLE)}</h1>
        <div class="meta-lines">
          <div><span class="lbl">Receipt #:</span>${escapeHtml(ref)}</div>
          <div><span class="lbl">Receipt date:</span>${dateStr}</div>
        </div>
      </div>
    </div>

    <section class="billed" aria-label="Bill to">
      <h2>Billed To</h2>
      <p class="billed-name">${escapeHtml(payload.patientName)} (${escapeHtml(payload.patientCode)})</p>
      ${phoneBlock}
      ${paymentLine}
      ${byBlock}
      ${notesLine}
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
        ${rowsHtml}
      </tbody>
    </table>

    <div class="table-rule" aria-hidden="true"></div>

    <div class="totals">
      ${
        amt > 0 && disc > 0
          ? `<div class="totals-row"><span class="lbl">Subtotal</span><span>$${amt.toFixed(2)}</span></div>
      <div class="totals-row"><span class="lbl">Discount / write-off</span><span>$${disc.toFixed(2)}</span></div>`
          : disc > 0 && amt === 0
            ? `<div class="totals-row"><span class="lbl">Discount / write-off</span><span>$${disc.toFixed(2)}</span></div>`
            : ""
      }
      <div class="totals-row totals-grand">
        <span class="lbl">Total (USD)</span>
        <span>$${total.toFixed(2)}</span>
      </div>
    </div>

    <div class="footer-spacer"></div>
  </div>
</body>
</html>`);
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
