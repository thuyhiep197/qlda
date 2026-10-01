import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from './api';
import { RELEASES_ENABLED } from './util';
import type { Component, Me, Project, ProjectSummary, Role, Sprint, UserBasic, Version } from './types';

export const useMe = () => useQuery<Me | null>({
  queryKey: ['me'],
  queryFn: () => api.get<Me>('/auth/me').catch(() => null),
  staleTime: 60_000,
});

/** Tài khoản có quyền (theo nhóm người dùng + quyền riêng) — dùng ngoài phạm vi dự án (menu, quản trị). */
export const hasPerm = (me: Me | null | undefined, p: string) => !!me && (!!me.is_admin || !!me.permissions?.includes(p));

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
export const useComponents = (key?: string) => useQuery<Component[]>({
  queryKey: ['components', key],
  queryFn: () => api.get(`/projects/${key}/components`),
  enabled: !!key,
});

export const useVersions = (key?: string) => useQuery<Version[]>({
  queryKey: ['versions', key],
  queryFn: () => api.get(`/projects/${key}/versions`),
  enabled: RELEASES_ENABLED && !!key,
});

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
