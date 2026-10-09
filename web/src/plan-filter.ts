export function filterTreeStrict<T extends { children: T[] }>(rows: T[], matches: (row: T) => boolean): T[] {
  return rows.flatMap((row) => {
    const children = filterTreeStrict(row.children, matches);
    return matches(row) ? [{ ...row, children }] : children;
  });
}
