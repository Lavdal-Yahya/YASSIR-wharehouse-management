import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/shared/api-client';
import { toQueryString, type Paginated } from '@/shared/pagination';
import type {
  CancelRemittanceBody,
  CashOnHand,
  CreateRemittanceBody,
  Remittance,
  RemittanceStatus,
} from './types';

// Every remittance write moves cash-on-hand — invalidate both keys.
// Also reports (shop report's `remittances` field), and sales-related
// caches don't need touching because remittance doesn't change sales/
// payments themselves.
export const REMITTANCES_KEY = ['remittances'] as const;
export const CASH_ON_HAND_KEY = ['reports', 'cash-on-hand'] as const;
const REPORTS_KEY = ['reports'] as const;

export type ListRemittancesParams = {
  page?: number;
  pageSize?: number;
  shopId?: string;
  status?: RemittanceStatus;
  from?: string;
  to?: string;
};

export function useRemittancesList(params: ListRemittancesParams) {
  return useQuery<Paginated<Remittance>, ApiError>({
    queryKey: [...REMITTANCES_KEY, 'list', params] as const,
    queryFn: ({ signal }) =>
      api<Paginated<Remittance>>(`/remittances${toQueryString(params)}`, { signal }),
  });
}

export function useRemittance(id: string | undefined) {
  return useQuery<Remittance, ApiError>({
    queryKey: [...REMITTANCES_KEY, 'detail', id] as const,
    queryFn: ({ signal }) => api<Remittance>(`/remittances/${id}`, { signal }),
    enabled: !!id,
  });
}

export function useCashOnHand(asOf?: string) {
  return useQuery<CashOnHand, ApiError>({
    queryKey: [...CASH_ON_HAND_KEY, { asOf: asOf ?? null }] as const,
    queryFn: ({ signal }) =>
      api<CashOnHand>(`/reports/cash-on-hand${asOf ? `?asOf=${encodeURIComponent(asOf)}` : ''}`, { signal }),
  });
}

export function useCreateRemittance() {
  const qc = useQueryClient();
  return useMutation<Remittance, ApiError, CreateRemittanceBody>({
    mutationFn: (body) =>
      api<Remittance>('/remittances', { method: 'POST', body }),
    onSuccess: () => invalidateRemittancesAndReports(qc),
  });
}

export function useCancelRemittance() {
  const qc = useQueryClient();
  return useMutation<Remittance, ApiError, { id: string; reason: string }>({
    mutationFn: ({ id, reason }) => {
      const body: CancelRemittanceBody = { reason };
      return api<Remittance>(`/remittances/${id}/cancel`, {
        method: 'POST',
        body,
      });
    },
    onSuccess: () => invalidateRemittancesAndReports(qc),
  });
}

function invalidateRemittancesAndReports(
  qc: ReturnType<typeof useQueryClient>,
): void {
  qc.invalidateQueries({ queryKey: REMITTANCES_KEY });
  qc.invalidateQueries({ queryKey: REPORTS_KEY });
}
