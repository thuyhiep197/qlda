/** Bộ lọc tìm kiếm đã lưu (như "Saved filters" của Jira): của riêng mình hoặc chia sẻ cho thành viên dự án. */
import { Router } from 'express';
import { all, get, run } from '../db.ts';
import { accessibleProjectIds, badRequest, forbidden, notFound } from '../permissions.ts';

const r = Router();

r.get('/', (req, res) => {
  const ids = accessibleProjectIds(req.user);
  const scope = ids === 'all' ? '1=1' : ids.length ? `f.project_id IN (${ids.join(',')})` : '0=1';
  res.json(all(`
    SELECT f.*, u.full_name AS owner_name, p.key AS project_key, p.name AS project_name
    FROM saved_filters f JOIN users u ON u.id = f.user_id LEFT JOIN projects p ON p.id = f.project_id
    WHERE f.user_id = ? OR (f.shared = 1 AND (f.project_id IS NULL OR ${scope}))
    ORDER BY f.user_id <> ?, f.name`, req.user.id, req.user.id));
});

function checkBody(b: any) {
  const name = String(b?.name || '').trim();
  if (!name) throw badRequest('Tên bộ lọc không được để trống');
  if (name.length > 100) throw badRequest('Tên bộ lọc tối đa 100 ký tự');
  const query = String(b?.query ?? '').replace(/^\?/, '');
  if (query.length > 2000) throw badRequest('Bộ lọc quá dài');
  return { name, query };
}

r.post('/', (req, res) => {
  const { name, query } = checkBody(req.body);
  let projectId: number | null = null;
  if (req.body?.project_key) {
    const p = get<{ id: number }>('SELECT id FROM projects WHERE key = ?', String(req.body.project_key).toUpperCase());
    if (!p) throw badRequest('Dự án không hợp lệ');
    const ids = accessibleProjectIds(req.user);
    if (ids !== 'all' && !ids.includes(p.id)) throw forbidden();
    projectId = p.id;
  }
  const { id } = run('INSERT INTO saved_filters(user_id, project_id, name, query, shared) VALUES (?,?,?,?,?)',
    req.user.id, projectId, name, query, !!req.body?.shared);
  res.status(201).json(get('SELECT * FROM saved_filters WHERE id = ?', id));
});

function loadOwn(req: any) {
  const f = get('SELECT * FROM saved_filters WHERE id = ?', Number(req.params.id));
  if (!f) throw notFound();
  if (f.user_id !== req.user.id && !req.user.is_admin) throw forbidden('Chỉ người tạo được sửa/xóa bộ lọc');
  return f;
}

r.patch('/:id', (req, res) => {
  const f = loadOwn(req);
  const { name, query } = checkBody({ name: req.body?.name ?? f.name, query: req.body?.query ?? f.query });
  run('UPDATE saved_filters SET name = ?, query = ?, shared = ? WHERE id = ?', name, query,
    req.body?.shared !== undefined ? !!req.body.shared : f.shared, f.id);
  res.json({ ok: true });
});

r.delete('/:id', (req, res) => {
  const f = loadOwn(req);
  run('DELETE FROM saved_filters WHERE id = ?', f.id);
  res.json({ ok: true });
});

export default r;
