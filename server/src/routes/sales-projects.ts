import { Router, type Request } from 'express';
import { all, get, localDate, now, run, tx } from '../db.ts';
import { audit } from '../audit.ts';
import { accessibleProjectIds, badRequest, userPermissions, type AuthUser, type Permission } from '../permissions.ts';
import { cleanSalesProject, customerCode, salesProjectCode } from '../customer.ts';
import { journeyProgress, journeyStatus } from '../journey.ts';
import { syncJourneys } from '../journey-sync.ts';
import { autoProjectStatuses } from '../phases.ts';
import { customerMembers, loadCustomer, loadSalesProjectOf, managesSalesProject, visibleSalesProjectsSql } from '../customer-access.ts';
import { checkPeople, namesSql, savePeople, type PeopleRole } from '../people.ts';
import { callAlerts, callsOf, TASK_SELECT } from './customer-work.ts';

/**
 * Dự án của khách hàng (cấp 2 dưới khách hàng) — do Kinh doanh tạo và theo dõi.
 * Mỗi dự án có mã (mã khách hàng + số), Kinh doanh, AM, BA/PM, sản phẩm, ghi chú và hành trình bán hàng (quy trình I–IV) riêng;
 * tình trạng tự động theo phần đang chạy của hành trình. Phía phân hệ Dự án gắn dự án sản xuất với dự án của khách hàng.
 */
const r = Router();

function check<T>(fn: () => T): T {
  try { return fn(); } catch (e) { throw badRequest(e instanceof Error ? e.message : String(e)); }
}

/** Gán mã cho khách hàng chưa có mã (khách hàng có từ trước, khách hàng mới tạo) — tự sinh từ tên, không sửa */
export function assignCustomerCodes() {
  const taken = all<{ code: string }>('SELECT code FROM customers WHERE code IS NOT NULL').map((x) => x.code);
  for (const c of all<{ id: number; name: string }>('SELECT id, name FROM customers WHERE code IS NULL ORDER BY id')) {
    const code = customerCode(c.name, taken);
    run('UPDATE customers SET code = ? WHERE id = ?', code, c.id);
    taken.push(code);
  }
}

/** Vai trò người của dự án của khách hàng (id tài khoản): Sale, AM, BA/PM, Dev, Tester */
const ROLES: PeopleRole[] = ['kd', 'am', 'ba', 'dev', 'tester'];
const SP_SELECT = `SELECT sp.*, c.name AS customer_name, pt.name AS product_type_name, pd.name AS product_name, pr.key AS project_key, pr.name AS project_name,
    ${ROLES.map((r) => `${namesSql('sales_project_owners', 'sales_project_id', 'sp.id', r)} AS ${r}_names`).join(',\n    ')},
    (SELECT COUNT(*) FROM customer_tasks t WHERE t.sales_project_id = sp.id AND t.status <> 'done') AS open_tasks
  FROM sales_projects sp JOIN customers c ON c.id = sp.customer_id LEFT JOIN product_types pt ON pt.id = sp.product_type_id
  LEFT JOIN products pd ON pd.id = sp.product_id LEFT JOIN projects pr ON pr.id = sp.project_id`;

/**
 * Danh sách dự án (của các khách hàng trong ids, hoặc tất cả) kèm tình trạng và tiến độ hành trình.
 * user: chỉ dự án người dùng được xem; archived: kèm cả dự án đã lưu trữ.
 */
export function salesProjectsOf(customerIds: number[] | 'all', opts: { user?: AuthUser; archived?: boolean } = {}, today = localDate()) {
  const where: string[] = [], params: unknown[] = [];
  if (customerIds !== 'all') {
    if (!customerIds.length) return [];
    where.push(`sp.customer_id IN (${customerIds.map(() => '?').join(',')})`); params.push(...customerIds);
  }
  if (!opts.archived) where.push('sp.is_archived = 0');
  if (opts.user) { const v = visibleSalesProjectsSql(opts.user); where.push(v.sql); params.push(...v.params); }
  const rows = all(`${SP_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY sp.customer_id, sp.code`, ...(params as any[]));
  const steps = new Map<number, any[]>();
  for (const st of all('SELECT id, sales_project_id, depth, position, code, title, status, due_date FROM journey_steps WHERE sales_project_id IS NOT NULL ORDER BY sales_project_id, position, id')) {
    if (!steps.has(st.sales_project_id)) steps.set(st.sales_project_id, []);
    steps.get(st.sales_project_id)!.push(st);
  }
  // Lịch gọi đã đến ngày mà chưa xác nhận → cảnh báo cho mọi người xem được dự án
  const calls = callAlerts(today);
  return rows.map((p: any) => {
    const list = steps.get(p.id) ?? [];
    const j = journeyProgress(list, today);
    return { ...p, status: journeyStatus(list), journey_pct: j.total ? j.pct : null,
      journey_overdue: j.sections.reduce((n, s) => n + s.overdue, 0), call_alert: calls.get(p.id) ?? null };
  });
}

function loadSalesProject(req: Request, perm: Permission = 'sales_project.view') {
  const c = loadCustomer(req);
  const sp = loadSalesProjectOf(req.user, c.id, req.params.pid, perm);
  return { c, sp };
}

/** Kiểm tra sản phẩm với danh mục (sản phẩm phải có thật và thuộc loại đã chọn), Kinh doanh là nhân sự Sale, AM là nhân sự AM */
function validate(body: any) {
  const v = check(() => cleanSalesProject(body));
  if (v.product_type_id && !get('SELECT 1 FROM product_types WHERE id = ?', v.product_type_id)) throw badRequest('Loại sản phẩm không hợp lệ');
  if (v.product_id) {
    const p = get<{ type_id: number }>('SELECT type_id FROM products WHERE id = ?', v.product_id);
    if (!p) throw badRequest('Sản phẩm không hợp lệ');
    if (v.product_type_id && p.type_id !== v.product_type_id) throw badRequest('Sản phẩm không thuộc loại sản phẩm đã chọn');
    v.product_type_id = p.type_id;
  }
  return v;
}

/** Id tài khoản theo vai trò của dự án: { kd: [...], am: [...], ... } */
const ownerIds = (spId: number) => {
  const rows = all<{ user_id: number; role: PeopleRole }>('SELECT user_id, role FROM sales_project_owners WHERE sales_project_id = ?', spId);
  return Object.fromEntries(ROLES.map((r) => [r, rows.filter((o) => o.role === r).map((o) => o.user_id)])) as Record<PeopleRole, number[]>;
};
/** Kiểm tra (người mới phải đúng vị trí) và lưu người ở mọi vai trò */
function savePeopleOf(spId: number, v: Record<`${PeopleRole}_ids`, number[]>, before: Partial<Record<PeopleRole, number[]>> = {}) {
  for (const r of ROLES) checkPeople(v[`${r}_ids`], r, before[r] ?? []);
  savePeople('sales_project_owners', 'sales_project_id', spId, Object.fromEntries(ROLES.map((r) => [r, v[`${r}_ids`]])));
}

/** Tên dự án của một khách hàng — để phía phân hệ Dự án chọn gắn dự án sản xuất (ai tạo / sửa dự án cũng xem được tên) */
r.get('/:id/project-names', (req, res) => {
  res.json(all(`SELECT sp.id, sp.code, sp.name, sp.project_id, pr.key AS project_key FROM sales_projects sp LEFT JOIN projects pr ON pr.id = sp.project_id
    WHERE sp.customer_id = ? ORDER BY sp.code`, Number(req.params.id)));
});

r.post('/:id/projects', (req, res) => {
  const c = loadCustomer(req, 'sales_project.create') as { id: number; name: string };
  const v = validate(req.body || {});
  const id = tx(() => {
    if (!get<{ code: string | null }>('SELECT code FROM customers WHERE id = ?', c.id)?.code) assignCustomerCodes();
    const cc = get<{ code: string }>('SELECT code FROM customers WHERE id = ?', c.id)!.code;
    const code = salesProjectCode(cc, all<{ code: string }>('SELECT code FROM sales_projects WHERE code LIKE ?', `${cc}-%`).map((x) => x.code));
    const { id } = run(`INSERT INTO sales_projects(customer_id, code, name, product_type_id, product_id, product_description, note, created_by)
      VALUES (?,?,?,?,?,?,?,?)`, c.id, code, v.name, v.product_type_id, v.product_id, v.product_description, v.note, req.user.id);
    savePeopleOf(id, v);
    return id;
  });
  audit(req, 'customer_updated', { target: c.name, detail: `Thêm dự án ${v.name}` });
  res.status(201).json(salesProjectsOf([c.id], { archived: true }).find((p: any) => p.id === id));
});

/** Chi tiết dự án: thông tin, Kinh doanh / AM, tình trạng, công việc, tài liệu, trao đổi, dự án sản xuất đã gắn */
r.get('/:id/projects/:pid', (req, res) => {
  const { c, sp } = loadSalesProject(req);
  syncJourneys([sp.id]);
  const p: any = salesProjectsOf([c.id], { archived: true }).find((x: any) => x.id === sp.id);
  p.can_manage = managesSalesProject(req.user, sp.id);
  const ids = ownerIds(sp.id);
  for (const r of ROLES) p[`${r}_ids`] = ids[r];
  const perms = userPermissions(req.user);
  p.tasks = !perms.has('ctask.view') ? [] : all(`${TASK_SELECT} WHERE t.sales_project_id = ? ORDER BY t.status = 'done', t.due_date IS NULL, t.due_date, t.id`, sp.id);
  p.files = !perms.has('cfile.view') ? [] : all(`SELECT f.id, f.filename, f.mime, f.size, f.created_at, f.uploader_id, u.full_name AS uploader_name, f.step_id, s.title AS step_title
    FROM customer_files f LEFT JOIN users u ON u.id = f.uploader_id LEFT JOIN journey_steps s ON s.id = f.step_id
    WHERE f.sales_project_id = ? ORDER BY f.created_at DESC`, sp.id);
  p.activities = !perms.has('ctalk.view') ? [] : all(`SELECT a.*, u.full_name AS user_name FROM customer_activities a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.sales_project_id = ? AND a.step_id IS NULL ORDER BY a.created_at, a.id`, sp.id);
  // Dự án sản xuất: tiến độ theo số việc; người không là thành viên chỉ xem tên
  p.calls = !perms.has('ctalk.view') ? [] : callsOf(sp.id);
  // Người tham gia dự án — chỉ những người này được giao việc, lịch gọi, bước
  p.member_ids = [...customerMembers(c.id, sp.id)];
  p.production = null;
  if (sp.project_id) {
    const access = accessibleProjectIds(req.user);
    const pr: any = get(`SELECT p.id, p.key, p.name, p.project_status, p.is_archived,
        (SELECT COUNT(*) FROM issues i WHERE i.project_id = p.id AND i.type <> 'epic') AS total_issues,
        (SELECT COUNT(*) FROM issues i JOIN statuses s ON s.id = i.status_id WHERE i.project_id = p.id AND i.type <> 'epic' AND s.category = 'done') AS done_issues
      FROM projects p WHERE p.id = ?`, sp.project_id);
    if (pr) {
      pr.status_auto = autoProjectStatuses().get(pr.id)?.status ?? 'Chưa bắt đầu';
      pr.accessible = access === 'all' || access.includes(pr.id);
      p.production = pr;
    }
  }
  res.json(p);
});

r.patch('/:id/projects/:pid', (req, res) => {
  const { c, sp } = loadSalesProject(req, 'sales_project.edit');
  const before = ownerIds(sp.id);
  const v = validate({ ...sp, ...Object.fromEntries(ROLES.map((r) => [`${r}_ids`, before[r]])), ...req.body });
  tx(() => {
    run(`UPDATE sales_projects SET name = ?, product_type_id = ?, product_id = ?, product_description = ?, note = ?, updated_at = ? WHERE id = ?`,
      v.name, v.product_type_id, v.product_id, v.product_description, v.note, now(), sp.id);
    savePeopleOf(sp.id, v, before);
  });
  audit(req, 'customer_updated', { target: c.name, detail: `Sửa dự án ${sp.code} ${v.name}` });
  res.json({ ok: true });
});

/** Lưu trữ / mở lại dự án (không xóa): dự án đã lưu trữ ẩn khỏi danh sách; dự án sản xuất ở phân hệ Dự án giữ nguyên */
r.post('/:id/projects/:pid/archive', (req, res) => {
  const { c, sp } = loadSalesProject(req, 'sales_project.delete');
  const archived = req.body?.archived === false ? 0 : 1;
  run('UPDATE sales_projects SET is_archived = ?, updated_at = ? WHERE id = ?', archived, now(), sp.id);
  audit(req, 'customer_updated', { target: c.name, detail: `${archived ? 'Lưu trữ' : 'Mở lại'} dự án ${sp.code} ${sp.name}` });
  res.json({ ok: true });
});

export default r;
