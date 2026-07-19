// Shared shape for paginated list responses. Every list endpoint returns this.

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export function toPaginated<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): Paginated<T> {
  return { items, total, page, pageSize };
}

export function skipTake(page: number, pageSize: number): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
