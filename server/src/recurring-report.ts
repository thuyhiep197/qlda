/**
 * Tự sinh task làm báo cáo họp giao ban theo kỳ tuần, theo cách các task trước đã tạo trong Epic:
 * nhân bản task tuần gần nhất (người thực hiện, ưu tiên, liên kết), ngày bắt đầu và hạn là thứ Năm cuối kỳ.
 *
 * Kỳ báo cáo: thứ Sáu → thứ Năm. Task sinh lúc 8h thứ Năm (giờ Việt Nam), ở trạng thái đang thực hiện.
 * Mỗi kỳ sinh một lần: kỳ đã xử lý ghi vào settings nên task bị xóa tay sẽ không sinh lại;
 * trong Epic đã có task của kỳ đó (tạo tay) thì không sinh thêm. Qua hạn của Epic thì dừng.
 */
import { all, get, getSetting, run, setSetting, tx } from './db.ts';
import { addHistory, createIssue, type IssueRow } from './issues.ts';
import { notify } from './notify.ts';
import { typeStatuses } from './workflow.ts';
import type { Permission } from './permissions.ts';

const VN_OFFSET = 7 * 3600_000;
const DAY = 86400_000;
const CREATE_HOUR = 8;

export type ReportRule = {
  epicKey: string;
  /** Thứ Năm cuối kỳ của tuần 1, dùng để đánh số tuần */
  week1Thursday: string;
  /** Kỳ đầu tiên được tự sinh (thứ Năm cuối kỳ), các kỳ trước không sinh bù */
  firstThursday: string;
};

export const REPORT_RULES: ReportRule[] = [
  { epicKey: 'QLTB-406', week1Thursday: '2026-10-01', firstThursday: '2026-11-12' },
];

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (date: string, n: number) => iso(Date.parse(`${date}T00:00:00Z`) + n * DAY);
const vnDate = (date: string) => date.split('-').reverse().join('/');

/** Thứ Năm cuối kỳ gần nhất đã đến giờ sinh task, tính theo giờ Việt Nam */
export function dueThursday(at: Date) {
  const vn = new Date(at.getTime() + VN_OFFSET);
  let back = (vn.getUTCDay() - 4 + 7) % 7;
  if (back === 0 && vn.getUTCHours() < CREATE_HOUR) back = 7;
  return iso(vn.getTime() - back * DAY);
}

export const weekNumber = (thursday: string, week1Thursday: string) =>
  Math.round((Date.parse(thursday) - Date.parse(week1Thursday)) / (7 * DAY)) + 1;

/** Kỳ báo cáo của thứ Năm cuối kỳ: từ thứ Sáu tuần trước, gửi trước họp sáng thứ Sáu kế tiếp */
export const reportPeriod = (thursday: string) => ({ from: addDays(thursday, -6), to: thursday, send: addDays(thursday, 1) });

const weekRe = (week?: number) => new RegExp(`tuần\\s*0*${week ?? '\\d+'}(?!\\d)`, 'i');
const settingKey = (rule: ReportRule) => `recurring_report:${rule.epicKey}`;
const isActiveMember = (projectId: number, userId: number | null) => !!userId && !!get(
  `SELECT 1 FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ? AND pm.user_id = ? AND u.is_active = 1`, projectId, userId);

/** Sinh task của kỳ đến hạn cho một quy tắc; trả về mã task mới, không sinh thì trả về null */
export function runReportRule(rule: ReportRule, at = new Date()): string | null {
  const thursday = dueThursday(at);
  if (thursday < rule.firstThursday) return null;
  const last = getSetting(settingKey(rule));
  if (last && last >= thursday) return null;
  const epic = get<IssueRow>("SELECT * FROM issues WHERE key = ? AND type = 'epic'", rule.epicKey);
  if (!epic) return null;
  if (epic.due_date && epic.due_date < thursday) return null;
  if (get<{ is_archived: number }>('SELECT is_archived FROM projects WHERE id = ?', epic.project_id)?.is_archived) return null;

  return tx(() => {
    const week = weekNumber(thursday, rule.week1Thursday);
    const children = all<IssueRow>("SELECT * FROM issues WHERE parent_id = ? AND type <> 'subtask' ORDER BY number DESC", epic.id);
    setSetting(settingKey(rule), thursday);
    if (children.some((c) => c.due_date === thursday || weekRe(week).test(c.summary))) return null;

    const status = typeStatuses(epic.project_id, 'task').find((s) => s.category === 'inprogress');
    if (!status) throw new Error(`Dự án của ${rule.epicKey} không có trạng thái đang thực hiện`);
    const template = children.find((c) => weekRe().test(c.summary));
    const assigneeId = [template?.assignee_id, epic.assignee_id].find((id) => isActiveMember(epic.project_id, id ?? null)) ?? null;
    const reporterId = template?.reporter_id ?? epic.reporter_id;
    const { from, to, send } = reportPeriod(thursday);

    const perms = new Set<Permission>(['issue.create', 'issue.assign', 'issue.transition']);
    const created = createIssue({ id: reporterId } as Parameters<typeof createIssue>[0], epic.project_id, perms, {
      type: 'task',
      summary: `Báo cáo tuần và nhật ký thi công tuần ${week}`,
      description: `Kỳ báo cáo: ${vnDate(from)} – ${vnDate(to)}.\nGửi Báo cáo tuần và Nhật ký thi công trước 8h30 ngày ${vnDate(send)}, trước giờ họp giao ban 9h.\n\nTask do hệ thống tự sinh theo kỳ báo cáo của Epic ${rule.epicKey}.`,
      priority: template?.priority ?? 'high',
      assignee_id: assigneeId,
      parent_id: epic.id,
      status_id: status.id,
      start_date: thursday,
      due_date: thursday,
    });
    if (template) {
      run('INSERT OR IGNORE INTO issue_links(source_id, target_id, type, created_by) VALUES (?,?,?,?)', created.id, template.id, 'relates', reporterId);
      addHistory(created.id, null, 'cloned', null, template.key);
    }
    // createIssue không báo cho chính người tạo; task do hệ thống sinh thì người thực hiện vẫn cần biết
    if (assigneeId && assigneeId === reporterId) notify([assigneeId], null, created.id, 'assigned', created.summary);
    return created.key as string;
  });
}

/** Chạy mọi quy tắc; lỗi của một quy tắc chỉ ghi log, không làm dừng máy chủ */
export function generateRecurringReports(at = new Date()) {
  for (const rule of REPORT_RULES) {
    try {
      const key = runReportRule(rule, at);
      if (key) console.log(`[recurring-report] ${rule.epicKey}: đã sinh ${key}`);
    } catch (e) {
      console.error(`[recurring-report] ${rule.epicKey}:`, e);
    }
  }
}
