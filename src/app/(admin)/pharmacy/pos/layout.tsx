import type { ReactNode } from "react";

/**
 * POS no longer uses negative horizontal margins, so it keeps the same padding as other
 * admin pages (`p-4` / `md:p-6` from the parent layout).
 */
export default function POSLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
