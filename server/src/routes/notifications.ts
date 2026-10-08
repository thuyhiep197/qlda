import { Router } from 'express';
import { all, get, now, run } from '../db.ts';
import { accessibleProjectIds } from '../permissions.ts';

const r = Router();

/** Chỉ hiện thông báo của những dự án người dùng còn quyền truy cập. */
function scope(user: Express.Request['user']) {
  const ids = accessibleProjectIds(user);
  if (ids === 'all') return '1=1';
  return ids.length ? `i.project_id IN (${ids.join(',')})` : '0=1';
}

// Thông báo quan trọng: có người nhắc (@) đến mình, issue đang được đánh dấu ⚑, hoặc chính thông báo "đánh dấu quan trọng"
const IMPORTANT = "(n.type IN ('mention', 'flag') OR i.flagged = 1)";

r.get('/', (req, res) => {
  const where = `n.user_id = ? AND ${scope(req.user)} AND p.is_archived = 0`;
  const tab = req.query.tab === 'important' ? ` AND ${IMPORTANT}` : '';
  const items = all(`
    SELECT n.id, n.type, n.text, n.created_at, n.read_at, u.full_name AS actor_name,
      i.key AS issue_key, i.summary AS issue_summary, i.type AS issue_type, i.flagged AS issue_flagged
    FROM notifications n JOIN issues i ON i.id = n.issue_id JOIN projects p ON p.id = i.project_id
    LEFT JOIN users u ON u.id = n.actor_id
    WHERE ${where}${tab} ORDER BY n.created_at DESC, n.id DESC LIMIT 50`, req.user.id);
  const count = (extra: string) => get<{ c: number }>(`SELECT COUNT(*) c FROM notifications n JOIN issues i ON i.id = n.issue_id
    JOIN projects p ON p.id = i.project_id WHERE ${where} AND n.read_at IS NULL${extra}`, req.user.id)!.c;
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
