/**
 * Người theo dõi (watcher) và thông báo trong ứng dụng, theo cách Jira:
 *  - Tự theo dõi: người tạo, người được giao, người bình luận, người được @nhắc.
 *  - Thông báo: được @nhắc; được giao việc; issue đang theo dõi có bình luận mới hoặc đổi trạng thái.
 *  - Không thông báo cho chính người thực hiện thao tác.
 */
import { all, get, now, run } from './db.ts';

export type NotificationType = 'mention' | 'assigned' | 'comment' | 'status';

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

export function notify(userIds: Iterable<number>, actorId: number, issueId: number, type: NotificationType, text?: string | null) {
  const ts = now();
  for (const id of new Set(userIds)) {
    if (id === actorId) continue;
    // Tôn trọng cài đặt cá nhân: người dùng có thể tắt từng loại thông báo
    const pref = get<{ p: string }>('SELECT preferences p FROM users WHERE id = ?', id)?.p;
    try { if (pref && JSON.parse(pref)?.notify?.[type] === false) continue; } catch { /* cài đặt hỏng → vẫn thông báo */ }
    run('INSERT INTO notifications(user_id, actor_id, issue_id, type, text, created_at) VALUES (?,?,?,?,?,?)',
      id, actorId, issueId, type, snippet(text), ts);
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
