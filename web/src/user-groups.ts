import { fold } from './customer-filter';

type Account = { full_name: string; username: string; email?: string | null };
/** Tài khoản khớp ô tìm: họ tên / tên đăng nhập / email, không phân biệt dấu và hoa thường ("hoang" khớp "Hoàng") */
export const matchAccount = (u: Account, q: string) => {
  const k = fold(q.trim());
  return !k || fold(`${u.full_name} ${u.username} ${u.email ?? ''}`).includes(k);
};

/** Gợi ý khi gõ tên: tài khoản khớp, người có họ tên / tên đăng nhập / một từ trong tên bắt đầu bằng chữ đang gõ xếp trước; tối đa `limit` */
export function suggestAccounts<U extends Account>(users: U[], q: string, limit = 8): U[] {
  const k = fold(q.trim());
  if (!k) return [];
  const rank = (u: U) => {
    const name = fold(u.full_name);
    if (name.startsWith(k) || fold(u.username).startsWith(k)) return 0;
    return name.split(/\s+/).some((w) => w.startsWith(k)) ? 1 : 2;
  };
  return users.filter((u) => matchAccount(u, q)).map((u, i) => ({ u, i, r: rank(u) }))
    .sort((a, b) => a.r - b.r || a.i - b.i).slice(0, limit).map((x) => x.u);
}

/** Nhóm xếp đầu (sau nhóm Quản trị hệ thống), so theo tên bỏ khoảng trắng, không phân biệt hoa thường */
const TOP_GROUPS = ['bangiámđốc', 'techlead', 'balead'];
const nameKey = (name: string | undefined) => (name ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, '');

/**
 * Xếp danh sách tài khoản theo nhóm người dùng: nhóm Quản trị hệ thống, Ban Giám đốc, Techlead, BA Lead đứng đầu, sau đó các nhóm
 * theo thứ tự danh mục nhóm, nhóm không còn trong danh mục đứng sau, tài khoản chưa có nhóm xếp cuối.
 * Trong mỗi nhóm giữ nguyên thứ tự cũ.
 */
export function groupByRole<U extends { default_role_id?: number | null }>(
  users: U[], roles: { id: number; name?: string; is_admin?: number | boolean }[],
): U[][] {
  const top = (r: (typeof roles)[number]) => {
    if (r.is_admin) return -1;
    const i = TOP_GROUPS.indexOf(nameKey(r.name));
    return i < 0 ? TOP_GROUPS.length : i;
  };
  const sorted = roles.map((r, i) => ({ r, i })).sort((a, b) => top(a.r) - top(b.r) || a.i - b.i);
  const order = new Map(sorted.map(({ r }, i) => [r.id, i]));
  const rank = (id: number | null | undefined) => (id == null ? Infinity : order.get(id) ?? roles.length);
  const groups = new Map<number | null, U[]>();
  for (const u of users) {
    const key = u.default_role_id ?? null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(u);
  }
  return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b)).map(([, list]) => list);
}

/** Các nhóm dòng của bảng tài khoản: xếp theo nhóm người dùng hoặc một nhóm duy nhất; không có tài khoản nào → không có nhóm */
export function userRowGroups<U extends { default_role_id?: number | null }>(
  users: U[] | undefined, byRole: boolean, roles: Parameters<typeof groupByRole>[1],
): U[][] {
  if (!users?.length) return [];
  return byRole ? groupByRole(users, roles) : [users];
}
