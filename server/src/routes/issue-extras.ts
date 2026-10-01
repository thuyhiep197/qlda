/**
 * Chức năng bổ sung cho issue theo Jira: ghi thời gian làm việc, thao tác hàng loạt,
 * nhân bản, chuyển sang dự án khác.
 */
import { Router } from 'express';
import { all, get, now, run, tx } from '../db.ts';
import {
  addHistory, createIssue, deleteIssue, fetchIssue, fmtMinutes, getIssueRow, parseDuration, syncEpicStatus, updateIssue,
  type IssueRow,
} from '../issues.ts';
import { badRequest, canEditIssue, forbidden, notFound, requireProjectAccess } from '../permissions.ts';
import { watch } from '../notify.ts';
import { typeStatuses } from '../workflow.ts';

const r = Router();

const checkWorkDate = (v: unknown) => {
  const s = String(v || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw badRequest('Ngày làm việc không hợp lệ');
  return s;
};

// ---------------------------------------------------------------------------
// Ghi thời gian làm việc (worklog)
// ---------------------------------------------------------------------------
r.get('/:key/worklogs', (req, res) => {
  const row = getIssueRow(String(req.params.key));
  if (!requireProjectAccess(req.user, row.project_id).has('worklog.view')) throw forbidden('Bạn không có quyền xem giờ công');
  res.json(all(`SELECT w.*, u.full_name AS user_name FROM worklogs w JOIN users u ON u.id = w.user_id
    WHERE w.issue_id = ? ORDER BY w.work_date DESC, w.id DESC`, row.id));
});

/**
 * Ghi giờ. remaining: 'auto' (trừ vào thời gian còn lại — mặc định), 'set' (đặt lại bằng remaining_value), 'keep'.
 */
r.post('/:key/worklogs', (req, res) => {
  const row = getIssueRow(String(req.params.key));
  const perms = requireProjectAccess(req.user, row.project_id);
  if (!perms.has('worklog.create')) throw forbidden('Bạn không có quyền ghi thời gian cho issue');
  const b = req.body || {};
  const minutes = parseDuration(b.time_spent, 'Thời gian đã làm');
  if (!minutes) throw badRequest('Nhập thời gian đã làm, VD: 2h 30m');
  const date = checkWorkDate(b.work_date);
  const mode = String(b.remaining || 'auto');
  tx(() => {
    run('INSERT INTO worklogs(issue_id, user_id, work_date, minutes, comment, created_at) VALUES (?,?,?,?,?,?)',
      row.id, req.user.id, date, minutes, String(b.comment || '').trim() || null, now());
    let remaining = row.remaining_estimate;
    if (mode === 'set') remaining = parseDuration(b.remaining_value, 'Thời gian còn lại') ?? 0;
    else if (mode === 'auto' && remaining !== null) remaining = Math.max(0, remaining - minutes);
    if (remaining !== row.remaining_estimate) {
      run('UPDATE issues SET remaining_estimate = ? WHERE id = ?', remaining, row.id);
    }
    run('UPDATE issues SET updated_at = ? WHERE id = ?', now(), row.id);
    addHistory(row.id, req.user.id, 'worklog', null, minutes, null, `${fmtMinutes(minutes)} (ngày ${date.split('-').reverse().join('/')})`);
    watch(row.id, [req.user.id]);
  });
  res.status(201).json({ ok: true });
});

function loadWorklog(req: Express.Request & { params: any }, perm: 'worklog.edit' | 'worklog.delete') {
  const w = get<{ id: number; issue_id: number; user_id: number; minutes: number; project_id: number }>(
    'SELECT w.*, i.project_id FROM worklogs w JOIN issues i ON i.id = w.issue_id WHERE w.id = ?', Number(req.params.id));
  if (!w) throw notFound();
  const perms = requireProjectAccess(req.user, w.project_id);
  if (w.user_id !== req.user.id && !perms.has(perm)) throw forbidden('Bạn chỉ sửa/xóa được giờ do mình ghi');
  return w;
}

r.patch('/worklogs/:id', (req, res) => {
  const w = loadWorklog(req, 'worklog.edit');
  const b = req.body || {};
  const minutes = b.time_spent !== undefined ? parseDuration(b.time_spent, 'Thời gian đã làm') : w.minutes;
  if (!minutes) throw badRequest('Thời gian đã làm phải lớn hơn 0');
  run('UPDATE worklogs SET minutes = ?, work_date = COALESCE(?, work_date), comment = COALESCE(?, comment), updated_at = ? WHERE id = ?',
    minutes, b.work_date ? checkWorkDate(b.work_date) : null, b.comment !== undefined ? String(b.comment).trim() : null, now(), w.id);
  res.json({ ok: true });
});

r.delete('/worklogs/:id', (req, res) => {
  const w = loadWorklog(req, 'worklog.delete');
  run('DELETE FROM worklogs WHERE id = ?', w.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Thao tác hàng loạt: đổi sprint (kèm vị trí), người thực hiện, trạng thái, ưu tiên, phiên bản, thêm nhãn; hoặc xóa
// ---------------------------------------------------------------------------
const BULK_FIELDS = ['sprint_id', 'assignee_id', 'status_id', 'priority', 'version_id', 'component_id', 'ba_id'];

r.post('/bulk', (req, res) => {
  const b = req.body || {};
  const keys: string[] = Array.isArray(b.keys) ? [...new Set(b.keys.map((k: unknown) => String(k).toUpperCase()))] as string[] : [];
  if (!keys.length) throw badRequest('Chưa chọn issue nào');
  if (keys.length > 500) throw badRequest('Mỗi lần tối đa 500 issue');
  const changes: Record<string, unknown> = {};
  for (const f of BULK_FIELDS) if (b.changes && Object.prototype.hasOwnProperty.call(b.changes, f)) changes[f] = b.changes[f];
  const addLabels: string[] = Array.isArray(b.changes?.labels_add) ? b.changes.labels_add.map(String).filter(Boolean) : [];
  // Đổi loại: Story/Task/Bug đổi loại issue; với việc con thì đổi "loại việc con" (vẫn là việc con của issue cha)
  const typeTo = b.changes?.type_to ? String(b.changes.type_to) : '';
  if (typeTo && !['story', 'task', 'bug'].includes(typeTo)) throw badRequest('Chỉ đổi được sang Story, Task hoặc Bug');
  if (!b.delete && !Object.keys(changes).length && !addLabels.length && !typeTo) throw badRequest('Chưa chọn thay đổi nào');

  // Vị trí khi đưa cả nhóm vào sprint/backlog: dàn đều giữa issue phía trên (after_id) và phía dưới (before_id)
  const rankOf = (id: unknown) => (id ? get<{ rank: number }>('SELECT rank FROM issues WHERE id = ?', Number(id))?.rank : undefined);
  const a = rankOf(b.after_id), z = rankOf(b.before_id);
  const ranks = keys.map((_, i) => (a !== undefined && z !== undefined ? a + ((z - a) * (i + 1)) / (keys.length + 1)
    : a !== undefined ? a + 1000 * (i + 1) : z !== undefined ? z - 1000 * (keys.length - i) : undefined));

  const results: { key: string; ok: boolean; error?: string }[] = [];
  keys.forEach((key, i) => {
    try {
      tx(() => {
        const row = getIssueRow(key);
        const perms = requireProjectAccess(req.user, row.project_id);
        if (b.delete) {
          if (!perms.has('issue.delete')) throw forbidden('Không có quyền xóa');
          deleteIssue(row);
          return;
        }
        const data: Record<string, unknown> = { ...changes };
        // Sub-task không đổi sprint trực tiếp; Epic không vào sprint — bỏ qua trường sprint cho các loại này
        if ('sprint_id' in data && (row.type === 'subtask' || row.type === 'epic')) delete data.sprint_id;
        if (typeTo) {
          if (row.type === 'epic') throw badRequest('Epic không đổi được loại');
          if (row.type === 'subtask') data.subtype = typeTo;
          else data.type = typeTo;
        }
        if (addLabels.length) data.labels = [...new Set([...(row.labels ? row.labels.split(',') : []), ...addLabels])];
        if (ranks[i] !== undefined && 'sprint_id' in data) data.rank = ranks[i];
        if (!Object.keys(data).length) return;
        updateIssue(req.user, row, perms, data);
      });
      results.push({ key, ok: true });
    } catch (e) {
      results.push({ key, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
  res.json({ ok: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok).length, results });
});

// ---------------------------------------------------------------------------
// Nhân bản issue
// ---------------------------------------------------------------------------
r.post('/:key/clone', (req, res) => {
  const row = getIssueRow(String(req.params.key));
  const perms = requireProjectAccess(req.user, row.project_id);
  const b = req.body || {};
  const summary = String(b.summary || `Bản sao - ${row.summary}`).slice(0, 255);
  const copy = (src: IssueRow, over: Record<string, unknown>) => {
    const sprint = src.sprint_id ? get<{ state: string }>('SELECT state FROM sprints WHERE id = ?', src.sprint_id) : null;
    const assigneeOk = src.assignee_id && get('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?', src.project_id, src.assignee_id);
    return createIssue(req.user, src.project_id, perms, {
      type: src.type, summary: src.summary, description: src.description, priority: src.priority,
      assignee_id: assigneeOk && (src.assignee_id === req.user.id || perms.has('issue.assign')) ? src.assignee_id : null,
      parent_id: src.parent_id, sprint_id: sprint && sprint.state !== 'closed' ? src.sprint_id : null,
      story_points: src.story_points, labels: src.labels ? src.labels.split(',') : [], start_date: src.start_date,
      due_date: src.due_date, version_id: src.version_id, component_id: src.component_id, subtype: src.subtype,
      original_estimate: src.original_estimate !== null ? src.original_estimate / 60 : null,
      ...over,
    });
  };
  const created = tx(() => {
    const issue = copy(row, { summary });
    if (b.include_subtasks) {
      for (const st of all<IssueRow>("SELECT * FROM issues WHERE parent_id = ? AND type = 'subtask' ORDER BY rank", row.id)) {
        copy(st, { parent_id: issue.id });
      }
    }
    run('INSERT OR IGNORE INTO issue_links(source_id, target_id, type, created_by) VALUES (?,?,?,?)', issue.id, row.id, 'relates', req.user.id);
    addHistory(issue.id, req.user.id, 'cloned', null, row.key);
    return issue;
  });
  res.status(201).json(fetchIssue('id', created.id));
});

// ---------------------------------------------------------------------------
// Chuyển issue sang dự án khác (sub-task đi theo issue cha)
// ---------------------------------------------------------------------------
r.post('/:key/move-project', (req, res) => {
  const row = getIssueRow(String(req.params.key));
  const srcPerms = requireProjectAccess(req.user, row.project_id);
  if (!srcPerms.has('issue.delete')) throw forbidden('Cần quyền xóa issue ở dự án hiện tại để chuyển issue đi');
  if (row.type === 'subtask') throw badRequest('Sub-task đi theo issue cha; hãy chuyển issue cha');
  const target = get<{ id: number; key: string; is_archived: number }>('SELECT * FROM projects WHERE key = ?', String(req.body?.project_key || '').toUpperCase());
  if (!target || target.is_archived) throw badRequest('Dự án đích không hợp lệ');
  if (target.id === row.project_id) throw badRequest('Issue đã ở dự án này');
  const dstPerms = requireProjectAccess(req.user, target.id);
  if (!dstPerms.has('issue.create')) throw forbidden('Bạn không có quyền tạo issue ở dự án đích');

  const moved = tx(() => {
    const items = [row, ...all<IssueRow>("SELECT * FROM issues WHERE parent_id = ? AND type = 'subtask' ORDER BY rank", row.id)];
    const oldKey = row.key;
    for (const it of items) {
      const cat = get<{ category: string }>('SELECT category FROM statuses WHERE id = ?', it.status_id)!.category;
      const list = typeStatuses(target.id, it.type);
      const st = list.find((s) => s.category === cat) ?? list[0];
      if (!st) throw badRequest('Dự án đích chưa có trạng thái');
      run('UPDATE projects SET issue_seq = issue_seq + 1 WHERE id = ?', target.id);
      const seq = get<{ issue_seq: number }>('SELECT issue_seq FROM projects WHERE id = ?', target.id)!.issue_seq;
      const member = it.assignee_id && get(`SELECT 1 FROM users u WHERE u.id = ? AND (u.is_admin = 1 OR EXISTS
        (SELECT 1 FROM project_members pm WHERE pm.project_id = ? AND pm.user_id = u.id))`, it.assignee_id, target.id);
      const rank = (get<{ r: number | null }>('SELECT MAX(rank) r FROM issues WHERE project_id = ?', target.id)!.r ?? 0) + 1000;
      run(`UPDATE issues SET project_id = ?, number = ?, key = ?, status_id = ?, sprint_id = NULL, version_id = NULL, component_id = NULL, ba_id = NULL,
           parent_id = ?, assignee_id = ?, rank = ?, updated_at = ? WHERE id = ?`,
      target.id, seq, `${target.key}-${seq}`, st.id, it.id === row.id ? null : it.parent_id, member ? it.assignee_id : null, rank, now(), it.id);
      addHistory(it.id, req.user.id, 'moved', it.key, `${target.key}-${seq}`, it.key, `${target.key}-${seq}`);
    }
    // Epic chuyển đi: các issue con ở lại dự án cũ, bỏ liên kết epic
    if (row.type === 'epic') run('UPDATE issues SET parent_id = NULL WHERE parent_id = ? AND project_id <> ?', row.id, target.id);
    // Issue rời khỏi Epic ở dự án cũ → Epic đó tự cập nhật trạng thái
    if (row.type !== 'epic' && row.type !== 'subtask') syncEpicStatus(row.parent_id, req.user.id);
    return { from: oldKey, to: get<{ key: string }>('SELECT key FROM issues WHERE id = ?', row.id)!.key };
  });
  res.json(moved);
});

export default r;
