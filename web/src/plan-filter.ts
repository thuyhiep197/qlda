export function filterTreeStrict<T extends { children: T[] }>(rows: T[], matches: (row: T) => boolean): T[] {
  return rows.flatMap((row) => {
    const children = filterTreeStrict(row.children, matches);
    return matches(row) ? [{ ...row, children }] : children;
  });
}

/** Giữ Epic làm dòng nhóm nếu bên trong có việc khớp; các dòng con vẫn lọc nghiêm theo người thực hiện. */
export function filterTreeKeepingMatchingRoots<T extends { children: T[] }>(rows: T[], matches: (row: T) => boolean): T[] {
  return rows.flatMap((root) => {
    const children = filterTreeStrict(root.children, matches);
    return matches(root) || children.length ? [{ ...root, children }] : [];
  });
}

/** Việc vừa tạo trong phiên này luôn được giữ lại, dù không khớp bộ lọc — để người tạo thấy ngay kết quả */
export const orCreated = <T extends { issue: { id: number } }>(created: Set<number>, match: (row: T) => boolean) =>
  (row: T) => created.has(row.issue.id) || match(row);

interface PlanRow<T> { level: number; issue: { type: string; subtype?: string | null }; children: T[] }

/**
 * Lọc cây kế hoạch: giữ việc khớp kèm nhánh cha làm ngữ cảnh; Loại áp cho đầu việc (việc con đi theo đầu việc).
 * strict (lọc Đánh giá/Trạng thái): việc cha không khớp thì bỏ, chỉ đưa các việc con khớp lên — Epic vẫn là dòng nhóm.
 */
export function filterPlanTree<T extends PlanRow<T>>(rows: T[], opt: { type: string; rowFilter: boolean; strict: boolean; match: (row: T) => boolean; keep?: (row: T) => boolean }): T[] {
  return rows.flatMap((r) => {
    if (opt.type && r.level === 1 && r.issue.type !== opt.type && !opt.keep?.(r)) {
      // Đầu việc khác loại nhưng có việc con đúng loại → chỉ hiện các việc con đó
      const subs = filterPlanTree(r.children.filter((c) => c.issue.subtype === opt.type || opt.keep?.(c)), opt);
      return subs.length ? [{ ...r, children: subs }] : [];
    }
    const kids = filterPlanTree(r.children, opt);
    if (kids.length) return opt.strict && r.level > 0 && !opt.match(r) ? kids : [{ ...r, children: kids }];
    // Giai đoạn chỉ còn hiện khi có việc bên trong khớp (trừ khi chỉ lọc theo người phụ trách/đánh giá… của chính giai đoạn)
    if (r.level === 0 && opt.type) return [];
    return opt.rowFilter && opt.match(r) ? [{ ...r, children: [] }] : !opt.rowFilter && r.level > 0 ? [{ ...r, children: [] }] : [];
  });
}
