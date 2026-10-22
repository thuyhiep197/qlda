import { Router } from 'express';
import { all, get, now, run } from '../db.ts';
import { accessibleProjectIds, userPermissions } from '../permissions.ts';
import { visibleCustomersSql } from '../customer-access.ts';
import { avatarUrl } from '../avatar.ts';
import { COMMENT_NOTICE_PERM, customerNoticeSql, ISSUE_NOTICE_PERM } from '../notify.ts';

const r = Router();

/**
 * Chỉ hiện thông báo của những dự án người dùng còn quyền truy cập (và còn quyền Issue – Xem), và của khách hàng khi còn quyền xem khách hàng
 * và quyền Xem của chức năng sinh ra thông báo (hành trình, lịch gọi / trao đổi, công việc) — xét lúc đọc vì quyền có thể đã đổi.
 */
function scope(user: Express.Request['user']) {
  const perms = userPermissions(user);
  const ids = accessibleProjectIds(user);
  const issues = !perms.has(ISSUE_NOTICE_PERM) ? '0=1' : ids === 'all' ? '1=1' : ids.length ? `i.project_id IN (${ids.join(',')})` : '0=1';
  const v = visibleCustomersSql(user);
  // Điều kiện xem khách hàng (bí danh c) chỉ dùng tham số id người dùng → thay trực tiếp vì là số nguyên của phiên đăng nhập
  const customers = perms.has('customer.view')
    ? `n.customer_id IS NOT NULL AND ${customerNoticeSql(perms)} AND EXISTS (SELECT 1 FROM customers c WHERE c.id = n.customer_id AND ${v.sql.replaceAll('?', String(Number(user.id)))})` : '0=1';
  return `((n.issue_id IS NOT NULL AND ${issues} AND p.is_archived = 0) OR (n.issue_id IS NULL AND ${customers}))`;
}

// Thông báo quan trọng: có người nhắc (@) đến mình, issue đang được đánh dấu ⚑, hoặc chính thông báo "đánh dấu quan trọng"
const IMPORTANT = "(n.type IN ('mention', 'flag', 'ping') OR i.flagged = 1)";

r.get('/', (req, res) => {
  const where = `n.user_id = ? AND ${scope(req.user)}`;
  const tab = req.query.tab === 'important' ? ` AND ${IMPORTANT}` : '';
  // Nội dung bình luận (thông báo bình luận / được nhắc trong issue) chỉ hiện khi có quyền Bình luận – Xem
  const text = userPermissions(req.user).has(COMMENT_NOTICE_PERM) ? 'n.text' : "CASE WHEN n.issue_id IS NOT NULL AND n.type IN ('comment', 'mention') THEN '' ELSE n.text END";
  const items = all(`
    SELECT n.id, n.type, ${text} AS text, n.created_at, n.read_at, u.full_name AS actor_name, u.avatar AS actor_avatar,
      i.key AS issue_key, i.summary AS issue_summary, i.type AS issue_type, i.flagged AS issue_flagged,
      n.customer_id, n.link, c.name AS customer_name
    FROM notifications n LEFT JOIN issues i ON i.id = n.issue_id LEFT JOIN projects p ON p.id = i.project_id
    LEFT JOIN customers c ON c.id = n.customer_id
    LEFT JOIN users u ON u.id = n.actor_id
    WHERE ${where}${tab} ORDER BY n.created_at DESC, n.id DESC LIMIT 50`, req.user.id);
  for (const n of items) { n.actor_avatar_url = avatarUrl(n.actor_avatar); delete n.actor_avatar; }
  const count = (extra: string) => get<{ c: number }>(`SELECT COUNT(*) c FROM notifications n LEFT JOIN issues i ON i.id = n.issue_id
    LEFT JOIN projects p ON p.id = i.project_id WHERE ${where} AND n.read_at IS NULL${extra}`, req.user.id)!.c;
  res.json({ unread: count(''), unread_important: count(` AND ${IMPORTANT}`), items });
});

r.post('/read-all', (req, res) => {
  run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now(), req.user.id);
  res.json({ ok: true });
});

r.post('/:id/read', (req, res) => {
  run('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?', now(), Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

export default r;
