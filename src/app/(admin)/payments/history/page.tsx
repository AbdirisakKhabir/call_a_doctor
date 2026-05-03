import { redirect } from "next/navigation";

/** Legacy URL; payment listing lives under Finance. */
export default function PaymentHistoryRedirectPage() {
  redirect("/finance/payments");
}
