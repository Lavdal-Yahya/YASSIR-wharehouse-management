import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/shared/api-client';
import type { Settings, SettingsPatch } from './types';

export const SETTINGS_KEY = ['settings'] as const;

// Public — usable by the login screen before auth.
export function useSettings() {
  return useQuery<Settings, ApiError>({
    queryKey: SETTINGS_KEY,
    queryFn: ({ signal }) => api<Settings>('/settings', { signal }),
    staleTime: 60_000,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation<Settings, ApiError, SettingsPatch>({
    mutationFn: (body) => api<Settings>('/settings', { method: 'PUT', body }),
    onSuccess: (data) => qc.setQueryData(SETTINGS_KEY, data),
  });
}

export function useUploadLogo() {
  const qc = useQueryClient();
  return useMutation<Settings, ApiError, File>({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/settings/logo', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const text = await res.text();
      const data = text ? (JSON.parse(text) as unknown) : undefined;
      if (!res.ok) {
        throw new ApiError(data as { statusCode: number; code: string; message: string });
      }
      return data as Settings;
    },
    onSuccess: (data) => qc.setQueryData(SETTINGS_KEY, data),
  });
}
