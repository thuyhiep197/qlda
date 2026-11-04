/** Epic đang mở trên Kế hoạch tổng quan: mặc định không mở epic nào, chỉ hiện các epic */
export const initialExpanded = (): Set<number> => new Set();

/** Các hàng của bảng: mỗi epic, tiếp theo là issue con nếu epic đang mở */
export function roadmapRows<C, E extends { id: number; children: C[] }>(epics: E[], expanded: Set<number>) {
  const rows: ({ kind: 'epic'; e: E } | { kind: 'child'; c: C; epic: E })[] = [];
  for (const e of epics) {
    rows.push({ kind: 'epic', e });
    if (expanded.has(e.id)) for (const c of e.children) rows.push({ kind: 'child', c, epic: e });
  }
  return rows;
}

/** Mở rộng tất cả = mọi epic có issue con đều đang mở (epic không có issue con không tính) */
export const allEpicsOpen = (epics: { id: number; children: unknown[] }[], expanded: Set<number>) =>
  epics.every((e) => !e.children.length || expanded.has(e.id));

/** Bấm mũi tên một epic: đổi đóng / mở, trả về tập mới */
export function toggleEpic(expanded: Set<number>, id: number) {
  const next = new Set(expanded);
  if (!next.delete(id)) next.add(id);
  return next;
}
