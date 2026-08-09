import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Call a Doctor - Sign In",
  description: "Sign in to Clinic Management System",
};

export default function SignIn() {
  return (
    <Suspense
      fallback={
        <div className="flex w-full max-w-md items-center justify-center py-20">
          <span className="text-gray-500 dark:text-gray-400">Loading...</span>
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
