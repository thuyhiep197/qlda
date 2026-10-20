import { primaryCode } from '../positions.ts';
import { Router, type Request } from 'express';
import { all, get, localDate, now, run, tx } from '../db.ts';
import { badRequest, forbidden, notFound, requireUserPerm, userPermissions } from '../permissions.ts';
import { callAlert, callPingDue, cleanCall, cleanCallConfirm, cleanTask } from '../customer.ts';
import { branchIds, cleanJourneyRows, journeyProgress, MAX_DEPTH, loadTemplate, PING_DAYS, pingDue, STEP_STATUSES, STEP_STATUS_LABELS, type StepStatus, type TemplateRow } from '../journey.ts';
import { notifyCustomer } from '../notify.ts';
import { syncJourneys } from '../journey-sync.ts';
import { customerMembers, loadCustomer as loadVisible, loadSalesProjectOf, projectOf, requireManage, requireMembers, visibleCustomersSql } from '../customer-access.ts';
import type { Permission } from '../permissions.ts';

/** Hành trình khách hàng (quy trình I–IV) và công việc kinh doanh của khách hàng */
const r = Router();

/** Khách hàng theo :id — kiểm tra quyền và người dùng được xem khách hàng này */
const loadCustomer = (req: Request, perm: Permission = 'customer.view') => loadVisible(req, perm) as { id: number; name: string };

const STEP_SELECT = `SELECT s.*, u.full_name AS assignee_name, st.positions AS assignee_positions FROM journey_steps s
  LEFT JOIN users u ON u.id = s.assignee_id LEFT JOIN staff st ON st.user_id = u.id`;
/** Mã vị trí (KD, AM, BA…) của người thực hiện thay cho danh sách vị trí thô */
const withCode = (s: any) => { const { assignee_positions, ...rest } = s; return { ...rest, assignee_dept: primaryCode(assignee_positions) }; };
/** Người phối hợp của các bước: [{ step_id, id, full_name, dept }] */
const supportersOf = (where: string, param: number) => all<{ step_id: number; id: number; full_name: string; dept: string | null }>(
  `SELECT ss.step_id, u.id, u.full_name, st.positions AS dept FROM journey_step_supporters ss JOIN users u ON u.id = ss.user_id
   LEFT JOIN staff st ON st.user_id = u.id JOIN journey_steps s ON s.id = ss.step_id WHERE ${where} ORDER BY u.full_name`, param)
  .map((x) => ({ ...x, dept: primaryCode(x.dept) }));
/** Hành trình của một dự án của khách hàng (mỗi dự án có quy trình I–IV riêng) */
export const journeySteps = (salesProjectId: number) => {
  const steps = all(`${STEP_SELECT} WHERE s.sales_project_id = ? ORDER BY s.position, s.id`, salesProjectId).map(withCode);
  const sup = supportersOf('s.sales_project_id = ?', salesProjectId);
  for (const st of steps) st.supporters = sup.filter((x) => x.step_id === st.id).map(({ step_id: _s, ...x }) => x);
  return steps;
};

const activeUser = (id: number | null) => {
  if (id && !get('SELECT 1 FROM users WHERE id = ? AND is_active = 1', id)) throw badRequest('Người phụ trách không hợp lệ');
  return id;
};

/** Số liệu cho Dashboard chung: khách hàng theo tình trạng, việc kinh doanh & bước hành trình của tôi, việc quá hạn */
r.get('/summary', (req, res) => {
  requireUserPerm(req.user, 'customer.view');
  const today = localDate();
  const vis = visibleCustomersSql(req.user);
  const byStatus = all<{ status: string; n: number }>(`SELECT status, COUNT(*) n FROM customers c WHERE ${vis.sql} GROUP BY status`, ...vis.params);
  const myTasks = all(`${TASK_SELECT.replace('SELECT t.*', 'SELECT t.*, c.name AS customer_name')} JOIN customers c ON c.id = t.customer_id
    WHERE t.assignee_id = ? AND t.status <> 'done' ORDER BY t.due_date IS NULL, t.due_date, t.id LIMIT 30`, req.user.id);
  const mySteps = all(`SELECT s.id, s.customer_id, s.sales_project_id, s.code, s.title, s.status, s.due_date, c.name AS customer_name, sp.name AS sales_project_name
    FROM journey_steps s JOIN customers c ON c.id = s.customer_id LEFT JOIN sales_projects sp ON sp.id = s.sales_project_id
    WHERE s.assignee_id = ? AND s.status <> 'done' AND s.depth > 0
    ORDER BY s.due_date IS NULL, s.due_date, s.position LIMIT 30`, req.user.id);
  const overdue = {
    tasks: get<{ n: number }>(`SELECT COUNT(*) n FROM customer_tasks t2 JOIN customers c ON c.id = t2.customer_id WHERE t2.status <> 'done' AND t2.due_date < ? AND ${vis.sql}`, today, ...vis.params)!.n,
    steps: get<{ n: number }>(`SELECT COUNT(*) n FROM journey_steps j2 JOIN customers c ON c.id = j2.customer_id WHERE j2.status <> 'done' AND j2.depth > 0 AND j2.due_date < ? AND ${vis.sql}`, today, ...vis.params)!.n,
  };
  const total = byStatus.reduce((n, x) => n + x.n, 0);
  res.json({ total, by_status: byStatus, my_tasks: myTasks, my_steps: mySteps, overdue, today });
});

// ---------------------------------------------------------------------------
// Hành trình khách hàng
// ---------------------------------------------------------------------------
/** Tạo hành trình của dự án từ quy trình mẫu đã được người dùng sửa (bỏ nhánh, thêm bước) */
function applyRows(customerId: number, salesProjectId: number, rows: TemplateRow[]) {
  rows.forEach((t, i) => run('INSERT INTO journey_steps(customer_id, sales_project_id, position, depth, code, title, unit, support) VALUES (?,?,?,?,?,?,?,?)',
    customerId, salesProjectId, (i + 1) * 10, t.depth, t.code || null, t.title, t.unit || null, t.support || null));
  return rows.length;
}

/** Quy trình mẫu I–IV để xem trước, sửa rồi mới áp dụng cho một dự án */
r.get('/journey-template', (req, res) => {
  requireUserPerm(req.user, 'customer.view');
  res.json({ rows: loadTemplate() });
});

/** Dự án :pid của khách hàng :id */
const loadSalesProject = (req: Request, customerId: number, perm: Permission) => loadSalesProjectOf(req.user, customerId, req.params.pid, perm) as { id: number; name: string };

r.get('/:id/projects/:pid/journey', (req, res) => {
  const c = loadCustomer(req);
  const sp = loadSalesProject(req, c.id, 'journey.view');
  syncJourneys([sp.id]);
  const steps = journeySteps(sp.id);
  const talk = new Map(all<{ step_id: number; n: number }>(`SELECT a.step_id, COUNT(*) n FROM customer_activities a JOIN journey_steps s ON s.id = a.step_id
    WHERE s.sales_project_id = ? GROUP BY a.step_id`, sp.id).map((x) => [x.step_id, x.n]));
  for (const st of steps) st.talk_count = talk.get(st.id) ?? 0;
  const files = all<{ id: number; step_id: number; filename: string; size: number }>(
    'SELECT f.id, f.step_id, f.filename, f.size FROM customer_files f JOIN journey_steps s ON s.id = f.step_id WHERE s.sales_project_id = ? ORDER BY f.created_at', sp.id);
  for (const s of steps) s.files = files.filter((f) => f.step_id === s.id);
  res.json({ steps, progress: journeyProgress(steps, localDate()), ping_days: PING_DAYS });
});

/** Áp dụng quy trình (mẫu đã sửa) cho dự án — chỉ khi dự án chưa có hành trình */
r.post('/:id/projects/:pid/journey/apply', (req, res) => {
  const c = loadCustomer(req);
  const sp = loadSalesProject(req, c.id, 'journey.create');
  if (get('SELECT 1 FROM journey_steps WHERE sales_project_id = ?', sp.id)) throw badRequest('Dự án đã có hành trình');
  const rows = check(() => cleanJourneyRows(req.body?.rows));
  const count = tx(() => applyRows(c.id, sp.id, rows));
  res.status(201).json({ ok: true, count });
});

/** Xóa toàn bộ hành trình của dự án (để áp dụng lại quy trình mẫu) */
r.delete('/:id/projects/:pid/journey', (req, res) => {
  const c = loadCustomer(req);
  const sp = loadSalesProject(req, c.id, 'journey.delete');
  run('DELETE FROM journey_steps WHERE sales_project_id = ?', sp.id);
  res.json({ ok: true });
});

/** Bước :sid của khách hàng :id — cần quyền perm (module Hành trình) và được xem dự án chứa bước */
function loadStep(req: Request, customerId: number, perm: Permission) {
  const s = get('SELECT * FROM journey_steps WHERE id = ? AND customer_id = ?', Number(req.params.sid), customerId);
  if (!s) throw notFound('Không tìm thấy bước trong hành trình');
  loadSalesProjectOf(req.user, customerId, s.sales_project_id, perm);
  return s;
}

/** Một bước của hành trình (như một issue của kinh doanh): phần/giai đoạn chứa nó, trao đổi, tài liệu kết quả */
r.get('/:id/journey/:sid', (req, res) => {
  const c = loadCustomer(req);
  const raw = get(`${STEP_SELECT} WHERE s.id = ? AND s.customer_id = ?`, Number(req.params.sid), c.id);
  if (!raw) throw notFound('Không tìm thấy bước trong hành trình');
  loadSalesProjectOf(req.user, c.id, raw.sales_project_id, 'journey.view');
  const s: any = withCode(raw);
  s.supporters = supportersOf('s.id = ?', s.id).map(({ step_id: _s, ...x }) => x);
  const before = all<{ id: number; depth: number; code: string | null; title: string }>(
    'SELECT id, depth, code, title FROM journey_steps WHERE sales_project_id IS ? AND (position < ? OR (position = ? AND id < ?)) ORDER BY position DESC, id DESC', s.sales_project_id, s.position, s.position, s.id);
  // Đường dẫn: các bước cha gần nhất có cấp nhỏ hơn
  const path: { id: number; code: string | null; title: string }[] = [];
  let depth = s.depth;
  for (const b of before) if (b.depth < depth) { path.unshift({ id: b.id, code: b.code, title: b.title }); depth = b.depth; if (depth === 0) break; }
  s.path = path;
  s.activities = all(`SELECT a.*, u.full_name AS user_name FROM customer_activities a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.step_id = ? ORDER BY a.created_at, a.id`, s.id);
  s.files = all(`SELECT f.id, f.filename, f.mime, f.size, f.created_at, f.uploader_id, u.full_name AS uploader_name FROM customer_files f
    LEFT JOIN users u ON u.id = f.uploader_id WHERE f.step_id = ? ORDER BY f.created_at DESC`, s.id);
  s.ping_options = PING_DAYS;
  s.sales_project_name = s.sales_project_id ? get<{ name: string }>('SELECT name FROM sales_projects WHERE id = ?', s.sales_project_id)?.name ?? null : null;
  s.member_ids = [...customerMembers(c.id, s.sales_project_id)];
  res.json(s);
});

/** Cập nhật một bước: trạng thái, người phụ trách, hạn, Ping, ghi chú, tên, đơn vị */
r.patch('/:id/journey/:sid', (req, res) => {
  const c = loadCustomer(req);
  const s = loadStep(req, c.id, 'journey.edit');
  const b = req.body || {};
  const status = b.status !== undefined ? String(b.status) : s.status;
  if (!(STEP_STATUSES as readonly string[]).includes(status)) throw badRequest('Trạng thái không hợp lệ');
  const assignee = b.assignee_id !== undefined ? activeUser(b.assignee_id ? Number(b.assignee_id) : null) : s.assignee_id;
  requireMembers(c.id, s.sales_project_id, [assignee], [s.assignee_id]);
  const due = b.due_date !== undefined ? (String(b.due_date || '').trim() || null) : s.due_date;
  if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due)))) throw badRequest('Hạn không hợp lệ');
  const ping = b.ping_days !== undefined ? Number(b.ping_days) || 0 : s.ping_days;
  if (!PING_DAYS.includes(ping)) throw badRequest('Ping không hợp lệ');
  const text = (k: string, max: number) => (b[k] !== undefined ? String(b[k] ?? '').trim().slice(0, max) || null : s[k]);
  const title = text('title', 300);
  if (!title) throw badRequest('Tên bước không được để trống');
  // Đổi hạn / Ping thì nhắc lại từ đầu
  const pinged = due !== s.due_date || ping !== s.ping_days ? null : s.pinged_on;
  run(`UPDATE journey_steps SET status = ?, assignee_id = ?, due_date = ?, ping_days = ?, pinged_on = ?, note = ?, title = ?, unit = ?, support = ?, updated_at = ?
    WHERE id = ?`, status, assignee, due, ping, pinged, text('note', 2000), title, text('unit', 50), text('support', 80), now(), s.id);
  if (assignee && assignee !== s.assignee_id) notifyCustomer([assignee], req.user.id, c.id, 'assigned', `step:${s.id}`, `${c.name}: ${title}`);
  // Người phối hợp: thay cả danh sách; người mới được thêm nhận thông báo
  if (Array.isArray(b.supporter_ids)) {
    const ids = [...new Set(b.supporter_ids.map(Number).filter((n: number) => n > 0))] as number[];
    ids.forEach((id) => activeUser(id));
    const before = new Set(all<{ user_id: number }>('SELECT user_id FROM journey_step_supporters WHERE step_id = ?', s.id).map((x) => x.user_id));
    requireMembers(c.id, s.sales_project_id, ids, [...before]);
    tx(() => {
      run('DELETE FROM journey_step_supporters WHERE step_id = ?', s.id);
      ids.forEach((id) => run('INSERT INTO journey_step_supporters(step_id, user_id) VALUES (?, ?)', s.id, id));
    });
    notifyCustomer(ids.filter((id) => !before.has(id)), req.user.id, c.id, 'assigned', `step:${s.id}`, `${c.name}: phối hợp ${title}`);
  }
  res.json({ ok: true, status_label: STEP_STATUS_LABELS[status as StepStatus] });
});

/** Thêm bước con vào cuối nhánh của một bước (tối đa MAX_DEPTH cấp) */
r.post('/:id/journey/:sid/children', (req, res) => {
  const c = loadCustomer(req);
  const parent = loadStep(req, c.id, 'journey.create');
  if (parent.depth >= MAX_DEPTH) throw badRequest(`Chỉ chia tối đa ${MAX_DEPTH} cấp việc con`);
  const title = String(req.body?.title ?? '').trim().slice(0, 300);
  if (!title) throw badRequest('Tên bước không được để trống');
  const steps = journeySteps(parent.sales_project_id);
  const branch = branchIds(steps, parent.id);
  const last = steps.find((x: any) => x.id === branch[branch.length - 1]);
  const next = steps[steps.indexOf(last) + 1];
  // Chèn giữa bước cuối nhánh và bước kế tiếp; hết chỗ thì đánh số lại
  let pos = next ? (last.position + next.position) / 2 : last.position + 10;
  if (next && next.position - last.position < 2) {
    tx(() => steps.forEach((x: any, i: number) => run('UPDATE journey_steps SET position = ? WHERE id = ?', (i + 1) * 10, x.id)));
    pos = (steps.indexOf(last) + 1) * 10 + 5;
  }
  const { id } = run('INSERT INTO journey_steps(customer_id, sales_project_id, position, depth, title) VALUES (?,?,?,?,?)', c.id, parent.sales_project_id, Math.round(pos), parent.depth + 1, title);
  res.status(201).json({ id });
});

/** Bỏ một bước cùng toàn bộ bước con (nhánh không áp dụng cho khách hàng này) */
r.delete('/:id/journey/:sid', (req, res) => {
  const c = loadCustomer(req);
  const s = loadStep(req, c.id, 'journey.delete');
  const ids = branchIds(journeySteps(s.sales_project_id), s.id);
  tx(() => ids.forEach((id) => run('DELETE FROM journey_steps WHERE id = ?', id)));
  res.json({ ok: true, removed: ids.length });
});

/** Nhắc hạn (Ping): người phụ trách bước nhận thông báo mỗi ngày từ [hạn − Ping ngày] cho tới khi bước kết thúc */
export function pingJourney() {
  const today = localDate();
  const rows = all(`SELECT s.*, c.name AS customer_name, sp.name AS sales_project_name FROM journey_steps s JOIN customers c ON c.id = s.customer_id LEFT JOIN sales_projects sp ON sp.id = s.sales_project_id
    WHERE s.status <> 'done' AND s.due_date IS NOT NULL AND s.ping_days > 0 AND s.assignee_id IS NOT NULL`);
  for (const s of rows) {
    if (!pingDue(s, today)) continue;
    const late = s.due_date < today ? 'đã quá hạn' : s.due_date === today ? 'đến hạn hôm nay' : `hạn ${s.due_date.split('-').reverse().join('/')}`;
    notifyCustomer([s.assignee_id], null, s.customer_id, 'ping', `step:${s.id}`, `${s.customer_name}${s.sales_project_name ? ` › ${s.sales_project_name}` : ''}: ${s.title} (${late})`);
    run('UPDATE journey_steps SET pinged_on = ? WHERE id = ?', today, s.id);
  }
  pingCalls(today);
}

// ---------------------------------------------------------------------------
// Lịch gọi điện của dự án của khách hàng: đặt lịch ngày gọi, giao người gọi (mặc định người đặt);
// đến ngày mà chưa xác nhận Đã gọi / Chưa gọi được thì chuông nhắc người gọi mỗi ngày và cảnh báo trên danh sách
// ---------------------------------------------------------------------------
const CALL_SELECT = `SELECT k.*, u.full_name AS assignee_name, cb.full_name AS created_by_name, db.full_name AS done_by_name
  FROM customer_calls k LEFT JOIN users u ON u.id = k.assignee_id LEFT JOIN users cb ON cb.id = k.created_by LEFT JOIN users db ON db.id = k.done_by`;
/** Lịch gọi của dự án: lịch chờ gọi (ngày gần nhất trước), rồi lịch đã xác nhận (mới nhất trước) */
export const callsOf = (salesProjectId: number) => all(`${CALL_SELECT} WHERE k.sales_project_id = ?
  ORDER BY k.status <> 'planned', CASE WHEN k.status = 'planned' THEN k.call_date END, k.call_date DESC, k.id DESC`, salesProjectId);
/** Cảnh báo lịch gọi đã đến ngày của các dự án: sales_project_id → { date, late, count } */
export function callAlerts(today = localDate()) {
  const planned = new Map<number, string[]>();
  for (const k of all<{ sales_project_id: number; call_date: string }>("SELECT sales_project_id, call_date FROM customer_calls WHERE status = 'planned' AND call_date <= ?", today)) {
    if (!planned.has(k.sales_project_id)) planned.set(k.sales_project_id, []);
    planned.get(k.sales_project_id)!.push(k.call_date);
  }
  return new Map([...planned].map(([id, dates]) => [id, callAlert(dates, today)!]));
}

const vnDate = (d: string) => d.split('-').reverse().join('/');

function addCall(req: Request, c: { id: number; name: string }, sp: { id: number; name: string }, v: ReturnType<typeof cleanCall>) {
  const assignee = activeUser(v.assignee_id ?? req.user.id)!;
  requireMembers(c.id, sp.id, [assignee]);
  const { id } = run('INSERT INTO customer_calls(customer_id, sales_project_id, call_date, assignee_id, note, created_by) VALUES (?,?,?,?,?,?)',
    c.id, sp.id, v.call_date, assignee, v.note, req.user.id);
  // Người khác đặt lịch giao cho mình → báo ngay
  notifyCustomer([assignee], req.user.id, c.id, 'assigned', `call:${sp.id}`, `${c.name} › ${sp.name}: lịch gọi khách hàng ngày ${vnDate(v.call_date)}`);
  return id;
}

/** Lịch gọi :kid của khách hàng — cần quyền perm (dùng chung quyền Trao đổi) và liên quan tới dự án chứa lịch */
function loadCall(req: Request, customerId: number, perm: Permission) {
  const k = get('SELECT * FROM customer_calls WHERE id = ? AND customer_id = ?', Number(req.params.kid), customerId);
  if (!k) throw notFound('Không tìm thấy lịch gọi');
  const sp = loadSalesProjectOf(req.user, customerId, k.sales_project_id, perm);
  return { k, sp };
}

r.post('/:id/projects/:pid/calls', (req, res) => {
  const c = loadCustomer(req, 'ctalk.create');
  const sp = loadSalesProjectOf(req.user, c.id, req.params.pid, 'ctalk.create');
  const v = check(() => cleanCall(req.body || {}));
  const id = addCall(req, c, sp, v);
  res.status(201).json(get(`${CALL_SELECT} WHERE k.id = ?`, id));
});

/** Sửa lịch chờ gọi: ngày, người gọi, ghi chú — đổi ngày thì nhắc lại từ đầu */
r.patch('/:id/calls/:kid', (req, res) => {
  const c = loadCustomer(req, 'ctalk.create');
  const { k, sp } = loadCall(req, c.id, 'ctalk.create');
  if (k.status !== 'planned') throw badRequest('Lịch gọi đã xác nhận, không sửa được');
  const v = check(() => cleanCall({ ...k, ...req.body }));
  const assignee = activeUser(v.assignee_id ?? k.assignee_id ?? req.user.id)!;
  requireMembers(c.id, sp.id, [assignee], [k.assignee_id]);
  run('UPDATE customer_calls SET call_date = ?, assignee_id = ?, note = ?, pinged_on = ?, updated_at = ? WHERE id = ?',
    v.call_date, assignee, v.note, v.call_date === k.call_date ? k.pinged_on : null, now(), k.id);
  if (assignee !== k.assignee_id) notifyCustomer([assignee], req.user.id, c.id, 'assigned', `call:${sp.id}`, `${c.name} › ${sp.name}: lịch gọi khách hàng ngày ${vnDate(v.call_date)}`);
  res.json({ ok: true });
});

/** Xác nhận lịch gọi: Đã gọi / Chưa gọi được (kèm kết quả), có thể đặt luôn lịch kế tiếp */
r.post('/:id/calls/:kid/confirm', (req, res) => {
  const c = loadCustomer(req, 'ctalk.create');
  const { k, sp } = loadCall(req, c.id, 'ctalk.create');
  if (k.status !== 'planned') throw badRequest('Lịch gọi này đã được xác nhận');
  const v = check(() => cleanCallConfirm(req.body || {}));
  const next = tx(() => {
    run('UPDATE customer_calls SET status = ?, result = ?, done_at = ?, done_by = ?, updated_at = ? WHERE id = ?', v.status, v.result, now(), req.user.id, now(), k.id);
    return v.next ? addCall(req, c, sp, { ...v.next, assignee_id: v.next.assignee_id ?? k.assignee_id }) : null;
  });
  res.json({ ok: true, next_id: next });
});

/** Xóa lịch gọi: người đặt lịch tự xóa được; của người khác cần quyền Xóa trao đổi */
r.delete('/:id/calls/:kid', (req, res) => {
  const c = loadCustomer(req);
  const { k } = loadCall(req, c.id, 'ctalk.view');
  const perms = userPermissions(req.user);
  if (!(perms.has('ctalk.create') && k.created_by === req.user.id) && !perms.has('ctalk.delete')) throw forbidden('Bạn chỉ xóa được lịch gọi do mình đặt');
  requireManage(req.user, c.id, k.sales_project_id);
  run('DELETE FROM customer_calls WHERE id = ?', k.id);
  res.json({ ok: true });
});

/** Nhắc lịch gọi: đến ngày gọi mà chưa xác nhận → chuông báo người gọi mỗi ngày một lần */
function pingCalls(today: string) {
  const rows = all(`SELECT k.*, c.name AS customer_name, sp.name AS sales_project_name FROM customer_calls k
    JOIN customers c ON c.id = k.customer_id JOIN sales_projects sp ON sp.id = k.sales_project_id
    WHERE k.status = 'planned' AND k.call_date <= ? AND k.assignee_id IS NOT NULL AND sp.is_archived = 0 AND c.is_archived = 0`, today);
  for (const k of rows) {
    if (!callPingDue(k, today)) continue;
    const late = k.call_date < today ? `quá ${Math.round((Date.parse(today) - Date.parse(k.call_date)) / 86400_000)} ngày` : 'hôm nay';
    notifyCustomer([k.assignee_id], null, k.customer_id, 'ping', `call:${k.sales_project_id}`, `${k.customer_name} › ${k.sales_project_name}: gọi khách hàng (${late})`);
    run('UPDATE customer_calls SET pinged_on = ? WHERE id = ?', today, k.id);
  }
}

// ---------------------------------------------------------------------------
// Công việc kinh doanh
// ---------------------------------------------------------------------------
export const TASK_SELECT = `SELECT t.*, u.full_name AS assignee_name, cb.full_name AS created_by_name, tsp.name AS sales_project_name
  FROM customer_tasks t LEFT JOIN users u ON u.id = t.assignee_id LEFT JOIN users cb ON cb.id = t.created_by LEFT JOIN sales_projects tsp ON tsp.id = t.sales_project_id`;

function check<T>(fn: () => T): T {
  try { return fn(); } catch (e) { throw badRequest(e instanceof Error ? e.message : String(e)); }
}

r.post('/:id/tasks', (req, res) => {
  const c = loadCustomer(req, 'ctask.create');
  const v = check(() => cleanTask(req.body || {}));
  activeUser(v.assignee_id);
  // Việc của một dự án của khách hàng (trống = việc chung của khách hàng)
  const spId = projectOf(req.user, c.id, req.body?.sales_project_id);
  requireManage(req.user, c.id, spId);
  requireMembers(c.id, spId, [v.assignee_id]);
  const { id } = run(`INSERT INTO customer_tasks(customer_id, title, description, assignee_id, due_date, status, created_by, done_at, sales_project_id)
    VALUES (?,?,?,?,?,?,?,?,?)`, c.id, v.title, v.description, v.assignee_id, v.due_date, v.status, req.user.id, v.status === 'done' ? now() : null, spId);
  if (v.assignee_id) notifyCustomer([v.assignee_id], req.user.id, c.id, 'assigned', 'tasks', `${c.name}: ${v.title}`);
  res.status(201).json(get(`${TASK_SELECT} WHERE t.id = ?`, id));
});

/** Công việc :tid của khách hàng — người dùng phải được xem dự án chứa việc (việc chung: được xem khách hàng là đủ) */
function loadTask(req: Request, customerId: number) {
  const t = get('SELECT * FROM customer_tasks WHERE id = ? AND customer_id = ?', Number(req.params.tid), customerId);
  if (!t) throw notFound('Không tìm thấy công việc');
  projectOf(req.user, customerId, t.sales_project_id);
  requireManage(req.user, customerId, t.sales_project_id);
  return t;
}

r.patch('/:id/tasks/:tid', (req, res) => {
  const c = loadCustomer(req, 'ctask.edit');
  const t = loadTask(req, c.id);
  const v = check(() => cleanTask({ ...t, ...req.body }));
  activeUser(v.assignee_id);
  requireMembers(c.id, t.sales_project_id, [v.assignee_id], [t.assignee_id]);
  const doneAt = v.status === 'done' ? t.done_at ?? now() : null;
  run('UPDATE customer_tasks SET title = ?, description = ?, assignee_id = ?, due_date = ?, status = ?, updated_at = ?, done_at = ? WHERE id = ?',
    v.title, v.description, v.assignee_id, v.due_date, v.status, now(), doneAt, t.id);
  if (v.assignee_id && v.assignee_id !== t.assignee_id) notifyCustomer([v.assignee_id], req.user.id, c.id, 'assigned', 'tasks', `${c.name}: ${v.title}`);
  res.json({ ok: true });
});

/** Xóa công việc: người tạo tự xóa được (có quyền Thêm công việc); việc của người khác cần quyền Xóa công việc */
r.delete('/:id/tasks/:tid', (req, res) => {
  const c = loadCustomer(req);
  const t = loadTask(req, c.id);
  const perms = userPermissions(req.user);
  if (!(perms.has('ctask.create') && t.created_by === req.user.id) && !perms.has('ctask.delete')) throw forbidden('Bạn chỉ xóa được công việc do mình tạo');
  run('DELETE FROM customer_tasks WHERE id = ?', t.id);
  res.json({ ok: true });
});

export default r;
