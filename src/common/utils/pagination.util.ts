export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  lastPage: number;
}

export interface PaginatedResponse<T> {
  message: string;
  data: T[];
  meta: PaginationMeta;
}

interface PaginatedResponseOptions {
  successMessage: string;
  emptyMessage: string;
}

interface NormalizedPagination {
  page: number;
  limit: number;
  skip: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function normalizePagination(
  page = DEFAULT_PAGE,
  limit = DEFAULT_LIMIT,
): NormalizedPagination {
  const normalizedPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : DEFAULT_PAGE;
  const normalizedLimit =
    Number.isFinite(limit) && limit > 0
      ? Math.min(Math.floor(limit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  return {
    page: normalizedPage,
    limit: normalizedLimit,
    skip: (normalizedPage - 1) * normalizedLimit,
  };
}

export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  return {
    total,
    page,
    limit,
    lastPage: total > 0 ? Math.ceil(total / limit) : 0,
  };
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
  options: PaginatedResponseOptions,
): PaginatedResponse<T> {
  return {
    message: data.length > 0 ? options.successMessage : options.emptyMessage,
    data,
    meta: buildPaginationMeta(total, page, limit),
  };
}
