import { Router } from 'express';
import { all, get, run, tx } from '../db.ts';
import { audit } from '../audit.ts';
import { badRequest, notFound, requireUserPerm } from '../permissions.ts';

/** Vị trí trong danh mục nhân sự ↔ trường nhân sự của dự án */
export const POSITIONS = ['ba_pm', 'tester', 'am', 'dev'] as const;
const PROJECT_FIELD: Record<(typeof POSITIONS)[number], string> = { ba_pm: 'ba', tester: 'tester', am: 'am', dev: 'dev' };

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
  return { full_name, positions, note };
}

// Mọi người đã đăng nhập đều xem được (để chọn nhân sự cho dự án)
r.get('/', (_req, res) => {
  res.json(all('SELECT id, full_name, positions, note FROM staff ORDER BY full_name'));
});

r.post('/', (req, res) => {
  requireUserPerm(req.user, 'staff.create');
  const v = clean(req.body || {});
  if (get('SELECT 1 FROM staff WHERE full_name = ?', v.full_name)) throw badRequest('Đã có người này trong danh mục');
  const { id } = run('INSERT INTO staff(full_name, positions, note) VALUES (?,?,?)', v.full_name, v.positions, v.note);
  audit(req, 'staff_created', { target: v.full_name, detail: v.positions });
  res.status(201).json(get('SELECT id, full_name, positions, note FROM staff WHERE id = ?', id));
});

/** Đổi họ tên → cập nhật luôn tên đó trong các trường nhân sự của dự án */
r.patch('/:id', (req, res) => {
  requireUserPerm(req.user, 'staff.edit');
  const cur = get('SELECT * FROM staff WHERE id = ?', Number(req.params.id));
  if (!cur) throw notFound();
  const v = clean({ ...cur, ...req.body });
  if (v.full_name !== cur.full_name && get('SELECT 1 FROM staff WHERE full_name = ?', v.full_name)) throw badRequest('Đã có người này trong danh mục');
  tx(() => {
    run('UPDATE staff SET full_name = ?, positions = ?, note = ? WHERE id = ?', v.full_name, v.positions, v.note, cur.id);
    if (v.full_name !== cur.full_name) {
      for (const f of Object.values(PROJECT_FIELD)) {
        for (const p of all(`SELECT id, ${f} AS v FROM projects WHERE ${f} IS NOT NULL`)) {
          const names = String(p.v).split(',').map((x) => x.trim());
          if (names.includes(cur.full_name)) run(`UPDATE projects SET ${f} = ? WHERE id = ?`, names.map((x) => (x === cur.full_name ? v.full_name : x)).join(', '), p.id);
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
