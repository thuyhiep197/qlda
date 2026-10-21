import { Router } from 'express';
import { all, get, run, tx } from '../db.ts';
import { audit } from '../audit.ts';
import { badRequest, notFound, requireUserPerm } from '../permissions.ts';

/**
 * Danh mục Tình trạng khách hàng: thêm, sửa tên, ngừng / dùng lại, kéo thả sắp xếp thứ tự hiển thị.
 * Khách hàng lưu tên tình trạng — đổi tên thì cập nhật luôn các khách hàng đang ở tình trạng đó.
 */
const r = Router();

const clean = (v: unknown) => {
  const name = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!name) throw badRequest('Tên tình trạng không được để trống');
  return name;
};

// Mọi người đã đăng nhập đều xem được (để chọn tình trạng cho khách hàng)
r.get('/', (_req, res) => {
  res.json(all(`SELECT s.*, (SELECT COUNT(*) FROM customers c WHERE c.status = s.name) AS customer_count
    FROM customer_statuses s ORDER BY s.position, s.id`));
});

r.post('/', (req, res) => {
  requireUserPerm(req.user, 'cstatus.create');
  const name = clean(req.body?.name);
  if (get('SELECT 1 FROM customer_statuses WHERE name = ?', name)) throw badRequest('Đã có tình trạng này');
  const pos = (get<{ m: number | null }>('SELECT MAX(position) m FROM customer_statuses')?.m ?? 0) + 1;
  const { id } = run('INSERT INTO customer_statuses(name, position) VALUES (?, ?)', name, pos);
  audit(req, 'customer_status_created', { target: name });
  res.status(201).json({ id });
});

/** Sửa tên (cập nhật khách hàng đang ở tình trạng đó) hoặc ngừng / dùng lại (is_active) */
r.patch('/:id', (req, res) => {
  const s = get<{ id: number; name: string; is_active: number }>('SELECT * FROM customer_statuses WHERE id = ?', Number(req.params.id));
  if (!s) throw notFound();
  const b = req.body || {};
  if (b.name !== undefined) {
    requireUserPerm(req.user, 'cstatus.edit');
    const name = clean(b.name);
    if (get('SELECT 1 FROM customer_statuses WHERE name = ? AND id <> ?', name, s.id)) throw badRequest('Đã có tình trạng này');
    tx(() => {
      run('UPDATE customer_statuses SET name = ? WHERE id = ?', name, s.id);
      run('UPDATE customers SET status = ? WHERE status = ?', name, s.name);
    });
    audit(req, 'customer_status_updated', { target: s.name, detail: `→ ${name}` });
  }
  if (b.is_active !== undefined) {
    requireUserPerm(req.user, 'cstatus.delete');
    if (!b.is_active && !get('SELECT 1 FROM customer_statuses WHERE is_active = 1 AND id <> ?', s.id)) throw badRequest('Phải còn ít nhất một tình trạng đang sử dụng');
    run('UPDATE customer_statuses SET is_active = ? WHERE id = ?', b.is_active ? 1 : 0, s.id);
    audit(req, 'customer_status_updated', { target: s.name, detail: b.is_active ? 'Dùng lại' : 'Ngừng sử dụng' });
  }
  res.json({ ok: true });
});

/** Sắp xếp thứ tự hiển thị: { ids: [id theo thứ tự mới] } */
r.put('/order', (req, res) => {
  requireUserPerm(req.user, 'cstatus.edit');
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number);
  const all_ = all<{ id: number }>('SELECT id FROM customer_statuses').map((x) => x.id);
  if (ids.length !== all_.length || all_.some((id) => !ids.includes(id))) throw badRequest('Danh sách sắp xếp không hợp lệ');
  tx(() => ids.forEach((id: number, i: number) => run('UPDATE customer_statuses SET position = ? WHERE id = ?', i + 1, id)));
  res.json({ ok: true });
});

/** Tình trạng hợp lệ cho khách hàng: có trong danh mục và đang dùng (giữ nguyên tình trạng cũ dù đã ngừng); trống = tình trạng đầu tiên đang dùng */
export function checkCustomerStatus(status: string | null, current?: string | null) {
  if (!status) return get<{ name: string }>('SELECT name FROM customer_statuses WHERE is_active = 1 ORDER BY position, id LIMIT 1')?.name ?? 'Mới';
  const s = get<{ name: string; is_active: number }>('SELECT name, is_active FROM customer_statuses WHERE name = ?', status);
  if (!s) throw badRequest('Tình trạng không có trong danh mục Tình trạng khách hàng');
  if (!s.is_active && s.name !== current) throw badRequest(`Tình trạng "${s.name}" đã ngừng sử dụng`);
  return s.name;
}

export default r;
