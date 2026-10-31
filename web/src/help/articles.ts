import { useMemo, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useMe } from '../hooks';
import type { PermissionCatalog } from '../types';
import { latestNewsKey, mergeOverrides, parseArticle, permCodes, visibleArticles, type HelpArticle, type HelpOverride } from './help-core';

/** Bài có sẵn: mỗi tệp web/src/help/content/<mã bài>.md là một bài */
const files = import.meta.glob('./content/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
export const BUILTIN_ARTICLES: HelpArticle[] = Object.entries(files)
  .map(([file, raw]) => parseArticle(file.replace(/^.*\/(.+)\.md$/, '$1'), raw));

export const NEWS_ID = 'co-gi-moi';
export const MY_PERMS_ID = 'quyen-cua-toi';
export const START_ID = 'bat-dau';

export const useHelpOverrides = () => useQuery<HelpOverride[]>({ queryKey: ['help'], queryFn: () => api.get('/help'), staleTime: 300_000 });

/** Mọi bài (có sẵn + bản sửa trên tool) và các bài người đang đăng nhập thấy được */
export function useHelpArticles() {
  const { data: me } = useMe();
  const { data: overrides } = useHelpOverrides();
  return useMemo(() => {
    const all = mergeOverrides(BUILTIN_ARTICLES, overrides ?? []);
    return { all, visible: visibleArticles(all, me), byId: new Map(all.map((a) => [a.id, a])) };
  }, [me, overrides]);
}

/** Có mục "Có gì mới" chưa đọc */
export function useHasUnreadNews() {
  const { data: me } = useMe();
  const { byId } = useHelpArticles();
  const key = latestNewsKey(byId.get(NEWS_ID)?.body ?? '');
  return !!me && !!key && me.preferences?.help_seen !== key;
}

/** Tên quyền để hiện cho người đọc, VD "Issue (Epic, Story…) – Thêm"; sub:customer → "Phân hệ Khách hàng" */
export function usePermLabel() {
  const { data: catalog } = useQuery<PermissionCatalog>({ queryKey: ['permissions'], queryFn: () => api.get('/permissions'), staleTime: 600_000 });
  return useMemo(() => {
    const names = new Map<string, string>();
    for (const g of catalog?.groups ?? []) for (const f of g.features) for (const a of f.actions) {
      names.set(`${f.key}.${a}`, `${f.label} – ${f.actionLabels?.[a] ?? catalog!.actions[a]}`);
    }
    for (const s of catalog?.subsystems ?? []) names.set(`sub:${s.key}`, s.label);
    names.set('admin', 'Quản trị hệ thống');
    return (need: string) => need.split(',').map((g) => permCodes(g).map((c) => names.get(c) ?? c).join(' hoặc ')).join(' và ');
  }, [catalog]);
}

// ---------------------------------------------------------------------------
// Ngăn hướng dẫn bên phải: mở từ nút "?" hoặc ⓘ ở bất kỳ màn hình nào. id null = bài của màn hình đang mở.
// ---------------------------------------------------------------------------
type DrawerState = { open: boolean; id: string | null };
let drawer: DrawerState = { open: false, id: null };
const listeners = new Set<() => void>();
const setDrawer = (s: DrawerState) => { drawer = s; listeners.forEach((l) => l()); };
export const openHelp = (id: string | null = null) => setDrawer({ open: true, id });
export const closeHelp = () => setDrawer({ open: false, id: null });
export const useHelpDrawer = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => drawer);

// Tour hướng dẫn nhanh: tự mở lần đầu đăng nhập; mở lại từ nút "?"
let tourOpen = false;
const tourListeners = new Set<() => void>();
export const startTour = () => { tourOpen = true; tourListeners.forEach((l) => l()); };
export const endTour = () => { tourOpen = false; tourListeners.forEach((l) => l()); };
export const useTourOpen = () => useSyncExternalStore((l) => { tourListeners.add(l); return () => tourListeners.delete(l); }, () => tourOpen);
