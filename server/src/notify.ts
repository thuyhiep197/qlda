/**
 * Người theo dõi (watcher) và thông báo trong ứng dụng, theo cách Jira:
 *  - Tự theo dõi: người tạo, người được giao, người bình luận, người được @nhắc.
 *  - Thông báo: được @nhắc; được giao việc; issue đang theo dõi có bình luận mới hoặc đổi trạng thái.
 *  - Issue được đánh dấu quan trọng (⚑): người thực hiện và người theo dõi nhận thông báo.
 *  - Không thông báo cho chính người thực hiện thao tác.
 */
import { all, get, now, run } from './db.ts';
import { userPermissions } from './permissions.ts';

export type NotificationType = 'mention' | 'assigned' | 'comment' | 'status' | 'flag' | 'ping';

/** @tên_đăng_nhập đứng đầu dòng hoặc sau khoảng trắng/ngoặc (không bắt nhầm email a@b.com). */
const MENTION_RE = /(^|[\s(>])@([a-z0-9][a-z0-9._-]*[a-z0-9_-]|[a-z0-9])/gi;

/** Người được @nhắc trong nội dung, chỉ tính thành viên dự án đang hoạt động (và quản trị hệ thống). */
export function mentionedUsers(text: string | null | undefined, projectId: number): number[] {
  if (!text) return [];
  const names = new Set<string>();
  for (const m of text.matchAll(MENTION_RE)) names.add(m[2].toLowerCase());
  const ids: number[] = [];
  for (const username of names) {
    const u = get<{ id: number }>(
      `SELECT u.id FROM users u WHERE u.username = ? AND u.is_active = 1 AND (u.is_admin = 1 OR EXISTS
         (SELECT 1 FROM project_members pm WHERE pm.project_id = ? AND pm.user_id = u.id))`, username, projectId);
    if (u) ids.push(u.id);
  }
  return ids;
}

export function watch(issueId: number, userIds: (number | null | undefined)[]) {
  for (const id of userIds) if (id) run('INSERT OR IGNORE INTO issue_watchers(issue_id, user_id) VALUES (?, ?)', issueId, id);
}

export function unwatch(issueId: number, userId: number) {
  run('DELETE FROM issue_watchers WHERE issue_id = ? AND user_id = ?', issueId, userId);
}

export function watchers(issueId: number): number[] {
  return all<{ user_id: number }>(
    'SELECT w.user_id FROM issue_watchers w JOIN users u ON u.id = w.user_id WHERE w.issue_id = ? AND u.is_active = 1', issueId,
  ).map((r) => r.user_id);
}

const snippet = (text?: string | null) => {
  const s = (text ?? '').replace(/!\[[^\]]*\]\([^)]*\)/g, '[ảnh]').replace(/\s+/g, ' ').trim();
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
};

/** Tôn trọng cài đặt cá nhân: người dùng có thể tắt từng loại thông báo */
function wants(userId: number, type: NotificationType) {
  const pref = get<{ p: string }>('SELECT preferences p FROM users WHERE id = ?', userId)?.p;
  try { return !(pref && JSON.parse(pref)?.notify?.[type] === false); } catch { return true; /* cài đặt hỏng → vẫn thông báo */ }
}

export function notify(userIds: Iterable<number>, actorId: number, issueId: number, type: NotificationType, text?: string | null) {
  const ts = now();
  for (const id of new Set(userIds)) {
    if (id === actorId || !wants(id, type)) continue;
    run('INSERT INTO notifications(user_id, actor_id, issue_id, type, text, created_at) VALUES (?,?,?,?,?,?)',
      id, actorId, issueId, type, snippet(text), ts);
  }
}

/** Người được @nhắc trong trao đổi của khách hàng: tài khoản đang hoạt động có quyền xem khách hàng */
export function mentionedCustomerUsers(text: string | null | undefined): number[] {
  if (!text) return [];
  const ids: number[] = [];
  for (const username of new Set([...text.matchAll(MENTION_RE)].map((m) => m[2].toLowerCase()))) {
    const u = get<{ id: number; is_admin: number }>('SELECT id, is_admin FROM users WHERE username = ? AND is_active = 1', username);
    if (u && userPermissions(u).has('customer.view')) ids.push(u.id);
  }
  return ids;
}

/**
 * Thông báo gắn với khách hàng (link = tab cần mở: journey | tasks | talk). Chỉ gửi cho người có quyền xem khách hàng;
 * actorId = null là hệ thống (VD nhắc hạn Ping).
 */
export function notifyCustomer(userIds: Iterable<number | null | undefined>, actorId: number | null, customerId: number, type: NotificationType,
  link: 'journey' | 'tasks' | 'talk', text?: string | null) {
  const ts = now();
  for (const id of new Set(userIds)) {
    if (!id || id === actorId || !wants(id, type)) continue;
    const u = get<{ id: number; is_admin: number }>('SELECT id, is_admin FROM users WHERE id = ? AND is_active = 1', id);
    if (!u || !userPermissions(u).has('customer.view')) continue;
    run('INSERT INTO notifications(user_id, actor_id, customer_id, link, type, text, created_at) VALUES (?,?,?,?,?,?,?)',
      id, actorId, customerId, link, type, snippet(text), ts);
  }
}

/** Nội dung mới có @nhắc: người được nhắc (chưa có trong nội dung cũ) nhận thông báo và tự theo dõi. */
export function handleMentions(issueId: number, projectId: number, actorId: number, newText?: string | null, oldText?: string | null) {
  const before = new Set(mentionedUsers(oldText, projectId));
  const added = mentionedUsers(newText, projectId).filter((id) => !before.has(id));
  watch(issueId, added);
  notify(added, actorId, issueId, 'mention', newText);
  return added;
}

/** Xóa thông báo đã đọc quá 90 ngày để bảng không phình to. */
export function pruneNotifications() {
  const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString();
  run('DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < ?', cutoff);
}
