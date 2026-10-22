import { Router } from 'express';
import { all, get, run } from '../db.ts';
import { audit } from '../audit.ts';
import { badRequest, notFound, requireUserPerm, userPermissions } from '../permissions.ts';
import { allowedPositions } from '../positions.ts';

/** Mã phòng ban từ chính nó lên các cấp trên */
export function departmentCodes(id: number): string[] {
  const out: string[] = [];
  for (let cur: number | null = id, guard = 0; cur && guard < 20; guard++) {
    const d: { code: string; parent_id: number | null } | undefined = get<{ code: string; parent_id: number | null }>('SELECT code, parent_id FROM departments WHERE id = ?', cur);
    if (!d) break;
    out.push(d.code);
    cur = d.parent_id;
  }
  return out;
}

/**
 * Phòng ban & Nhân sự (sơ đồ tổ chức): Ban Giám đốc đứng đầu, dưới là các phòng (parent_id);
 * nhân sự = tài khoản người dùng thuộc một phòng ban (phòng ban, vị trí, quản lý lưu ở tài khoản).
 */
const r = Router();

function clean(b: any) {
  const code = String(b.code ?? '').replace(/\s+/g, '').toUpperCase().slice(0, 20);
  const name = String(b.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!code) throw badRequest('Mã phòng ban không được để trống');
  if (!name) throw badRequest('Tên phòng ban không được để trống');
  const parent_id = b.parent_id ? Number(b.parent_id) : null;
  if (parent_id && !get('SELECT 1 FROM departments WHERE id = ?', parent_id)) throw badRequest('Phòng ban cấp trên không hợp lệ');
  return { code, name, parent_id };
}

/** Phòng ban cấp trên không được là chính nó hoặc phòng ban cấp dưới của nó */
function checkNoCycle(id: number, parentId: number | null) {
  for (let p = parentId, guard = 0; p && guard < 50; guard++) {
    if (p === id) throw badRequest('Phòng ban cấp trên không được là chính nó hoặc phòng ban cấp dưới');
    p = get<{ parent_id: number | null }>('SELECT parent_id FROM departments WHERE id = ?', p)?.parent_id ?? null;
  }
}

// Mọi người đã đăng nhập đều xem được danh sách phòng ban (dùng để chọn); danh sách nhân sự của phòng chỉ khi có quyền Nhân sự – Xem
r.get('/', (req, res) => {
  const deps = all(`SELECT d.id, d.code, d.name, d.parent_id, d.position FROM departments d ORDER BY d.position, d.name`);
  const staff = !userPermissions(req.user).has('staff.view') ? [] : all(`SELECT u.id, u.full_name, u.positions, u.staff_note AS note, u.id AS user_id, u.department_id, u.username, u.is_active,
      u.manager_id, (SELECT m.full_name FROM users m WHERE m.id = u.manager_id) AS manager_name
    FROM users u WHERE u.department_id IS NOT NULL ORDER BY u.full_name`);
  // allowed_positions: vị trí được chọn khi thêm nhân sự vào phòng ban; preset: vị trí tích sẵn của nhóm
  res.json(deps.map((d: any) => { const a = allowedPositions(departmentCodes(d.id)); return { ...d, allowed_positions: a.allowed, preset_position: a.preset, staff: staff.filter((x: any) => x.department_id === d.id) }; }));
});

r.post('/', (req, res) => {
  requireUserPerm(req.user, 'department.create');
  const v = clean(req.body || {});
  if (get('SELECT 1 FROM departments WHERE code = ?', v.code)) throw badRequest('Mã phòng ban đã tồn tại');
  const pos = (get<{ m: number | null }>('SELECT MAX(position) m FROM departments')?.m ?? -1) + 1;
  const { id } = run('INSERT INTO departments(code, name, parent_id, position) VALUES (?,?,?,?)', v.code, v.name, v.parent_id, pos);
  audit(req, 'department_created', { target: v.name });
  res.status(201).json({ id, ...v });
});

r.patch('/:id', (req, res) => {
  requireUserPerm(req.user, 'department.edit');
  const d = get('SELECT * FROM departments WHERE id = ?', Number(req.params.id));
  if (!d) throw notFound();
  const v = clean({ ...d, ...req.body });
  if (get('SELECT 1 FROM departments WHERE code = ? AND id <> ?', v.code, d.id)) throw badRequest('Mã phòng ban đã tồn tại');
  checkNoCycle(d.id, v.parent_id);
  run('UPDATE departments SET code = ?, name = ?, parent_id = ? WHERE id = ?', v.code, v.name, v.parent_id, d.id);
  res.json({ ok: true });
});

r.delete('/:id', (req, res) => {
  requireUserPerm(req.user, 'department.delete');
  const d = get('SELECT * FROM departments WHERE id = ?', Number(req.params.id));
  if (!d) throw notFound();
  if (get('SELECT 1 FROM departments WHERE parent_id = ?', d.id)) throw badRequest('Phòng ban đang có phòng ban cấp dưới');
  if (get('SELECT 1 FROM users WHERE department_id = ?', d.id)) throw badRequest('Phòng ban đang có nhân sự, hãy chuyển nhân sự sang phòng ban khác trước');
  run('DELETE FROM departments WHERE id = ?', d.id);
  audit(req, 'department_deleted', { target: d.name });
  res.json({ ok: true });
});

export default r;
