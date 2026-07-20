import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/shared/api-client';
import { toQueryString, type Paginated } from '@/shared/pagination';
import { INVENTORY_KEY } from '@/features/inventory/api';
import type {
  CreateTransferBody,
  ReverseTransferBody,
  Transfer,
  TransferDetail,
} from './types';

export const TRANSFERS_KEY = ['transfers'] as const;

export type ListTransfersParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  sourceLocationId?: string;
  destinationLocationId?: string;
  status?: string;
  from?: string;
  to?: string;
};

export function useTransfersList(params: ListTransfersParams) {
  return useQuery<Paginated<Transfer>, ApiError>({
    queryKey: [...TRANSFERS_KEY, 'list', params] as const,
    queryFn: ({ signal }) =>
      api<Paginated<Transfer>>(`/transfers${toQueryString(params)}`, { signal }),
  });
}

export function useTransfer(id: string | undefined) {
  return useQuery<TransferDetail, ApiError>({
    queryKey: [...TRANSFERS_KEY, 'detail', id] as const,
    queryFn: ({ signal }) => api<TransferDetail>(`/transfers/${id}`, { signal }),
    enabled: !!id,
  });
}

export function useCreateTransfer() {
  const qc = useQueryClient();
  return useMutation<TransferDetail, ApiError, CreateTransferBody>({
    mutationFn: (body) =>
      api<TransferDetail>('/transfers', { method: 'POST', body }),
    onSuccess: () => {
      // Both locations' balances + ledgers change.
      qc.invalidateQueries({ queryKey: TRANSFERS_KEY });
      qc.invalidateQueries({ queryKey: INVENTORY_KEY });
    },
  });
}

export function useReverseTransfer(id: string) {
  const qc = useQueryClient();
  return useMutation<TransferDetail, ApiError, ReverseTransferBody>({
    mutationFn: (body) =>
      api<TransferDetail>(`/transfers/${id}/reverse`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TRANSFERS_KEY });
      qc.invalidateQueries({ queryKey: INVENTORY_KEY });
    },
  });
}
