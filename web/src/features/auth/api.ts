import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/shared/api-client';
import type { SessionUser } from '@/shared/types';

export const AUTH_ME_KEY = ['auth', 'me'] as const;

type MeResponse = { user: SessionUser };
type LoginBody = { username: string; password: string };

// `me` is the SPA's session probe. 401 means "unauthenticated" — a valid,
// expected state we should not retry or bubble as an error.
export function useMe() {
  return useQuery<MeResponse | null, ApiError>({
    queryKey: AUTH_ME_KEY,
    queryFn: async ({ signal }) => {
      try {
        return await api<MeResponse>('/auth/me', { signal });
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 401) return null;
        throw err;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation<MeResponse, ApiError, LoginBody>({
    mutationFn: (body) => api<MeResponse>('/auth/login', { method: 'POST', body }),
    onSuccess: (data) => {
      qc.setQueryData(AUTH_ME_KEY, data);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError>({
    mutationFn: () => api<{ ok: true }>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      qc.setQueryData(AUTH_ME_KEY, null);
      qc.clear();
    },
  });
}
