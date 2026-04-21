/** Browser print for consolidated medication invoice (shared by Pharmacy client invoice). */

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printConsolidatedInvoice(payload: {
  patient: { patientCode: string; name: string; phone?: string | null };
  generatedAt: string;
  pharmacyLabel?: string;
  dateRangeLabel?: string;
  prescriptions: { id: number; prescriptionDate: string; doctorName: string; branchName: string }[];
  lines: {
    prescriptionId: number;
    prescriptionDate: string;
    doctorName: string;
    productName: string;
    productCode: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    dosage: string | null;
  }[];
  subtotal: number;
}) {
  const ref = `INV-${payload.patient.patientCode}-${new Date(payload.generatedAt).getTime()}`;
  const w = window.open("", "_blank");
  if (!w) return;
  const rows = payload.lines
    .map(
      (l) => `
      <tr>
        <td>${l.prescriptionDate}</td>
        <td>#${l.prescriptionId}</td>
        <td>${escapeHtml(l.doctorName)}</td>
        <td>${escapeHtml(l.productName)} <span class="muted">${escapeHtml(l.productCode)}</span></td>
        <td class="num">${l.quantity}</td>
        <td class="num">$${l.unitPrice.toFixed(2)}</td>
        <td class="num">$${l.lineTotal.toFixed(2)}</td>
        <td>${l.dosage ? escapeHtml(l.dosage) : "—"}</td>
      </tr>`
    )
    .join("");

  const metaBits = [
    `Reference: ${escapeHtml(ref)}`,
    `Generated ${new Date(payload.generatedAt).toLocaleString()}`,
  ];
  if (payload.pharmacyLabel) metaBits.push(escapeHtml(payload.pharmacyLabel));
  if (payload.dateRangeLabel) metaBits.push(escapeHtml(payload.dateRangeLabel));

  w.document.write(`<!DOCTYPE html>
<html><head><title>Invoice ${ref}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; max-width: 900px; margin: 0 auto; color: #111; }
  h1 { font-size: 1.25rem; margin: 0 0 4px; }
  .muted { color: #666; font-size: 0.85em; }
  .meta { font-size: 0.9rem; color: #444; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th, td { border-bottom: 1px solid #ddd; padding: 8px 6px; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; font-weight: 600; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .total { margin-top: 16px; text-align: right; font-size: 1.1rem; font-weight: 700; }
  @media print { body { padding: 12px; } }
</style></head><body>
  <h1>Medication invoice — consolidated</h1>
  <p class="meta">${metaBits.join(" · ")}</p>
  <p><strong>${escapeHtml(payload.patient.name)}</strong> (${escapeHtml(payload.patient.patientCode)})${payload.patient.phone ? ` · ${escapeHtml(payload.patient.phone)}` : ""}</p>
  <p class="muted" style="margin-bottom:16px">Prescriptions included: ${payload.prescriptions.map((p) => "#" + p.id + " (" + p.prescriptionDate + ")").join(", ")}</p>
  <table>
    <thead>
      <tr>
        <th>Visit date</th>
        <th>Rx #</th>
        <th>Doctor</th>
        <th>Product</th>
        <th class="num">Qty</th>
        <th class="num">Unit</th>
        <th class="num">Line</th>
        <th>Dosage</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="total">Subtotal: $${payload.subtotal.toFixed(2)}</p>
  <p class="muted" style="margin-top:24px;font-size:0.8rem">Prices use current product selling price at invoice time.</p>
</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
