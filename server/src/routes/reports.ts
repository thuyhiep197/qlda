import { Router } from 'express';
import { all, get, localDate } from '../db.ts';
import { accessibleProjectIds, badRequest, notFound } from '../permissions.ts';
import { listIssues } from '../issues.ts';
import { loadProject } from './projects.ts';

const r = Router();

/** 00:00 giờ địa phương của ngày YYYY-MM-DD (máy chủ chạy TZ=Asia/Ho_Chi_Minh). */
const dayStart = (d: string) => new Date(`${d}T00:00:00`);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Trang chủ
// ---------------------------------------------------------------------------
r.get('/dashboard', (req, res) => {
  const user = req.user;
  const ids = accessibleProjectIds(user);
  const scope = ids === 'all' ? '1=1' : ids.length ? `i.project_id IN (${ids.join(',')})` : '0=1';
  const today = localDate();
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

  const mine = listIssues(user, { assignee: 'me', statusCategory: 'todo,inprogress', sort: 'priority', limit: '100' });
  const stats = get(`
    SELECT
      SUM(CASE WHEN i.assignee_id = ? AND s.category <> 'done' THEN 1 ELSE 0 END) AS assigned_open,
      SUM(CASE WHEN i.assignee_id = ? AND s.category = 'inprogress' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN i.assignee_id = ? AND s.category <> 'done' AND i.due_date < ? THEN 1 ELSE 0 END) AS overdue,
      SUM(CASE WHEN i.assignee_id = ? AND s.category = 'done' AND i.resolved_at >= ? THEN 1 ELSE 0 END) AS done_week,
      SUM(CASE WHEN i.reporter_id = ? AND s.category <> 'done' THEN 1 ELSE 0 END) AS reported_open
    FROM issues i JOIN statuses s ON s.id = i.status_id JOIN projects p ON p.id = i.project_id
    WHERE p.is_archived = 0 AND ${scope}`, user.id, user.id, user.id, today, user.id, weekAgo, user.id);
  const activity = all(`
    SELECT h.id, h.field, h.old_label, h.new_label, h.created_at, u.full_name AS user_name,
      i.key, i.summary, i.type
    FROM issue_history h JOIN issues i ON i.id = h.issue_id LEFT JOIN users u ON u.id = h.user_id
    JOIN projects p ON p.id = i.project_id
    WHERE p.is_archived = 0 AND ${scope} AND h.field IN ('created','status','assignee','sprint')
    ORDER BY h.created_at DESC, h.id DESC LIMIT 30`);
  // BA: việc của mô-đun mình phụ trách đang ở bước kiểm thử
  const toTest = listIssues(user, { ba: 'me', statusCategory: 'inprogress', sort: 'priority', limit: '100' })
    .filter((i: any) => /kiểm thử|kiem thu|test|qa/i.test(i.status_name));
  const myModules = all(`SELECT c.id, c.name, c.side, p.key AS project_key,
      (SELECT COUNT(*) FROM issues i WHERE i.component_id = c.id AND i.type NOT IN ('epic','subtask')) AS total,
      (SELECT COUNT(*) FROM issues i JOIN statuses s ON s.id = i.status_id WHERE i.component_id = c.id AND i.type NOT IN ('epic','subtask') AND s.category = 'done') AS done,
      (SELECT COUNT(*) FROM issues i JOIN statuses s ON s.id = i.status_id WHERE i.component_id = c.id AND i.type NOT IN ('epic','subtask') AND s.category = 'inprogress') AS inprogress
    FROM components c JOIN projects p ON p.id = c.project_id WHERE c.lead_id = ? AND p.is_archived = 0 ORDER BY p.key, c.position`, user.id);
  res.json({ stats, mine, activity, toTest, myModules });
});

// ---------------------------------------------------------------------------
// Báo cáo dự án
// ---------------------------------------------------------------------------
r.get('/projects/:key/summary', (req, res) => {
  const { project } = loadProject(req, 'report.view');
  const pid = project.id;
  const byStatus = all(`SELECT s.id, s.name, s.category, COUNT(i.id) AS count FROM statuses s
    LEFT JOIN issues i ON i.status_id = s.id AND i.type <> 'epic'
    WHERE s.project_id = ? GROUP BY s.id ORDER BY s.position`, pid);
  const byType = all(`SELECT type AS name, COUNT(*) AS count FROM issues WHERE project_id = ? GROUP BY type`, pid);
  const byPriority = all(`SELECT i.priority AS name, COUNT(*) AS count FROM issues i JOIN statuses s ON s.id = i.status_id
    WHERE i.project_id = ? AND s.category <> 'done' AND i.type <> 'epic' GROUP BY i.priority`, pid);
  const byAssignee = all(`
    SELECT COALESCE(u.full_name, 'Chưa giao') AS name, i.assignee_id AS id,
      SUM(CASE WHEN s.category = 'todo' THEN 1 ELSE 0 END) AS todo,
      SUM(CASE WHEN s.category = 'inprogress' THEN 1 ELSE 0 END) AS inprogress,
      SUM(CASE WHEN s.category = 'done' THEN 1 ELSE 0 END) AS done,
      COALESCE(SUM(CASE WHEN s.category <> 'done' THEN i.story_points END), 0) AS open_points
    FROM issues i JOIN statuses s ON s.id = i.status_id LEFT JOIN users u ON u.id = i.assignee_id
    WHERE i.project_id = ? AND i.type <> 'epic'
    GROUP BY i.assignee_id ORDER BY (todo + inprogress) DESC`, pid);

  const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 180);
  // Nhóm theo ngày giờ Việt Nam (múi giờ máy chủ), không theo UTC
  const firstDay = addDays(localDate(), -(days - 1));
  const since = dayStart(firstDay).toISOString();
  const count = (col: 'created_at' | 'resolved_at') => {
    const m = new Map<string, number>();
    for (const x of all<{ t: string }>(`SELECT ${col} t FROM issues WHERE project_id = ? AND type <> 'epic' AND ${col} >= ?`, pid, since)) {
      const d = localDate(new Date(x.t));
      m.set(d, (m.get(d) || 0) + 1);
    }
    return m;
  };
  const cMap = count('created_at'), rMap = count('resolved_at');
  const trend = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(firstDay, i);
    trend.push({ date: d, created: cMap.get(d) || 0, resolved: rMap.get(d) || 0 });
  }
  const today = localDate();
  const overdue = listIssues(req.user, { project: project.key, statusCategory: 'todo,inprogress', sort: 'due' })
    .filter((i: any) => i.due_date && i.due_date < today && i.type !== 'epic');
  res.json({ byStatus, byType, byPriority, byAssignee, trend, overdue });
});

/**
 * Dashboard dự án: tiến độ thực tế so với kế hoạch (theo hạn hoàn thành), từng giai đoạn (Epic),
 * sprint đang chạy, mô-đun (nhãn), khối lượng theo người, việc quá hạn/sắp đến hạn, mốc sắp tới.
 */
r.get('/projects/:key/dashboard', (req, res) => {
  const { project } = loadProject(req, 'dashboard.view');
  const pid = project.id;
  const today = localDate();
  const in7 = addDays(today, 7);
  type Row = { id: number; key: string; type: string; summary: string; parent_id: number | null; start_date: string | null;
    due_date: string | null; story_points: number | null; labels: string | null; assignee_id: number | null; category: string;
    status_name: string; sprint_id: number | null; component_id: number | null };
  const rows = all<Row>(`SELECT i.id, i.key, i.type, i.summary, i.parent_id, i.start_date, i.due_date, i.story_points, i.labels,
      i.assignee_id, i.sprint_id, i.component_id, s.category, s.name AS status_name
    FROM issues i JOIN statuses s ON s.id = i.status_id WHERE i.project_id = ?`, pid);
  const work = rows.filter((i) => i.type !== 'epic' && i.type !== 'subtask');
  const done = (i: Row) => i.category === 'done';
  const pts = (list: Row[]) => list.reduce((a, i) => a + (i.story_points || 0), 0);
  // Tiến độ: đếm theo số issue (Story/Task/Bug), không dùng điểm ước lượng
  const measure = (list: Row[]) => {
    const total = list.length;
    const actual = list.filter(done).length;
    const planned = list.filter((i) => i.due_date && i.due_date < today).length;
    return {
      total_issues: list.length, done_issues: list.filter(done).length,
      inprogress_issues: list.filter((i) => i.category === 'inprogress').length,
      points: pts(list), done_points: pts(list.filter(done)),
      pct_done: total ? Math.round((actual / total) * 100) : 0,
      pct_planned: total ? Math.round((planned / total) * 100) : 0,
      overdue: list.filter((i) => !done(i) && i.due_date && i.due_date < today).length,
    };
  };
  const dates = (list: Row[]) => {
    const s = list.map((i) => i.start_date || i.due_date).filter(Boolean).sort() as string[];
    const d = list.map((i) => i.due_date || i.start_date).filter(Boolean).sort() as string[];
    return { start: s[0] ?? null, end: d[d.length - 1] ?? null };
  };
  const health = (m: ReturnType<typeof measure>, end: string | null) =>
    m.total_issues && m.done_issues === m.total_issues ? 'done'
      : m.overdue > 0 && end && end < today ? 'late'
        : m.pct_done + 10 < m.pct_planned ? 'behind'
          : m.done_issues === 0 && m.inprogress_issues === 0 ? 'not_started' : 'on_track';

  const overall = measure(work);
  const span = dates(work);
  const elapsed = span.start && span.end
    ? Math.min(100, Math.max(0, Math.round(((Date.parse(today) - Date.parse(span.start)) / Math.max(1, Date.parse(span.end) - Date.parse(span.start) + 86400_000)) * 100)))
    : 0;

  const epics = rows.filter((i) => i.type === 'epic').map((e) => {
    const kids = work.filter((i) => i.parent_id === e.id);
    const m = measure(kids);
    const d = dates(kids);
    const start = e.start_date || d.start, end = e.due_date || d.end;
    return { id: e.id, key: e.key, summary: e.summary, start_date: start, due_date: end, status_name: e.status_name, ...m, health: health(m, end) };
  }).sort((a, b) => (a.start_date || '9').localeCompare(b.start_date || '9') || a.id - b.id);

  const modules = new Map<string, Row[]>();
  for (const i of work) for (const l of (i.labels || '').split(',').filter(Boolean)) modules.set(l, [...(modules.get(l) || []), i]);
  const labels = [...modules.entries()].map(([name, list]) => ({ name, ...measure(list), ...dates(list) }))
    .sort((a, b) => (a.start || '9').localeCompare(b.start || '9'));

  // Mô-đun (Component) kèm BA phụ trách
  const components = all<{ id: number; name: string; side: string | null; lead_name: string | null }>(
    'SELECT c.id, c.name, c.side, u.full_name AS lead_name FROM components c LEFT JOIN users u ON u.id = c.lead_id WHERE c.project_id = ? ORDER BY c.position, c.id', pid,
  ).map((c) => { const list = work.filter((i) => i.component_id === c.id); return { ...c, ...measure(list), ...dates(list) }; });

  const active = all<{ id: number; name: string; start_date: string; end_date: string; goal: string | null }>(
    `SELECT id, name, start_date, end_date, goal FROM sprints WHERE project_id = ? AND state = 'active' ORDER BY start_date, id`, pid);
  const sprints = active.map((s) => {
    const list = work.filter((i) => i.sprint_id === s.id);
    const len = Math.max(1, Date.parse(s.end_date) - Date.parse(s.start_date) + 86400_000);
    return { ...s, ...measure(list),
      days_left: Math.ceil((Date.parse(s.end_date) - Date.parse(today)) / 86400_000),
      pct_time: Math.min(100, Math.max(0, Math.round(((Date.parse(today) - Date.parse(s.start_date) + 86400_000) / len) * 100))) };
  });
  const next = get(`SELECT id, name, start_date, end_date FROM sprints WHERE project_id = ? AND state = 'future' ORDER BY COALESCE(start_date, '9'), id LIMIT 1`, pid) ?? null;

  const byAssignee = all(`SELECT COALESCE(u.full_name, 'Chưa giao') AS name,
      SUM(CASE WHEN s.category = 'todo' THEN 1 ELSE 0 END) AS todo,
      SUM(CASE WHEN s.category = 'inprogress' THEN 1 ELSE 0 END) AS inprogress,
      SUM(CASE WHEN s.category <> 'done' AND i.due_date < ? THEN 1 ELSE 0 END) AS overdue
    FROM issues i JOIN statuses s ON s.id = i.status_id LEFT JOIN users u ON u.id = i.assignee_id
    WHERE i.project_id = ? AND i.type NOT IN ('epic') AND s.category <> 'done'
    GROUP BY i.assignee_id ORDER BY (todo + inprogress) DESC`, today, pid);

  const open = listIssues(req.user, { project: project.key, statusCategory: 'todo,inprogress', sort: 'due' })
    .filter((i: any) => i.type !== 'epic' && i.due_date);
  const overdueList = open.filter((i: any) => i.due_date < today).slice(0, 15);
  const upcomingAll = open.filter((i: any) => i.type !== 'subtask' && i.due_date >= today && i.due_date <= in7);
  const upcoming = upcomingAll.slice(0, 15);
  const milestones = rows.filter((i) => (i.labels || '').split(',').includes('mốc') || i.type === 'epic')
    .filter((i) => i.due_date && i.due_date >= today && !done(i))
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!)).slice(0, 6)
    .map((i) => ({ key: i.key, type: i.type, summary: i.summary, due_date: i.due_date, days: Math.round((Date.parse(i.due_date!) - Date.parse(today)) / 86400_000) }));

  const activity = all(`SELECT h.id, h.field, h.old_label, h.new_label, h.created_at, u.full_name AS user_name, i.key, i.summary, i.type
    FROM issue_history h JOIN issues i ON i.id = h.issue_id LEFT JOIN users u ON u.id = h.user_id
    WHERE i.project_id = ? AND h.field IN ('created','status','assignee') ORDER BY h.created_at DESC, h.id DESC LIMIT 12`, pid);
  const doneWeek = get<{ c: number }>(`SELECT COUNT(*) c FROM issues i JOIN statuses s ON s.id = i.status_id
    WHERE i.project_id = ? AND i.type NOT IN ('epic','subtask') AND s.category = 'done' AND i.resolved_at >= ?`,
  pid, dayStart(addDays(today, -6)).toISOString())!.c;

  res.json({ today, overall: { ...overall, ...span, pct_time: elapsed, health: health(overall, span.end), done_week: doneWeek, upcoming_count: upcomingAll.length },
    epics, labels, components, sprints, next_sprint: next, byAssignee, overdue: overdueList, upcoming, milestones, activity });
});

r.get('/projects/:key/velocity', (req, res) => {
  const { project } = loadProject(req, 'report.view');
  const sprints = all(`SELECT id, name, start_date, end_date, completed_at, committed_points, completed_points,
      committed_issues, completed_issues
    FROM sprints WHERE project_id = ? AND state = 'closed' ORDER BY completed_at DESC LIMIT 10`, project.id).reverse();
  res.json(sprints);
});

/**
 * Burndown: dựng lại trạng thái của từng issue theo từng ngày từ lịch sử thay đổi
 * (trường sprint và status), tính tổng story point còn lại cuối mỗi ngày.
 */
r.get('/projects/:key/burndown', (req, res) => {
  const { project } = loadProject(req, 'report.view');
  const sprintId = Number(req.query.sprint);
  const sprint = get("SELECT * FROM sprints WHERE id = ? AND project_id = ? AND state <> 'future'", sprintId, project.id);
  if (!sprint) throw notFound('Không tìm thấy sprint');
  if (!sprint.start_date || !sprint.end_date) throw badRequest('Sprint chưa có ngày bắt đầu/kết thúc');

  const categories = new Map(all('SELECT id, category FROM statuses WHERE project_id = ?', project.id).map((s) => [String(s.id), s.category]));
  const sid = String(sprint.id);
  const candidates = all(`SELECT id, status_id, sprint_id, story_points FROM issues
    WHERE project_id = ? AND type <> 'subtask' AND (sprint_id = ? OR id IN (
      SELECT issue_id FROM issue_history WHERE field = 'sprint' AND (old_value = ? OR new_value = ?)))`,
  project.id, sprint.id, sid, sid);
  const events = new Map<number, any[]>();
  if (candidates.length) {
    const hist = all(`SELECT issue_id, field, old_value, new_value, created_at FROM issue_history
      WHERE issue_id IN (${candidates.map((c) => c.id).join(',')}) AND field IN ('sprint','status')
      ORDER BY created_at DESC, id DESC`);
    for (const h of hist) {
      if (!events.has(h.issue_id)) events.set(h.issue_id, []);
      events.get(h.issue_id)!.push(h);
    }
  }

  // Trạng thái (sprint, status) của issue tại thời điểm t: lấy giá trị hiện tại rồi hoàn tác các thay đổi sau t
  const stateAt = (issue: any, t: string) => {
    let sp = issue.sprint_id == null ? null : String(issue.sprint_id);
    let st = String(issue.status_id);
    for (const e of events.get(issue.id) || []) {
      if (e.created_at <= t) break;
      if (e.field === 'sprint') sp = e.old_value;
      else st = e.old_value;
    }
    return { inSprint: sp === sid, done: categories.get(st) === 'done' };
  };
  const remainingAt = (t: string) => {
    let points = 0, issues = 0;
    for (const c of candidates) {
      const s = stateAt(c, t);
      if (s.inSprint && !s.done) { points += c.story_points || 0; issues++; }
    }
    return { points, issues };
  };

  // Mốc ngày theo giờ Việt Nam: một ngày tính từ 00:00 đến 23:59 giờ địa phương
  const startTs = sprint.started_at || dayStart(sprint.start_date).toISOString();
  const endLimit = sprint.completed_at || new Date().toISOString();
  const totalDays = Math.max(1, Math.round((Date.parse(`${sprint.end_date}T00:00:00Z`) - Date.parse(`${sprint.start_date}T00:00:00Z`)) / 86400_000));
  const initial = remainingAt(startTs);
  const series = [{ date: sprint.start_date, ideal: initial.points, remaining: initial.points, remaining_issues: initial.issues }];
  for (let i = 1; i <= totalDays; i++) {
    const d = addDays(sprint.start_date, i);
    const eod = new Date(dayStart(addDays(d, 1)).getTime() - 1).toISOString();
    const t = eod < endLimit ? eod : endLimit;
    const past = dayStart(d).toISOString() <= endLimit;
    const rem = past ? remainingAt(t) : null;
    series.push({
      date: d,
      ideal: Math.max(0, +(initial.points * (1 - i / totalDays)).toFixed(2)),
      remaining: rem ? rem.points : (null as any),
      remaining_issues: rem ? rem.issues : (null as any),
    });
  }
  res.json({ sprint, series });
});

/** Roadmap: danh sách epic kèm tiến độ các issue con. */
r.get('/projects/:key/roadmap', (req, res) => {
  const { project } = loadProject(req, 'plan.view');
  const epics = all(`
    SELECT e.id, e.key, e.summary, e.start_date, e.due_date, e.assignee_id, u.full_name AS assignee_name,
      s.name AS status_name, s.category AS status_category,
      (SELECT COUNT(*) FROM issues c WHERE c.parent_id = e.id) AS total,
      (SELECT COUNT(*) FROM issues c JOIN statuses cs ON cs.id = c.status_id WHERE c.parent_id = e.id AND cs.category = 'done') AS done,
      (SELECT COUNT(*) FROM issues c JOIN statuses cs ON cs.id = c.status_id WHERE c.parent_id = e.id AND cs.category = 'inprogress') AS inprogress,
      (SELECT COALESCE(SUM(c.story_points),0) FROM issues c WHERE c.parent_id = e.id) AS points,
      (SELECT COALESCE(SUM(c.story_points),0) FROM issues c JOIN statuses cs ON cs.id = c.status_id WHERE c.parent_id = e.id AND cs.category = 'done') AS done_points,
      (SELECT MIN(sp.start_date) FROM issues c JOIN sprints sp ON sp.id = c.sprint_id WHERE c.parent_id = e.id) AS sprint_start,
      (SELECT MAX(sp.end_date) FROM issues c JOIN sprints sp ON sp.id = c.sprint_id WHERE c.parent_id = e.id) AS sprint_end
    FROM issues e JOIN statuses s ON s.id = e.status_id LEFT JOIN users u ON u.id = e.assignee_id
    WHERE e.project_id = ? AND e.type = 'epic' ORDER BY e.rank, e.id`, project.id);
  // Issue con của từng epic (mở rộng trên lộ trình như Jira Timeline)
  const children = all(`
    SELECT c.id, c.key, c.type, c.summary, c.parent_id, c.start_date, c.due_date, c.story_points,
      u.full_name AS assignee_name, s.name AS status_name, s.category AS status_category,
      sp.start_date AS sprint_start, sp.end_date AS sprint_end, sp.name AS sprint_name
    FROM issues c JOIN issues e ON e.id = c.parent_id AND e.type = 'epic'
    JOIN statuses s ON s.id = c.status_id LEFT JOIN users u ON u.id = c.assignee_id LEFT JOIN sprints sp ON sp.id = c.sprint_id
    WHERE e.project_id = ? ORDER BY c.rank, c.id`, project.id);
  const byEpic = new Map<number, any[]>();
  for (const c of children) byEpic.set(c.parent_id, [...(byEpic.get(c.parent_id) || []), c]);
  res.json(epics.map((e) => ({ ...e, children: byEpic.get(e.id) || [] })));
});

/**
 * Báo cáo sprint (Sprint report của Jira): việc đã xong, chưa xong, thêm vào giữa sprint, bị rút khỏi sprint.
 * Dựng lại từ lịch sử trường sprint; không tính sub-task.
 */
r.get('/projects/:key/sprint-report', (req, res) => {
  const { project } = loadProject(req, 'report.view');
  const sprint = get("SELECT * FROM sprints WHERE id = ? AND project_id = ? AND state <> 'future'", Number(req.query.sprint), project.id);
  if (!sprint) throw notFound('Không tìm thấy sprint');
  const sid = String(sprint.id);
  const started = sprint.started_at || dayStart(sprint.start_date).toISOString();
  const ended = sprint.completed_at || new Date().toISOString();
  const rows = all(`SELECT i.id, i.key, i.type, i.summary, i.story_points, i.sprint_id, i.priority,
      s.name AS status_name, s.category AS status_category, u.full_name AS assignee_name
    FROM issues i JOIN statuses s ON s.id = i.status_id LEFT JOIN users u ON u.id = i.assignee_id
    WHERE i.project_id = ? AND i.type <> 'subtask' AND (i.sprint_id = ? OR i.id IN (
      SELECT issue_id FROM issue_history WHERE field = 'sprint' AND (old_value = ? OR new_value = ?)))`, project.id, sprint.id, sid, sid);
  const hist = rows.length ? all(`SELECT issue_id, old_value, new_value, created_at FROM issue_history
    WHERE field = 'sprint' AND issue_id IN (${rows.map((x) => x.id).join(',')}) ORDER BY created_at, id`) : [];
  const completedAt = sprint.completed_at;
  const out = { completed: [] as any[], not_completed: [] as any[], removed: [] as any[], added_ids: [] as number[] };
  for (const i of rows) {
    const h = hist.filter((x) => x.issue_id === i.id);
    // Được thêm vào sau khi sprint bắt đầu
    const added = h.some((x) => x.new_value === sid && x.created_at > started);
    // Bị rút khỏi sprint trong lúc chạy (không tính lúc hoàn thành sprint tự chuyển việc dở đi)
    const lastOut = [...h].reverse().find((x) => x.old_value === sid);
    const movedAtCompletion = lastOut && completedAt && Math.abs(Date.parse(lastOut.created_at) - Date.parse(completedAt)) < 5000;
    const item = { ...i, added };
    if (added) out.added_ids.push(i.id);
    if (String(i.sprint_id) === sid) {
      (i.status_category === 'done' ? out.completed : out.not_completed).push(item);
    } else if (movedAtCompletion) {
      out.not_completed.push(item);
    } else if (lastOut && lastOut.created_at > started && lastOut.created_at <= ended) {
      out.removed.push(item);
    }
  }
  const sum = (list: any[]) => list.reduce((a, x) => a + (x.story_points || 0), 0);
  res.json({
    sprint,
    completed: out.completed, not_completed: out.not_completed, removed: out.removed,
    totals: {
      committed_points: sprint.committed_points, completed_points: sum(out.completed), not_completed_points: sum(out.not_completed),
      added_points: sum(rows.filter((x) => out.added_ids.includes(x.id))), removed_points: sum(out.removed),
    },
  });
});

/** Giờ công: các lần ghi giờ của dự án trong khoảng ngày (mặc định 30 ngày gần nhất). */
r.get('/projects/:key/worklogs', (req, res) => {
  const { project } = loadProject(req, 'report.view');
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to)) ? String(req.query.to) : localDate();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from)) ? String(req.query.from) : addDays(to, -29);
  const rows = all(`SELECT w.id, w.work_date, w.minutes, w.comment, w.user_id, u.full_name AS user_name,
      i.key, i.summary, i.type
    FROM worklogs w JOIN issues i ON i.id = w.issue_id JOIN users u ON u.id = w.user_id
    WHERE i.project_id = ? AND w.work_date BETWEEN ? AND ? ORDER BY w.work_date, u.full_name`, project.id, from, to);
  const est = get(`SELECT COALESCE(SUM(original_estimate), 0) AS original, COALESCE(SUM(remaining_estimate), 0) AS remaining,
      (SELECT COALESCE(SUM(w.minutes), 0) FROM worklogs w JOIN issues i2 ON i2.id = w.issue_id WHERE i2.project_id = ?) AS spent
    FROM issues WHERE project_id = ?`, project.id, project.id);
  res.json({ from, to, rows, totals: est });
});

export default r;
