/** Chuyển phần tử ở vị trí from sang vị trí to (kéo thả sắp xếp); vị trí không hợp lệ thì giữ nguyên */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return list;
  const out = [...list];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}

/** Tình trạng chọn được cho khách hàng: đang sử dụng, theo thứ tự; giữ tình trạng hiện tại dù đã ngừng */
export function statusOptions<T extends { name: string; is_active: number }>(list: T[], current?: string | null): string[] {
  const names = list.filter((s) => s.is_active).map((s) => s.name);
  return current && !names.includes(current) ? [current, ...names] : names;
}
