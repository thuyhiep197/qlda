/**
 * Xếp danh sách tài khoản theo nhóm người dùng: các nhóm theo thứ tự danh mục nhóm,
 * nhóm không còn trong danh mục đứng sau, tài khoản chưa có nhóm xếp cuối. Trong mỗi nhóm giữ nguyên thứ tự cũ.
 */
export function groupByRole<U extends { default_role_id?: number | null }>(users: U[], roles: { id: number }[]): U[][] {
  const order = new Map(roles.map((r, i) => [r.id, i]));
  const rank = (id: number | null | undefined) => (id == null ? Infinity : order.get(id) ?? roles.length);
  const groups = new Map<number | null, U[]>();
  for (const u of users) {
    const key = u.default_role_id ?? null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(u);
  }
  return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b)).map(([, list]) => list);
}
