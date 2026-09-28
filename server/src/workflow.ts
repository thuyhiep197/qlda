/**
 * Workflow theo loại issue (giống workflow scheme của Jira):
 *  - Mỗi dự án có một kho trạng thái (bảng statuses) — mỗi trạng thái là một cột trên board.
 *  - Mỗi loại issue có thể chỉ dùng một phần kho (bảng type_statuses); loại chưa cấu hình dùng toàn bộ kho.
 *  - Khi dự án bật kiểm soát workflow: luồng chuyển riêng của loại (transitions.issue_type = loại) nếu có,
 *    nếu không dùng luồng chung (issue_type = '').
 */
import { all, get } from './db.ts';

interface StatusRow { id: number; name: string; category: string; position: number }

export function projectStatuses(projectId: number): StatusRow[] {
  return all<StatusRow>('SELECT id, name, category, position FROM statuses WHERE project_id = ? ORDER BY position, id', projectId);
}

/** Trạng thái loại issue được dùng, theo thứ tự cột của dự án. */
export function typeStatuses(projectId: number, type: string): StatusRow[] {
  const ids = new Set(all<{ status_id: number }>(
    'SELECT status_id FROM type_statuses WHERE project_id = ? AND issue_type = ?', projectId, type,
  ).map((r) => r.status_id));
  const list = projectStatuses(projectId);
  return ids.size ? list.filter((s) => ids.has(s.id)) : list;
}

export function isStatusAllowed(projectId: number, type: string, statusId: number) {
  return typeStatuses(projectId, type).some((s) => s.id === statusId);
}

/** Trạng thái khởi đầu của loại issue: trạng thái "Cần làm" đầu tiên, nếu không có thì trạng thái đầu tiên. */
export function initialStatus(projectId: number, type: string): number | undefined {
  const list = typeStatuses(projectId, type);
  return (list.find((s) => s.category === 'todo') ?? list[0])?.id;
}

/** Quy một trạng thái về trạng thái hợp lệ của loại issue: giữ nguyên nếu hợp lệ, không thì lấy trạng thái cùng nhóm đầu tiên. */
export function mapStatusForType(projectId: number, type: string, statusId: number): number {
  const list = typeStatuses(projectId, type);
  if (list.some((s) => s.id === statusId)) return statusId;
  const cat = get<{ category: string }>('SELECT category FROM statuses WHERE id = ?', statusId)?.category;
  return (list.find((s) => s.category === cat) ?? list.find((s) => s.category === 'todo') ?? list[0]).id;
}

/** Luồng chuyển đang áp dụng cho loại issue (riêng của loại nếu có, không thì luồng chung). */
export function transitionScope(projectId: number, type: string): string {
  return get('SELECT 1 FROM transitions WHERE project_id = ? AND issue_type = ? LIMIT 1', projectId, type) ? type : '';
}

export function canTransition(projectId: number, type: string, fromId: number, toId: number): boolean {
  if (fromId === toId) return true;
  if (!get<{ workflow_strict: number }>('SELECT workflow_strict FROM projects WHERE id = ?', projectId)?.workflow_strict) return true;
  return !!get('SELECT 1 FROM transitions WHERE project_id = ? AND issue_type = ? AND from_status_id = ? AND to_status_id = ?',
    projectId, transitionScope(projectId, type), fromId, toId);
}

/** Cấu hình workflow của dự án gửi cho giao diện. */
export function workflowConfig(projectId: number) {
  const typeRows = all<{ issue_type: string; status_id: number }>(
    'SELECT issue_type, status_id FROM type_statuses WHERE project_id = ?', projectId);
  const type_statuses: Record<string, number[]> = {};
  for (const r of typeRows) (type_statuses[r.issue_type] ??= []).push(r.status_id);
  const transitions = all<{ issue_type: string; from_status_id: number; to_status_id: number }>(
    'SELECT issue_type, from_status_id, to_status_id FROM transitions WHERE project_id = ?', projectId);
  return { type_statuses, transitions };
}
