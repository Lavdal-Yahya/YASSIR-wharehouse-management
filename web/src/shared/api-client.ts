import type { ApiErrorBody } from './types';

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  constructor(body: ApiErrorBody) {
    super(body.message);
    this.statusCode = body.statusCode;
    this.code = body.code;
    this.name = 'ApiError';
  }
}

type FetchOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

// Thin wrapper around fetch that carries cookies, sends/receives JSON, and
// normalizes errors into ApiError. Any handler that cares about specific
// domain errors reads `err.code` (the same string the i18n layer uses).
export async function api<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = opts;
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;

  if (!res.ok) {
    const fallback: ApiErrorBody = {
      statusCode: res.status,
      code: 'INTERNAL',
      message: 'Request failed',
    };
    throw new ApiError((data as ApiErrorBody | undefined) ?? fallback);
  }

  return data as T;
}
