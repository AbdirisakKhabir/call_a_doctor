import { redirect } from "next/navigation";

export default function LegacyBranchesRedirect() {
  redirect("/settings/branches");
}
