import type { Category, Issue, IssueType, Priority, Project, Status } from './types';

/** Chức năng Phát hành (phiên bản): đang tắt theo yêu cầu. Dữ liệu phía server vẫn giữ nguyên; đổi thành true để bật lại. */
export const RELEASES_ENABLED = false;

export const TYPE_LABELS: Record<IssueType, string> = {
  epic: 'Epic', story: 'Story', task: 'Task', bug: 'Bug', subtask: 'Sub-task',
};
export const PRIORITY_LABELS: Record<Priority, string> = {
  highest: 'Khẩn cấp', high: 'Cao', medium: 'Trung bình', low: 'Thấp', lowest: 'Rất thấp',
};
export const PRIORITIES: Priority[] = ['highest', 'high', 'medium', 'low', 'lowest'];
export const CATEGORY_LABELS: Record<Category, string> = {
  todo: 'Cần làm', inprogress: 'Đang thực hiện', done: 'Hoàn thành',
};
/** Side của hệ thống: phân hệ Sở, phân hệ các Trường, hoặc dùng chung. */
export const SIDE_LABELS: Record<'so' | 'truong' | 'chung', string> = { so: 'Sở', truong: 'Trường', chung: 'Chung' };

// Ưu tiên & trạng thái của DỰ ÁN (theo danh mục trong bảng quản lý dự án của BA) — khác ưu tiên/trạng thái của issue
export const PROJECT_PRIORITIES: [string, string][] = [
  ['Rất cao', 'red'], ['Cao', 'yellow'], ['Bình thường', 'blue'], ['Thấp', 'default'], ['Ổn định', 'green'], ['Pending', 'purple'],
];
/** Trạng thái dự án = giai đoạn trong vòng đời dự án (cùng danh sách với "Giai đoạn dự án" của Epic, server/src/phases.ts) */
export const PROJECT_STATUSES: [string, string][] = [
  ['Chưa bắt đầu', 'default'], ['Trình chủ trương', 'purple'], ['Lập HSYC', 'purple'], ['Khảo sát, phân tích', 'blue'],
  ['Xây dựng', 'blue'], ['Kiểm thử', 'yellow'], ['Triển khai', 'green'], ['Nghiệm thu', 'green'], ['Hỗ trợ vận hành', 'default'],
];
export const lozengeOf = (list: [string, string][], v: string | null) => `lozenge lozenge-${list.find(([n]) => n === v)?.[1] ?? 'default'}`;

export const FIELD_LABELS: Record<string, string> = {
  created: 'đã tạo issue', summary: 'Tiêu đề', description: 'Mô tả', note: 'Ghi chú', type: 'Loại', priority: 'Độ ưu tiên',
  story_points: 'Điểm ước lượng', labels: 'Nhãn', start_date: 'Ngày bắt đầu', due_date: 'Hạn hoàn thành',
  assignee: 'Người thực hiện', parent: 'Issue cha', sprint: 'Sprint', status: 'Trạng thái',
  attachment: 'Tệp đính kèm', link: 'Liên kết', version: 'Phiên bản', component: 'Mô-đun', ba: 'BA phụ trách', subtype: 'Loại việc con', phase: 'Giai đoạn dự án', flagged: 'Đánh dấu quan trọng', original_estimate: 'Ước lượng thời gian',
  remaining_estimate: 'Thời gian còn lại', worklog: 'Ghi giờ', moved: 'Chuyển dự án', cloned: 'Nhân bản từ',
};

export function fmtDate(v?: string | null) {
  if (!v) return '';
  const d = v.length === 10 ? new Date(`${v}T00:00:00`) : new Date(v);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDateTime(v?: string | null) {
  if (!v) return '';
  return new Date(v).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(v: string) {
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} ngày trước`;
  return fmtDate(v);
}

export function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const PALETTE = ['#0c66e4', '#1f845a', '#ae2e24', '#6e5dc6', '#b65c02', '#0b7285', '#943d73', '#5b7f24', '#c9372c', '#1d7afc'];
export function colorOf(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts.length > 1 ? parts[parts.length - 2][0] : '') + parts[parts.length - 1][0]).toUpperCase();
}

export const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); };
export const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400_000).toISOString().slice(0, 10);

export const isOverdue = (i: { due_date: string | null; status_category: Category }) =>
  !!i.due_date && i.status_category !== 'done' && i.due_date < today();

/** Trạng thái loại issue được dùng (theo workflow của dự án), theo thứ tự cột. */
export function statusesFor(project: Project, type: IssueType): Status[] {
  const ids = project.type_statuses?.[type];
  return ids?.length ? project.statuses.filter((s) => ids.includes(s.id)) : project.statuses;
}

/** Có được chuyển issue loại `type` từ trạng thái `from` sang `to` không (giống kiểm tra ở server). */
export function canMove(project: Project, type: IssueType, from: number, to: number): boolean {
  if (!statusesFor(project, type).some((s) => s.id === to)) return false;
  if (from === to || !project.workflow_strict) return true;
  const scope = project.transitions.some((t) => t.issue_type === type) ? type : '';
  return project.transitions.some((t) => t.issue_type === scope && t.from_status_id === from && t.to_status_id === to);
}

/** Giải thích ngắn từng loại issue, hiển thị ở tooltip mọi nơi có biểu tượng loại issue. */
export const TYPE_TIPS: Record<IssueType, string> = {
  epic: 'Nhóm công việc lớn (mô-đun)',
  story: 'Chức năng',
  task: 'Công việc',
  bug: 'Lỗi',
  subtask: 'Việc con',
};
export const typeTip = (t: IssueType) => `${TYPE_LABELS[t]}: ${TYPE_TIPS[t]}`;

/** Phút → dạng Jira: 1d 2h 30m (1 ngày = 8 giờ). */
export function fmtDuration(m: number | null | undefined): string {
  if (m === null || m === undefined) return '';
  if (m === 0) return '0h';
  const d = Math.floor(m / 480), h = Math.floor((m % 480) / 60), mm = m % 60;
  return [d && `${d}d`, h && `${h}h`, mm && `${mm}m`].filter(Boolean).join(' ');
}

/** Phút → số giờ gọn (VD 3.5h) cho bảng giờ công. */
export const fmtHours = (m: number) => `${Math.round((m / 60) * 10) / 10}h`;

/** Đánh giá tiến độ của một issue tại hôm nay (cùng quy tắc với màn Kế hoạch chi tiết). */
export type Health = 'late' | 'behind' | 'on_track' | 'not_started' | 'done' | 'done_late' | 'no_plan';
export const HEALTH_LABELS: Record<Health, string> = {
  late: 'Trễ hạn', behind: 'Chậm tiến độ', on_track: 'Đúng tiến độ', not_started: 'Chưa đến hạn',
  done_late: 'Xong, trễ hạn', done: 'Hoàn thành', no_plan: 'Chưa có lịch',
};
export function issueHealth(i: Pick<Issue, 'status_category' | 'start_date' | 'due_date' | 'resolved_at'>, now = today()): Health {
  const DAY = 86400_000;
  const d = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
  if (i.status_category === 'done') {
    const doneDay = i.resolved_at ? new Date(new Date(i.resolved_at).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10) : null;
    return i.due_date && doneDay && doneDay > i.due_date ? 'done_late' : 'done';
  }
  if (!i.start_date && !i.due_date) return 'no_plan';
  const s = i.start_date || i.due_date!, e = i.due_date || i.start_date!;
  if (e < now) return 'late';
  if (s > now) return 'not_started';
  const progress = i.status_category === 'inprogress' ? 50 : 0;
  const expected = Math.round(Math.min(1, (d(s, now) + 1) / (d(s, e) + 1)) * 100);
  if (progress === 0 && d(s, now) >= 1) return 'behind';
  return progress + 15 < expected ? 'behind' : 'on_track';
}

/** Vị trí trong Danh mục nhân sự; field = trường nhân sự tương ứng của dự án */
export const STAFF_POSITIONS: { key: 'ba_pm' | 'tester' | 'am' | 'dev'; label: string; field: 'ba' | 'tester' | 'am' | 'dev' }[] = [
  { key: 'ba_pm', label: 'BA/PM', field: 'ba' }, { key: 'dev', label: 'Dev', field: 'dev' },
  { key: 'tester', label: 'Tester', field: 'tester' }, { key: 'am', label: 'AM', field: 'am' },
];
