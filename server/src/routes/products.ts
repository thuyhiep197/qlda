import { Router } from 'express';
import { all, get, run } from '../db.ts';
import { audit } from '../audit.ts';
import { badRequest, notFound, requireUserPerm } from '../permissions.ts';
import { cleanProduct, sameName } from '../customer.ts';

/** Danh mục Loại sản phẩm & Sản phẩm — chọn cho khách hàng; mô tả sản phẩm tự điền vào khách hàng */
const r = Router();

function check<T>(fn: () => T): T {
  try { return fn(); } catch (e) { throw badRequest(e instanceof Error ? e.message : String(e)); }
}

// Mọi người đã đăng nhập đều xem được (để chọn sản phẩm cho khách hàng)
r.get('/types', (_req, res) => {
  res.json(all(`SELECT t.id, t.name, t.position, (SELECT COUNT(*) FROM products p WHERE p.type_id = t.id) AS product_count
    FROM product_types t ORDER BY t.position, t.name`));
});

function typeName(v: unknown) {
  const name = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!name) throw badRequest('Tên loại sản phẩm không được để trống');
  return name;
}
const typeTaken = (name: string, exceptId?: number) =>
  all<{ id: number; name: string }>('SELECT id, name FROM product_types').some((t) => t.id !== exceptId && sameName(t.name, name));

r.post('/types', (req, res) => {
  requireUserPerm(req.user, 'product.create');
  const name = typeName(req.body?.name);
  if (typeTaken(name)) throw badRequest('Đã có loại sản phẩm này');
  const pos = (get<{ m: number | null }>('SELECT MAX(position) m FROM product_types')?.m ?? -1) + 1;
  const { id } = run('INSERT INTO product_types(name, position) VALUES (?, ?)', name, pos);
  audit(req, 'product_type_created', { target: name });
  res.status(201).json({ id, name });
});

r.patch('/types/:id', (req, res) => {
  requireUserPerm(req.user, 'product.edit');
  const t = get('SELECT * FROM product_types WHERE id = ?', Number(req.params.id));
  if (!t) throw notFound();
  const name = typeName(req.body?.name);
  if (typeTaken(name, t.id)) throw badRequest('Đã có loại sản phẩm này');
  run('UPDATE product_types SET name = ? WHERE id = ?', name, t.id);
  res.json({ ok: true });
});

r.delete('/types/:id', (req, res) => {
  requireUserPerm(req.user, 'product.delete');
  const t = get('SELECT * FROM product_types WHERE id = ?', Number(req.params.id));
  if (!t) throw notFound();
  if (get('SELECT 1 FROM products WHERE type_id = ?', t.id)) throw badRequest('Loại sản phẩm đang có sản phẩm, hãy xóa hoặc chuyển các sản phẩm đó trước');
  run('DELETE FROM product_types WHERE id = ?', t.id);
  audit(req, 'product_type_deleted', { target: t.name });
  res.json({ ok: true });
});

r.get('/', (_req, res) => {
  res.json(all(`SELECT p.id, p.type_id, p.name, p.description, t.name AS type_name,
      (SELECT COUNT(*) FROM customers c WHERE c.product_id = p.id) AS customer_count
    FROM products p JOIN product_types t ON t.id = p.type_id ORDER BY t.position, p.name`));
});

function validProduct(body: any, exceptId?: number) {
  const v = check(() => cleanProduct(body));
  if (!get('SELECT 1 FROM product_types WHERE id = ?', v.type_id)) throw badRequest('Loại sản phẩm không hợp lệ');
  if (all<{ id: number; name: string }>('SELECT id, name FROM products WHERE type_id = ?', v.type_id).some((p) => p.id !== exceptId && sameName(p.name, v.name))) {
    throw badRequest('Đã có sản phẩm này trong loại sản phẩm đã chọn');
  }
  return v;
}

r.post('/', (req, res) => {
  requireUserPerm(req.user, 'product.create');
  const v = validProduct(req.body || {});
  const { id } = run('INSERT INTO products(type_id, name, description) VALUES (?,?,?)', v.type_id, v.name, v.description);
  audit(req, 'product_created', { target: v.name });
  res.status(201).json({ id, ...v });
});

/** Sửa mô tả trong danh mục không đổi mô tả đã ghi ở khách hàng (mỗi khách hàng giữ mô tả riêng của mình) */
r.patch('/:id', (req, res) => {
  requireUserPerm(req.user, 'product.edit');
  const p = get('SELECT * FROM products WHERE id = ?', Number(req.params.id));
  if (!p) throw notFound();
  const v = validProduct({ ...p, ...req.body }, p.id);
  run('UPDATE products SET type_id = ?, name = ?, description = ? WHERE id = ?', v.type_id, v.name, v.description, p.id);
  if (v.type_id !== p.type_id) run('UPDATE customers SET product_type_id = ? WHERE product_id = ?', v.type_id, p.id);
  res.json({ ok: true });
});

/** Xóa sản phẩm: khách hàng đã chọn sản phẩm này được gỡ sản phẩm, vẫn giữ loại sản phẩm và mô tả đã ghi */
r.delete('/:id', (req, res) => {
  requireUserPerm(req.user, 'product.delete');
  const p = get('SELECT * FROM products WHERE id = ?', Number(req.params.id));
  if (!p) throw notFound();
  run('DELETE FROM products WHERE id = ?', p.id);
  audit(req, 'product_deleted', { target: p.name });
  res.json({ ok: true });
});

export default r;
