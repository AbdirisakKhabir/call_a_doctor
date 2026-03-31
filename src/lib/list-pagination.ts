/** Shared list API pagination (pass `page` query to enable). */

export const DEFAULT_LIST_PAGE_SIZE = 20;
export const MAX_LIST_PAGE_SIZE = 100;

export function listPaginationFromSearchParams(searchParams: URLSearchParams): {
  paginate: boolean;
  page: number;
  pageSize: number;
  skip: number;
} {
  const pageRaw = searchParams.get("page");
  const paginate = pageRaw != null && pageRaw !== "";
  const page = Math.max(1, Math.floor(Number(pageRaw)) || 1);
  const pageSizeRaw = searchParams.get("pageSize");
  const pageSize = Math.min(
    MAX_LIST_PAGE_SIZE,
    Math.max(1, Math.floor(Number(pageSizeRaw)) || DEFAULT_LIST_PAGE_SIZE)
  );
  const skip = (page - 1) * pageSize;
  return { paginate, page, pageSize, skip };
}
