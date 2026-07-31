import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/shared/api-client';
import { toQueryString, type Paginated } from '@/shared/pagination';
import { INVENTORY_KEY } from '@/features/inventory/api';
import type { Product, ProductWriteBody } from './types';

export const PRODUCTS_KEY = ['products'] as const;

// Product edits change the effective sale price + cost on stock pages
// (defaultSalePrice fallback for shop stock, defaultPurchaseCost for the
// value summary). Any mutation must invalidate both caches.
const invalidateProductAndInventory = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: PRODUCTS_KEY });
  qc.invalidateQueries({ queryKey: INVENTORY_KEY });
};

export type ProductsListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  includeArchived?: boolean;
};

export function useProductsList(params: ProductsListParams) {
  return useQuery<Paginated<Product>, ApiError>({
    queryKey: [...PRODUCTS_KEY, 'list', params] as const,
    queryFn: ({ signal }) =>
      api<Paginated<Product>>(`/products${toQueryString(params)}`, { signal }),
  });
}

export function useProduct(id: string | undefined) {
  return useQuery<Product, ApiError>({
    queryKey: [...PRODUCTS_KEY, 'detail', id] as const,
    queryFn: ({ signal }) => api<Product>(`/products/${id}`, { signal }),
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation<Product, ApiError, ProductWriteBody>({
    mutationFn: (body) => api<Product>('/products', { method: 'POST', body }),
    onSuccess: () => invalidateProductAndInventory(qc),
  });
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient();
  return useMutation<Product, ApiError, ProductWriteBody>({
    mutationFn: (body) => api<Product>(`/products/${id}`, { method: 'PATCH', body }),
    onSuccess: () => invalidateProductAndInventory(qc),
  });
}

export function useArchiveProduct() {
  const qc = useQueryClient();
  return useMutation<Product, ApiError, string>({
    mutationFn: (id) => api<Product>(`/products/${id}/archive`, { method: 'POST' }),
    onSuccess: () => invalidateProductAndInventory(qc),
  });
}

export function useRestoreProduct() {
  const qc = useQueryClient();
  return useMutation<Product, ApiError, string>({
    mutationFn: (id) => api<Product>(`/products/${id}/restore`, { method: 'POST' }),
    onSuccess: () => invalidateProductAndInventory(qc),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api<void>(`/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateProductAndInventory(qc),
  });
}

// FormData path — the JSON api client is bypassed. Errors normalize the same
// way (ApiError with a code the i18n layer uses).
export function useUploadProductImage(id: string) {
  const qc = useQueryClient();
  return useMutation<Product, ApiError, File>({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/products/${id}/image`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const text = await res.text();
      const data = text ? (JSON.parse(text) as unknown) : undefined;
      if (!res.ok) {
        throw new ApiError(
          data as {
            statusCode: number;
            code: string;
            message: string;
          },
        );
      }
      return data as Product;
    },
    onSuccess: () => invalidateProductAndInventory(qc),
  });
}
