import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/shared/api-client';
import { toQueryString, type Paginated } from '@/shared/pagination';
import type { Shop, ShopWriteBody } from './types';

export const SHOPS_KEY = ['shops'] as const;

export type ShopsListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: boolean;
};

export function useShopsList(params: ShopsListParams) {
  return useQuery<Paginated<Shop>, ApiError>({
    queryKey: [...SHOPS_KEY, 'list', params] as const,
    queryFn: ({ signal }) => api<Paginated<Shop>>(`/shops${toQueryString(params)}`, { signal }),
  });
}

export function useShop(id: string | undefined) {
  return useQuery<Shop, ApiError>({
    queryKey: [...SHOPS_KEY, 'detail', id] as const,
    queryFn: ({ signal }) => api<Shop>(`/shops/${id}`, { signal }),
    enabled: !!id,
  });
}

export function useCreateShop() {
  const qc = useQueryClient();
  return useMutation<Shop, ApiError, ShopWriteBody>({
    mutationFn: (body) => api<Shop>('/shops', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SHOPS_KEY }),
  });
}

export function useUpdateShop(id: string) {
  const qc = useQueryClient();
  return useMutation<Shop, ApiError, ShopWriteBody>({
    mutationFn: (body) => api<Shop>(`/shops/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SHOPS_KEY }),
  });
}

export function useArchiveShop() {
  const qc = useQueryClient();
  return useMutation<Shop, ApiError, string>({
    mutationFn: (id) => api<Shop>(`/shops/${id}/archive`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SHOPS_KEY }),
  });
}

export function useRestoreShop() {
  const qc = useQueryClient();
  return useMutation<Shop, ApiError, string>({
    mutationFn: (id) => api<Shop>(`/shops/${id}/restore`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SHOPS_KEY }),
  });
}
