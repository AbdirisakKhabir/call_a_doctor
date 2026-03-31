import SignUpForm from "@/components/auth/SignUpForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Call a Doctor - Sign Up",
  description: "Sign up for Clinic Management System",
};

export default function SignUp() {
  return <SignUpForm />;
}
