import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/shared/api-client';
import { toQueryString, type Paginated } from '@/shared/pagination';
import { CUSTOMERS_KEY } from '@/features/customers/api';
import { SALES_KEY } from '@/features/sales/api';
import type {
  Payment,
  PaymentDetail,
  RegisterPaymentBody,
} from './types';

export const PAYMENTS_KEY = ['payments'] as const;

export type ListPaymentsParams = {
  page?: number;
  pageSize?: number;
  customerId?: string;
  shopId?: string;
  status?: string;
  from?: string;
  to?: string;
};

export function usePaymentsList(params: ListPaymentsParams) {
  return useQuery<Paginated<Payment>, ApiError>({
    queryKey: [...PAYMENTS_KEY, 'list', params] as const,
    queryFn: ({ signal }) =>
      api<Paginated<Payment>>(`/payments${toQueryString(params)}`, { signal }),
    enabled: !!(params.customerId ?? params.shopId),
  });
}

export function usePayment(id: string | undefined) {
  return useQuery<PaymentDetail, ApiError>({
    queryKey: [...PAYMENTS_KEY, 'detail', id] as const,
    queryFn: ({ signal }) => api<PaymentDetail>(`/payments/${id}`, { signal }),
    enabled: !!id,
  });
}

export function useRegisterPayment() {
  const qc = useQueryClient();
  return useMutation<PaymentDetail, ApiError, RegisterPaymentBody>({
    mutationFn: (body) =>
      api<PaymentDetail>('/payments', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY });
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY });
      qc.invalidateQueries({ queryKey: SALES_KEY });
    },
  });
}

// Id is passed at mutate-call time so the customer account page can
// reverse any payment in the list without conditionally calling hooks.
export function useReversePayment() {
  const qc = useQueryClient();
  return useMutation<PaymentDetail, ApiError, { id: string; reason: string }>({
    mutationFn: ({ id, reason }) =>
      api<PaymentDetail>(`/payments/${id}/reverse`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY });
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY });
      qc.invalidateQueries({ queryKey: SALES_KEY });
    },
  });
}
