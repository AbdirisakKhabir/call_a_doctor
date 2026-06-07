"use client";

import Pagination from "@/components/tables/Pagination";

type ListPaginationFooterProps = {
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  noun?: string;
  onPageChange: (page: number) => void;
};

export default function ListPaginationFooter({
  loading,
  total,
  page,
  pageSize,
  noun = "items",
  onPageChange,
}: ListPaginationFooterProps) {
  if (loading || total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fromIdx = (page - 1) * pageSize + 1;
  const toIdx = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Showing {fromIdx}–{toIdx} of {total} {noun}
      </p>
      <Pagination currentPage={page} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  );
}
