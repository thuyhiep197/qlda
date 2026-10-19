/** Thanh bên thu gọn (chỉ hiện biểu tượng) hay mở rộng — nhớ trên từng máy; trình duyệt chặn lưu trữ thì mặc định mở rộng */
const KEY = 'qlda-sidebar-collapsed';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function readCollapsed(store: Store | undefined = globalThis.localStorage): boolean {
  try { return store?.getItem(KEY) === '1'; } catch { return false; }
}

export function saveCollapsed(value: boolean, store: Store | undefined = globalThis.localStorage) {
  try { store?.setItem(KEY, value ? '1' : '0'); } catch { /* trình duyệt chặn lưu trữ */ }
}

/** Độ rộng thanh bên khi mở rộng (người dùng kéo mép phải để co giãn) — giới hạn trong [MIN_WIDTH, MAX_WIDTH] */
const WIDTH_KEY = 'qlda-sidebar-width';
export const DEFAULT_WIDTH = 240, MIN_WIDTH = 180, MAX_WIDTH = 400;
/** Kéo hẹp hơn mức này thì thu gọn thành chỉ còn biểu tượng */
export const COLLAPSE_BELOW = 130;

export const clampWidth = (w: number) => Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w)));

export function readWidth(store: Store | undefined = globalThis.localStorage): number {
  try { const w = Number(store?.getItem(WIDTH_KEY)); return w ? clampWidth(w) : DEFAULT_WIDTH; } catch { return DEFAULT_WIDTH; }
}

export function saveWidth(value: number, store: Store | undefined = globalThis.localStorage) {
  try { store?.setItem(WIDTH_KEY, String(clampWidth(value))); } catch { /* trình duyệt chặn lưu trữ */ }
}
