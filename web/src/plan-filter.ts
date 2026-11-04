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

/** Dòng được tick để thao tác hàng loạt: đầu việc, việc con đang hiện trên bảng; không gồm Epic và dòng "Chưa thuộc giai đoạn nào" */
export const selectableRows = <T extends { level: number; issue: { id: number } }>(lines: T[]) => lines.filter((r) => r.level > 0 && r.issue.id > 0);

/** Issue đang chọn VÀ đang hiện: việc bị lọc đi hoặc nằm trong nhánh thu gọn không bị thao tác hàng loạt chạm tới */
export const selectedVisibleIssues = <I extends { id: number }>(lines: { level: number; issue: I }[], selected: Set<number>) =>
  selectableRows(lines).filter((r) => selected.has(r.issue.id)).map((r) => r.issue);

/** Ô chọn tất cả: đã chọn đủ các dòng đang hiện thì bỏ chọn hết, ngược lại chọn hết các dòng đang hiện */
export function toggleAllVisible<T extends { level: number; issue: { id: number } }>(lines: T[], selected: Set<number>) {
  const rows = selectableRows(lines);
  const all = rows.length > 0 && rows.every((r) => selected.has(r.issue.id));
  return all ? new Set<number>() : new Set(rows.map((r) => r.issue.id));
}

interface DoneRow<T> { level: number; issue: { id: number; status_category: string }; children: T[] }

/**
 * Ẩn việc đã Hoàn thành (việc cha còn việc con chưa xong thì giữ).
 * Epic không còn việc nào bên trong: keepEmptyRoot quyết định có giữ không — đang lọc mà Epic chỉ là dòng nhóm thì bỏ,
 * không để lại một dòng Epic trống với "0 việc khớp".
 */
export function dropDoneRows<T extends DoneRow<T>>(rows: T[], keepEmptyRoot: (row: T) => boolean): T[] {
  return rows.flatMap((r) => {
    const kids = dropDoneRows(r.children, keepEmptyRoot);
    if (kids.length) return [{ ...r, children: kids }];
    if (r.issue.status_category === 'done' && r.issue.id > 0) return [];
    return r.level === 0 && !keepEmptyRoot(r) ? [] : [{ ...r, children: kids }];
  });
}

/** Số việc đã Hoàn thành đang bị ẩn (dòng nhóm bị bỏ theo không tính) */
export const countDone = <T extends { issue: { id: number; status_category: string } }>(rows: T[]) => rows.filter((r) => r.issue.status_category === 'done' && r.issue.id > 0).length;

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
