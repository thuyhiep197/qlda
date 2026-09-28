import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { all, get, now, run, tx, UPLOAD_DIR } from '../db.ts';
import {
  addHistory, createIssue, deleteIssue, fetchIssue, getIssueRow, listIssues, rankBetween, updateIssue,
  type IssueFilter,
} from '../issues.ts';
import { handleMentions, notify, unwatch, watch, watchers } from '../notify.ts';
import { badRequest, canEditIssue, forbidden, notFound, requirePerm, requireProjectAccess } from '../permissions.ts';

const r = Router();

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 25);
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, _file, cb) => cb(null, crypto.randomUUID()),
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 10 },
});

r.get('/', (req, res) => {
  res.json(listIssues(req.user, req.query as IssueFilter));
});

r.post('/', (req, res) => {
  const key = String(req.body?.project_key || '').toUpperCase();
  const project = get('SELECT * FROM projects WHERE key = ?', key);
  if (!project) throw badRequest('Dự án không hợp lệ');
  const perms = requireProjectAccess(req.user, project.id);
  res.status(201).json(createIssue(req.user, project.id, perms, req.body));
});

r.get('/:key', (req, res) => {
  const row = getIssueRow(req.params.key);
  const perms = requireProjectAccess(req.user, row.project_id);
  const issue = fetchIssue('id', row.id);
  const children = all(`SELECT i.id, i.key, i.type, i.summary, i.priority, i.story_points, i.assignee_id,
      u.full_name AS assignee_name, s.name AS status_name, s.category AS status_category
    FROM issues i JOIN statuses s ON s.id = i.status_id LEFT JOIN users u ON u.id = i.assignee_id
    WHERE i.parent_id = ? ORDER BY i.rank, i.id`, row.id);
  const comments = all(`SELECT c.*, u.full_name AS author_name FROM comments c JOIN users u ON u.id = c.author_id
    WHERE c.issue_id = ? ORDER BY c.created_at`, row.id);
  const attachments = all(`SELECT a.id, a.filename, a.mime, a.size, a.created_at, a.uploader_id, u.full_name AS uploader_name
    FROM attachments a JOIN users u ON u.id = a.uploader_id WHERE a.issue_id = ? ORDER BY a.created_at`, row.id);
  const links = all(`
    SELECT l.id, l.type, 'out' AS direction, i.key, i.summary, i.type AS issue_type, s.name AS status_name, s.category AS status_category
      FROM issue_links l JOIN issues i ON i.id = l.target_id JOIN statuses s ON s.id = i.status_id WHERE l.source_id = ?
    UNION ALL
    SELECT l.id, l.type, 'in' AS direction, i.key, i.summary, i.type AS issue_type, s.name AS status_name, s.category AS status_category
      FROM issue_links l JOIN issues i ON i.id = l.source_id JOIN statuses s ON s.id = i.status_id WHERE l.target_id = ?`, row.id, row.id);
  const history = all(`SELECT h.*, u.full_name AS user_name FROM issue_history h LEFT JOIN users u ON u.id = h.user_id
    WHERE h.issue_id = ? ORDER BY h.created_at DESC, h.id DESC LIMIT 200`, row.id);
  const transitions = all('SELECT from_status_id, to_status_id FROM transitions WHERE project_id = ?', row.project_id);
  const watcherList = all(`SELECT u.id, u.username, u.full_name FROM issue_watchers w JOIN users u ON u.id = w.user_id
    WHERE w.issue_id = ? AND u.is_active = 1 ORDER BY u.full_name`, row.id);
  res.json({
    ...issue, children, comments, attachments, links, history,
    watchers: watcherList, watching: watcherList.some((w) => w.id === req.user.id),
    can_edit: canEditIssue(req.user, perms, row),
    permissions: [...perms],
    workflow_strict: !!get('SELECT workflow_strict FROM projects WHERE id = ?', row.project_id)?.workflow_strict,
    transitions,
  });
});

r.patch('/:key', (req, res) => {
  const row = getIssueRow(req.params.key);
  const perms = requireProjectAccess(req.user, row.project_id);
  res.json(updateIssue(req.user, row, perms, req.body || {}));
});

/** Kéo thả: đổi sprint/trạng thái và vị trí trong một thao tác. */
r.post('/:key/move', (req, res) => {
  const row = getIssueRow(req.params.key);
  const perms = requireProjectAccess(req.user, row.project_id);
  const b = req.body || {};
  const data: Record<string, unknown> = {};
  if (b.sprint_id !== undefined) data.sprint_id = b.sprint_id;
  if (b.status_id !== undefined) data.status_id = b.status_id;
  const rank = rankBetween(b.after_id, b.before_id);
  if (rank !== undefined) data.rank = rank;
  res.json(updateIssue(req.user, row, perms, data));
});

r.delete('/:key', (req, res) => {
  const row = getIssueRow(req.params.key);
  requirePerm(req.user, row.project_id, 'issue.delete');
  deleteIssue(row);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Bình luận
// ---------------------------------------------------------------------------
r.post('/:key/comments', (req, res) => {
  const row = getIssueRow(req.params.key);
  requirePerm(req.user, row.project_id, 'comment.create');
  const body = String(req.body?.body || '').trim();
  if (!body) throw badRequest('Nội dung bình luận không được để trống');
  const id = tx(() => {
    const { id } = run('INSERT INTO comments(issue_id, author_id, body, created_at) VALUES (?,?,?,?)', row.id, req.user.id, body, now());
    run('UPDATE issues SET updated_at = ? WHERE id = ?', now(), row.id);
    // Người bình luận tự theo dõi; người được @nhắc nhận thông báo "nhắc đến", những người theo dõi khác nhận "bình luận"
    watch(row.id, [req.user.id]);
    const mentioned = new Set(handleMentions(row.id, row.project_id, req.user.id, body));
    notify(watchers(row.id).filter((u) => !mentioned.has(u)), req.user.id, row.id, 'comment', body);
    return id;
  });
  res.status(201).json({ id });
});

function loadComment(user: Express.Request['user'], id: number) {
  const c = get('SELECT c.*, i.project_id FROM comments c JOIN issues i ON i.id = c.issue_id WHERE c.id = ?', id);
  if (!c) throw notFound();
  const perms = requireProjectAccess(user, c.project_id);
  if (c.author_id !== user.id && !perms.has('comment.delete_any')) throw forbidden();
  return c;
}

r.patch('/comments/:id', (req, res) => {
  const c = loadComment(req.user, Number(req.params.id));
  const body = String(req.body?.body || '').trim();
  if (!body) throw badRequest('Nội dung bình luận không được để trống');
  tx(() => {
    run('UPDATE comments SET body = ?, updated_at = ? WHERE id = ?', body, now(), c.id);
    handleMentions(c.issue_id, c.project_id, req.user.id, body, c.body);
  });
  res.json({ ok: true });
});

r.delete('/comments/:id', (req, res) => {
  const c = loadComment(req.user, Number(req.params.id));
  run('DELETE FROM comments WHERE id = ?', c.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Tệp đính kèm
// ---------------------------------------------------------------------------
r.post('/:key/attachments', upload.array('files'), (req, res) => {
  const files = (req.files as Express.Multer.File[]) || [];
  const cleanup = () => files.forEach((f) => fs.rm(f.path, { force: true }, () => {}));
  try {
    const row = getIssueRow(String(req.params.key));
    requirePerm(req.user, row.project_id, 'attachment.create');
    const created: { id: number; filename: string; mime: string }[] = [];
    for (const f of files) {
      // multer đọc tên tệp theo latin1, chuyển về UTF-8 để giữ tiếng Việt
      const filename = Buffer.from(f.originalname, 'latin1').toString('utf8');
      const { id } = run('INSERT INTO attachments(issue_id, uploader_id, filename, stored_name, mime, size, created_at) VALUES (?,?,?,?,?,?,?)',
        row.id, req.user.id, filename, f.filename, f.mimetype, f.size, now());
      created.push({ id, filename, mime: f.mimetype });
      addHistory(row.id, req.user.id, 'attachment', null, filename);
    }
    res.status(201).json({ ok: true, attachments: created });
  } catch (e) {
    cleanup();
    throw e;
  }
});

function loadAttachment(user: Express.Request['user'], id: number) {
  const a = get('SELECT a.*, i.project_id FROM attachments a JOIN issues i ON i.id = a.issue_id WHERE a.id = ?', id);
  if (!a) throw notFound();
  return { a, perms: requireProjectAccess(user, a.project_id) };
}

r.get('/attachments/:id', (req, res) => {
  const { a } = loadAttachment(req.user, Number(req.params.id));
  const file = path.join(UPLOAD_DIR, a.stored_name);
  if (!fs.existsSync(file)) throw notFound('Tệp không còn tồn tại trên máy chủ');
  // Chỉ hiển thị trực tiếp ảnh raster; SVG/HTML luôn tải về để tránh chạy mã độc
  const inline = req.query.inline === '1' && /^image\/(png|jpe?g|gif|webp|bmp)$/.test(a.mime || '');
  res.setHeader('Content-Type', a.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  fs.createReadStream(file).pipe(res);
});

r.delete('/attachments/:id', (req, res) => {
  const { a, perms } = loadAttachment(req.user, Number(req.params.id));
  if (a.uploader_id !== req.user.id && !perms.has('attachment.delete_any')) throw forbidden();
  run('DELETE FROM attachments WHERE id = ?', a.id);
  addHistory(a.issue_id, req.user.id, 'attachment', a.filename, null);
  fs.rm(path.join(UPLOAD_DIR, a.stored_name), { force: true }, () => {});
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Liên kết issue
// ---------------------------------------------------------------------------
r.post('/:key/links', (req, res) => {
  const row = getIssueRow(req.params.key);
  const perms = requireProjectAccess(req.user, row.project_id);
  if (!canEditIssue(req.user, perms, row)) throw forbidden();
  const target = getIssueRow(String(req.body?.target_key || ''));
  requireProjectAccess(req.user, target.project_id);
  if (target.id === row.id) throw badRequest('Không thể liên kết issue với chính nó');
  const type = String(req.body?.type || 'relates');
  if (!['blocks', 'relates', 'duplicates'].includes(type)) throw badRequest('Loại liên kết không hợp lệ');
  run('INSERT OR IGNORE INTO issue_links(source_id, target_id, type, created_by) VALUES (?,?,?,?)', row.id, target.id, type, req.user.id);
  addHistory(row.id, req.user.id, 'link', null, target.key);
  res.status(201).json({ ok: true });
});

r.delete('/links/:id', (req, res) => {
  const l = get('SELECT l.*, i.project_id, i.reporter_id, i.assignee_id FROM issue_links l JOIN issues i ON i.id = l.source_id WHERE l.id = ?', Number(req.params.id));
  if (!l) throw notFound();
  const perms = requireProjectAccess(req.user, l.project_id);
  if (!canEditIssue(req.user, perms, l)) throw forbidden();
  run('DELETE FROM issue_links WHERE id = ?', l.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Người theo dõi: ai cũng tự theo dõi/bỏ theo dõi được; thêm/bớt người khác cần quyền sửa issue
// ---------------------------------------------------------------------------
r.post('/:key/watchers', (req, res) => {
  const row = getIssueRow(String(req.params.key));
  const perms = requireProjectAccess(req.user, row.project_id);
  const userId = req.body?.user_id ? Number(req.body.user_id) : req.user.id;
  if (userId !== req.user.id) {
    if (!canEditIssue(req.user, perms, row)) throw forbidden('Bạn không có quyền thêm người theo dõi');
    const ok = get(`SELECT 1 FROM users u WHERE u.id = ? AND u.is_active = 1 AND (u.is_admin = 1 OR EXISTS
      (SELECT 1 FROM project_members pm WHERE pm.project_id = ? AND pm.user_id = u.id))`, userId, row.project_id);
    if (!ok) throw badRequest('Người dùng không thuộc dự án');
  }
  watch(row.id, [userId]);
  res.json({ ok: true });
});

r.delete('/:key/watchers/:userId', (req, res) => {
  const row = getIssueRow(String(req.params.key));
  const perms = requireProjectAccess(req.user, row.project_id);
  const userId = Number(req.params.userId);
  if (userId !== req.user.id && !canEditIssue(req.user, perms, row)) throw forbidden('Bạn không có quyền bỏ người theo dõi');
  unwatch(row.id, userId);
  res.json({ ok: true });
});

export default r;
