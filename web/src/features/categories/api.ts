import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/shared/api-client';
import { toQueryString, type Paginated } from '@/shared/pagination';
import type { Category } from './types';

export type CategoriesListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: boolean;
};

export const CATEGORIES_KEY = ['categories'] as const;

export function useCategoriesList(params: CategoriesListParams) {
  return useQuery<Paginated<Category>, ApiError>({
    queryKey: [...CATEGORIES_KEY, 'list', params] as const,
    queryFn: ({ signal }) =>
      api<Paginated<Category>>(`/categories${toQueryString(params)}`, { signal }),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation<Category, ApiError, { name: string }>({
    mutationFn: (body) => api<Category>('/categories', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation<Category, ApiError, { id: string; name: string }>({
    mutationFn: ({ id, name }) => api<Category>(`/categories/${id}`, { method: 'PATCH', body: { name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}

export function useArchiveCategory() {
  const qc = useQueryClient();
  return useMutation<Category, ApiError, string>({
    mutationFn: (id) => api<Category>(`/categories/${id}/archive`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}

export function useRestoreCategory() {
  const qc = useQueryClient();
  return useMutation<Category, ApiError, string>({
    mutationFn: (id) => api<Category>(`/categories/${id}/restore`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}
