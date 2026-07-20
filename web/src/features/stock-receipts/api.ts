import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/shared/api-client';
import { toQueryString, type Paginated } from '@/shared/pagination';
import { INVENTORY_KEY } from '@/features/inventory/api';
import { ORDERS_KEY } from '@/features/orders/api';
import type {
  CreateDirectReceiptBody,
  StockReceipt,
  StockReceiptDetail,
} from './types';

export const RECEIPTS_KEY = ['receipts'] as const;

export type ListReceiptsParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  source?: 'direct' | 'order';
  from?: string;
  to?: string;
};

export function useReceiptsList(params: ListReceiptsParams) {
  return useQuery<Paginated<StockReceipt>, ApiError>({
    queryKey: [...RECEIPTS_KEY, 'list', params] as const,
    queryFn: ({ signal }) =>
      api<Paginated<StockReceipt>>(
        `/stock-receipts${toQueryString(params)}`,
        { signal },
      ),
  });
}

export function useReceipt(id: string | undefined) {
  return useQuery<StockReceiptDetail, ApiError>({
    queryKey: [...RECEIPTS_KEY, 'detail', id] as const,
    queryFn: ({ signal }) => api<StockReceiptDetail>(`/stock-receipts/${id}`, { signal }),
    enabled: !!id,
  });
}

export function useCreateDirectReceipt() {
  const qc = useQueryClient();
  return useMutation<StockReceiptDetail, ApiError, CreateDirectReceiptBody>({
    mutationFn: (body) =>
      api<StockReceiptDetail>('/stock-receipts/direct', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECEIPTS_KEY });
      qc.invalidateQueries({ queryKey: INVENTORY_KEY });
      // Direct receipts don't touch orders, but keep the invalidation cheap
      // and consistent so any dashboard/report layer picks it up.
      qc.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}
