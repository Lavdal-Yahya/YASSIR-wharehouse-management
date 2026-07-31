import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/shared/api-client';
import { toQueryString, type Paginated } from '@/shared/pagination';
import { CUSTOMERS_KEY } from '@/features/customers/api';
import { INVENTORY_KEY } from '@/features/inventory/api';
import type {
  CancelSaleBody,
  CreateSaleBody,
  PaymentStatus,
  Sale,
  SaleDetail,
  SalesSummary,
  SaleStatus,
  UpdateSaleBody,
} from './types';

export const SALES_KEY = ['sales'] as const;
const REPORTS_KEY = ['reports'] as const;

export type ListSalesParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  shopId?: string;
  customerId?: string;
  paymentStatus?: PaymentStatus | PaymentStatus[];
  status?: SaleStatus | SaleStatus[];
  from?: string;
  to?: string;
};

export type SalesListResponse = Paginated<Sale> & { summary: SalesSummary };

export function useSalesList(params: ListSalesParams) {
  return useQuery<SalesListResponse, ApiError>({
    queryKey: [...SALES_KEY, 'list', params] as const,
    queryFn: ({ signal }) =>
      api<SalesListResponse>(`/sales${toQueryString(serialize(params))}`, {
        signal,
      }),
  });
}

export function useSale(id: string | undefined) {
  return useQuery<SaleDetail, ApiError>({
    queryKey: [...SALES_KEY, 'detail', id] as const,
    queryFn: ({ signal }) => api<SaleDetail>(`/sales/${id}`, { signal }),
    enabled: !!id,
  });
}

// Sale confirmation — the app's hero write. Invalidates inventory
// (balances just changed), customers (an inline-created customer or
// updated outstanding), reports (dashboards read from the same rows),
// and sales itself.
export function useConfirmSale() {
  const qc = useQueryClient();
  return useMutation<SaleDetail, ApiError, CreateSaleBody>({
    mutationFn: (body) =>
      api<SaleDetail>('/sales', { method: 'POST', body }),
    onSuccess: () => invalidateSalesFallout(qc),
  });
}

// OWNER book-correction edit. No stock ripple — just rewrites qty/price
// on existing items and header fields. Reuses the standard sales-fallout
// invalidation so reports/customer/payment views also refetch.
export function useUpdateSale(id: string) {
  const qc = useQueryClient();
  return useMutation<SaleDetail, ApiError, UpdateSaleBody>({
    mutationFn: (body) =>
      api<SaleDetail>(`/sales/${id}`, { method: 'PATCH', body }),
    onSuccess: () => invalidateSalesFallout(qc),
  });
}

export function useCancelSale(id: string) {
  const qc = useQueryClient();
  return useMutation<SaleDetail, ApiError, CancelSaleBody>({
    mutationFn: (body) =>
      api<SaleDetail>(`/sales/${id}/cancel`, { method: 'POST', body }),
    onSuccess: () => invalidateSalesFallout(qc),
  });
}

function invalidateSalesFallout(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: SALES_KEY });
  qc.invalidateQueries({ queryKey: INVENTORY_KEY });
  qc.invalidateQueries({ queryKey: CUSTOMERS_KEY });
  qc.invalidateQueries({ queryKey: REPORTS_KEY });
}

// toQueryString expects string|number|boolean values — flatten status
// arrays into comma-joined strings the server-side @Transform accepts.
function serialize(params: ListSalesParams): Record<string, string | number | undefined> {
  const flat: Record<string, string | number | undefined> = {
    page: params.page,
    pageSize: params.pageSize,
    search: params.search,
    shopId: params.shopId,
    customerId: params.customerId,
    from: params.from,
    to: params.to,
  };
  if (params.paymentStatus) {
    flat.paymentStatus = Array.isArray(params.paymentStatus)
      ? params.paymentStatus.join(',')
      : params.paymentStatus;
  }
  if (params.status) {
    flat.status = Array.isArray(params.status)
      ? params.status.join(',')
      : params.status;
  }
  return flat;
}
