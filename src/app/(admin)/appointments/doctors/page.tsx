import { redirect } from "next/navigation";

export default function LegacyDoctorsRedirect() {
  redirect("/settings/doctors");
}
