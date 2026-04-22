"use client";

import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import {
  ChevronLeftIcon,
  EnvelopeIcon,
  EyeCloseIcon,
  EyeIcon,
  LockIcon,
} from "@/icons";
import Link from "next/link";
import Image from "next/image";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";

export default function SignInForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { user, login, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";

  useEffect(() => {
    if (isLoading) return;
    if (user) {
      router.replace(redirect);
    }
  }, [user, isLoading, router, redirect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    const result = await login(email.trim(), password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.replace(redirect);
  };

  if (isLoading || user) {
    return (
      <div className="flex min-h-[50vh] flex-1 flex-col items-center justify-center gap-4">
        <div
          className="h-10 w-10 animate-spin rounded-full border-[3px] border-brand-200 border-t-brand-600 dark:border-brand-800 dark:border-t-brand-400"
          aria-hidden
        />
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Signing you in…
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-1 flex-col overflow-hidden lg:w-1/2">
      <div
        className="pointer-events-none absolute inset-0 bg-linear-to-br from-gray-50 via-brand-50/50 to-blue-light-50/40 dark:from-gray-950 dark:via-gray-900 dark:to-brand-950/40"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-300/25 blur-3xl dark:bg-brand-500/15"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-blue-light-300/20 blur-3xl dark:bg-blue-light-600/10"
        aria-hidden
      />

      <div className="relative z-10 flex flex-1 flex-col px-4 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
        <div className="mx-auto w-full max-w-md">
          <Link
            href="/"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 transition-colors hover:text-brand-700 dark:text-gray-400 dark:hover:text-brand-300"
          >
            <ChevronLeftIcon className="transition-transform group-hover:-translate-x-0.5" />
            Back to home
          </Link>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center py-8 sm:py-12">
          <div className="w-full max-w-md">
            <div
              className="rounded-[1.75rem] border border-gray-200/90 bg-white/95 p-8 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.12)] backdrop-blur-sm dark:border-white/10 dark:bg-gray-900/95 dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)] sm:p-10"
            >
              <div className="mb-8 text-center sm:mb-10">
                <Link
                  href="/"
                  className="inline-flex h-16 w-32 items-center justify-center"
                >
                  <Image
                    src="/logo/call-a-doctor.png"
                    alt=""
                    width={220}
                    height={60}
                    className="object-contain h-12 w-auto"
                    priority
                  />
                </Link>
                <h1 className="mt-6 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-[1.75rem]">
                  Welcome back
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  Sign in to <span className="font-medium text-gray-700 dark:text-gray-300">Call a Doctor</span>{" "}
                  to manage the calendar, clients, and pharmacy.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div
                    role="alert"
                    className="flex gap-3 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-800 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-200"
                  >
                    <span className="mt-0.5 shrink-0 text-error-500 dark:text-error-400" aria-hidden>
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                    </span>
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>
                    Email <span className="text-error-500">*</span>
                  </Label>
                  <div className="relative">
                    <span
                      className="pointer-events-none absolute left-3.5 top-1/2 z-20 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                      aria-hidden
                    >
                      <EnvelopeIcon className="h-[18px] w-[18px]" />
                    </span>
                    <Input
                      placeholder="you@clinic.com"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      className="rounded-xl pl-11"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>
                    Password <span className="text-error-500">*</span>
                  </Label>
                  <div className="relative">
                    <span
                      className="pointer-events-none absolute left-3.5 top-1/2 z-20 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                      aria-hidden
                    >
                      <LockIcon className="h-[18px] w-[18px]" />
                    </span>
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="rounded-xl pl-11 pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 z-30 -translate-y-1/2 rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/10 dark:hover:text-gray-200"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                      ) : (
                        <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="pt-1">
                  <Button
                    className="w-full rounded-xl py-3.5 text-[15px] font-semibold shadow-lg shadow-brand-500/20 transition-all hover:shadow-xl hover:shadow-brand-500/25 hover:brightness-[1.02] active:scale-[0.99] dark:shadow-brand-900/40"
                    size="md"
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                          aria-hidden
                        />
                        Signing in…
                      </span>
                    ) : (
                      "Sign in"
                    )}
                  </Button>
                </div>
              </form>
            </div>

            <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="font-semibold text-brand-600 underline-offset-4 transition-colors hover:text-brand-700 hover:underline dark:text-brand-400 dark:hover:text-brand-300"
              >
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
