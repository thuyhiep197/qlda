import { Router } from 'express';
import { all, get, run } from '../db.ts';
import { audit } from '../audit.ts';
import { badRequest, notFound, requireUserPerm } from '../permissions.ts';

import { allowedPositions, POSITION_CODES, POSITIONS, type Position } from '../positions.ts';
import { departmentCodes } from './departments.ts';

/**
 * Nhân sự = tài khoản người dùng: xếp tài khoản vào phòng ban, chọn vị trí (BGĐ, KD, AM, BA/PM, Dev, Tester, HC), quản lý, ghi chú.
 * Họ tên lấy theo tài khoản (sửa ở Người dùng); tạo tài khoản ở Người dùng. id = id tài khoản.
 */
const r = Router();

/** Phòng ban + vị trí (+ quản lý, ghi chú) của tài khoản; requireDepartment = false: bỏ trống phòng ban là chưa xếp phòng */
export function cleanPlacement(b: any, requireDepartment = true) {
  const department_id = b.department_id ? Number(b.department_id) : null;
  if (!department_id && !requireDepartment) return { positions: '', note: String(b.note ?? '').trim().slice(0, 200) || null, department_id: null, manager_id: null };
  return clean(b);
}

function clean(b: any) {
  const list = (Array.isArray(b.positions) ? b.positions : String(b.positions ?? '').split(',')).map((x: unknown) => String(x).trim()).filter(Boolean);
  if (!list.length) throw badRequest('Chọn ít nhất một vị trí');
  if (list.some((p: string) => !(POSITIONS as readonly string[]).includes(p))) throw badRequest('Vị trí không hợp lệ');
  const positions = POSITIONS.filter((p) => list.includes(p)).join(',');
  const note = String(b.note ?? '').trim().slice(0, 200) || null;
  const department_id = b.department_id ? Number(b.department_id) : null;
  if (department_id && !get('SELECT 1 FROM departments WHERE id = ?', department_id)) throw badRequest('Phòng ban không hợp lệ');
  if (!department_id) throw badRequest('Chọn phòng ban');
  // Vị trí phải thuộc bộ vị trí của phòng (VD Phòng Kinh doanh: Sale, AM)
  const { allowed } = allowedPositions(departmentCodes(department_id));
  const wrong = positions.split(',').filter((p) => p && !(allowed as string[]).includes(p));
  if (wrong.length) throw badRequest(`Vị trí ${wrong.map((p) => POSITION_CODES[p as Position] ?? p).join(', ')} không thuộc phòng ban này`);
  const manager_id = b.manager_id ? Number(b.manager_id) : null;
  if (manager_id && !get('SELECT 1 FROM users WHERE id = ?', manager_id)) throw badRequest('Người quản lý không hợp lệ');
  return { positions, note, department_id, manager_id };
}

/** Người quản lý không được là chính mình hoặc người mình đang quản lý (trực tiếp hay gián tiếp) */
function checkManager(userId: number, managerId: number | null) {
  for (let m = managerId, guard = 0; m && guard < 50; guard++) {
    if (m === userId) throw badRequest('Người quản lý không được là chính người này hoặc người do người này quản lý');
    m = get<{ manager_id: number | null }>('SELECT manager_id FROM users WHERE id = ?', m)?.manager_id ?? null;
  }
}

// Mọi người đã đăng nhập đều xem được: tài khoản đã xếp phòng ban
r.get('/', (_req, res) => {
  res.json(all(`SELECT u.id, u.full_name, u.positions, u.staff_note AS note, u.id AS user_id, u.username, u.department_id, u.manager_id,
      (SELECT m.full_name FROM users m WHERE m.id = u.manager_id) AS manager_name, CASE WHEN pd.id IS NULL OR pd.parent_id IS NULL THEN d.name ELSE pd.name || ' › ' || d.name END AS department_name
    FROM users u JOIN departments d ON d.id = u.department_id LEFT JOIN departments pd ON pd.id = d.parent_id
    ORDER BY u.full_name`));
});

/** Xếp một tài khoản (chưa thuộc phòng ban nào) vào phòng ban */
r.post('/', (req, res) => {
  requireUserPerm(req.user, 'staff.create');
  const userId = Number(req.body?.user_id);
  const u = get<{ id: number; full_name: string; department_id: number | null }>('SELECT id, full_name, department_id FROM users WHERE id = ?', userId);
  if (!u) throw badRequest('Chọn tài khoản');
  if (u.department_id) throw badRequest('Tài khoản này đã thuộc một phòng ban — sửa ở dòng của người đó');
  const v = clean(req.body || {});
  checkManager(u.id, v.manager_id);
  run('UPDATE users SET positions = ?, staff_note = ?, department_id = ?, manager_id = ? WHERE id = ?', v.positions, v.note, v.department_id, v.manager_id, u.id);
  audit(req, 'staff_created', { target: u.full_name, detail: v.positions });
  res.status(201).json({ id: u.id });
});

r.patch('/:id', (req, res) => {
  requireUserPerm(req.user, 'staff.edit');
  const cur = get('SELECT id, full_name, positions, staff_note AS note, department_id, manager_id FROM users WHERE id = ?', Number(req.params.id));
  if (!cur) throw notFound();
  const v = clean({ ...cur, ...req.body });
  checkManager(cur.id, v.manager_id);
  run('UPDATE users SET positions = ?, staff_note = ?, department_id = ?, manager_id = ? WHERE id = ?', v.positions, v.note, v.department_id, v.manager_id, cur.id);
  audit(req, 'staff_updated', { target: cur.full_name, detail: v.positions });
  res.json({ ok: true });
});

/** Bỏ khỏi phòng ban (tài khoản vẫn còn; khách hàng, dự án đã chọn người này giữ nguyên) */
r.delete('/:id', (req, res) => {
  requireUserPerm(req.user, 'staff.delete');
  const cur = get<{ id: number; full_name: string }>('SELECT id, full_name FROM users WHERE id = ?', Number(req.params.id));
  if (!cur) throw notFound();
  run("UPDATE users SET department_id = NULL, positions = '', manager_id = NULL WHERE id = ?", cur.id);
  run('UPDATE users SET manager_id = NULL WHERE manager_id = ?', cur.id);
  audit(req, 'staff_deleted', { target: cur.full_name });
  res.json({ ok: true });
});

export default r;
