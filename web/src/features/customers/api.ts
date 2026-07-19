import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/shared/api-client';
import { toQueryString, type Paginated } from '@/shared/pagination';
import type { Customer, CustomerWriteBody } from './types';

export const CUSTOMERS_KEY = ['customers'] as const;

export type CustomersListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: boolean;
};

export function useCustomersList(params: CustomersListParams) {
  return useQuery<Paginated<Customer>, ApiError>({
    queryKey: [...CUSTOMERS_KEY, 'list', params] as const,
    queryFn: ({ signal }) => api<Paginated<Customer>>(`/customers${toQueryString(params)}`, { signal }),
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery<Customer, ApiError>({
    queryKey: [...CUSTOMERS_KEY, 'detail', id] as const,
    queryFn: ({ signal }) => api<Customer>(`/customers/${id}`, { signal }),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation<Customer, ApiError, CustomerWriteBody>({
    mutationFn: (body) => api<Customer>('/customers', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CUSTOMERS_KEY }),
  });
}

export function useUpdateCustomer(id: string) {
  const qc = useQueryClient();
  return useMutation<Customer, ApiError, CustomerWriteBody>({
    mutationFn: (body) => api<Customer>(`/customers/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CUSTOMERS_KEY }),
  });
}

export function useArchiveCustomer() {
  const qc = useQueryClient();
  return useMutation<Customer, ApiError, string>({
    mutationFn: (id) => api<Customer>(`/customers/${id}/archive`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CUSTOMERS_KEY }),
  });
}

export function useRestoreCustomer() {
  const qc = useQueryClient();
  return useMutation<Customer, ApiError, string>({
    mutationFn: (id) => api<Customer>(`/customers/${id}/restore`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CUSTOMERS_KEY }),
  });
}
