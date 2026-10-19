/** Thanh bên thu gọn (chỉ hiện biểu tượng) hay mở rộng — nhớ trên từng máy; trình duyệt chặn lưu trữ thì mặc định mở rộng */
const KEY = 'qlda-sidebar-collapsed';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function readCollapsed(store: Store | undefined = globalThis.localStorage): boolean {
  try { return store?.getItem(KEY) === '1'; } catch { return false; }
}

export function saveCollapsed(value: boolean, store: Store | undefined = globalThis.localStorage) {
  try { store?.setItem(KEY, value ? '1' : '0'); } catch { /* trình duyệt chặn lưu trữ */ }
}
