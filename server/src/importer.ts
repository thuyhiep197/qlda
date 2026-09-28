/**
 * Nhập issue hàng loạt (từ file Excel mẫu của QLDA hoặc CSV xuất từ Jira).
 * Giao diện đọc file và gửi lên các dòng đã quy về khóa chuẩn; server chuẩn hóa giá trị,
 * tạo issue trong MỘT transaction bằng chính createIssue(), rồi:
 *  - chế độ xem trước (commit = false): luôn rollback, chỉ trả kết quả kiểm tra từng dòng;
 *  - chế độ nhập (commit = true): có dòng lỗi thì rollback toàn bộ, không nhập dở dang.
 */
import { all, get, tx } from './db.ts';
import { createIssue } from './issues.ts';
import { isStatusAllowed } from './workflow.ts';
import { badRequest, forbidden, type AuthUser, type Permission } from './permissions.ts';

export interface ImportRow {
  row: number;
  ref?: string;
  type?: string;
  summary?: string;
  description?: string;
  parent?: string;
  priority?: string;
  assignee?: string;
  story_points?: string;
  sprint?: string;
  status?: string;
  labels?: string;
  start_date?: string;
  due_date?: string;
}

export interface ImportResult {
  row: number;
  type: string | null;
  summary: string;
  parent: string | null;
  assignee: string | null;
  sprint: string | null;
  key?: string;
  errors: string[];
  warnings: string[];
}

export const MAX_IMPORT_ROWS = 1000;

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v)).trim();
/** Chuẩn hóa để so khớp: chữ thường, bỏ dấu tiếng Việt, gộp khoảng trắng. */
const fold = (v: unknown) => str(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/\s+/g, ' ');

const TYPE_MAP: Record<string, string> = {
  epic: 'epic', story: 'story', 'user story': 'story', task: 'task', 'cong viec': 'task',
  bug: 'bug', loi: 'bug', defect: 'bug', 'sub-task': 'subtask', subtask: 'subtask', 'sub task': 'subtask',
};
const PRIORITY_MAP: Record<string, string> = {
  'khan cap': 'highest', cao: 'high', 'trung binh': 'medium', thap: 'low', 'rat thap': 'lowest',
  highest: 'highest', blocker: 'highest', critical: 'highest', high: 'high', major: 'high',
  medium: 'medium', normal: 'medium', low: 'low', minor: 'low', lowest: 'lowest', trivial: 'lowest',
};
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Nhận YYYY-MM-DD, dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy và kiểu Jira "28/Sep/26 10:00 AM". */
function parseDate(v: string): string | null | undefined {
  const s = str(v);
  if (!s) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const ok = (y: number, m: number, d: number) => {
    if (y < 100) y += 2000;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : undefined;
  };
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return ok(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[/ -]([A-Za-z]{3})[a-z]*[/ -](\d{2,4})/);
  if (m && MONTHS.includes(m[2].toLowerCase())) return ok(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  return undefined;
}

export function runImport(user: AuthUser, projectId: number, perms: Set<Permission>, input: unknown, commit: boolean) {
  if (!perms.has('issue.import')) throw forbidden('Bạn không có quyền nhập issue từ file');
  if (!Array.isArray(input) || input.length === 0) throw badRequest('File không có dòng dữ liệu nào');
  if (input.length > MAX_IMPORT_ROWS) throw badRequest(`Mỗi lần nhập tối đa ${MAX_IMPORT_ROWS} dòng, file có ${input.length} dòng`);
  const rows = input as ImportRow[];

  // Danh mục tra cứu của dự án
  const members = all<{ id: number; username: string; full_name: string; email: string | null }>(
    `SELECT u.id, u.username, u.full_name, u.email FROM project_members pm JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = ? AND u.is_active = 1`, projectId);
  const memberBy = new Map<string, number>();
  for (const m of members) {
    for (const k of [m.username, m.full_name, m.email]) if (k && !memberBy.has(fold(k))) memberBy.set(fold(k), m.id);
  }
  const statuses = all<{ id: number; name: string; category: string }>('SELECT id, name, category FROM statuses WHERE project_id = ? ORDER BY position, id', projectId);
  const statusBy = new Map(statuses.map((s) => [fold(s.name), s.id]));
  const firstOf = (cat: string) => statuses.find((s) => s.category === cat)?.id;
  const STATUS_ALIASES: Record<string, string> = {
    'to do': 'todo', todo: 'todo', open: 'todo', backlog: 'todo', new: 'todo', 'selected for development': 'todo', 'can lam': 'todo',
    'in progress': 'inprogress', 'in review': 'inprogress', review: 'inprogress', testing: 'inprogress', 'dang lam': 'inprogress',
    done: 'done', closed: 'done', resolved: 'done', 'hoan thanh': 'done',
  };
  const sprints = all<{ id: number; name: string; state: string }>('SELECT id, name, state FROM sprints WHERE project_id = ?', projectId);
  const sprintBy = new Map(sprints.map((s) => [fold(s.name), s]));

  // Bước 1: chuẩn hóa từng dòng
  const results: ImportResult[] = [];
  const prepared = rows.map((r, i) => {
    const res: ImportResult = {
      row: Number(r.row) || i + 2, type: null, summary: str(r.summary), parent: str(r.parent) || null,
      assignee: str(r.assignee) || null, sprint: str(r.sprint) || null, errors: [], warnings: [],
    };
    results.push(res);
    const data: Record<string, unknown> = { summary: str(r.summary), description: str(r.description) || null };

    const typeRaw = str(r.type);
    const type = typeRaw ? TYPE_MAP[fold(typeRaw)] : 'task';
    if (!type) res.errors.push(`Loại issue "${typeRaw}" không hợp lệ (Epic, Story, Task, Bug, Sub-task)`);
    else { res.type = type; data.type = type; if (!typeRaw) res.warnings.push('Không ghi loại, mặc định là Task'); }

    if (!data.summary) res.errors.push('Thiếu tiêu đề');
    else if (String(data.summary).length > 255) res.errors.push('Tiêu đề dài quá 255 ký tự');

    if (str(r.priority)) {
      const p = PRIORITY_MAP[fold(r.priority)];
      if (p) data.priority = p;
      else res.warnings.push(`Độ ưu tiên "${str(r.priority)}" không nhận ra, dùng Trung bình`);
    }

    if (res.assignee) {
      const inParen = res.assignee.match(/\(([^()]+)\)\s*$/)?.[1];
      const id = memberBy.get(fold(inParen ?? res.assignee)) ?? memberBy.get(fold(res.assignee));
      if (!id) res.warnings.push(`Không tìm thấy "${res.assignee}" trong thành viên dự án, để trống người thực hiện`);
      else if (id !== user.id && !perms.has('issue.assign')) res.warnings.push('Bạn không có quyền giao việc cho người khác, để trống người thực hiện');
      else data.assignee_id = id;
    }

    if (str(r.story_points)) {
      const n = Number(str(r.story_points).replace(',', '.'));
      if (Number.isFinite(n) && n >= 0 && n <= 1000) data.story_points = n;
      else res.warnings.push(`Điểm ước lượng "${str(r.story_points)}" không hợp lệ, bỏ qua`);
    }

    if (str(r.labels)) data.labels = str(r.labels).split(/[,;]/).map((x) => x.trim()).filter(Boolean);

    for (const [k, label] of [['start_date', 'Ngày bắt đầu'], ['due_date', 'Hạn hoàn thành']] as const) {
      const d = parseDate(str(r[k]));
      if (d === undefined) res.warnings.push(`${label} "${str(r[k])}" không đúng định dạng ngày, bỏ qua`);
      else if (d) data[k] = d;
    }

    if (str(r.status)) {
      const key = fold(r.status);
      const id = statusBy.get(key) ?? (STATUS_ALIASES[key] ? firstOf(STATUS_ALIASES[key]) : undefined);
      if (id) {
        data.status_id = id;
        if (type && !isStatusAllowed(projectId, type, id)) {
          res.warnings.push(`Trạng thái "${str(r.status)}" không thuộc workflow của loại này, dùng trạng thái cùng nhóm`);
        }
      }
      else res.warnings.push(`Trạng thái "${str(r.status)}" không có trong dự án, dùng trạng thái đầu tiên`);
    }

    if (res.sprint) {
      const sp = sprintBy.get(fold(res.sprint));
      if (type === 'epic' || type === 'subtask') res.warnings.push(`${type === 'epic' ? 'Epic' : 'Sub-task'} không gán sprint trực tiếp, bỏ qua cột Sprint`);
      else if (!sp) res.warnings.push(`Không có sprint "${res.sprint}" trong dự án, đưa vào Backlog`);
      else if (sp.state === 'closed') res.warnings.push(`Sprint "${res.sprint}" đã đóng, đưa vào Backlog`);
      else data.sprint_id = sp.id;
    }
    return { res, data, ref: fold(r.ref) };
  });

  // Tham chiếu issue cha: mã dòng trong file → mã issue đã có (VD QLTB-12) → tiêu đề trong file → tiêu đề issue đã có
  const byRef = new Map<string, number>();
  const byTitle = new Map<string, number[]>();
  prepared.forEach((p, i) => {
    if (p.ref) {
      if (byRef.has(p.ref)) p.res.errors.push(`Mã dòng "${str(rows[i].ref)}" bị trùng với dòng ${prepared[byRef.get(p.ref)!].res.row}`);
      else byRef.set(p.ref, i);
    }
    const t = fold(p.data.summary);
    if (t) byTitle.set(t, [...(byTitle.get(t) || []), i]);
  });

  const resolveParent = (i: number): { row?: number; id?: number; error?: string } => {
    const p = prepared[i];
    const raw = p.res.parent;
    if (!raw) return {};
    const f = fold(raw);
    if (byRef.has(f)) return { row: byRef.get(f) };
    const existing = get<{ id: number }>('SELECT id FROM issues WHERE project_id = ? AND key = ?', projectId, raw.toUpperCase());
    if (existing) return { id: existing.id };
    const same = (byTitle.get(f) || []).filter((j) => j !== i);
    if (same.length === 1) return { row: same[0] };
    if (same.length > 1) return { error: `Issue cha "${raw}" trùng tiêu đề với nhiều dòng, hãy dùng cột Mã dòng` };
    const wanted = p.data.type === 'subtask' ? "type IN ('story','task','bug')" : "type = 'epic'";
    const found = all<{ id: number }>(`SELECT id FROM issues WHERE project_id = ? AND ${wanted} AND lower(summary) = lower(?)`, projectId, raw);
    if (found.length === 1) return { id: found[0].id };
    return { error: `Không tìm thấy issue cha "${raw}" (trong file hoặc trong dự án)` };
  };

  // Bước 2: tạo theo thứ tự dòng trong file (mã issue tăng theo thứ tự đó);
  // nếu issue cha nằm ở dòng phía sau thì tạo issue cha trước
  const parents = prepared.map((_, i) => resolveParent(i));
  const order: number[] = [];
  const state = new Map<number, 'visiting' | 'done'>();
  const visit = (i: number) => {
    if (state.get(i) === 'done') return;
    if (state.get(i) === 'visiting') {
      prepared[i].res.errors.push('Issue cha tham chiếu vòng tròn (A là cha của B và B là cha của A)');
      return;
    }
    state.set(i, 'visiting');
    const pr = parents[i].row;
    if (pr !== undefined) visit(pr);
    state.set(i, 'done');
    order.push(i);
  };
  prepared.forEach((_, i) => visit(i));

  const ROLLBACK = Symbol('rollback');
  const createdIds = new Map<number, number>();
  let created = 0;
  try {
    tx(() => {
      for (const i of order) {
        const { res, data } = prepared[i];
        if (res.errors.length) continue;
        const parent = parents[i];
        if (parent.error) {
          if (data.type === 'subtask') { res.errors.push(parent.error); continue; }
          res.warnings.push(`${parent.error}; issue được tạo không thuộc epic`);
        } else if (parent.row !== undefined) {
          const pid = createdIds.get(parent.row);
          if (!pid) { res.errors.push(`Issue cha ở dòng ${prepared[parent.row].res.row} bị lỗi nên không tạo được dòng này`); continue; }
          data.parent_id = pid;
        } else if (parent.id) data.parent_id = parent.id;
        try {
          const issue = createIssue(user, projectId, perms, data);
          createdIds.set(i, issue.id);
          if (commit) res.key = issue.key;
          created++;
        } catch (e) {
          res.errors.push(e instanceof Error ? e.message : String(e));
        }
      }
      if (!commit || results.some((r) => r.errors.length)) throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  const hasErrors = results.some((r) => r.errors.length);
  return {
    committed: commit && !hasErrors,
    created: commit && !hasErrors ? created : 0,
    valid: results.filter((r) => !r.errors.length).length,
    errors: results.filter((r) => r.errors.length).length,
    warnings: results.filter((r) => r.warnings.length).length,
    results,
  };
}
