import { Router } from 'express';
import { all, get, run } from '../db.ts';
import { audit } from '../audit.ts';
import { badRequest, notFound, requireUserPerm } from '../permissions.ts';
import { sameName } from '../customer.ts';
import { shortName } from '../geo.ts';

/** Danh mục địa chính (module Danh mục dùng chung): tỉnh/thành phố và phường/xã */
const r = Router();

const byName = <T extends { name: string }>(list: T[]) => list.sort((a, b) => shortName(a.name).localeCompare(shortName(b.name), 'vi'));

function clean(b: any, label: string) {
  const code = String(b.code ?? '').trim();
  const name = String(b.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 150);
  if (!/^\d{2,5}$/.test(code)) throw badRequest(`Mã ${label} gồm 2–5 chữ số`);
  if (!name) throw badRequest(`Tên ${label} không được để trống`);
  return { code, name };
}

// Mọi người đã đăng nhập đều xem được (để chọn địa chỉ cho khách hàng)
r.get('/provinces', (_req, res) => {
  res.json(byName(all(`SELECT p.code, p.name, (SELECT COUNT(*) FROM geo_wards w WHERE w.province_code = p.code) AS ward_count,
      (SELECT COUNT(*) FROM customers c WHERE c.province_code = p.code) AS customer_count FROM geo_provinces p`)));
});

r.get('/wards', (req, res) => {
  const province = String(req.query.province || '');
  if (!province) throw badRequest('Chọn tỉnh/thành phố');
  res.json(byName(all(`SELECT w.code, w.province_code, w.name, (SELECT COUNT(*) FROM customers c WHERE c.ward_code = w.code) AS customer_count
    FROM geo_wards w WHERE w.province_code = ?`, province)));
});

r.post('/provinces', (req, res) => {
  requireUserPerm(req.user, 'geo.create');
  const v = clean(req.body || {}, 'tỉnh/thành phố');
  if (get('SELECT 1 FROM geo_provinces WHERE code = ?', v.code)) throw badRequest('Mã tỉnh/thành phố đã tồn tại');
  if (all<{ name: string }>('SELECT name FROM geo_provinces').some((p) => sameName(p.name, v.name))) throw badRequest('Đã có tỉnh/thành phố này');
  run('INSERT INTO geo_provinces(code, name) VALUES (?, ?)', v.code, v.name);
  audit(req, 'geo_created', { target: v.name });
  res.status(201).json(v);
});

r.patch('/provinces/:code', (req, res) => {
  requireUserPerm(req.user, 'geo.edit');
  const p = get('SELECT * FROM geo_provinces WHERE code = ?', req.params.code);
  if (!p) throw notFound();
  const v = clean({ code: p.code, name: req.body?.name }, 'tỉnh/thành phố');
  if (all<{ code: string; name: string }>('SELECT code, name FROM geo_provinces').some((x) => x.code !== p.code && sameName(x.name, v.name))) throw badRequest('Đã có tỉnh/thành phố này');
  run('UPDATE geo_provinces SET name = ? WHERE code = ?', v.name, p.code);
  audit(req, 'geo_updated', { target: p.name, detail: `→ ${v.name}` });
  res.json({ ok: true });
});

r.delete('/provinces/:code', (req, res) => {
  requireUserPerm(req.user, 'geo.delete');
  const p = get('SELECT * FROM geo_provinces WHERE code = ?', req.params.code);
  if (!p) throw notFound();
  if (get('SELECT 1 FROM geo_wards WHERE province_code = ?', p.code)) throw badRequest('Tỉnh/thành phố đang có phường/xã, hãy xóa các phường/xã trước');
  if (get('SELECT 1 FROM customers WHERE province_code = ?', p.code)) throw badRequest('Đang có khách hàng thuộc tỉnh/thành phố này');
  run('DELETE FROM geo_provinces WHERE code = ?', p.code);
  audit(req, 'geo_deleted', { target: p.name });
  res.json({ ok: true });
});

r.post('/wards', (req, res) => {
  requireUserPerm(req.user, 'geo.create');
  const v = clean(req.body || {}, 'phường/xã');
  const province = String(req.body?.province_code || '');
  if (!get('SELECT 1 FROM geo_provinces WHERE code = ?', province)) throw badRequest('Tỉnh/thành phố không hợp lệ');
  if (get('SELECT 1 FROM geo_wards WHERE code = ?', v.code)) throw badRequest('Mã phường/xã đã tồn tại');
  if (all<{ name: string }>('SELECT name FROM geo_wards WHERE province_code = ?', province).some((w) => sameName(w.name, v.name))) throw badRequest('Tỉnh/thành phố đã có phường/xã này');
  run('INSERT INTO geo_wards(code, province_code, name) VALUES (?, ?, ?)', v.code, province, v.name);
  audit(req, 'geo_created', { target: v.name });
  res.status(201).json({ ...v, province_code: province });
});

r.patch('/wards/:code', (req, res) => {
  requireUserPerm(req.user, 'geo.edit');
  const w = get('SELECT * FROM geo_wards WHERE code = ?', req.params.code);
  if (!w) throw notFound();
  const v = clean({ code: w.code, name: req.body?.name }, 'phường/xã');
  if (all<{ code: string; name: string }>('SELECT code, name FROM geo_wards WHERE province_code = ?', w.province_code).some((x) => x.code !== w.code && sameName(x.name, v.name))) {
    throw badRequest('Tỉnh/thành phố đã có phường/xã này');
  }
  run('UPDATE geo_wards SET name = ? WHERE code = ?', v.name, w.code);
  audit(req, 'geo_updated', { target: w.name, detail: `→ ${v.name}` });
  res.json({ ok: true });
});

r.delete('/wards/:code', (req, res) => {
  requireUserPerm(req.user, 'geo.delete');
  const w = get('SELECT * FROM geo_wards WHERE code = ?', req.params.code);
  if (!w) throw notFound();
  if (get('SELECT 1 FROM customers WHERE ward_code = ?', w.code)) throw badRequest('Đang có khách hàng thuộc phường/xã này');
  run('DELETE FROM geo_wards WHERE code = ?', w.code);
  audit(req, 'geo_deleted', { target: w.name });
  res.json({ ok: true });
});

export default r;
