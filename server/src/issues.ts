import fs from 'node:fs';
import path from 'node:path';
import { all, get, now, run, tx, UPLOAD_DIR } from './db.ts';
import { handleMentions, notify, watch, watchers } from './notify.ts';
import { checkPhase, guessPhase } from './phases.ts';
import { canTransition, initialStatus, isStatusAllowed, mapStatusForType, projectStatuses, typeStatuses } from './workflow.ts';
import {
  accessibleProjectIds, badRequest, canEditIssue, forbidden, notFound,
  type AuthUser, type Permission,
} from './permissions.ts';

export const ISSUE_TYPES = ['epic', 'story', 'task', 'bug', 'subtask'] as const;
export const PRIORITIES = ['highest', 'high', 'medium', 'low', 'lowest'] as const;
const STANDARD_TYPES = ['story', 'task', 'bug'];
const TYPE_NAMES: Record<string, string> = { epic: 'Epic', story: 'Story', task: 'Task', bug: 'Bug', subtask: 'Sub-task' };

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
  version_id: number | null;
  component_id: number | null;
  ba_id: number | null;
  subtype: string | null;
  phase: string | null;
  original_estimate: number | null;
  remaining_estimate: number | null;
}

const ISSUE_SELECT = `
SELECT i.*, p.key AS project_key, p.name AS project_name,
  s.name AS status_name, s.category AS status_category,
  a.full_name AS assignee_name, r.full_name AS reporter_name,
  par.key AS parent_key, par.summary AS parent_summary, par.type AS parent_type,
  sp.name AS sprint_name, sp.state AS sprint_state,
  v.name AS version_name, v.status AS version_status,
  cp.name AS component_name, cp.side AS component_side,
  COALESCE(i.ba_id, cp.lead_id) AS component_lead_id, COALESCE(bu.full_name, cu.full_name) AS component_lead_name,
  cu.full_name AS component_default_lead_name,
  (SELECT COALESCE(SUM(w.minutes), 0) FROM worklogs w WHERE w.issue_id = i.id) AS time_spent,
  (SELECT COUNT(*) FROM issues c WHERE c.parent_id = i.id) AS child_count,
  (SELECT COUNT(*) FROM issues c JOIN statuses cs ON cs.id = c.status_id
     WHERE c.parent_id = i.id AND cs.category = 'done') AS child_done
FROM issues i
JOIN projects p ON p.id = i.project_id
JOIN statuses s ON s.id = i.status_id
LEFT JOIN users a ON a.id = i.assignee_id
LEFT JOIN users r ON r.id = i.reporter_id
LEFT JOIN issues par ON par.id = i.parent_id
LEFT JOIN sprints sp ON sp.id = i.sprint_id
LEFT JOIN versions v ON v.id = i.version_id
LEFT JOIN components cp ON cp.id = i.component_id
LEFT JOIN users cu ON cu.id = cp.lead_id
LEFT JOIN users bu ON bu.id = i.ba_id`;

export function serialize(row: any) {
  return { ...row, labels: row.labels ? String(row.labels).split(',').filter(Boolean) : [],
    ...(row.type === 'epic' ? { phase_guess: guessPhase(row.summary) } : {}) };
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
  version?: string;
  component?: string;
  ba?: string;
  keys?: string;
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
  // Lọc Story/Task/Bug lấy cả việc con cùng loại
  if (types.length) {
    where.push(`(i.type IN (${placeholders(types.length)}) OR (i.type = 'subtask' AND i.subtype IN (${placeholders(types.length)})))`);
    params.push(...types, ...types);
  }
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

  if (f.version === 'none') where.push('i.version_id IS NULL');
  else if (f.version) { where.push('i.version_id = ?'); params.push(Number(f.version)); }
  if (f.component === 'none') where.push('i.component_id IS NULL');
  else if (f.component) { where.push('i.component_id = ?'); params.push(Number(f.component)); }
  // BA phụ trách = người phụ trách mô-đun của issue
  if (f.ba) { where.push('COALESCE(i.ba_id, cp.lead_id) = ?'); params.push(f.ba === 'me' ? user.id : Number(f.ba)); }
  const keys = csv(f.keys).map((k) => k.toUpperCase());
  if (keys.length) { where.push(`i.key IN (${placeholders(keys.length)})`); params.push(...keys); }
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
const versionName = (id: number | null) => (id ? get('SELECT name FROM versions WHERE id = ?', id)?.name : null);
export const fmtMinutes = (m: number | null | undefined) => {
  if (m === null || m === undefined) return null;
  const d = Math.floor(m / 480), h = Math.floor((m % 480) / 60), mm = m % 60;
  return [d && `${d}d`, h && `${h}h`, mm && `${mm}m`].filter(Boolean).join(' ') || '0m';
};
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
  if (!Number.isFinite(n) || n < 0 || n > 1000) throw badRequest('Điểm ước lượng không hợp lệ');
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

/** Loại việc con: story / task / bug, bỏ trống = việc con thường. */
function checkSubtype(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (!STANDARD_TYPES.includes(String(v))) throw badRequest('Loại việc con chỉ có thể là Story, Task hoặc Bug');
  return String(v);
}
const SUBTYPE_LABELS: Record<string, string> = { story: 'Story', task: 'Task', bug: 'Bug' };

function checkStatus(projectId: number, statusId: unknown) {
  const s = get<{ id: number; category: string; project_id: number }>('SELECT * FROM statuses WHERE id = ?', Number(statusId));
  if (!s || s.project_id !== projectId) throw badRequest('Trạng thái không hợp lệ');
  return s;
}

/** Mô-đun thuộc dự án (null = bỏ trống). */
export function checkComponent(projectId: number, componentId: unknown): number | null {
  if (componentId === null || componentId === undefined || componentId === '') return null;
  const c = get<{ id: number; project_id: number }>('SELECT id, project_id FROM components WHERE id = ?', Number(componentId));
  if (!c || c.project_id !== projectId) throw badRequest('Mô-đun không hợp lệ');
  return c.id;
}
const componentName = (id: number | null) => (id ? get<{ name: string }>('SELECT name FROM components WHERE id = ?', id)?.name ?? null : null);
/** BA phụ trách mô-đun tự theo dõi các issue của mô-đun (nhận thông báo bình luận, chuyển trạng thái). */
const watchLead = (issueId: number, componentId: number | null) => {
  const lead = componentId ? get<{ lead_id: number | null }>('SELECT lead_id FROM components WHERE id = ?', componentId)?.lead_id : null;
  if (lead) watch(issueId, [lead]);
};

/** Phiên bản phát hành thuộc dự án và chưa lưu trữ. */
export function checkVersion(projectId: number, versionId: unknown): number | null {
  if (versionId === null || versionId === undefined || versionId === '') return null;
  const v = get<{ id: number; project_id: number; status: string }>('SELECT * FROM versions WHERE id = ?', Number(versionId));
  if (!v || v.project_id !== projectId) throw badRequest('Phiên bản phát hành không hợp lệ');
  if (v.status === 'archived') throw badRequest('Phiên bản đã lưu trữ, không gán thêm issue');
  return v.id;
}

/**
 * Thời lượng kiểu Jira → phút. Nhận "1w 2d 3h 30m", "2.5h", "90m" hoặc số (hiểu là giờ);
 * 1 ngày = 8 giờ, 1 tuần = 5 ngày. Chuỗi rỗng/null → null.
 */
export function parseDuration(v: unknown, label = 'Thời gian'): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 0) throw badRequest(`${label} không hợp lệ`);
    return Math.round(v * 60);
  }
  const s = String(v).trim().toLowerCase().replace(/,/g, '.');
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 60);
  const units: Record<string, number> = { w: 5 * 8 * 60, d: 8 * 60, h: 60, m: 1, t: 5 * 8 * 60, n: 8 * 60, g: 60, p: 1 };
  let total = 0, matched = '';
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*([wdhmtngp])[a-zà-ỹ]*/g)) { total += Number(m[1]) * units[m[2]]; matched += m[0]; }
  if (!matched || s.replace(/\s+/g, '').length !== matched.replace(/\s+/g, '').length) {
    throw badRequest(`${label} không hợp lệ. Dùng dạng 2h 30m, 1d (8 giờ), 1w (5 ngày) hoặc số giờ`);
  }
  return Math.round(total);
}

function checkSprint(projectId: number, sprintId: unknown): number | null {
  if (sprintId === null || sprintId === undefined || sprintId === '') return null;
  const sp = get('SELECT * FROM sprints WHERE id = ?', Number(sprintId));
  if (!sp || sp.project_id !== projectId) throw badRequest('Sprint không hợp lệ');
  if (sp.state === 'closed') throw badRequest('Không thể đưa issue vào sprint đã đóng');
  return sp.id;
}

export function checkTransition(projectId: number, type: string, fromId: number, toId: number) {
  if (!canTransition(projectId, type, fromId, toId)) throw badRequest(`Quy trình không cho phép chuyển từ "${statusName(fromId)}" sang "${statusName(toId)}"`);
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

    // Trạng thái theo workflow của loại issue; nếu được chỉ định sẵn (VD tạo nhanh trên một cột board)
    // mà loại này không dùng trạng thái đó thì quy về trạng thái hợp lệ cùng nhóm
    const first = initialStatus(projectId, type);
    if (!first) throw badRequest('Dự án chưa cấu hình trạng thái');
    const statusId = data.status_id ? mapStatusForType(projectId, type, checkStatus(projectId, data.status_id).id) : first;

    let sprintId: number | null = null;
    if (type === 'subtask' && parentId) sprintId = get('SELECT sprint_id FROM issues WHERE id = ?', parentId)?.sprint_id ?? null;
    else if (type !== 'epic' && data.sprint_id) sprintId = checkSprint(projectId, data.sprint_id);
    // Sub-task thuộc mô-đun của issue cha
    const componentId = type === 'subtask' && parentId
      ? get('SELECT component_id FROM issues WHERE id = ?', parentId)?.component_id ?? null
      : checkComponent(projectId, data.component_id);

    run('UPDATE projects SET issue_seq = issue_seq + 1 WHERE id = ?', projectId);
    const p = get('SELECT key, issue_seq FROM projects WHERE id = ?', projectId)!;
    const ts = now();
    const status = get('SELECT category FROM statuses WHERE id = ?', statusId)!;
    const estimate = parseDuration(data.original_estimate, 'Ước lượng thời gian');
    const { id } = run(
      `INSERT INTO issues(project_id, number, key, type, summary, description, status_id, priority, assignee_id,
        reporter_id, parent_id, sprint_id, story_points, labels, start_date, due_date, rank, resolved_at, created_at, updated_at,
        version_id, original_estimate, remaining_estimate, component_id, subtype)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      projectId, p.issue_seq, `${p.key}-${p.issue_seq}`, type, summary, data.description || null, statusId, priority,
      assigneeId, user.id, parentId, sprintId, checkPoints(data.story_points), checkLabels(data.labels),
      checkDate(data.start_date, 'Ngày bắt đầu'), checkDate(data.due_date, 'Hạn hoàn thành'),
      data.rank !== undefined ? Number(data.rank) : nextRank(projectId), status.category === 'done' ? ts : null, ts, ts,
      checkVersion(projectId, data.version_id), estimate, estimate, componentId,
      type === 'subtask' ? checkSubtype(data.subtype) : null,
    );
    addHistory(id, user.id, 'created', null, null);
    if (sprintId) addHistory(id, user.id, 'sprint', null, sprintId, null, sprintName(sprintId));
    watch(id, [user.id, assigneeId]);
    watchLead(id, componentId);
    if (assigneeId) notify([assigneeId], user.id, id, 'assigned', summary);
    handleMentions(id, projectId, user.id, data.description);
    if (type !== 'epic' && type !== 'subtask') syncEpicStatus(parentId, user.id);
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
      const convertible = [...STANDARD_TYPES, 'subtask'];
      if (!convertible.includes(issue.type) || !convertible.includes(data.type)) {
        throw badRequest('Chỉ có thể đổi qua lại giữa Story, Task, Bug và Sub-task (Epic không đổi được loại)');
      }
      if (issue.type === 'subtask' && !has('parent_id')) {
        // Như Jira "Chuyển thành issue": issue mới thuộc Epic của issue cha cũ (nếu có)
        const oldParent = issue.parent_id ? get<IssueRow>('SELECT * FROM issues WHERE id = ?', issue.parent_id) : undefined;
        data.parent_id = oldParent?.type === 'epic' ? oldParent.id : oldParent?.parent_id ?? null;
      }
      if (data.type === 'subtask') {
        // Như Jira "Chuyển thành sub-task": phải chọn issue cha, và issue không được đang có sub-task
        if (!has('parent_id') || !data.parent_id) throw badRequest('Chọn issue cha khi chuyển thành Sub-task');
        if (get("SELECT 1 FROM issues WHERE parent_id = ? AND type = 'subtask'", issue.id)) {
          throw badRequest('Issue đang có sub-task, không thể chuyển thành Sub-task');
        }
      }
      sets.type = data.type; history.push(['type', issue.type, data.type]);
      if (data.type !== 'subtask' && issue.subtype) sets.subtype = null;
    }
    if (has('subtype')) {
      requireEdit();
      if (((sets.type as string | undefined) ?? issue.type) !== 'subtask') {
        if (data.subtype) throw badRequest('Chỉ việc con mới chọn được loại việc con');
      } else {
        const v = checkSubtype(data.subtype);
        if (v !== issue.subtype) {
          sets.subtype = v;
          history.push(['subtype', issue.subtype, v, SUBTYPE_LABELS[issue.subtype ?? ''] ?? 'Sub-task', SUBTYPE_LABELS[v ?? ''] ?? 'Sub-task']);
        }
      }
    }
    if (has('phase')) {
      requireEdit();
      if (((sets.type as string | undefined) ?? issue.type) !== 'epic') throw badRequest('Chỉ Epic mới chọn được giai đoạn dự án');
      const v = checkPhase(data.phase);
      if (v !== issue.phase) { sets.phase = v; history.push(['phase', issue.phase, v, issue.phase ?? 'Tự động', v ?? 'Tự động']); }
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
      const newType = (sets.type as string | undefined) ?? issue.type;
      const v = checkParent(issue.project_id, newType, data.parent_id, issue.id);
      if (v !== issue.parent_id) {
        sets.parent_id = v;
        history.push(['parent', issue.parent_id, v, issueKey(issue.parent_id), issueKey(v)]);
        if (newType === 'subtask' && v) {
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
          if (((sets.type as string | undefined) ?? issue.type) === 'subtask') throw badRequest('Sub-task luôn thuộc sprint của issue cha');
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
    if (has('version_id')) {
      const v = checkVersion(issue.project_id, data.version_id);
      if (v !== issue.version_id) {
        if (!perms.has('sprint.manage') && !canEdit) throw forbidden('Bạn không có quyền đổi phiên bản phát hành');
        sets.version_id = v;
        history.push(['version', issue.version_id, v, versionName(issue.version_id), versionName(v)]);
      }
    }
    if (has('ba_id')) {
      requireEdit();
      const v = data.ba_id ? Number(data.ba_id) : null;
      if (v && !isMember(issue.project_id, v)) throw badRequest('BA phụ trách phải là thành viên dự án');
      if (v !== issue.ba_id) {
        sets.ba_id = v;
        history.push(['ba', issue.ba_id, v, userName(issue.ba_id) ?? 'Theo mô-đun', userName(v) ?? 'Theo mô-đun']);
        if (v) watch(issue.id, [v]);
      }
    }
    if (has('component_id')) {
      requireEdit();
      const v = checkComponent(issue.project_id, data.component_id);
      if (v !== issue.component_id) {
        sets.component_id = v;
        history.push(['component', issue.component_id, v, componentName(issue.component_id), componentName(v)]);
        watchLead(issue.id, v);
      }
    }
    if (has('original_estimate')) {
      requireEdit();
      const v = parseDuration(data.original_estimate, 'Ước lượng thời gian');
      if (v !== issue.original_estimate) {
        sets.original_estimate = v;
        history.push(['original_estimate', issue.original_estimate, v, fmtMinutes(issue.original_estimate), fmtMinutes(v)]);
        // Như Jira: chưa ghi giờ nào thì thời gian còn lại = ước lượng
        if (!has('remaining_estimate') && !get('SELECT 1 FROM worklogs WHERE issue_id = ?', issue.id)) sets.remaining_estimate = v;
      }
    }
    if (has('remaining_estimate')) {
      requireEdit();
      const v = parseDuration(data.remaining_estimate, 'Thời gian còn lại');
      if (v !== issue.remaining_estimate) {
        sets.remaining_estimate = v;
        history.push(['remaining_estimate', issue.remaining_estimate, v, fmtMinutes(issue.remaining_estimate), fmtMinutes(v)]);
      }
    }
    const effType = (sets.type as string | undefined) ?? issue.type;
    const applyStatus = (s: { id: number; category: string }) => {
      sets.status_id = s.id;
      const wasDone = get('SELECT category FROM statuses WHERE id = ?', issue.status_id)?.category === 'done';
      if (s.category === 'done' && !wasDone) sets.resolved_at = now();
      if (s.category !== 'done') sets.resolved_at = null;
      history.push(['status', issue.status_id, s.id, statusName(issue.status_id), statusName(s.id)]);
    };
    if (has('status_id') && Number(data.status_id) !== issue.status_id) {
      if (!perms.has('issue.transition')) throw forbidden('Bạn không có quyền chuyển trạng thái');
      if (issue.type === 'epic' && epicWorkCount(issue.id)) {
        throw badRequest('Trạng thái Epic tự động theo các Story/Task/Bug bên trong, không đổi tay được');
      }
      const s = checkStatus(issue.project_id, data.status_id);
      if (!isStatusAllowed(issue.project_id, effType, s.id)) {
        throw badRequest(`Trạng thái "${statusName(s.id)}" không dùng cho loại ${TYPE_NAMES[effType] ?? effType}`);
      }
      checkTransition(issue.project_id, effType, issue.status_id, s.id);
      applyStatus(s);
    } else if (sets.type && !isStatusAllowed(issue.project_id, effType, issue.status_id)) {
      // Đổi loại issue mà trạng thái hiện tại không có trong workflow của loại mới → chuyển sang trạng thái cùng nhóm
      applyStatus(checkStatus(issue.project_id, mapStatusForType(issue.project_id, effType, issue.status_id)));
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
      // Epic cũ và Epic mới (nếu đổi Epic) tự cập nhật trạng thái
      if (sets.status_id !== undefined || sets.parent_id !== undefined || sets.type !== undefined) {
        syncEpicStatus(issue.parent_id, user.id);
        if (sets.parent_id !== undefined) syncEpicStatus(sets.parent_id as number | null, user.id);
      }
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
    syncEpicStatus(issue.parent_id, null);
    for (const f of files) fs.rm(path.join(UPLOAD_DIR, f.stored_name), { force: true }, () => {});
  });
}

/**
 * Trạng thái Epic tự động theo các Story/Task/Bug bên trong (không tính Sub-task):
 *  - tất cả Hoàn thành → Epic Hoàn thành; tất cả Cần làm → Epic Cần làm;
 *  - còn lại (có việc đang thực hiện, hoặc đã xong một phần) → Epic Đang thực hiện.
 * Epic chưa có việc nào thì giữ nguyên trạng thái.
 */
const WORK_TYPES = "('story','task','bug')";
export function epicWorkCount(epicId: number) {
  return get<{ c: number }>(`SELECT COUNT(*) c FROM issues WHERE parent_id = ? AND type IN ${WORK_TYPES}`, epicId)!.c;
}
export function syncEpicStatus(epicId: number | null | undefined, actorId: number | null) {
  if (!epicId) return;
  const epic = get<IssueRow>('SELECT * FROM issues WHERE id = ?', epicId);
  if (!epic || epic.type !== 'epic') return;
  const kids = all<{ category: string }>(`SELECT s.category FROM issues i JOIN statuses s ON s.id = i.status_id
    WHERE i.parent_id = ? AND i.type IN ${WORK_TYPES}`, epicId);
  if (!kids.length) return;
  const target = kids.every((k) => k.category === 'done') ? 'done' : kids.every((k) => k.category === 'todo') ? 'todo' : 'inprogress';
  if (get<{ category: string }>('SELECT category FROM statuses WHERE id = ?', epic.status_id)?.category === target) return;
  const s = typeStatuses(epic.project_id, 'epic').find((x) => x.category === target)
    ?? projectStatuses(epic.project_id).find((x) => x.category === target);
  if (!s) return;
  const ts = now();
  run('UPDATE issues SET status_id = ?, resolved_at = ?, updated_at = ? WHERE id = ?', s.id, target === 'done' ? epicDoneAt(epic.id) ?? ts : null, ts, epic.id);
  addHistory(epic.id, actorId, 'status', epic.status_id, s.id, statusName(epic.status_id), `${s.name} (tự động)`);
  if (actorId) notify(watchers(epic.id), actorId, epic.id, 'status', `${statusName(epic.status_id)} → ${s.name} (tự động theo các issue bên trong)`);
}
/** Đồng bộ mọi Epic — chạy khi khởi động (dữ liệu cũ, hoặc trạng thái bị đổi ngoài luồng thông thường). */
/** Ngày Epic hoàn thành = lúc việc bên trong cuối cùng hoàn thành (không phải lúc hệ thống đồng bộ). */
function epicDoneAt(epicId: number) {
  return get<{ t: string | null }>(`SELECT MAX(resolved_at) t FROM issues WHERE parent_id = ? AND type IN ${WORK_TYPES}`, epicId)?.t ?? null;
}
export function syncAllEpics() {
  for (const e of all<{ id: number }>("SELECT id FROM issues WHERE type = 'epic'")) tx(() => syncEpicStatus(e.id, null));
  // Sửa ngày hoàn thành của Epic đã tự chuyển Hoàn thành trước đây (từng lấy nhầm thời điểm đồng bộ)
  for (const e of all<{ id: number; resolved_at: string | null }>(`SELECT i.id, i.resolved_at FROM issues i JOIN statuses s ON s.id = i.status_id
    WHERE i.type = 'epic' AND s.category = 'done'`)) {
    if (!epicWorkCount(e.id)) continue;
    const t = epicDoneAt(e.id);
    if (t && t !== e.resolved_at) run('UPDATE issues SET resolved_at = ? WHERE id = ?', t, e.id);
  }
}

export function getIssueRow(key: string) {
  const k = key.toUpperCase();
  const row = get<IssueRow>('SELECT * FROM issues WHERE key = ?', k)
    // Issue đã chuyển sang dự án khác: mã cũ vẫn mở được (như Jira)
    ?? get<IssueRow>(`SELECT i.* FROM issue_history h JOIN issues i ON i.id = h.issue_id
         WHERE h.field = 'moved' AND h.old_label = ? ORDER BY h.id DESC LIMIT 1`, k);
  if (!row) throw notFound('Không tìm thấy issue');
  return row;
}
