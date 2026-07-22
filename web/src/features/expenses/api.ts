import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/shared/api-client';
import { toQueryString, type Paginated } from '@/shared/pagination';
import type {
  CancelExpenseBody,
  CreateExpenseBody,
  Expense,
  ExpenseStatus,
  UpdateExpenseBody,
} from './types';

// Any expense write invalidates dashboards + reports too — cash-collected
// − expenses (netCollected in the shop report) reads from the same rows.
export const EXPENSES_KEY = ['expenses'] as const;
const REPORTS_KEY = ['reports'] as const;

export type ListExpensesParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  shopId?: string;
  categoryId?: string;
  status?: ExpenseStatus;
  from?: string;
  to?: string;
};

export function useExpensesList(params: ListExpensesParams) {
  return useQuery<Paginated<Expense>, ApiError>({
    queryKey: [...EXPENSES_KEY, 'list', params] as const,
    queryFn: ({ signal }) =>
      api<Paginated<Expense>>(`/expenses${toQueryString(params)}`, { signal }),
  });
}

export function useExpense(id: string | undefined) {
  return useQuery<Expense, ApiError>({
    queryKey: [...EXPENSES_KEY, 'detail', id] as const,
    queryFn: ({ signal }) => api<Expense>(`/expenses/${id}`, { signal }),
    enabled: !!id,
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation<Expense, ApiError, CreateExpenseBody>({
    mutationFn: (body) => api<Expense>('/expenses', { method: 'POST', body }),
    onSuccess: () => invalidateExpensesAndReports(qc),
  });
}

export function useUpdateExpense(id: string) {
  const qc = useQueryClient();
  return useMutation<Expense, ApiError, UpdateExpenseBody>({
    mutationFn: (body) => api<Expense>(`/expenses/${id}`, { method: 'PATCH', body }),
    onSuccess: () => invalidateExpensesAndReports(qc),
  });
}

export function useCancelExpense() {
  const qc = useQueryClient();
  return useMutation<Expense, ApiError, { id: string; reason: string }>({
    mutationFn: ({ id, reason }) => {
      const body: CancelExpenseBody = { reason };
      return api<Expense>(`/expenses/${id}/cancel`, { method: 'POST', body });
    },
    onSuccess: () => invalidateExpensesAndReports(qc),
  });
}

function invalidateExpensesAndReports(
  qc: ReturnType<typeof useQueryClient>,
): void {
  qc.invalidateQueries({ queryKey: EXPENSES_KEY });
  qc.invalidateQueries({ queryKey: REPORTS_KEY });
}
