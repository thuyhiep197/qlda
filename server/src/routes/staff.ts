import { Router } from 'express';
import { all, get, run, tx } from '../db.ts';
import { audit } from '../audit.ts';
import { badRequest, notFound, requireUserPerm } from '../permissions.ts';

import { POSITIONS, type Position } from '../positions.ts';

/** Vị trí trong danh mục nhân sự ↔ trường nhân sự của dự án (KD, HC, BGĐ không có trường tương ứng) */
const PROJECT_FIELD: Partial<Record<Position, string>> = { ba_pm: 'ba', tester: 'tester', am: 'am', dev: 'dev' };

const r = Router();

function clean(b: any) {
  const full_name = String(b.full_name ?? '').replace(/\s+/g, ' ').trim();
  if (!full_name) throw badRequest('Họ tên không được để trống');
  if (full_name.length > 100) throw badRequest('Họ tên quá dài');
  if (full_name.includes(',')) throw badRequest('Họ tên không được chứa dấu phẩy');
  const list = (Array.isArray(b.positions) ? b.positions : String(b.positions ?? '').split(',')).map((x: unknown) => String(x).trim()).filter(Boolean);
  if (!list.length) throw badRequest('Chọn ít nhất một vị trí');
  if (list.some((p: string) => !(POSITIONS as readonly string[]).includes(p))) throw badRequest('Vị trí không hợp lệ');
  const positions = POSITIONS.filter((p) => list.includes(p)).join(',');
  const note = String(b.note ?? '').trim().slice(0, 200) || null;
  const user_id = b.user_id ? Number(b.user_id) : null;
  if (user_id && !get('SELECT 1 FROM users WHERE id = ?', user_id)) throw badRequest('Tài khoản đăng nhập không hợp lệ');
  const department_id = b.department_id ? Number(b.department_id) : null;
  if (department_id && !get('SELECT 1 FROM departments WHERE id = ?', department_id)) throw badRequest('Phòng ban không hợp lệ');
  return { full_name, positions, note, user_id, department_id };
}

// Mọi người đã đăng nhập đều xem được (để chọn nhân sự cho dự án)
r.get('/', (_req, res) => {
  res.json(all(`SELECT s.id, s.full_name, s.positions, s.note, s.user_id, u.username, s.department_id, d.name AS department_name
    FROM staff s LEFT JOIN users u ON u.id = s.user_id LEFT JOIN departments d ON d.id = s.department_id ORDER BY s.full_name`));
});

r.post('/', (req, res) => {
  requireUserPerm(req.user, 'staff.create');
  const v = clean(req.body || {});
  if (get('SELECT 1 FROM staff WHERE full_name = ?', v.full_name)) throw badRequest('Đã có người này trong danh mục');
  if (v.user_id && get('SELECT 1 FROM staff WHERE user_id = ?', v.user_id)) throw badRequest('Tài khoản này đã gắn với một nhân sự khác');
  const { id } = run('INSERT INTO staff(full_name, positions, note, user_id, department_id) VALUES (?,?,?,?,?)', v.full_name, v.positions, v.note, v.user_id, v.department_id);
  audit(req, 'staff_created', { target: v.full_name, detail: v.positions });
  res.status(201).json(get('SELECT id, full_name, positions, note, user_id, department_id FROM staff WHERE id = ?', id));
});

/** Đổi họ tên → cập nhật luôn tên đó trong các trường nhân sự của dự án (khách hàng gắn theo id nên tự đúng) */
r.patch('/:id', (req, res) => {
  requireUserPerm(req.user, 'staff.edit');
  const cur = get('SELECT * FROM staff WHERE id = ?', Number(req.params.id));
  if (!cur) throw notFound();
  const v = clean({ ...cur, ...req.body });
  if (v.full_name !== cur.full_name && get('SELECT 1 FROM staff WHERE full_name = ?', v.full_name)) throw badRequest('Đã có người này trong danh mục');
  if (v.user_id && get('SELECT 1 FROM staff WHERE user_id = ? AND id <> ?', v.user_id, cur.id)) throw badRequest('Tài khoản này đã gắn với một nhân sự khác');
  tx(() => {
    run('UPDATE staff SET full_name = ?, positions = ?, note = ?, user_id = ?, department_id = ? WHERE id = ?', v.full_name, v.positions, v.note, v.user_id, v.department_id, cur.id);
    if (v.full_name !== cur.full_name) {
      const targets = Object.values(PROJECT_FIELD).map((f) => ['projects', f]);
      for (const [table, f] of targets) {
        for (const p of all(`SELECT id, ${f} AS v FROM ${table} WHERE ${f} IS NOT NULL`)) {
          const names = String(p.v).split(',').map((x) => x.trim());
          if (names.includes(cur.full_name)) run(`UPDATE ${table} SET ${f} = ? WHERE id = ?`, names.map((x) => (x === cur.full_name ? v.full_name : x)).join(', '), p.id);
        }
      }
    }
  });
  audit(req, 'staff_updated', { target: cur.full_name, detail: v.full_name !== cur.full_name ? `→ ${v.full_name}` : v.positions });
  res.json({ ok: true });
});

/** Xóa khỏi danh mục: dự án đã ghi tên người này vẫn giữ nguyên tên */
r.delete('/:id', (req, res) => {
  requireUserPerm(req.user, 'staff.delete');
  const cur = get('SELECT * FROM staff WHERE id = ?', Number(req.params.id));
  if (!cur) throw notFound();
  run('DELETE FROM staff WHERE id = ?', cur.id);
  audit(req, 'staff_deleted', { target: cur.full_name });
  res.json({ ok: true });
});

export default r;
