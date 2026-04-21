import React, { type ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  children: ReactNode;
};

/** Grouped section for client add/edit forms. */
export default function ClientFormCard({ title, description, children }: Props) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/3 md:p-6">
      <div className="mb-4 border-b border-gray-100 pb-3 dark:border-gray-800">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
        {description ? (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
