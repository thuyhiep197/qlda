import { Router, type Request } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { all, get, localDate, now, run, tx, UPLOAD_DIR } from '../db.ts';
import { audit } from '../audit.ts';
import { accessibleProjectIds, badRequest, forbidden, notFound, requireUserPerm, userPermissions } from '../permissions.ts';
import { listIssues } from '../issues.ts';
import { autoProjectStatuses } from '../phases.ts';
import { avatarUrl } from '../avatar.ts';
import { upload, utf8Name } from '../upload.ts';
import { cleanActivity, cleanContacts, cleanCustomer, sameName } from '../customer.ts';

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

const FIELDS = ['name', 'province', 'ward', 'product_type_id', 'product_id', 'product_description', 'source', 'status', 'am'] as const;

/** Kiểm tra thông tin khách hàng với danh mục: sản phẩm phải có thật và thuộc loại sản phẩm đã chọn (chưa chọn loại thì lấy loại của sản phẩm) */
function validate(body: any) {
  const v = check(() => cleanCustomer(body));
  if (v.product_type_id && !get('SELECT 1 FROM product_types WHERE id = ?', v.product_type_id)) throw badRequest('Loại sản phẩm không hợp lệ');
  if (v.product_id) {
    const p = get<{ type_id: number }>('SELECT type_id FROM products WHERE id = ?', v.product_id);
    if (!p) throw badRequest('Sản phẩm không hợp lệ');
    if (v.product_type_id && p.type_id !== v.product_type_id) throw badRequest('Sản phẩm không thuộc loại sản phẩm đã chọn');
    v.product_type_id = p.type_id;
  }
  return v;
}

/** Ghi lại danh sách đầu mối theo thứ tự trên form: sửa dòng có sẵn, thêm dòng mới, xóa dòng bị bỏ */
function saveContacts(customerId: number, list: ReturnType<typeof cleanContacts>) {
  const keep = new Set<number>();
  list.forEach((c, i) => {
    const existing = c.id && get('SELECT 1 FROM customer_contacts WHERE id = ? AND customer_id = ?', c.id, customerId);
    if (existing) {
      run('UPDATE customer_contacts SET full_name = ?, phone = ?, email = ?, position = ? WHERE id = ?', c.full_name, c.phone, c.email, i, c.id);
      keep.add(c.id!);
    } else {
      keep.add(run('INSERT INTO customer_contacts(customer_id, full_name, phone, email, position) VALUES (?,?,?,?,?)', customerId, c.full_name, c.phone, c.email, i).id);
    }
  });
  for (const c of all<{ id: number }>('SELECT id FROM customer_contacts WHERE customer_id = ?', customerId)) {
    if (!keep.has(c.id)) run('DELETE FROM customer_contacts WHERE id = ?', c.id);
  }
}

// Tên khách hàng để chọn ở ô "Khách hàng" của dự án — mọi người đã đăng nhập đều xem được
r.get('/names', (_req, res) => {
  res.json(all('SELECT id, name FROM customers ORDER BY name'));
});

const FIRST_CONTACT = (col: string) => `(SELECT cc.${col} FROM customer_contacts cc WHERE cc.customer_id = c.id ORDER BY cc.position, cc.id LIMIT 1)`;

r.get('/', (req, res) => {
  requireUserPerm(req.user, 'customer.view');
  res.json(all(`
    SELECT c.*, pt.name AS product_type_name, p.name AS product_name,
      (SELECT COUNT(*) FROM projects pr WHERE pr.customer_id = c.id AND pr.is_archived = 0) AS project_count,
      (SELECT COUNT(*) FROM customer_contacts cc WHERE cc.customer_id = c.id) AS contact_count,
      (SELECT MAX(activity_date) FROM customer_activities a WHERE a.customer_id = c.id) AS last_activity_date,
      ${FIRST_CONTACT('full_name')} AS contact_name, ${FIRST_CONTACT('phone')} AS contact_phone, ${FIRST_CONTACT('email')} AS contact_email
    FROM customers c LEFT JOIN product_types pt ON pt.id = c.product_type_id LEFT JOIN products p ON p.id = c.product_id
    ORDER BY c.name`));
});

r.post('/', (req, res) => {
  requireUserPerm(req.user, 'customer.create');
  const v = validate(req.body || {});
  const contacts = check(() => cleanContacts(req.body?.contacts));
  if (nameTaken(v.name)) throw badRequest('Đã có khách hàng (cơ quan/đơn vị) này');
  const id = tx(() => {
    const { id } = run(`INSERT INTO customers(${FIELDS.join(', ')}, created_by) VALUES (${FIELDS.map(() => '?').join(',')}, ?)`,
      ...FIELDS.map((f) => v[f]), req.user.id);
    saveContacts(id, contacts);
    return id;
  });
  audit(req, 'customer_created', { target: v.name });
  res.status(201).json(get('SELECT * FROM customers WHERE id = ?', id));
});

r.get('/:id', (req, res) => {
  requireUserPerm(req.user, 'customer.view');
  const c = loadCustomer(req);
  c.product_type_name = c.product_type_id ? get('SELECT name FROM product_types WHERE id = ?', c.product_type_id)?.name ?? null : null;
  c.product_name = c.product_id ? get('SELECT name FROM products WHERE id = ?', c.product_id)?.name ?? null : null;
  c.contacts = all('SELECT id, full_name, phone, email FROM customer_contacts WHERE customer_id = ? ORDER BY position, id', c.id);
  c.files = all(`SELECT f.id, f.filename, f.mime, f.size, f.created_at, f.uploader_id, u.full_name AS uploader_name
    FROM customer_files f LEFT JOIN users u ON u.id = f.uploader_id WHERE f.customer_id = ? ORDER BY f.created_at DESC`, c.id);
  c.activities = all(`SELECT a.*, u.full_name AS user_name FROM customer_activities a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.customer_id = ? ORDER BY a.activity_date DESC, a.id DESC`, c.id);
  // Dự án của khách hàng kèm tiến độ; công việc chỉ hiện ở dự án người xem là thành viên
  const access = accessibleProjectIds(req.user);
  const auto = autoProjectStatuses();
  c.projects = all(`SELECT p.id, p.key, p.name, p.type, p.priority, p.project_status, p.is_archived, p.ba, p.dev, p.tester, p.am,
      u.full_name AS lead_name,
      (SELECT COUNT(*) FROM issues i WHERE i.project_id = p.id AND i.type <> 'epic') AS total_issues,
      (SELECT COUNT(*) FROM issues i JOIN statuses s ON s.id = i.status_id WHERE i.project_id = p.id AND i.type <> 'epic' AND s.category = 'done') AS done_issues,
      (SELECT COUNT(*) FROM issues i JOIN statuses s ON s.id = i.status_id WHERE i.project_id = p.id AND i.type <> 'epic' AND s.category <> 'done'
        AND i.due_date < ?) AS overdue_issues,
      (SELECT MIN(i.start_date) FROM issues i WHERE i.project_id = p.id) AS start_date,
      (SELECT MAX(i.due_date) FROM issues i WHERE i.project_id = p.id) AS end_date
    FROM projects p LEFT JOIN users u ON u.id = p.lead_id
    WHERE p.customer_id = ? ORDER BY p.is_archived, p.name`, localDate(), c.id).map((p: any) => {
    const a = auto.get(p.id) ?? { status: 'Chưa bắt đầu', reason: 'Chưa có công việc nào' };
    return { ...p, status_auto: a.status, status_reason: a.reason, accessible: access === 'all' || access.includes(p.id) };
  });
  c.issues = listIssues(req.user, { customer: String(c.id), statusCategory: 'todo,inprogress', excludeEpics: '1', sort: 'due', limit: '500' });
  const ids = c.projects.filter((p: any) => p.accessible && !p.is_archived).map((p: any) => p.id);
  c.recent = ids.length ? all(`SELECT h.id, h.field, h.new_label, h.created_at, u.full_name AS user_name, u.avatar AS user_avatar, i.key, i.summary, i.type, pr.key AS project_key
    FROM issue_history h JOIN issues i ON i.id = h.issue_id JOIN projects pr ON pr.id = i.project_id LEFT JOIN users u ON u.id = h.user_id
    WHERE i.project_id IN (${ids.map(() => '?').join(',')}) AND h.field IN ('created','status','assignee')
    ORDER BY h.created_at DESC, h.id DESC LIMIT 20`, ...ids).map((a: any) => { const { user_avatar, ...item } = a; return { ...item, user_avatar_url: avatarUrl(user_avatar) }; }) : [];
  res.json(c);
});

/** Sửa thông tin (kèm danh sách đầu mối nếu gửi lên); đổi tên → cập nhật luôn tên ở các dự án của khách hàng */
r.patch('/:id', (req, res) => {
  requireUserPerm(req.user, 'customer.edit');
  const cur = loadCustomer(req);
  const v = validate({ ...cur, ...req.body });
  const contacts = req.body?.contacts !== undefined ? check(() => cleanContacts(req.body.contacts)) : null;
  if (nameTaken(v.name, cur.id)) throw badRequest('Đã có khách hàng (cơ quan/đơn vị) này');
  tx(() => {
    run(`UPDATE customers SET ${FIELDS.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...FIELDS.map((f) => v[f]), now(), cur.id);
    if (v.name !== cur.name) run('UPDATE projects SET customer = ? WHERE customer_id = ?', v.name, cur.id);
    if (contacts) saveContacts(cur.id, contacts);
  });
  audit(req, 'customer_updated', { target: cur.name, detail: v.name !== cur.name ? `→ ${v.name}` : undefined });
  res.json({ ok: true });
});

/** Xóa khách hàng (kèm đầu mối, tài liệu, lịch sử chăm sóc); dự án được gỡ khỏi khách hàng nhưng vẫn giữ tên đã ghi */
r.delete('/:id', (req, res) => {
  requireUserPerm(req.user, 'customer.delete');
  const cur = loadCustomer(req);
  const files = all<{ stored_name: string }>('SELECT stored_name FROM customer_files WHERE customer_id = ?', cur.id);
  run('DELETE FROM customers WHERE id = ?', cur.id);
  files.forEach((f) => fs.rm(path.join(UPLOAD_DIR, f.stored_name), { force: true }, () => {}));
  audit(req, 'customer_deleted', { target: cur.name });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Tài liệu của khách hàng
// ---------------------------------------------------------------------------
r.post('/:id/files', upload.array('files'), (req, res) => {
  const files = (req.files as Express.Multer.File[]) || [];
  try {
    requireUserPerm(req.user, 'customer.edit');
    const c = loadCustomer(req);
    for (const f of files) {
      run('INSERT INTO customer_files(customer_id, uploader_id, filename, stored_name, mime, size, created_at) VALUES (?,?,?,?,?,?,?)',
        c.id, req.user.id, utf8Name(f.originalname), f.filename, f.mimetype, f.size, now());
    }
    res.status(201).json({ ok: true, count: files.length });
  } catch (e) {
    files.forEach((f) => fs.rm(f.path, { force: true }, () => {}));
    throw e;
  }
});

function loadFile(req: Request) {
  const f = get('SELECT * FROM customer_files WHERE id = ? AND customer_id = ?', Number(req.params.fid), Number(req.params.id));
  if (!f) throw notFound('Không tìm thấy tài liệu');
  return f;
}

r.get('/:id/files/:fid', (req, res) => {
  requireUserPerm(req.user, 'customer.view');
  const f = loadFile(req);
  const file = path.join(UPLOAD_DIR, f.stored_name);
  if (!fs.existsSync(file)) throw notFound('Tệp không còn tồn tại trên máy chủ');
  res.setHeader('Content-Type', f.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}`);
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  fs.createReadStream(file).pipe(res);
});

/** Xóa tài liệu: người tải lên tự xóa được; tài liệu của người khác cần quyền xóa khách hàng */
r.delete('/:id/files/:fid', (req, res) => {
  const f = loadFile(req);
  const perms = userPermissions(req.user);
  if (!(perms.has('customer.edit') && f.uploader_id === req.user.id) && !perms.has('customer.delete')) throw forbidden('Bạn chỉ xóa được tài liệu do mình tải lên');
  run('DELETE FROM customer_files WHERE id = ?', f.id);
  fs.rm(path.join(UPLOAD_DIR, f.stored_name), { force: true }, () => {});
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
