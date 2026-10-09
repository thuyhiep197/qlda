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
