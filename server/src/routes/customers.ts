import { Router, type Request } from 'express';
import { all, get, localDate, now, run, tx } from '../db.ts';
import { audit } from '../audit.ts';
import { badRequest, forbidden, notFound, requireUserPerm, userPermissions } from '../permissions.ts';
import { cleanActivity, cleanContact, cleanCustomer, sameName } from '../customer.ts';

const r = Router();

/** Lỗi kiểm tra dữ liệu nhập → HTTP 400 */
function check<T>(fn: () => T): T {
  try { return fn(); } catch (e) { throw badRequest(e instanceof Error ? e.message : String(e)); }
}

function loadCustomer(req: Request) {
  const c = get('SELECT * FROM customers WHERE id = ?', Number(req.params.id));
  if (!c) throw notFound('Không tìm thấy khách hàng');
  return c;
}

const nameTaken = (name: string, exceptId?: number) =>
  all<{ id: number; name: string }>('SELECT id, name FROM customers').some((c) => c.id !== exceptId && sameName(c.name, name));

const FIELDS = ['name', 'kind', 'status', 'tax_code', 'province', 'address', 'phone', 'email', 'website', 'am', 'note'] as const;

// Tên khách hàng để gợi ý ở ô "Tên khách hàng" của dự án — mọi người đã đăng nhập đều xem được
r.get('/names', (_req, res) => {
  res.json(all('SELECT id, name FROM customers ORDER BY name'));
});

r.get('/', (req, res) => {
  requireUserPerm(req.user, 'customer.view');
  res.json(all(`
    SELECT c.*,
      (SELECT COUNT(*) FROM projects p WHERE p.customer = c.name COLLATE NOCASE AND p.is_archived = 0) AS project_count,
      (SELECT COUNT(*) FROM customer_contacts cc WHERE cc.customer_id = c.id) AS contact_count,
      (SELECT MAX(activity_date) FROM customer_activities a WHERE a.customer_id = c.id) AS last_activity_date,
      (SELECT cc.full_name FROM customer_contacts cc WHERE cc.customer_id = c.id ORDER BY cc.is_primary DESC, cc.id LIMIT 1) AS contact_name,
      (SELECT cc.phone FROM customer_contacts cc WHERE cc.customer_id = c.id ORDER BY cc.is_primary DESC, cc.id LIMIT 1) AS contact_phone
    FROM customers c ORDER BY c.name`));
});

r.post('/', (req, res) => {
  requireUserPerm(req.user, 'customer.create');
  const v = check(() => cleanCustomer(req.body || {}));
  if (nameTaken(v.name)) throw badRequest('Đã có khách hàng này');
  const { id } = run(`INSERT INTO customers(${FIELDS.join(', ')}, created_by) VALUES (${FIELDS.map(() => '?').join(',')}, ?)`,
    ...FIELDS.map((f) => v[f]), req.user.id);
  audit(req, 'customer_created', { target: v.name });
  res.status(201).json(get('SELECT * FROM customers WHERE id = ?', id));
});

r.get('/:id', (req, res) => {
  requireUserPerm(req.user, 'customer.view');
  const c = loadCustomer(req);
  c.contacts = all('SELECT * FROM customer_contacts WHERE customer_id = ? ORDER BY is_primary DESC, full_name', c.id);
  c.activities = all(`SELECT a.*, u.full_name AS user_name FROM customer_activities a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.customer_id = ? ORDER BY a.activity_date DESC, a.id DESC`, c.id);
  c.projects = all(`SELECT id, key, name, priority, project_status, is_archived, ba, am FROM projects
    WHERE customer = ? COLLATE NOCASE ORDER BY is_archived, name`, c.name);
  res.json(c);
});

/** Đổi tên khách hàng → cập nhật luôn tên đó ở các dự án của khách hàng */
r.patch('/:id', (req, res) => {
  requireUserPerm(req.user, 'customer.edit');
  const cur = loadCustomer(req);
  const v = check(() => cleanCustomer({ ...cur, ...req.body }));
  if (nameTaken(v.name, cur.id)) throw badRequest('Đã có khách hàng này');
  tx(() => {
    run(`UPDATE customers SET ${FIELDS.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...FIELDS.map((f) => v[f]), now(), cur.id);
    if (v.name !== cur.name) run('UPDATE projects SET customer = ? WHERE customer = ? COLLATE NOCASE', v.name, cur.name);
  });
  audit(req, 'customer_updated', { target: cur.name, detail: v.name !== cur.name ? `→ ${v.name}` : undefined });
  res.json({ ok: true });
});

/** Xóa khách hàng (kèm người liên hệ, lịch sử chăm sóc); dự án đã ghi tên khách hàng vẫn giữ nguyên tên */
r.delete('/:id', (req, res) => {
  requireUserPerm(req.user, 'customer.delete');
  const cur = loadCustomer(req);
  run('DELETE FROM customers WHERE id = ?', cur.id);
  audit(req, 'customer_deleted', { target: cur.name });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Người liên hệ — mỗi khách hàng có tối đa một đầu mối chính
// ---------------------------------------------------------------------------
function saveContact(customerId: number, v: ReturnType<typeof cleanContact>, contactId?: number) {
  return tx(() => {
    if (v.is_primary) run('UPDATE customer_contacts SET is_primary = 0 WHERE customer_id = ?', customerId);
    if (contactId) {
      run('UPDATE customer_contacts SET full_name = ?, position = ?, phone = ?, email = ?, is_primary = ?, note = ? WHERE id = ?',
        v.full_name, v.position, v.phone, v.email, v.is_primary, v.note, contactId);
      return contactId;
    }
    return run('INSERT INTO customer_contacts(customer_id, full_name, position, phone, email, is_primary, note) VALUES (?,?,?,?,?,?,?)',
      customerId, v.full_name, v.position, v.phone, v.email, v.is_primary, v.note).id;
  });
}

function loadContact(req: Request, customerId: number) {
  const ct = get('SELECT * FROM customer_contacts WHERE id = ? AND customer_id = ?', Number(req.params.cid), customerId);
  if (!ct) throw notFound('Không tìm thấy người liên hệ');
  return ct;
}

r.post('/:id/contacts', (req, res) => {
  requireUserPerm(req.user, 'customer.edit');
  const c = loadCustomer(req);
  const id = saveContact(c.id, check(() => cleanContact(req.body || {})));
  res.status(201).json(get('SELECT * FROM customer_contacts WHERE id = ?', id));
});

r.patch('/:id/contacts/:cid', (req, res) => {
  requireUserPerm(req.user, 'customer.edit');
  const c = loadCustomer(req);
  const ct = loadContact(req, c.id);
  saveContact(c.id, check(() => cleanContact({ ...ct, ...req.body })), ct.id);
  res.json({ ok: true });
});

r.delete('/:id/contacts/:cid', (req, res) => {
  requireUserPerm(req.user, 'customer.edit');
  const c = loadCustomer(req);
  run('DELETE FROM customer_contacts WHERE id = ?', loadContact(req, c.id).id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Lịch sử chăm sóc: gọi điện, gặp mặt, email, ghi chú
// ---------------------------------------------------------------------------
r.post('/:id/activities', (req, res) => {
  requireUserPerm(req.user, 'customer.edit');
  const c = loadCustomer(req);
  const v = check(() => cleanActivity(req.body || {}, localDate()));
  const { id } = run('INSERT INTO customer_activities(customer_id, user_id, kind, activity_date, content) VALUES (?,?,?,?,?)',
    c.id, req.user.id, v.kind, v.activity_date, v.content);
  res.status(201).json(get('SELECT a.*, u.full_name AS user_name FROM customer_activities a LEFT JOIN users u ON u.id = a.user_id WHERE a.id = ?', id));
});

/** Xóa hoạt động: người ghi tự xóa được; hoạt động của người khác cần quyền xóa khách hàng */
r.delete('/:id/activities/:aid', (req, res) => {
  const c = loadCustomer(req);
  const a = get('SELECT * FROM customer_activities WHERE id = ? AND customer_id = ?', Number(req.params.aid), c.id);
  if (!a) throw notFound('Không tìm thấy hoạt động');
  const perms = userPermissions(req.user);
  if (!(perms.has('customer.edit') && a.user_id === req.user.id) && !perms.has('customer.delete')) throw forbidden('Bạn chỉ xóa được hoạt động do mình ghi');
  run('DELETE FROM customer_activities WHERE id = ?', a.id);
  res.json({ ok: true });
});

export default r;
