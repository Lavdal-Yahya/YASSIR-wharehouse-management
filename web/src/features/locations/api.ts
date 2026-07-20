import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/shared/api-client';

export type LocationType = 'WAREHOUSE' | 'SHOP';

export type Location = {
  id: string;
  name: string;
  type: LocationType;
  shopId: string | null;
  active: boolean;
};

export const LOCATIONS_KEY = ['locations'] as const;

export function useLocationsList() {
  return useQuery<Location[], ApiError>({
    queryKey: [...LOCATIONS_KEY, 'list'] as const,
    queryFn: ({ signal }) => api<Location[]>('/locations', { signal }),
    // Locations rarely change; a longer stale window avoids per-page refetch.
    staleTime: 5 * 60 * 1000,
  });
}

// Convenience: the one warehouse. There is always exactly one (seeded on
// install). undefined while loading; hooks that depend on it should gate.
export function useWarehouseLocation(): Location | undefined {
  const list = useLocationsList();
  return list.data?.find((l) => l.type === 'WAREHOUSE');
}
