import { Router, type Request } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { all, get, localDate, now, run, tx, UPLOAD_DIR } from '../db.ts';
import { audit } from '../audit.ts';
import { accessibleProjectIds, badRequest, forbidden, notFound, requireUserPerm, userPermissions, type AuthUser, type Permission } from '../permissions.ts';
import { customerMembers, loadCustomer, loadCustomerRef, managesCustomer, projectOf, requireCustomerInfo, requireCustomerSubsystem, requireManage, seesAllCustomers,
  visibleCustomersSql, visibleSalesProjectsSql } from '../customer-access.ts';
import { checkPeople, namesSql, savePeople, userPositions } from '../people.ts';
import { autoProjectStatuses } from '../phases.ts';
import { avatarUrl } from '../avatar.ts';
import { upload, utf8Name } from '../upload.ts';
import { cleanActivity, cleanContacts, cleanCustomer, sameName } from '../customer.ts';
import { TASK_SELECT } from './customer-work.ts';
import { assignCustomerCodes, requireProjectForm, salesProjectsOf } from './sales-projects.ts';
import { syncJourneys } from '../journey-sync.ts';
import { checkCustomerStatus } from './customer-statuses.ts';
import { mentionedCustomerUsers, notifyCustomer } from '../notify.ts';

const r = Router();

/** Lỗi kiểm tra dữ liệu nhập → HTTP 400 */
function check<T>(fn: () => T): T {
  try { return fn(); } catch (e) { throw badRequest(e instanceof Error ? e.message : String(e)); }
}

const nameTaken = (name: string, exceptId?: number) =>
  all<{ id: number; name: string }>('SELECT id, name FROM customers').some((c) => c.id !== exceptId && sameName(c.name, name));

/** Sản phẩm nay theo từng dự án của khách hàng; tình trạng khách hàng vẫn nhập tay */
const FIELDS = ['name', 'province_code', 'ward_code', 'source', 'status'] as const;

/** Sale (role kd) và AM (role am) của khách hàng — tài khoản (id người dùng) */
const saveOwners = (customerId: number, kd: number[], am: number[]) => savePeople('customer_owners', 'customer_id', customerId, { kd, am });
const ownersOf = (customerId: number) => all<{ id: number; full_name: string; role: 'kd' | 'am' }>(
  'SELECT u.id, u.full_name, co.role FROM customer_owners co JOIN users u ON u.id = co.user_id WHERE co.customer_id = ? ORDER BY u.full_name', customerId);
const OWNER_NAMES = (role: 'kd' | 'am') => namesSql('customer_owners', 'customer_id', 'c.id', role);

/** Kiểm tra thông tin khách hàng với danh mục: tỉnh, phường/xã theo Danh mục địa chính (phường/xã phải thuộc tỉnh đã chọn) */
function validate(body: any, currentStatus?: string | null) {
  const v = check(() => cleanCustomer(body));
  v.status = checkCustomerStatus(v.status, currentStatus);
  if (v.province_code && !get('SELECT 1 FROM geo_provinces WHERE code = ?', v.province_code)) throw badRequest('Tỉnh/thành phố không có trong Danh mục địa chính');
  if (v.ward_code) {
    const w = get<{ province_code: string }>('SELECT province_code FROM geo_wards WHERE code = ?', v.ward_code);
    if (!w) throw badRequest('Phường/xã không có trong Danh mục địa chính');
    if (v.province_code && w.province_code !== v.province_code) throw badRequest('Phường/xã không thuộc tỉnh/thành phố đã chọn');
    v.province_code = w.province_code;
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

// Tên khách hàng để chọn ở ô "Khách hàng" của form Tạo / Sửa dự án — người có quyền Dự án – Thêm / Sửa
r.get('/names', (req, res) => {
  requireProjectForm(req.user);
  res.json(all('SELECT id, name FROM customers ORDER BY name'));
});

const FIRST_CONTACT = (col: string) => `(SELECT cc.${col} FROM customer_contacts cc WHERE cc.customer_id = c.id ORDER BY cc.position, cc.id LIMIT 1)`;

/**
 * Khách hàng (kèm dự án) người dùng được xem; ?archived=1: kèm khách hàng, dự án đã lưu trữ.
 * Dùng được với một ô Xem bất kỳ của phân hệ; dự án = dự án trong phạm vi (không có Dự án của khách hàng – Xem thì chỉ tên).
 * Không có Thông tin khách hàng – Xem: chỉ khách hàng chứa dự án trong phạm vi, mỗi khách hàng chỉ tên (và tỉnh để gom nhóm).
 */
r.get('/', (req, res) => {
  const perms = userPermissions(req.user);
  requireCustomerSubsystem(req.user);
  syncJourneys();
  const archived = req.query.archived === '1';
  const vis = visibleCustomersSql(req.user);
  const projectsByCustomer = new Map<number, any[]>();
  for (const sp of salesProjectsOf('all', { user: req.user, archived })) {
    if (!projectsByCustomer.has(sp.customer_id)) projectsByCustomer.set(sp.customer_id, []);
    projectsByCustomer.get(sp.customer_id)!.push(sp);
  }
  if (!perms.has('customer.view')) {
    const ids = [...projectsByCustomer.keys()];
    if (!ids.length) return res.json([]);
    // Mọi khách hàng ở đây đều là khách hàng mình tham gia → nằm trong "Khách hàng của tôi"
    return res.json(all<{ id: number }>(`SELECT c.id, c.name, c.province_code, gp.name AS province_name, c.is_archived
      FROM customers c LEFT JOIN geo_provinces gp ON gp.code = c.province_code
      WHERE c.id IN (${ids.map(() => '?').join(',')}) ${archived ? '' : 'AND c.is_archived = 0'} ORDER BY c.name`, ...ids)
      .map((c) => ({ ...c, is_mine: 1, sales_projects: projectsByCustomer.get(c.id) ?? [] })));
  }
  const openTasks = new Map(all<{ customer_id: number; n: number }>("SELECT customer_id, COUNT(*) n FROM customer_tasks WHERE status <> 'done' GROUP BY customer_id")
    .map((x) => [x.customer_id, x.n]));
  // Số dự án sản xuất (Kế hoạch), ngày làm việc gần nhất (Trao đổi), số việc đang mở (Công việc): chỉ khi có quyền Xem chức năng đó
  const canPlan = perms.has('plan.view'), canTalk = perms.has('ctalk.view'), canTask = perms.has('ctask.view');
  // Mỗi khách hàng kèm các dự án của khách hàng (cấp 2) người dùng được xem; sản phẩm = sản phẩm của các dự án (để tìm kiếm)
  res.json(all(`
    SELECT c.*, gp.name AS province_name, gw.name AS ward_name,
      ${canPlan ? '(SELECT COUNT(*) FROM projects pr WHERE pr.customer_id = c.id AND pr.is_archived = 0)' : 'NULL'} AS project_count,
      (SELECT COUNT(*) FROM customer_contacts cc WHERE cc.customer_id = c.id) AS contact_count,
      ${canTalk ? '(SELECT MAX(activity_date) FROM customer_activities a WHERE a.customer_id = c.id)' : 'NULL'} AS last_activity_date,
      ${FIRST_CONTACT('full_name')} AS contact_name, ${FIRST_CONTACT('phone')} AS contact_phone, ${FIRST_CONTACT('email')} AS contact_email,
      ${OWNER_NAMES('kd')} AS kd_names, ${OWNER_NAMES('am')} AS am_names,
      (EXISTS (SELECT 1 FROM customer_owners co WHERE co.customer_id = c.id AND co.user_id = ?)
        OR EXISTS (SELECT 1 FROM sales_project_owners o JOIN sales_projects sp ON sp.id = o.sales_project_id
          WHERE sp.customer_id = c.id AND o.user_id = ?)) AS is_mine
    FROM customers c LEFT JOIN geo_provinces gp ON gp.code = c.province_code LEFT JOIN geo_wards gw ON gw.code = c.ward_code
    WHERE ${vis.sql} ${archived ? '' : 'AND c.is_archived = 0'} ORDER BY c.name`, req.user.id, req.user.id, ...vis.params).map((c: any) => {
    const projects = projectsByCustomer.get(c.id) ?? [];
    return { ...c, sales_projects: projects, product_name: [...new Set(projects.map((p) => p.product_name).filter(Boolean))].join(', ') || null,
      ...(canTask ? { open_tasks: openTasks.get(c.id) ?? 0 } : {}) };
  }));
});

r.post('/', (req, res) => {
  requireUserPerm(req.user, 'customer.create');
  const v = validate(req.body || {});
  const contacts = check(() => cleanContacts(req.body?.contacts));
  if (nameTaken(v.name)) throw badRequest('Đã có khách hàng (cơ quan/đơn vị) này');
  // Người tạo có vị trí Sale → Sale của khách hàng, vị trí AM → AM (mặc định); người khác tự chọn người phụ trách
  const pos = userPositions(req.user.id);
  if (pos.includes('kd') && !v.kd_ids.includes(req.user.id)) v.kd_ids.push(req.user.id);
  else if (pos.includes('am') && !v.am_ids.includes(req.user.id)) v.am_ids.push(req.user.id);
  checkPeople(v.kd_ids, 'kd');
  checkPeople(v.am_ids, 'am');
  const id = tx(() => {
    const { id } = run(`INSERT INTO customers(${FIELDS.join(', ')}, created_by) VALUES (${FIELDS.map(() => '?').join(',')}, ?)`,
      ...FIELDS.map((f) => v[f]), req.user.id);
    saveContacts(id, contacts);
    saveOwners(id, v.kd_ids, v.am_ids);
    assignCustomerCodes();
    return id;
  });
  audit(req, 'customer_created', { target: v.name });
  res.status(201).json(get('SELECT * FROM customers WHERE id = ?', id));
});

/** Dự án của khách hàng trong phạm vi của người dùng (để lọc công việc, tài liệu, trao đổi — mỗi chức năng theo ô quyền riêng) */
function visibleProjectIds(user: AuthUser, customerId: number): Set<number> {
  const v = visibleSalesProjectsSql(user);
  return new Set(all<{ id: number }>(`SELECT sp.id FROM sales_projects sp WHERE sp.customer_id = ? AND ${v.sql}`, customerId, ...v.params).map((x) => x.id));
}
/** Mục chung của khách hàng (không thuộc dự án) hoặc thuộc dự án người dùng được xem */
const inVisible = (ids: Set<number>) => (x: { sales_project_id: number | null }) => x.sales_project_id == null || ids.has(x.sales_project_id);

r.get('/:id', (req, res) => {
  const c = loadCustomer(req);
  const perms = userPermissions(req.user);
  // Thêm / sửa / lưu trữ chỉ trên khách hàng mình liên quan (xem tất cả chỉ để xem)
  c.can_manage = managesCustomer(req.user, c.id);
  // Người tham gia (gộp mọi dự án) — chỉ những người này được giao việc chung của khách hàng
  c.member_ids = [...customerMembers(c.id, null)];
  const spIds = visibleProjectIds(req.user, c.id);
  syncJourneys([...spIds]);
  const owners = ownersOf(c.id);
  c.kd_ids = owners.filter((o) => o.role === 'kd').map((o) => o.id);
  c.am_ids = owners.filter((o) => o.role === 'am').map((o) => o.id);
  c.kd_names = owners.filter((o) => o.role === 'kd').map((o) => o.full_name).join(', ') || null;
  c.am_names = owners.filter((o) => o.role === 'am').map((o) => o.full_name).join(', ') || null;
  c.province_name = c.province_code ? get('SELECT name FROM geo_provinces WHERE code = ?', c.province_code)?.name ?? null : null;
  c.ward_name = c.ward_code ? get('SELECT name FROM geo_wards WHERE code = ?', c.ward_code)?.name ?? null : null;
  c.contacts = all('SELECT id, full_name, phone, email FROM customer_contacts WHERE customer_id = ? ORDER BY position, id', c.id);
  c.files = !perms.has('cfile.view') ? [] : all<any>(`SELECT f.id, f.filename, f.mime, f.size, f.created_at, f.uploader_id, u.full_name AS uploader_name, f.step_id, s.title AS step_title,
      f.sales_project_id, sp.name AS sales_project_name
    FROM customer_files f LEFT JOIN users u ON u.id = f.uploader_id LEFT JOIN journey_steps s ON s.id = f.step_id LEFT JOIN sales_projects sp ON sp.id = f.sales_project_id
    WHERE f.customer_id = ? ORDER BY f.created_at DESC`, c.id).filter(inVisible(spIds));
  c.tasks = !perms.has('ctask.view') ? [] : all<any>(`${TASK_SELECT} WHERE t.customer_id = ? ORDER BY t.status = 'done', t.due_date IS NULL, t.due_date, t.id`, c.id).filter(inVisible(spIds));
  // Các dự án của khách hàng (cấp 2) trong phạm vi, kèm tình trạng, tiến độ hành trình (không có Dự án của khách hàng – Xem: chỉ tên);
  // ?archived=1 kèm dự án đã lưu trữ
  c.sales_projects = salesProjectsOf([c.id], { user: req.user, archived: req.query.archived === '1' });
  // Trao đổi chung của khách hàng (không thuộc dự án / bước nào)
  c.activities = !perms.has('ctalk.view') ? [] : all(`SELECT a.*, u.full_name AS user_name FROM customer_activities a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.customer_id = ? AND a.sales_project_id IS NULL AND a.step_id IS NULL ORDER BY a.created_at, a.id`, c.id);
  // Dự án của khách hàng kèm tiến độ; công việc chỉ hiện ở dự án người xem là thành viên
  const access = accessibleProjectIds(req.user);
  const auto = autoProjectStatuses();
  // Liên kết tiến độ sản xuất = dữ liệu phân hệ Dự án: chỉ trả về khi có quyền Kế hoạch – Xem
  c.projects = !perms.has('plan.view') ? [] : all(`SELECT p.id, p.key, p.name, p.type, p.priority, p.project_status, p.is_archived,
      ${(['ba', 'dev', 'tester', 'am'] as const).map((r) => `${namesSql('project_people', 'project_id', 'p.id', r)} AS ${r}`).join(', ')},
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
  // Hoạt động gần đây của issue (phân hệ Dự án): cần thêm quyền Issue – Xem
  const ids = !perms.has('issue.view') ? [] : c.projects.filter((p: any) => p.accessible && !p.is_archived).map((p: any) => p.id);
  c.recent = ids.length ? all(`SELECT h.id, h.field, h.new_label, h.created_at, u.full_name AS user_name, u.avatar AS user_avatar, i.key, i.summary, i.type, pr.key AS project_key
    FROM issue_history h JOIN issues i ON i.id = h.issue_id JOIN projects pr ON pr.id = i.project_id LEFT JOIN users u ON u.id = h.user_id
    WHERE i.project_id IN (${ids.map(() => '?').join(',')}) AND h.field IN ('created','status','assignee')
    ORDER BY h.created_at DESC, h.id DESC LIMIT 20`, ...ids).map((a: any) => { const { user_avatar, ...item } = a; return { ...item, user_avatar_url: avatarUrl(user_avatar) }; }) : [];
  res.json(c);
});

/** Sửa thông tin (kèm danh sách đầu mối nếu gửi lên); đổi tên → cập nhật luôn tên ở các dự án của khách hàng */
r.patch('/:id', (req, res) => {
  const cur = loadCustomer(req, 'customer.edit');
  const owners = ownersOf(cur.id);
  const v = validate({ ...cur, kd_ids: owners.filter((o) => o.role === 'kd').map((o) => o.id), am_ids: owners.filter((o) => o.role === 'am').map((o) => o.id), ...req.body }, cur.status);
  checkPeople(v.kd_ids, 'kd', owners.filter((o) => o.role === 'kd').map((o) => o.id));
  checkPeople(v.am_ids, 'am', owners.filter((o) => o.role === 'am').map((o) => o.id));
  const me = req.user.id;
  if (!seesAllCustomers(req.user) && owners.some((o) => o.id === me) && !v.kd_ids.includes(me) && !v.am_ids.includes(me)) {
    throw badRequest('Bạn không thể bỏ chính mình khỏi Sale / AM của khách hàng (sẽ không còn xem được khách hàng này)');
  }
  const contacts = req.body?.contacts !== undefined ? check(() => cleanContacts(req.body.contacts)) : null;
  if (nameTaken(v.name, cur.id)) throw badRequest('Đã có khách hàng (cơ quan/đơn vị) này');
  tx(() => {
    run(`UPDATE customers SET ${FIELDS.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...FIELDS.map((f) => v[f]), now(), cur.id);
    if (v.name !== cur.name) run('UPDATE projects SET customer = ? WHERE customer_id = ?', v.name, cur.id);
    if (contacts) saveContacts(cur.id, contacts);
    saveOwners(cur.id, v.kd_ids, v.am_ids);
  });
  audit(req, 'customer_updated', { target: cur.name, detail: v.name !== cur.name ? `→ ${v.name}` : undefined });
  res.json({ ok: true });
});

/** Lưu trữ / mở lại khách hàng (không xóa): khách hàng đã lưu trữ ẩn khỏi danh sách cùng các dự án của khách hàng */
r.post('/:id/archive', (req, res) => {
  const cur = loadCustomer(req, 'customer.delete');
  const archived = req.body?.archived === false ? 0 : 1;
  run('UPDATE customers SET is_archived = ?, updated_at = ? WHERE id = ?', archived, now(), cur.id);
  audit(req, 'customer_updated', { target: cur.name, detail: archived ? 'Lưu trữ' : 'Mở lại' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Tài liệu: của khách hàng (chung), của một dự án (?project=), kết quả của một bước (?step=)
// ---------------------------------------------------------------------------
/** Bước hành trình thuộc khách hàng, dự án chứa bước trong phạm vi */
function stepOf(req: Request, customerId: number, raw: unknown) {
  const step = get<{ id: number; title: string; sales_project_id: number }>('SELECT id, title, sales_project_id FROM journey_steps WHERE id = ? AND customer_id = ?', Number(raw), customerId);
  if (!step) throw badRequest('Không tìm thấy bước trong hành trình');
  projectOf(req.user, customerId, step.sales_project_id);
  return step;
}

r.post('/:id/files', upload.array('files'), (req, res) => {
  const files = (req.files as Express.Multer.File[]) || [];
  try {
    // Tài liệu của dự án / bước: dự án trong phạm vi; tài liệu chung: thêm Thông tin khách hàng – Xem
    const c = loadCustomerRef(req, 'cfile.create');
    const step = req.query.step ? stepOf(req, c.id, req.query.step) : null;
    const spId = step ? step.sales_project_id : projectOf(req.user, c.id, req.query.project);
    if (!spId) requireCustomerInfo(req.user, c.id);
    requireManage(req.user, c.id, spId);
    for (const f of files) {
      run('INSERT INTO customer_files(customer_id, uploader_id, filename, stored_name, mime, size, created_at, step_id, sales_project_id) VALUES (?,?,?,?,?,?,?,?,?)',
        c.id, req.user.id, utf8Name(f.originalname), f.filename, f.mimetype, f.size, now(), step?.id ?? null, spId);
    }
    res.status(201).json({ ok: true, count: files.length });
  } catch (e) {
    files.forEach((f) => fs.rm(f.path, { force: true }, () => {}));
    throw e;
  }
});

/** Tài liệu :fid — cần quyền perm (không truyền = một ô Xem của phân hệ); của dự án: dự án trong phạm vi; chung: được xem thông tin khách hàng */
function loadFile(req: Request, perm?: Permission) {
  const c = loadCustomerRef(req, perm);
  const f = get('SELECT * FROM customer_files WHERE id = ? AND customer_id = ?', Number(req.params.fid), c.id);
  if (!f) throw notFound('Không tìm thấy tài liệu');
  if (!projectOf(req.user, c.id, f.sales_project_id)) requireCustomerInfo(req.user, c.id);
  return f;
}

r.get('/:id/files/:fid', (req, res) => {
  const f = loadFile(req, 'cfile.export');
  const file = path.join(UPLOAD_DIR, f.stored_name);
  if (!fs.existsSync(file)) throw notFound('Tệp không còn tồn tại trên máy chủ');
  res.setHeader('Content-Type', f.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}`);
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  fs.createReadStream(file).pipe(res);
});

/** Xóa tài liệu: người tải lên tự xóa được (có quyền Tải lên); tài liệu của người khác cần quyền Xóa tài liệu */
r.delete('/:id/files/:fid', (req, res) => {
  const f = loadFile(req);
  requireManage(req.user, Number(req.params.id), f.sales_project_id);
  const perms = userPermissions(req.user);
  if (!(perms.has('cfile.create') && f.uploader_id === req.user.id) && !perms.has('cfile.delete')) throw forbidden('Bạn chỉ xóa được tài liệu do mình tải lên');
  run('DELETE FROM customer_files WHERE id = ?', f.id);
  fs.rm(path.join(UPLOAD_DIR, f.stored_name), { force: true }, () => {});
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Trao đổi: làm việc với khách hàng (gọi điện, gặp mặt, email) và thảo luận nội bộ — chung, của dự án, của bước
// ---------------------------------------------------------------------------
r.post('/:id/activities', (req, res) => {
  const c = loadCustomerRef(req, 'ctalk.create');
  const v = check(() => cleanActivity(req.body || {}, localDate()));
  const step = req.body?.step_id ? stepOf(req, c.id, req.body.step_id) : null;
  const spId = step ? step.sales_project_id : projectOf(req.user, c.id, req.body?.sales_project_id);
  if (!spId) requireCustomerInfo(req.user, c.id);
  requireManage(req.user, c.id, spId);
  const { id } = run('INSERT INTO customer_activities(customer_id, user_id, kind, activity_date, content, step_id, sales_project_id) VALUES (?,?,?,?,?,?,?)',
    c.id, req.user.id, v.kind, v.activity_date, v.content, step?.id ?? null, spId);
  // Link: bước → step:<id>; dự án → info:<id dự án>; chung → info (người nhận phải được xem đúng phần đó)
  const link = step ? `step:${step.id}` : spId ? `info:${spId}` : 'info';
  notifyCustomer(mentionedCustomerUsers(v.content, c.id, link), req.user.id, c.id, 'mention', link, v.content);
  res.status(201).json(get('SELECT a.*, u.full_name AS user_name FROM customer_activities a LEFT JOIN users u ON u.id = a.user_id WHERE a.id = ?', id));
});

/** Xóa trao đổi: người ghi tự xóa được (có quyền Thêm trao đổi); của người khác cần quyền Xóa trao đổi */
r.delete('/:id/activities/:aid', (req, res) => {
  const c = loadCustomerRef(req);
  const a = get('SELECT * FROM customer_activities WHERE id = ? AND customer_id = ?', Number(req.params.aid), c.id);
  if (!a) throw notFound('Không tìm thấy trao đổi');
  if (!projectOf(req.user, c.id, a.sales_project_id)) requireCustomerInfo(req.user, c.id);
  requireManage(req.user, c.id, a.sales_project_id);
  const perms = userPermissions(req.user);
  if (!(perms.has('ctalk.create') && a.user_id === req.user.id) && !perms.has('ctalk.delete')) throw forbidden('Bạn chỉ xóa được trao đổi do mình ghi');
  run('DELETE FROM customer_activities WHERE id = ?', a.id);
  res.json({ ok: true });
});

export default r;
