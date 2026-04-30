import { redirect } from "next/navigation";

/** Old path — client invoice lives under Finance. */
export default function PharmacyPatientInvoiceRedirect() {
  redirect("/finance/client-invoice");
}
