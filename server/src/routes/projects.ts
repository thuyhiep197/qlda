import { Router, type Request } from 'express';
import { all, get, localDate, now, run, tx } from '../db.ts';
import { addHistory } from '../issues.ts';
import { runImport } from '../importer.ts';
import { mapStatusForType, projectStatuses, workflowConfig } from '../workflow.ts';
import { accessibleProjectIds, accountRoleId, badRequest, forbidden, notFound, requireProjectAccess, type Permission, requireUserPerm } from '../permissions.ts';

const r = Router();

export function loadProject(req: Request, perm?: Permission) {
  const key = String(req.params.key || '').toUpperCase();
  const project = get('SELECT * FROM projects WHERE key = ?', key);
  if (!project) throw notFound('Không tìm thấy dự án');
  const perms = requireProjectAccess(req.user, project.id);
  if (perm && !perms.has(perm)) throw forbidden();
  return { project, perms };
}

const DEFAULT_STATUSES: [string, string][] = [
  ['Cần làm', 'todo'],
  ['Đang làm', 'inprogress'],
  ['Đang review', 'inprogress'],
  ['Kiểm thử', 'inprogress'],
  ['Hoàn thành', 'done'],
];

// ---------------------------------------------------------------------------
// Dự án
// ---------------------------------------------------------------------------
r.get('/', (req, res) => {
  const ids = accessibleProjectIds(req.user);
  const showArchived = req.query.archived === '1' && req.user.is_admin;
  const rows = all(`
    SELECT p.*, u.full_name AS lead_name,
      (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) AS member_count,
      (SELECT COUNT(*) FROM issues i JOIN statuses s ON s.id = i.status_id
        WHERE i.project_id = p.id AND s.category <> 'done') AS open_count,
      (SELECT COUNT(*) FROM issues i WHERE i.project_id = p.id) AS issue_count,
      (SELECT r.name FROM project_members pm JOIN users mu ON mu.id = pm.user_id JOIN roles r ON r.id = COALESCE(mu.default_role_id, pm.role_id)
        WHERE pm.project_id = p.id AND pm.user_id = ?) AS my_role
    FROM projects p LEFT JOIN users u ON u.id = p.lead_id
    WHERE p.is_archived = ? ORDER BY p.name`, req.user.id, showArchived ? 1 : 0);
  res.json(ids === 'all' ? rows : rows.filter((p) => ids.includes(p.id)));
});

r.post('/', (req, res) => {
  requireUserPerm(req.user, 'project.create');
  const b = req.body || {};
  const key = String(b.key || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) throw badRequest('Mã dự án 2–10 ký tự, bắt đầu bằng chữ cái, chỉ gồm chữ in hoa và số');
  if (get('SELECT 1 FROM projects WHERE key = ?', key)) throw badRequest('Mã dự án đã tồn tại');
  const name = String(b.name || '').trim();
  if (!name) throw badRequest('Tên dự án không được để trống');
  const type = b.type === 'kanban' ? 'kanban' : 'scrum';
  const leadId = b.lead_id ? Number(b.lead_id) : req.user.id;
  if (!get('SELECT 1 FROM users WHERE id = ? AND is_active = 1', leadId)) throw badRequest('Trưởng dự án không hợp lệ');

  const id = tx(() => {
    const { id } = run('INSERT INTO projects(key, name, description, type, lead_id) VALUES (?,?,?,?,?)',
      key, name, b.description || null, type, leadId);
    DEFAULT_STATUSES.forEach(([n, c], i) => run('INSERT INTO statuses(project_id, name, category, position) VALUES (?,?,?,?)', id, n, c, i));
    run('INSERT INTO project_members(project_id, user_id, role_id) VALUES (?,?,?)', id, leadId, accountRoleId(leadId));
    return id;
  });
  res.status(201).json(get('SELECT * FROM projects WHERE id = ?', id));
});

r.get('/:key', (req, res) => {
  const { project, perms } = loadProject(req);
  const statuses = all('SELECT * FROM statuses WHERE project_id = ? ORDER BY position, id', project.id);
  const members = all(`SELECT u.id, u.username, u.full_name, u.email, u.is_active, u.is_admin,
      COALESCE(u.default_role_id, pm.role_id) AS role_id, r.name AS role_name
    FROM project_members pm JOIN users u ON u.id = pm.user_id JOIN roles r ON r.id = COALESCE(u.default_role_id, pm.role_id)
    WHERE pm.project_id = ? ORDER BY u.full_name`, project.id);
  const { transitions, type_statuses } = workflowConfig(project.id);
  // Như Jira (sprint song song): có thể có nhiều sprint cùng chạy
  const activeSprints = all("SELECT * FROM sprints WHERE project_id = ? AND state = 'active' ORDER BY start_date, id", project.id);
  const lead = get('SELECT id, full_name FROM users WHERE id = ?', project.lead_id) ?? null;
  const labels = new Set<string>();
  for (const row of all<{ labels: string }>('SELECT DISTINCT labels FROM issues WHERE project_id = ? AND labels IS NOT NULL', project.id)) {
    row.labels.split(',').forEach((l) => l && labels.add(l));
  }
  res.json({
    ...project, lead, statuses, members, transitions, type_statuses, active_sprint: activeSprints[0] ?? null, active_sprints: activeSprints,
    labels: [...labels].sort(), permissions: [...perms],
  });
});

r.patch('/:key', (req, res) => {
  const { project } = loadProject(req, 'project.admin');
  const b = req.body || {};
  const name = b.name !== undefined ? String(b.name).trim() : project.name;
  if (!name) throw badRequest('Tên dự án không được để trống');
  const type = b.type !== undefined ? (b.type === 'kanban' ? 'kanban' : 'scrum') : project.type;
  const leadId = b.lead_id !== undefined ? Number(b.lead_id) : project.lead_id;
  run('UPDATE projects SET name = ?, description = ?, type = ?, lead_id = ? WHERE id = ?',
    name, b.description !== undefined ? b.description || null : project.description, type, leadId, project.id);
  res.json({ ok: true });
});

r.post('/:key/archive', (req, res) => {
  requireUserPerm(req.user, 'project.delete');
  const project = get('SELECT * FROM projects WHERE key = ?', String(req.params.key).toUpperCase());
  if (!project) throw notFound();
  run('UPDATE projects SET is_archived = ? WHERE id = ?', req.body?.archived === false ? 0 : 1, project.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Thành viên
// ---------------------------------------------------------------------------
r.post('/:key/members', (req, res) => {
  const { project } = loadProject(req, 'project.admin');
  const ids: number[] = (Array.isArray(req.body?.user_ids) ? req.body.user_ids : [req.body?.user_id]).map(Number);
  tx(() => {
    for (const userId of ids) {
      if (!get('SELECT 1 FROM users WHERE id = ? AND is_active = 1', userId)) throw badRequest('Người dùng không hợp lệ');
      run('INSERT OR IGNORE INTO project_members(project_id, user_id, role_id) VALUES (?,?,?)', project.id, userId, accountRoleId(userId));
    }
  });
  res.status(201).json({ ok: true });
});

r.delete('/:key/members/:userId', (req, res) => {
  const { project } = loadProject(req, 'project.admin');
  const userId = Number(req.params.userId);
  if (userId === req.user.id && !req.user.is_admin) throw badRequest('Không thể tự xóa mình khỏi dự án');
  run('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', project.id, userId);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Trạng thái & workflow
// ---------------------------------------------------------------------------
const CATEGORIES = ['todo', 'inprogress', 'done'];

r.post('/:key/statuses', (req, res) => {
  const { project } = loadProject(req, 'project.admin');
  const name = String(req.body?.name || '').trim();
  const category = String(req.body?.category || 'inprogress');
  if (!name) throw badRequest('Tên trạng thái không được để trống');
  if (!CATEGORIES.includes(category)) throw badRequest('Nhóm trạng thái không hợp lệ');
  const pos = (get('SELECT MAX(position) m FROM statuses WHERE project_id = ?', project.id)?.m ?? -1) + 1;
  const { id } = run('INSERT INTO statuses(project_id, name, category, position) VALUES (?,?,?,?)', project.id, name, category, pos);
  res.status(201).json({ id });
});

r.put('/:key/statuses/order', (req, res) => {
  const { project } = loadProject(req, 'project.admin');
  const ids: number[] = (req.body?.ids || []).map(Number);
  tx(() => ids.forEach((id, i) => run('UPDATE statuses SET position = ? WHERE id = ? AND project_id = ?', i, id, project.id)));
  res.json({ ok: true });
});

r.patch('/:key/statuses/:id', (req, res) => {
  const { project } = loadProject(req, 'project.admin');
  const s = get('SELECT * FROM statuses WHERE id = ? AND project_id = ?', Number(req.params.id), project.id);
  if (!s) throw notFound();
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : s.name;
  const category = req.body?.category ?? s.category;
  if (!name) throw badRequest('Tên trạng thái không được để trống');
  if (!CATEGORIES.includes(category)) throw badRequest('Nhóm trạng thái không hợp lệ');
  const wip = req.body?.wip_limit !== undefined ? (Number(req.body.wip_limit) > 0 ? Number(req.body.wip_limit) : null) : s.wip_limit;
  run('UPDATE statuses SET name = ?, category = ?, wip_limit = ? WHERE id = ?', name, category, wip, s.id);
  res.json({ ok: true });
});

r.delete('/:key/statuses/:id', (req, res) => {
  const { project } = loadProject(req, 'project.admin');
  const s = get('SELECT * FROM statuses WHERE id = ? AND project_id = ?', Number(req.params.id), project.id);
  if (!s) throw notFound();
  if (get<{ c: number }>('SELECT COUNT(*) c FROM statuses WHERE project_id = ?', project.id)!.c <= 1) {
    throw badRequest('Dự án phải có ít nhất một trạng thái');
  }
  const inUse = get<{ c: number }>('SELECT COUNT(*) c FROM issues WHERE status_id = ?', s.id)!.c;
  tx(() => {
    if (inUse) {
      const target = get('SELECT * FROM statuses WHERE id = ? AND project_id = ?', Number(req.query.moveTo), project.id);
      if (!target || target.id === s.id) throw badRequest(`Có ${inUse} issue đang ở trạng thái này, hãy chọn trạng thái để chuyển sang`);
      run('DELETE FROM type_statuses WHERE status_id = ?', s.id);
      for (const i of all<{ id: number; type: string }>('SELECT id, type FROM issues WHERE status_id = ?', s.id)) {
        // Trạng thái đích phải thuộc workflow của loại issue; nếu không thì lấy trạng thái cùng nhóm
        const to = get('SELECT * FROM statuses WHERE id = ?', mapStatusForType(project.id, i.type, target.id))!;
        addHistory(i.id, req.user.id, 'status', s.id, to.id, s.name, to.name);
        run(`UPDATE issues SET status_id = ?, resolved_at = CASE WHEN ? = 'done' THEN COALESCE(resolved_at, ?) ELSE NULL END WHERE id = ?`,
          to.id, to.category, now(), i.id);
      }
    }
    run('DELETE FROM statuses WHERE id = ?', s.id);
  });
  res.json({ ok: true });
});

const ISSUE_TYPE_KEYS = ['epic', 'story', 'task', 'bug', 'subtask'];

/**
 * Luồng chuyển trạng thái. issue_type = '' là luồng chung; truyền một loại issue để đặt luồng riêng cho loại đó,
 * kèm use_default = true để bỏ luồng riêng (quay về luồng chung).
 */
r.put('/:key/workflow', (req, res) => {
  const { project } = loadProject(req, 'project.admin');
  const scope = String(req.body?.issue_type ?? '');
  if (scope && !ISSUE_TYPE_KEYS.includes(scope)) throw badRequest('Loại issue không hợp lệ');
  const list: { from_status_id: number; to_status_id: number }[] = req.body?.transitions || [];
  const valid = new Set(all('SELECT id FROM statuses WHERE project_id = ?', project.id).map((s) => s.id));
  tx(() => {
    if (req.body?.strict !== undefined) run('UPDATE projects SET workflow_strict = ? WHERE id = ?', !!req.body.strict, project.id);
    if (req.body?.transitions === undefined && !req.body?.use_default) return;
    run('DELETE FROM transitions WHERE project_id = ? AND issue_type = ?', project.id, scope);
    if (scope && req.body?.use_default) return;
    for (const t of list) {
      const f = Number(t.from_status_id), to = Number(t.to_status_id);
      if (f !== to && valid.has(f) && valid.has(to)) {
        run('INSERT OR IGNORE INTO transitions(project_id, issue_type, from_status_id, to_status_id) VALUES (?,?,?,?)', project.id, scope, f, to);
      }
    }
  });
  res.json({ ok: true });
});

/**
 * Tập trạng thái của một loại issue. status_ids = null → dùng toàn bộ trạng thái của dự án.
 * Issue đang ở trạng thái bị bỏ sẽ được chuyển sang trạng thái cùng nhóm; dry_run = true chỉ trả về kế hoạch chuyển.
 */
r.put('/:key/type-statuses', (req, res) => {
  const { project } = loadProject(req, 'project.admin');
  const type = String(req.body?.issue_type || '');
  if (!ISSUE_TYPE_KEYS.includes(type)) throw badRequest('Loại issue không hợp lệ');
  const all_ = projectStatuses(project.id);
  const raw = req.body?.status_ids;
  const ids: number[] | null = raw === null ? null : Array.isArray(raw) ? [...new Set(raw.map(Number))] : null;
  if (ids) {
    if (!ids.length) throw badRequest('Loại issue phải dùng ít nhất một trạng thái');
    if (ids.some((id) => !all_.some((s) => s.id === id))) throw badRequest('Trạng thái không hợp lệ');
  }
  const keep = ids ? all_.filter((s) => ids.includes(s.id)) : all_;
  const pick = (from: { category: string }) => keep.find((s) => s.category === from.category) ?? keep.find((s) => s.category === 'todo') ?? keep[0];
  // Kế hoạch chuyển trạng thái cho issue đang ở trạng thái bị bỏ
  const affected = all<{ id: number; status_id: number }>('SELECT id, status_id FROM issues WHERE project_id = ? AND type = ?', project.id, type)
    .filter((i) => !keep.some((s) => s.id === i.status_id));
  const moves = new Map<string, { from: string; to: string; count: number }>();
  for (const i of affected) {
    const from = all_.find((s) => s.id === i.status_id)!;
    const to = pick(from);
    const k = `${from.id}-${to.id}`;
    moves.set(k, { from: from.name, to: to.name, count: (moves.get(k)?.count ?? 0) + 1 });
  }
  if (req.body?.dry_run) { res.json({ moves: [...moves.values()] }); return; }
  tx(() => {
    run('DELETE FROM type_statuses WHERE project_id = ? AND issue_type = ?', project.id, type);
    if (ids && ids.length < all_.length) {
      for (const id of ids) run('INSERT INTO type_statuses(project_id, issue_type, status_id) VALUES (?,?,?)', project.id, type, id);
    }
    for (const i of affected) {
      const from = all_.find((s) => s.id === i.status_id)!;
      const to = pick(from);
      addHistory(i.id, req.user.id, 'status', from.id, to.id, from.name, to.name);
      run(`UPDATE issues SET status_id = ?, resolved_at = CASE WHEN ? = 'done' THEN COALESCE(resolved_at, ?) ELSE NULL END WHERE id = ?`,
        to.id, to.category, now(), i.id);
    }
  });
  res.json({ ok: true, moves: [...moves.values()] });
});

// ---------------------------------------------------------------------------
// Sprint
// ---------------------------------------------------------------------------
r.get('/:key/sprints', (req, res) => {
  const { project } = loadProject(req);
  const state = req.query.state ? String(req.query.state).split(',') : ['future', 'active', 'closed'];
  const rows = all(`
    SELECT sp.*,
      (SELECT COUNT(*) FROM issues i WHERE i.sprint_id = sp.id AND i.type <> 'subtask') AS issue_count,
      (SELECT COALESCE(SUM(i.story_points),0) FROM issues i WHERE i.sprint_id = sp.id AND i.type <> 'subtask') AS points,
      (SELECT COALESCE(SUM(i.story_points),0) FROM issues i JOIN statuses s ON s.id = i.status_id
        WHERE i.sprint_id = sp.id AND i.type <> 'subtask' AND s.category = 'done') AS done_points
    FROM sprints sp WHERE sp.project_id = ?
    ORDER BY CASE sp.state WHEN 'active' THEN 0 WHEN 'future' THEN 1 ELSE 2 END, sp.id`, project.id);
  res.json(rows.filter((s) => state.includes(s.state)));
});

r.post('/:key/sprints', (req, res) => {
  const { project } = loadProject(req, 'sprint.create');
  const id = tx(() => {
    run('UPDATE projects SET sprint_seq = sprint_seq + 1 WHERE id = ?', project.id);
    const seq = get('SELECT sprint_seq FROM projects WHERE id = ?', project.id)!.sprint_seq;
    const name = String(req.body?.name || '').trim() || `${project.key} Sprint ${seq}`;
    return run('INSERT INTO sprints(project_id, name, goal) VALUES (?,?,?)', project.id, name, req.body?.goal || null).id;
  });
  res.status(201).json(get('SELECT * FROM sprints WHERE id = ?', id));
});

/** Ngày muộn nhất trong kế hoạch (hạn hoàn thành/ngày bắt đầu của issue) — mốc để tạo loạt sprint. */
r.get('/:key/sprints/plan-end', (req, res) => {
  const { project } = loadProject(req);
  const row = get(`SELECT MAX(COALESCE(due_date, start_date)) AS d FROM issues WHERE project_id = ?`, project.id);
  res.json({ plan_end: row?.d ?? null });
});

/** Tạo nhiều sprint một lần (theo quy luật người dùng đã xem trước). Tất cả hoặc không gì cả. */
r.post('/:key/sprints/batch', (req, res) => {
  const { project } = loadProject(req, 'sprint.create');
  const list = Array.isArray(req.body?.sprints) ? req.body.sprints : [];
  if (!list.length) throw badRequest('Chưa có sprint nào để tạo');
  if (list.length > 100) throw badRequest('Tối đa 100 sprint mỗi lần');
  const rows = list.map((s: any, i: number) => {
    const name = String(s?.name || '').trim();
    if (!name) throw badRequest(`Sprint thứ ${i + 1}: thiếu tên`);
    const start = checkDate(s.start_date, `Sprint "${name}": ngày bắt đầu`);
    const end = checkDate(s.end_date, `Sprint "${name}": ngày kết thúc`);
    if (start && end && end < start) throw badRequest(`Sprint "${name}": ngày kết thúc phải sau ngày bắt đầu`);
    return { name, start, end, goal: s.goal ? String(s.goal) : null };
  });
  const ids = tx(() => rows.map((s: { name: string; start: string | null; end: string | null; goal: string | null }) => {
    run('UPDATE projects SET sprint_seq = sprint_seq + 1 WHERE id = ?', project.id);
    return run('INSERT INTO sprints(project_id, name, goal, start_date, end_date) VALUES (?,?,?,?,?)',
      project.id, s.name, s.goal, s.start, s.end).id;
  }));
  res.status(201).json({ created: ids.length });
});

function loadSprint(req: Request, perm: Permission = 'sprint.edit') {
  const { project } = loadProject(req, perm);
  const sprint = get('SELECT * FROM sprints WHERE id = ? AND project_id = ?', Number(req.params.id), project.id);
  if (!sprint) throw notFound('Không tìm thấy sprint');
  return { project, sprint };
}

function checkDate(v: unknown, label: string) {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw badRequest(`${label} không hợp lệ`);
  return String(v);
}

r.patch('/:key/sprints/:id', (req, res) => {
  const { sprint } = loadSprint(req);
  if (sprint.state === 'closed') throw badRequest('Sprint đã đóng, không thể sửa');
  const b = req.body || {};
  const name = b.name !== undefined ? String(b.name).trim() : sprint.name;
  if (!name) throw badRequest('Tên sprint không được để trống');
  const start = b.start_date !== undefined ? checkDate(b.start_date, 'Ngày bắt đầu') : sprint.start_date;
  const end = b.end_date !== undefined ? checkDate(b.end_date, 'Ngày kết thúc') : sprint.end_date;
  if (start && end && end < start) throw badRequest('Ngày kết thúc phải sau ngày bắt đầu');
  run('UPDATE sprints SET name = ?, goal = ?, start_date = ?, end_date = ? WHERE id = ?',
    name, b.goal !== undefined ? b.goal || null : sprint.goal, start, end, sprint.id);
  res.json({ ok: true });
});

r.post('/:key/sprints/:id/start', (req, res) => {
  const { project, sprint } = loadSprint(req);
  if (sprint.state !== 'future') throw badRequest('Chỉ bắt đầu được sprint chưa chạy');
  const b = req.body || {};
  const start = checkDate(b.start_date, 'Ngày bắt đầu') || localDate();
  const end = checkDate(b.end_date, 'Ngày kết thúc');
  if (!end) throw badRequest('Cần chọn ngày kết thúc sprint');
  if (end < start) throw badRequest('Ngày kết thúc phải sau ngày bắt đầu');
  const stats = get(`SELECT COUNT(*) c, COALESCE(SUM(story_points),0) p FROM issues WHERE sprint_id = ? AND type <> 'subtask'`, sprint.id)!;
  run(`UPDATE sprints SET state = 'active', name = ?, goal = ?, start_date = ?, end_date = ?, started_at = ?,
       committed_points = ?, committed_issues = ? WHERE id = ?`,
  String(b.name || sprint.name), b.goal !== undefined ? b.goal || null : sprint.goal, start, end, now(), stats.p, stats.c, sprint.id);
  res.json({ ok: true });
});

r.post('/:key/sprints/:id/complete', (req, res) => {
  const { project, sprint } = loadSprint(req);
  if (sprint.state !== 'active') throw badRequest('Chỉ hoàn thành được sprint đang chạy');
  const moveTo = req.body?.move_to;
  tx(() => {
    let target: number | null = null;
    if (moveTo === 'new') {
      run('UPDATE projects SET sprint_seq = sprint_seq + 1 WHERE id = ?', project.id);
      const seq = get('SELECT sprint_seq FROM projects WHERE id = ?', project.id)!.sprint_seq;
      target = run('INSERT INTO sprints(project_id, name) VALUES (?,?)', project.id, `${project.key} Sprint ${seq}`).id;
    } else if (moveTo && moveTo !== 'backlog') {
      const t = get("SELECT * FROM sprints WHERE id = ? AND project_id = ? AND state IN ('future','active') AND id <> ?", Number(moveTo), project.id, sprint.id);
      if (!t) throw badRequest('Sprint đích không hợp lệ');
      target = t.id;
    }
    const targetName = target ? get('SELECT name FROM sprints WHERE id = ?', target)!.name : null;
    const ts = now();
    const stats = get(`SELECT COUNT(*) c, COALESCE(SUM(i.story_points),0) p FROM issues i JOIN statuses s ON s.id = i.status_id
      WHERE i.sprint_id = ? AND i.type <> 'subtask' AND s.category = 'done'`, sprint.id)!;
    const open = all(`SELECT i.id FROM issues i JOIN statuses s ON s.id = i.status_id
      LEFT JOIN issues par ON par.id = i.parent_id LEFT JOIN statuses ps ON ps.id = par.status_id
      WHERE i.sprint_id = ? AND (s.category <> 'done' OR (i.type = 'subtask' AND ps.category <> 'done'))`, sprint.id);
    for (const i of open) {
      run('UPDATE issues SET sprint_id = ?, updated_at = ? WHERE id = ?', target, ts, i.id);
      addHistory(i.id, req.user.id, 'sprint', sprint.id, target, sprint.name, targetName);
    }
    run(`UPDATE sprints SET state = 'closed', completed_at = ?, completed_points = ?, completed_issues = ? WHERE id = ?`,
      ts, stats.p, stats.c, sprint.id);
  });
  res.json({ ok: true });
});

r.delete('/:key/sprints/:id', (req, res) => {
  const { sprint } = loadSprint(req, 'sprint.delete');
  if (sprint.state !== 'future') throw badRequest('Chỉ xóa được sprint chưa bắt đầu');
  tx(() => {
    for (const i of all('SELECT id FROM issues WHERE sprint_id = ?', sprint.id)) {
      addHistory(i.id, req.user.id, 'sprint', sprint.id, null, sprint.name, null);
    }
    run('UPDATE issues SET sprint_id = NULL WHERE sprint_id = ?', sprint.id);
    run('DELETE FROM sprints WHERE id = ?', sprint.id);
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Nhập issue từ file (xem trước: commit=false, nhập thật: commit=true)
// ---------------------------------------------------------------------------
r.post('/:key/import', (req, res) => {
  const { project, perms } = loadProject(req);
  res.json(runImport(req.user, project.id, perms, req.body?.rows, req.body?.commit === true));
});

export default r;
