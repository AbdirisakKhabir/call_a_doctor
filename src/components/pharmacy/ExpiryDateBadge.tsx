"use client";

import React from "react";
import Badge from "@/components/ui/badge/Badge";
import { getExpiryTone } from "@/lib/expiry";

type ExpiryDateBadgeProps = {
  expiryDate: string | null | undefined;
  className?: string;
};

export default function ExpiryDateBadge({
  expiryDate,
  className = "",
}: ExpiryDateBadgeProps) {
  if (!expiryDate) {
    return (
      <span
        className={`text-sm text-gray-500 dark:text-gray-400 ${className}`.trim()}
      >
        —
      </span>
    );
  }
  const tone = getExpiryTone(expiryDate);
  const color =
    tone === "expired" ? "error" : tone === "soon" ? "warning" : "success";
  const ymd = expiryDate.length >= 10 ? expiryDate.slice(0, 10) : expiryDate;
  const label = new Date(ymd + "T12:00:00").toLocaleDateString();
  return (
    <span className={className}>
      <Badge color={color} size="sm">
        {label}
      </Badge>
    </span>
  );
}
