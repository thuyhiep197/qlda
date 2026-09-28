import { QueryClient } from '@tanstack/react-query';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  const res = await fetch(`/api${path}`, init);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) queryClient.setQueryData(['me'], null);
    throw new ApiError(res.status, data?.error || `Lỗi ${res.status}`);
  }
  return data as T;
}

export const api = {
  get: <T = any>(path: string) => request<T>('GET', path),
  post: <T = any>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T = any>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T = any>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: <T = any>(path: string) => request<T>('DELETE', path),
};

export function qs(params: Record<string, string | number | undefined | null | false>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Làm mới toàn bộ dữ liệu liên quan tới issue/sprint/dự án sau khi thay đổi. */
export function refreshAll() {
  return queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
}

/** Đăng xuất rồi tải lại trang để xóa sạch dữ liệu của phiên cũ (an toàn khi dùng chung máy). */
export async function logout() {
  try { await request('POST', '/auth/logout', {}); } finally {
    queryClient.clear();
    window.location.assign('/');
  }
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
