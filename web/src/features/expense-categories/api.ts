import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/shared/api-client';
import { toQueryString, type Paginated } from '@/shared/pagination';
import type { ExpenseCategory } from './types';

export const EXPENSE_CATEGORIES_KEY = ['expense-categories'] as const;

export type ListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: boolean;
};

export function useExpenseCategoriesList(params: ListParams) {
  return useQuery<Paginated<ExpenseCategory>, ApiError>({
    queryKey: [...EXPENSE_CATEGORIES_KEY, 'list', params] as const,
    queryFn: ({ signal }) =>
      api<Paginated<ExpenseCategory>>(`/expense-categories${toQueryString(params)}`, { signal }),
  });
}

export function useCreateExpenseCategory() {
  const qc = useQueryClient();
  return useMutation<ExpenseCategory, ApiError, { name: string }>({
    mutationFn: (body) => api<ExpenseCategory>('/expense-categories', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: EXPENSE_CATEGORIES_KEY }),
  });
}

export function useUpdateExpenseCategory() {
  const qc = useQueryClient();
  return useMutation<ExpenseCategory, ApiError, { id: string; name: string }>({
    mutationFn: ({ id, name }) =>
      api<ExpenseCategory>(`/expense-categories/${id}`, { method: 'PATCH', body: { name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: EXPENSE_CATEGORIES_KEY }),
  });
}

export function useArchiveExpenseCategory() {
  const qc = useQueryClient();
  return useMutation<ExpenseCategory, ApiError, string>({
    mutationFn: (id) => api<ExpenseCategory>(`/expense-categories/${id}/archive`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: EXPENSE_CATEGORIES_KEY }),
  });
}

export function useRestoreExpenseCategory() {
  const qc = useQueryClient();
  return useMutation<ExpenseCategory, ApiError, string>({
    mutationFn: (id) => api<ExpenseCategory>(`/expense-categories/${id}/restore`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: EXPENSE_CATEGORIES_KEY }),
  });
}
