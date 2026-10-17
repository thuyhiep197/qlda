import { Router } from 'express';
import { all, get, run } from '../db.ts';
import { audit } from '../audit.ts';
import { badRequest, notFound, requireUserPerm } from '../permissions.ts';

/** Danh mục phòng ban (KD, AM, BA, DEV, HC, BGĐ…): phòng ban của tài khoản, tự hiện ở Phòng thực hiện / phối hợp của hành trình */
const r = Router();

function clean(b: any) {
  const code = String(b.code ?? '').replace(/\s+/g, '').toUpperCase().slice(0, 20);
  const name = String(b.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!code) throw badRequest('Mã phòng ban không được để trống');
  if (!name) throw badRequest('Tên phòng ban không được để trống');
  return { code, name };
}

// Mọi người đã đăng nhập đều xem được
r.get('/', (_req, res) => {
  res.json(all(`SELECT d.id, d.code, d.name, d.position, (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.is_active = 1) AS user_count
    FROM departments d ORDER BY d.position, d.code`));
});

r.post('/', (req, res) => {
  requireUserPerm(req.user, 'department.create');
  const v = clean(req.body || {});
  if (get('SELECT 1 FROM departments WHERE code = ?', v.code)) throw badRequest('Mã phòng ban đã tồn tại');
  const pos = (get<{ m: number | null }>('SELECT MAX(position) m FROM departments')?.m ?? -1) + 1;
  const { id } = run('INSERT INTO departments(code, name, position) VALUES (?,?,?)', v.code, v.name, pos);
  audit(req, 'department_created', { target: v.code });
  res.status(201).json({ id, ...v });
});

r.patch('/:id', (req, res) => {
  requireUserPerm(req.user, 'department.edit');
  const d = get('SELECT * FROM departments WHERE id = ?', Number(req.params.id));
  if (!d) throw notFound();
  const v = clean({ ...d, ...req.body });
  if (get('SELECT 1 FROM departments WHERE code = ? AND id <> ?', v.code, d.id)) throw badRequest('Mã phòng ban đã tồn tại');
  run('UPDATE departments SET code = ?, name = ? WHERE id = ?', v.code, v.name, d.id);
  res.json({ ok: true });
});

r.delete('/:id', (req, res) => {
  requireUserPerm(req.user, 'department.delete');
  const d = get('SELECT * FROM departments WHERE id = ?', Number(req.params.id));
  if (!d) throw notFound();
  if (get('SELECT 1 FROM users WHERE department_id = ? AND is_active = 1', d.id)) throw badRequest('Phòng ban đang có tài khoản, hãy chuyển các tài khoản sang phòng ban khác trước');
  run('DELETE FROM departments WHERE id = ?', d.id);
  audit(req, 'department_deleted', { target: d.code });
  res.json({ ok: true });
});

export default r;
