import type { Category, IssueType, Priority, Project, Status } from './types';

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
export const FIELD_LABELS: Record<string, string> = {
  created: 'đã tạo issue', summary: 'Tiêu đề', description: 'Mô tả', type: 'Loại', priority: 'Độ ưu tiên',
  story_points: 'Story point', labels: 'Nhãn', start_date: 'Ngày bắt đầu', due_date: 'Hạn hoàn thành',
  assignee: 'Người thực hiện', parent: 'Issue cha', sprint: 'Sprint', status: 'Trạng thái',
  attachment: 'Tệp đính kèm', link: 'Liên kết',
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
