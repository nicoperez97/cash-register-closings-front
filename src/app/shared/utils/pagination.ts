/** Shared list pagination. */
export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
export const DEFAULT_PAGE_SIZE = 10;

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export type ListQuery = {
  page?: number;
  limit?: number;
  since?: string;
  [key: string]: string | number | undefined;
};

export function isPaginatedResult<T>(
  value: T[] | PaginatedResult<T>,
): value is PaginatedResult<T> {
  return (
    !!value &&
    !Array.isArray(value) &&
    Array.isArray((value as PaginatedResult<T>).items) &&
    typeof (value as PaginatedResult<T>).total === 'number'
  );
}

export function paginateClient<T>(
  rows: T[],
  pageIndex: number,
  pageSize: number,
): T[] {
  const start = pageIndex * pageSize;
  return rows.slice(start, start + pageSize);
}

export function toParams(opts?: ListQuery): Record<string, string> {
  if (!opts) return {};
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts)) {
    if (v === undefined || v === null || v === '') continue;
    params[k] = String(v);
  }
  return params;
}
