import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/shared/api-client';
import { toQueryString } from '@/shared/pagination';
import type {
  DebtReport,
  EstimatedProfit,
  IncomingOrdersReport,
  ReportFilter,
  SalesReport,
  ShopReport,
  WarehouseReport,
} from './types';

// One shared query-key prefix so any expense/sale/payment mutation can
// invalidate all reports with `qc.invalidateQueries({ queryKey: REPORTS_KEY })`.
export const REPORTS_KEY = ['reports'] as const;

// The reports are read-only — no mutation hooks live here. All hooks
// take the same shared ReportFilter shape so a page that flips
// shop/from/to keeps every panel in sync.

export function useShopReport(filter: ReportFilter) {
  return useQuery<ShopReport, ApiError>({
    queryKey: [...REPORTS_KEY, 'shop', filter] as const,
    queryFn: ({ signal }) =>
      api<ShopReport>(`/reports/shop${toQueryString(filter)}`, { signal }),
  });
}

export function useWarehouseReport(filter: Omit<ReportFilter, 'shopId'>) {
  return useQuery<WarehouseReport, ApiError>({
    queryKey: [...REPORTS_KEY, 'warehouse', filter] as const,
    queryFn: ({ signal }) =>
      api<WarehouseReport>(`/reports/warehouse${toQueryString(filter)}`, { signal }),
  });
}

export function useSalesReport(filter: ReportFilter) {
  return useQuery<SalesReport, ApiError>({
    queryKey: [...REPORTS_KEY, 'sales', filter] as const,
    queryFn: ({ signal }) =>
      api<SalesReport>(`/reports/sales${toQueryString(filter)}`, { signal }),
  });
}

export function useDebtReport(filter: ReportFilter) {
  return useQuery<DebtReport, ApiError>({
    queryKey: [...REPORTS_KEY, 'debt', filter] as const,
    queryFn: ({ signal }) =>
      api<DebtReport>(`/reports/debt${toQueryString(filter)}`, { signal }),
  });
}

export function useIncomingOrdersReport(filter: Omit<ReportFilter, 'shopId'>) {
  return useQuery<IncomingOrdersReport, ApiError>({
    queryKey: [...REPORTS_KEY, 'incoming-orders', filter] as const,
    queryFn: ({ signal }) =>
      api<IncomingOrdersReport>(
        `/reports/incoming-orders${toQueryString(filter)}`,
        { signal },
      ),
  });
}

export function useEstimatedProfit(filter: ReportFilter) {
  return useQuery<EstimatedProfit, ApiError>({
    queryKey: [...REPORTS_KEY, 'estimated-profit', filter] as const,
    queryFn: ({ signal }) =>
      api<EstimatedProfit>(
        `/reports/estimated-profit${toQueryString(filter)}`,
        { signal },
      ),
  });
}
