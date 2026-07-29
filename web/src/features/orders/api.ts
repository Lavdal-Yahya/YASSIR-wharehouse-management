import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/shared/api-client';
import { toQueryString, type Paginated } from '@/shared/pagination';
import { INVENTORY_KEY } from '@/features/inventory/api';
import type {
  CreateOrderBody,
  IncomingOrder,
  IncomingOrderDetail,
  OrdersSummary,
  ReceiveOrderBody,
} from './types';

export const ORDERS_KEY = ['orders'] as const;

export type ListOrdersParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  from?: string;
  to?: string;
};

export type OrdersListResponse = Paginated<IncomingOrder> & { summary: OrdersSummary };

export function useOrdersList(params: ListOrdersParams) {
  return useQuery<OrdersListResponse, ApiError>({
    queryKey: [...ORDERS_KEY, 'list', params] as const,
    queryFn: ({ signal }) =>
      api<OrdersListResponse>(
        `/incoming-orders${toQueryString(params)}`,
        { signal },
      ),
  });
}

export function useOrder(id: string | undefined) {
  return useQuery<IncomingOrderDetail, ApiError>({
    queryKey: [...ORDERS_KEY, 'detail', id] as const,
    queryFn: ({ signal }) =>
      api<IncomingOrderDetail>(`/incoming-orders/${id}`, { signal }),
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation<IncomingOrderDetail, ApiError, CreateOrderBody>({
    mutationFn: (body) =>
      api<IncomingOrderDetail>('/incoming-orders', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ORDERS_KEY }),
  });
}

export function useReceiveOrder(id: string) {
  const qc = useQueryClient();
  return useMutation<IncomingOrderDetail, ApiError, ReceiveOrderBody>({
    mutationFn: (body) =>
      api<IncomingOrderDetail>(`/incoming-orders/${id}/receive`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      // Receiving changes both the order and warehouse stock.
      qc.invalidateQueries({ queryKey: ORDERS_KEY });
      qc.invalidateQueries({ queryKey: INVENTORY_KEY });
    },
  });
}

export function useCancelOrder(id: string) {
  const qc = useQueryClient();
  return useMutation<IncomingOrderDetail, ApiError, { reason: string }>({
    mutationFn: (body) =>
      api<IncomingOrderDetail>(`/incoming-orders/${id}/cancel`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ORDERS_KEY }),
  });
}
