import fs from 'node:fs';
import path from 'node:path';
import { all, get, now, run, tx, UPLOAD_DIR } from './db.ts';
import { handleMentions, notify, watch, watchers } from './notify.ts';
import {
  accessibleProjectIds, badRequest, canEditIssue, forbidden, notFound,
  type AuthUser, type Permission,
} from './permissions.ts';

export const ISSUE_TYPES = ['epic', 'story', 'task', 'bug', 'subtask'] as const;
export const PRIORITIES = ['highest', 'high', 'medium', 'low', 'lowest'] as const;
const STANDARD_TYPES = ['story', 'task', 'bug'];

export interface IssueRow {
  id: number;
  project_id: number;
  number: number;
  key: string;
  type: string;
  summary: string;
  description: string | null;
  status_id: number;
  priority: string;
  assignee_id: number | null;
  reporter_id: number | null;
  parent_id: number | null;
  sprint_id: number | null;
  story_points: number | null;
  labels: string | null;
  start_date: string | null;
  due_date: string | null;
  rank: number;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

const ISSUE_SELECT = `
SELECT i.*, p.key AS project_key, p.name AS project_name,
  s.name AS status_name, s.category AS status_category,
  a.full_name AS assignee_name, r.full_name AS reporter_name,
  par.key AS parent_key, par.summary AS parent_summary, par.type AS parent_type,
  sp.name AS sprint_name, sp.state AS sprint_state,
  (SELECT COUNT(*) FROM issues c WHERE c.parent_id = i.id) AS child_count,
  (SELECT COUNT(*) FROM issues c JOIN statuses cs ON cs.id = c.status_id
     WHERE c.parent_id = i.id AND cs.category = 'done') AS child_done
FROM issues i
JOIN projects p ON p.id = i.project_id
JOIN statuses s ON s.id = i.status_id
LEFT JOIN users a ON a.id = i.assignee_id
LEFT JOIN users r ON r.id = i.reporter_id
LEFT JOIN issues par ON par.id = i.parent_id
LEFT JOIN sprints sp ON sp.id = i.sprint_id`;

export function serialize(row: any) {
  return { ...row, labels: row.labels ? String(row.labels).split(',').filter(Boolean) : [] };
}

export function fetchIssue(where: 'id' | 'key', value: number | string) {
  const row = get(`${ISSUE_SELECT} WHERE i.${where} = ?`, value);
  if (!row) throw notFound('Không tìm thấy issue');
  return serialize(row);
}

export interface IssueFilter {
  project?: string;
  type?: string;
  status?: string;
  statusCategory?: string;
  assignee?: string;
  reporter?: string;
  priority?: string;
  sprint?: string;
  parent?: string;
  label?: string;
  q?: string;
  excludeSubtasks?: string;
  excludeEpics?: string;
  hideDoneOlderThanDays?: string;
  sort?: string;
  limit?: string;
}

const csv = (v?: string) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const placeholders = (n: number) => Array(n).fill('?').join(',');

export function listIssues(user: AuthUser, f: IssueFilter) {
  const where: string[] = [];
  const params: any[] = [];

  if (f.project) {
    where.push('p.key = ?');
    params.push(f.project.toUpperCase());
  }
  const ids = accessibleProjectIds(user);
  if (ids !== 'all') {
    if (ids.length === 0) return [];
    where.push(`i.project_id IN (${placeholders(ids.length)})`);
    params.push(...ids);
  }
  where.push('p.is_archived = 0');

  const types = csv(f.type);
  if (types.length) { where.push(`i.type IN (${placeholders(types.length)})`); params.push(...types); }
  const statuses = csv(f.status).map(Number);
  if (statuses.length) { where.push(`i.status_id IN (${placeholders(statuses.length)})`); params.push(...statuses); }
  const cats = csv(f.statusCategory);
  if (cats.length) { where.push(`s.category IN (${placeholders(cats.length)})`); params.push(...cats); }
  const prios = csv(f.priority);
  if (prios.length) { where.push(`i.priority IN (${placeholders(prios.length)})`); params.push(...prios); }

  const assignees = csv(f.assignee);
  if (assignees.length) {
    const conds: string[] = [];
    for (const a of assignees) {
      if (a === 'none') conds.push('i.assignee_id IS NULL');
      else { conds.push('i.assignee_id = ?'); params.push(a === 'me' ? user.id : Number(a)); }
    }
    where.push(`(${conds.join(' OR ')})`);
  }
  if (f.reporter) { where.push('i.reporter_id = ?'); params.push(f.reporter === 'me' ? user.id : Number(f.reporter)); }

  if (f.sprint === 'backlog') where.push('i.sprint_id IS NULL');
  else if (f.sprint === 'active') where.push("sp.state = 'active'");
  else if (f.sprint === 'open') where.push("(i.sprint_id IS NULL OR sp.state <> 'closed')");
  else if (f.sprint) { where.push('i.sprint_id = ?'); params.push(Number(f.sprint)); }

  if (f.parent === 'none') where.push('i.parent_id IS NULL');
  else if (f.parent) { where.push('i.parent_id = ?'); params.push(Number(f.parent)); }

  if (f.label) { where.push("(',' || i.labels || ',') LIKE ?"); params.push(`%,${f.label},%`); }
  if (f.q) {
    where.push('(i.summary LIKE ? OR i.key LIKE ? OR i.description LIKE ?)');
    const like = `%${f.q}%`;
    params.push(like, like, like);
  }
  if (f.excludeSubtasks === '1') where.push("i.type <> 'subtask'");
  if (f.excludeEpics === '1') where.push("i.type <> 'epic'");
  if (f.hideDoneOlderThanDays) {
    const cutoff = new Date(Date.now() - Number(f.hideDoneOlderThanDays) * 86400_000).toISOString();
    where.push("(s.category <> 'done' OR i.resolved_at IS NULL OR i.resolved_at >= ?)");
    params.push(cutoff);
  }

  const sorts: Record<string, string> = {
    rank: 'i.rank ASC, i.id ASC',
    created: 'i.created_at DESC',
    updated: 'i.updated_at DESC',
    key: 'p.key ASC, i.number DESC',
    priority: "CASE i.priority WHEN 'highest' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, i.rank",
    due: 'i.due_date IS NULL, i.due_date ASC',
  };
  const order = sorts[f.sort || 'rank'] || sorts.rank;
  const limit = Math.min(Number(f.limit) || 2000, 5000);

  return all(`${ISSUE_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${limit}`, ...params).map(serialize);
}

// ---------------------------------------------------------------------------
// Lịch sử thay đổi
// ---------------------------------------------------------------------------
export function addHistory(issueId: number, userId: number | null, field: string,
  oldValue: unknown, newValue: unknown, oldLabel?: unknown, newLabel?: unknown) {
  const s = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
  run(
    'INSERT INTO issue_history(issue_id, user_id, field, old_value, new_value, old_label, new_label, created_at) VALUES (?,?,?,?,?,?,?,?)',
    issueId, userId, field, s(oldValue), s(newValue), s(oldLabel ?? oldValue), s(newLabel ?? newValue), now(),
  );
}

const statusName = (id: number | null) => (id ? get('SELECT name FROM statuses WHERE id = ?', id)?.name : null);
const userName = (id: number | null) => (id ? get('SELECT full_name FROM users WHERE id = ?', id)?.full_name : null);
const sprintName = (id: number | null) => (id ? get('SELECT name FROM sprints WHERE id = ?', id)?.name : null);
const issueKey = (id: number | null) => (id ? get('SELECT key FROM issues WHERE id = ?', id)?.key : null);

// ---------------------------------------------------------------------------
// Kiểm tra dữ liệu
// ---------------------------------------------------------------------------
function isMember(projectId: number, userId: number) {
  return !!get('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?', projectId, userId) ||
    !!get('SELECT 1 FROM users WHERE id = ? AND is_admin = 1 AND is_active = 1', userId);
}

function checkDate(v: unknown, label: string): string | null {
  if (v === null || v === '' || v === undefined) return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw badRequest(`${label} không hợp lệ (định dạng YYYY-MM-DD)`);
  return v;
}

function checkPoints(v: unknown): number | null {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1000) throw badRequest('Story point không hợp lệ');
  return n;
}

function checkLabels(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const arr = Array.isArray(v) ? v : String(v).split(',');
  const clean = [...new Set(arr.map((s) => String(s).trim().replace(/[,\s]+/g, '-')).filter(Boolean))];
  return clean.length ? clean.join(',') : null;
}

/** Kiểm tra issue cha hợp lệ theo loại issue. Trả về id cha. */
function checkParent(projectId: number, type: string, parentId: unknown, selfId?: number): number | null {
  if (parentId === null || parentId === undefined || parentId === '') {
    if (type === 'subtask') throw badRequest('Sub-task bắt buộc phải có issue cha');
    return null;
  }
  if (type === 'epic') throw badRequest('Epic không thể có issue cha');
  const parent = get<IssueRow>('SELECT * FROM issues WHERE id = ?', Number(parentId));
  if (!parent || parent.project_id !== projectId) throw badRequest('Issue cha không hợp lệ');
  if (parent.id === selfId) throw badRequest('Issue không thể là cha của chính nó');
  if (type === 'subtask') {
    if (!STANDARD_TYPES.includes(parent.type)) throw badRequest('Sub-task chỉ được tạo dưới Story, Task hoặc Bug');
  } else if (parent.type !== 'epic') {
    throw badRequest('Story/Task/Bug chỉ có thể thuộc về một Epic');
  }
  return parent.id;
}

function checkStatus(projectId: number, statusId: unknown) {
  const s = get<{ id: number; category: string; project_id: number }>('SELECT * FROM statuses WHERE id = ?', Number(statusId));
  if (!s || s.project_id !== projectId) throw badRequest('Trạng thái không hợp lệ');
  return s;
}

function checkSprint(projectId: number, sprintId: unknown): number | null {
  if (sprintId === null || sprintId === undefined || sprintId === '') return null;
  const sp = get('SELECT * FROM sprints WHERE id = ?', Number(sprintId));
  if (!sp || sp.project_id !== projectId) throw badRequest('Sprint không hợp lệ');
  if (sp.state === 'closed') throw badRequest('Không thể đưa issue vào sprint đã đóng');
  return sp.id;
}

export function checkTransition(projectId: number, fromId: number, toId: number) {
  if (fromId === toId) return;
  const p = get('SELECT workflow_strict FROM projects WHERE id = ?', projectId);
  if (!p?.workflow_strict) return;
  const ok = get('SELECT 1 FROM transitions WHERE project_id = ? AND from_status_id = ? AND to_status_id = ?', projectId, fromId, toId);
  if (!ok) throw badRequest(`Workflow không cho phép chuyển từ "${statusName(fromId)}" sang "${statusName(toId)}"`);
}

function nextRank(projectId: number) {
  return (get<{ r: number | null }>('SELECT MAX(rank) r FROM issues WHERE project_id = ?', projectId)!.r ?? 0) + 1000;
}

// ---------------------------------------------------------------------------
// Tạo / sửa / xóa
// ---------------------------------------------------------------------------
export function createIssue(user: AuthUser, projectId: number, perms: Set<Permission>, data: any) {
  if (!perms.has('issue.create')) throw forbidden();
  const type = String(data.type || 'task');
  if (!ISSUE_TYPES.includes(type as any)) throw badRequest('Loại issue không hợp lệ');
  const summary = String(data.summary || '').trim();
  if (!summary) throw badRequest('Tiêu đề không được để trống');
  if (summary.length > 255) throw badRequest('Tiêu đề tối đa 255 ký tự');
  const priority = data.priority || 'medium';
  if (!PRIORITIES.includes(priority)) throw badRequest('Độ ưu tiên không hợp lệ');

  return tx(() => {
    const parentId = checkParent(projectId, type, data.parent_id);
    let assigneeId: number | null = data.assignee_id ? Number(data.assignee_id) : null;
    if (assigneeId && !isMember(projectId, assigneeId)) throw badRequest('Người được giao không thuộc dự án');
    if (assigneeId && assigneeId !== user.id && !perms.has('issue.assign')) throw forbidden('Bạn không có quyền giao việc cho người khác');

    let statusId: number;
    if (data.status_id) statusId = checkStatus(projectId, data.status_id).id;
    else {
      const first = get('SELECT id FROM statuses WHERE project_id = ? ORDER BY (category <> \'todo\'), position LIMIT 1', projectId);
      if (!first) throw badRequest('Dự án chưa cấu hình trạng thái');
      statusId = first.id;
    }

    let sprintId: number | null = null;
    if (type === 'subtask' && parentId) sprintId = get('SELECT sprint_id FROM issues WHERE id = ?', parentId)?.sprint_id ?? null;
    else if (type !== 'epic' && data.sprint_id) sprintId = checkSprint(projectId, data.sprint_id);

    run('UPDATE projects SET issue_seq = issue_seq + 1 WHERE id = ?', projectId);
    const p = get('SELECT key, issue_seq FROM projects WHERE id = ?', projectId)!;
    const ts = now();
    const status = get('SELECT category FROM statuses WHERE id = ?', statusId)!;
    const { id } = run(
      `INSERT INTO issues(project_id, number, key, type, summary, description, status_id, priority, assignee_id,
        reporter_id, parent_id, sprint_id, story_points, labels, start_date, due_date, rank, resolved_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      projectId, p.issue_seq, `${p.key}-${p.issue_seq}`, type, summary, data.description || null, statusId, priority,
      assigneeId, user.id, parentId, sprintId, checkPoints(data.story_points), checkLabels(data.labels),
      checkDate(data.start_date, 'Ngày bắt đầu'), checkDate(data.due_date, 'Hạn hoàn thành'),
      nextRank(projectId), status.category === 'done' ? ts : null, ts, ts,
    );
    addHistory(id, user.id, 'created', null, null);
    if (sprintId) addHistory(id, user.id, 'sprint', null, sprintId, null, sprintName(sprintId));
    watch(id, [user.id, assigneeId]);
    if (assigneeId) notify([assigneeId], user.id, id, 'assigned', summary);
    handleMentions(id, projectId, user.id, data.description);
    return fetchIssue('id', id);
  });
}

export function updateIssue(user: AuthUser, issue: IssueRow, perms: Set<Permission>, data: any) {
  const canEdit = canEditIssue(user, perms, issue);
  const sets: Record<string, unknown> = {};
  const history: [string, unknown, unknown, unknown?, unknown?][] = [];
  const has = (k: string) => Object.prototype.hasOwnProperty.call(data, k);
  const requireEdit = () => { if (!canEdit) throw forbidden('Bạn không có quyền sửa issue này'); };

  tx(() => {
    if (has('summary')) {
      requireEdit();
      const v = String(data.summary || '').trim();
      if (!v) throw badRequest('Tiêu đề không được để trống');
      if (v.length > 255) throw badRequest('Tiêu đề tối đa 255 ký tự');
      if (v !== issue.summary) { sets.summary = v; history.push(['summary', issue.summary, v]); }
    }
    if (has('description')) {
      requireEdit();
      const v = data.description ? String(data.description) : null;
      if (v !== issue.description) { sets.description = v; history.push(['description', null, null]); }
    }
    if (has('type') && data.type !== issue.type) {
      requireEdit();
      if (!STANDARD_TYPES.includes(issue.type) || !STANDARD_TYPES.includes(data.type)) {
        throw badRequest('Chỉ có thể đổi qua lại giữa Story, Task và Bug');
      }
      sets.type = data.type; history.push(['type', issue.type, data.type]);
    }
    if (has('priority') && data.priority !== issue.priority) {
      requireEdit();
      if (!PRIORITIES.includes(data.priority)) throw badRequest('Độ ưu tiên không hợp lệ');
      sets.priority = data.priority; history.push(['priority', issue.priority, data.priority]);
    }
    if (has('story_points')) {
      requireEdit();
      const v = checkPoints(data.story_points);
      if (v !== issue.story_points) { sets.story_points = v; history.push(['story_points', issue.story_points, v]); }
    }
    if (has('labels')) {
      requireEdit();
      const v = checkLabels(data.labels);
      if (v !== issue.labels) { sets.labels = v; history.push(['labels', issue.labels, v]); }
    }
    for (const [k, label] of [['start_date', 'Ngày bắt đầu'], ['due_date', 'Hạn hoàn thành']] as const) {
      if (has(k)) {
        requireEdit();
        const v = checkDate(data[k], label);
        if (v !== issue[k]) { sets[k] = v; history.push([k, issue[k], v]); }
      }
    }
    if (has('assignee_id')) {
      const v = data.assignee_id ? Number(data.assignee_id) : null;
      if (v !== issue.assignee_id) {
        const selfAssign = v === user.id && canEdit;
        if (!perms.has('issue.assign') && !selfAssign) throw forbidden('Bạn không có quyền giao việc');
        if (v && !isMember(issue.project_id, v)) throw badRequest('Người được giao không thuộc dự án');
        sets.assignee_id = v;
        history.push(['assignee', issue.assignee_id, v, userName(issue.assignee_id), userName(v)]);
      }
    }
    if (has('parent_id')) {
      requireEdit();
      const v = checkParent(issue.project_id, issue.type, data.parent_id, issue.id);
      if (v !== issue.parent_id) {
        sets.parent_id = v;
        history.push(['parent', issue.parent_id, v, issueKey(issue.parent_id), issueKey(v)]);
        if (issue.type === 'subtask' && v) {
          data.__subtaskSprint = get('SELECT sprint_id FROM issues WHERE id = ?', v)?.sprint_id ?? null;
        }
      }
    }
    if (has('sprint_id') || data.__subtaskSprint !== undefined) {
      const v = data.__subtaskSprint !== undefined ? data.__subtaskSprint : checkSprint(issue.project_id, data.sprint_id);
      if (v !== issue.sprint_id) {
        if (data.__subtaskSprint === undefined) {
          if (!perms.has('sprint.manage') && !canEdit) throw forbidden('Bạn không có quyền đổi sprint');
          if (issue.type === 'epic') throw badRequest('Epic không thể đưa vào sprint');
          if (issue.type === 'subtask') throw badRequest('Sub-task luôn thuộc sprint của issue cha');
        }
        sets.sprint_id = v;
        history.push(['sprint', issue.sprint_id, v, sprintName(issue.sprint_id), sprintName(v)]);
        // Sub-task đi theo issue cha
        for (const st of all<IssueRow>("SELECT * FROM issues WHERE parent_id = ? AND type = 'subtask'", issue.id)) {
          if (st.sprint_id !== v) {
            run('UPDATE issues SET sprint_id = ?, updated_at = ? WHERE id = ?', v, now(), st.id);
            addHistory(st.id, user.id, 'sprint', st.sprint_id, v, sprintName(st.sprint_id), sprintName(v));
          }
        }
      }
    }
    if (has('status_id') && Number(data.status_id) !== issue.status_id) {
      if (!perms.has('issue.transition')) throw forbidden('Bạn không có quyền chuyển trạng thái');
      const s = checkStatus(issue.project_id, data.status_id);
      checkTransition(issue.project_id, issue.status_id, s.id);
      sets.status_id = s.id;
      const wasDone = get('SELECT category FROM statuses WHERE id = ?', issue.status_id)?.category === 'done';
      if (s.category === 'done' && !wasDone) sets.resolved_at = now();
      if (s.category !== 'done') sets.resolved_at = null;
      history.push(['status', issue.status_id, s.id, statusName(issue.status_id), statusName(s.id)]);
    }
    if (has('rank')) {
      if (!perms.has('sprint.manage') && !canEdit) throw forbidden('Bạn không có quyền sắp xếp');
      sets.rank = Number(data.rank);
    }

    const keys = Object.keys(sets);
    if (keys.length) {
      sets.updated_at = now();
      const cols = Object.keys(sets);
      run(`UPDATE issues SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...(cols.map((c) => sets[c]) as any[]), issue.id);
      for (const h of history) addHistory(issue.id, user.id, h[0], h[1], h[2], h[3], h[4]);

      // Thông báo theo cách Jira: người được giao; người theo dõi khi đổi trạng thái; người được @nhắc trong mô tả
      if (sets.assignee_id) {
        watch(issue.id, [sets.assignee_id as number]);
        notify([sets.assignee_id as number], user.id, issue.id, 'assigned', (sets.summary as string) ?? issue.summary);
      }
      const st = history.find((h) => h[0] === 'status');
      if (st) notify(watchers(issue.id), user.id, issue.id, 'status', `${st[3]} → ${st[4]}`);
      if (sets.description !== undefined) handleMentions(issue.id, issue.project_id, user.id, sets.description as string, issue.description);
    }
  });
  return fetchIssue('id', issue.id);
}

/** Tính rank mới khi kéo thả: nằm giữa issue phía trên (afterId) và phía dưới (beforeId). */
export function rankBetween(afterId?: number | null, beforeId?: number | null): number | undefined {
  const a = afterId ? get<{ rank: number }>('SELECT rank FROM issues WHERE id = ?', afterId)?.rank : undefined;
  const b = beforeId ? get<{ rank: number }>('SELECT rank FROM issues WHERE id = ?', beforeId)?.rank : undefined;
  if (a !== undefined && b !== undefined) return (a + b) / 2;
  if (a !== undefined) return a + 1000;
  if (b !== undefined) return b - 1000;
  return undefined;
}

export function deleteIssue(issue: IssueRow) {
  tx(() => {
    const ids = [issue.id, ...all<{ id: number }>("SELECT id FROM issues WHERE parent_id = ? AND type = 'subtask'", issue.id).map((r) => r.id)];
    const files = all<{ stored_name: string }>(
      `SELECT stored_name FROM attachments WHERE issue_id IN (${placeholders(ids.length)})`, ...ids,
    );
    for (const id of ids.slice(1)) run('DELETE FROM issues WHERE id = ?', id);
    run('DELETE FROM issues WHERE id = ?', issue.id);
    for (const f of files) fs.rm(path.join(UPLOAD_DIR, f.stored_name), { force: true }, () => {});
  });
}

export function getIssueRow(key: string) {
  const row = get<IssueRow>('SELECT * FROM issues WHERE key = ?', key.toUpperCase());
  if (!row) throw notFound('Không tìm thấy issue');
  return row;
}
