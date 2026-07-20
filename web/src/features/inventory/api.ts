import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/shared/api-client';
import { toQueryString, type Paginated } from '@/shared/pagination';
import type { BalanceRow, MovementRow, StockCorrection } from './types';

export const INVENTORY_KEY = ['inventory'] as const;

export type ListBalancesParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  lowStockOnly?: boolean;
  outOfStockOnly?: boolean;
  includeZero?: boolean;
};

export function useInventoryBalances(
  locationId: string | undefined,
  params: ListBalancesParams,
) {
  return useQuery<Paginated<BalanceRow>, ApiError>({
    queryKey: [...INVENTORY_KEY, 'balances', locationId, params] as const,
    queryFn: ({ signal }) =>
      api<Paginated<BalanceRow>>(
        `/inventory/${locationId}${toQueryString(params)}`,
        { signal },
      ),
    enabled: !!locationId,
  });
}

export type ListMovementsParams = {
  page?: number;
  pageSize?: number;
  productId?: string;
  locationId?: string;
  movementType?: string;
  from?: string;
  to?: string;
};

export function useInventoryMovements(params: ListMovementsParams) {
  return useQuery<Paginated<MovementRow>, ApiError>({
    queryKey: [...INVENTORY_KEY, 'movements', params] as const,
    queryFn: ({ signal }) =>
      api<Paginated<MovementRow>>(
        `/inventory/movements${toQueryString(params)}`,
        { signal },
      ),
  });
}

export type ListCorrectionsParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  locationId?: string;
  productId?: string;
  from?: string;
  to?: string;
};

export function useStockCorrectionsList(params: ListCorrectionsParams) {
  return useQuery<Paginated<StockCorrection>, ApiError>({
    queryKey: [...INVENTORY_KEY, 'corrections', params] as const,
    queryFn: ({ signal }) =>
      api<Paginated<StockCorrection>>(
        `/inventory/corrections${toQueryString(params)}`,
        { signal },
      ),
  });
}

export type CreateCorrectionBody = {
  locationId: string;
  productId: string;
  adjustmentQuantity: number;
  reason: string;
  notes?: string | null;
};

export function useCreateCorrection() {
  const qc = useQueryClient();
  return useMutation<StockCorrection, ApiError, CreateCorrectionBody>({
    mutationFn: (body) =>
      api<StockCorrection>('/inventory/corrections', {
        method: 'POST',
        body,
      }),
    // Corrections change balances too — invalidate the whole inventory slice.
    onSuccess: () => qc.invalidateQueries({ queryKey: INVENTORY_KEY }),
  });
}

export type OpeningStockItemBody = {
  productId: string;
  quantity: number;
  unitCost?: number;
  notes?: string | null;
};

export type CreateOpeningStockBody = {
  locationId: string;
  items: OpeningStockItemBody[];
};

export function useCreateOpeningStock() {
  const qc = useQueryClient();
  return useMutation<
    { locationId: string; itemCount: number; totalQuantity: number },
    ApiError,
    CreateOpeningStockBody
  >({
    mutationFn: (body) =>
      api('/inventory/opening-stock', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVENTORY_KEY }),
  });
}
