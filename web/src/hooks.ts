import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from './api';
import type { Me, Project, ProjectSummary, Role, Sprint, UserBasic } from './types';

export const useMe = () => useQuery<Me | null>({
  queryKey: ['me'],
  queryFn: () => api.get<Me>('/auth/me').catch(() => null),
  staleTime: 60_000,
});

export const useProjects = () => useQuery<ProjectSummary[]>({ queryKey: ['projects'], queryFn: () => api.get('/projects') });

export const useProject = (key?: string) => useQuery<Project>({
  queryKey: ['project', key],
  queryFn: () => api.get(`/projects/${key}`),
  enabled: !!key,
});

export const useSprints = (key?: string, state?: string) => useQuery<Sprint[]>({
  queryKey: ['sprints', key, state],
  queryFn: () => api.get(`/projects/${key}/sprints${state ? `?state=${state}` : ''}`),
  enabled: !!key,
});

export const useUsersBasic = () => useQuery<UserBasic[]>({ queryKey: ['users-basic'], queryFn: () => api.get('/users/basic') });
export const useRoles = () => useQuery<Role[]>({ queryKey: ['roles'], queryFn: () => api.get('/roles') });

/** Mở issue dạng cửa sổ nổi trên trang hiện tại thông qua tham số ?issue=KEY */
export function useIssueModal() {
  const [params, setParams] = useSearchParams();
  const open = useCallback((key: string) => {
    setParams((p) => { const n = new URLSearchParams(p); n.set('issue', key); return n; });
  }, [setParams]);
  const close = useCallback(() => {
    setParams((p) => { const n = new URLSearchParams(p); n.delete('issue'); return n; });
  }, [setParams]);
  return { current: params.get('issue'), open, close };
}

export const can = (perms: string[] | undefined, p: string) => !!perms?.includes(p);
