import { Router } from 'express';
import { all, get, localDate } from '../db.ts';
import { accessibleProjectIds, badRequest, notFound } from '../permissions.ts';
import { listIssues } from '../issues.ts';
import { loadProject } from './projects.ts';

const r = Router();

const day = (d: Date) => d.toISOString().slice(0, 10);

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
  res.json({ stats, mine, activity });
});

// ---------------------------------------------------------------------------
// Báo cáo dự án
// ---------------------------------------------------------------------------
r.get('/projects/:key/summary', (req, res) => {
  const { project } = loadProject(req);
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
  const since = new Date(Date.now() - (days - 1) * 86400_000);
  const created = all(`SELECT substr(created_at,1,10) d, COUNT(*) c FROM issues
    WHERE project_id = ? AND type <> 'epic' AND created_at >= ? GROUP BY d`, pid, day(since));
  const resolved = all(`SELECT substr(resolved_at,1,10) d, COUNT(*) c FROM issues
    WHERE project_id = ? AND type <> 'epic' AND resolved_at >= ? GROUP BY d`, pid, day(since));
  const cMap = new Map(created.map((x) => [x.d, x.c]));
  const rMap = new Map(resolved.map((x) => [x.d, x.c]));
  const trend = [];
  for (let i = 0; i < days; i++) {
    const d = day(new Date(since.getTime() + i * 86400_000));
    trend.push({ date: d, created: cMap.get(d) || 0, resolved: rMap.get(d) || 0 });
  }
  const today = localDate();
  const overdue = listIssues(req.user, { project: project.key, statusCategory: 'todo,inprogress', sort: 'due' })
    .filter((i: any) => i.due_date && i.due_date < today && i.type !== 'epic');
  res.json({ byStatus, byType, byPriority, byAssignee, trend, overdue });
});

r.get('/projects/:key/velocity', (req, res) => {
  const { project } = loadProject(req);
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
  const { project } = loadProject(req);
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

  const startTs = sprint.started_at || `${sprint.start_date}T00:00:00.000Z`;
  const endLimit = sprint.completed_at || new Date().toISOString();
  const start = new Date(`${sprint.start_date}T00:00:00Z`);
  const end = new Date(`${sprint.end_date}T00:00:00Z`);
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400_000));
  const initial = remainingAt(startTs);
  const series = [{ date: sprint.start_date, ideal: initial.points, remaining: initial.points, remaining_issues: initial.issues }];
  for (let i = 1; i <= totalDays; i++) {
    const d = new Date(start.getTime() + i * 86400_000);
    const eod = new Date(d.getTime() + 86400_000 - 1).toISOString();
    const t = eod < endLimit ? eod : endLimit;
    const past = new Date(d.getTime()).toISOString() <= endLimit;
    const rem = past ? remainingAt(t) : null;
    series.push({
      date: day(d),
      ideal: Math.max(0, +(initial.points * (1 - i / totalDays)).toFixed(2)),
      remaining: rem ? rem.points : (null as any),
      remaining_issues: rem ? rem.issues : (null as any),
    });
  }
  res.json({ sprint, series });
});

/** Roadmap: danh sách epic kèm tiến độ các issue con. */
r.get('/projects/:key/roadmap', (req, res) => {
  const { project } = loadProject(req);
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
  res.json(epics);
});

export default r;
