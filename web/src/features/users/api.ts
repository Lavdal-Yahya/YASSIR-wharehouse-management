import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/shared/api-client';
import { toQueryString, type Paginated } from '@/shared/pagination';
import type { CreateUserBody, UpdateUserBody, User } from './types';

export const USERS_KEY = ['users'] as const;

export type UsersListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  includeInactive?: boolean;
  role?: string;
};

export function useUsersList(params: UsersListParams) {
  return useQuery<Paginated<User>, ApiError>({
    queryKey: [...USERS_KEY, 'list', params] as const,
    queryFn: ({ signal }) => api<Paginated<User>>(`/users${toQueryString(params)}`, { signal }),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation<User, ApiError, CreateUserBody>({
    mutationFn: (body) => api<User>('/users', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation<User, ApiError, UpdateUserBody>({
    mutationFn: (body) => api<User>(`/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useDisableUser() {
  const qc = useQueryClient();
  return useMutation<User, ApiError, string>({
    mutationFn: (id) => api<User>(`/users/${id}/disable`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useEnableUser() {
  const qc = useQueryClient();
  return useMutation<User, ApiError, string>({
    mutationFn: (id) => api<User>(`/users/${id}/enable`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useResetPassword() {
  const qc = useQueryClient();
  return useMutation<{ user: User; generatedPassword: string }, ApiError, string>({
    mutationFn: (id) =>
      api<{ user: User; generatedPassword: string }>(`/users/${id}/reset-password`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}
