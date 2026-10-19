import { all, now, run, tx } from './db.ts';
import { syncUpdates } from './journey.ts';

/**
 * Phần III, IV của hành trình theo đầu việc trùng tên của dự án sản xuất đã gắn (trạng thái, hạn).
 * Chạy khi xem khách hàng / dự án và định kỳ; chỉ ghi khi đầu việc đổi so với lần trước nên Kinh doanh sửa tay vẫn giữ.
 */
export function syncJourneys(salesProjectIds?: number[]) {
  const where = salesProjectIds ? (salesProjectIds.length ? `AND id IN (${salesProjectIds.map(() => '?').join(',')})` : 'AND 0') : '';
  for (const sp of all<{ id: number; project_id: number }>(`SELECT id, project_id FROM sales_projects WHERE project_id IS NOT NULL ${where}`, ...(salesProjectIds ?? []))) {
    const steps = all<any>('SELECT id, depth, position, status, due_date, code, title, synced_status, synced_due, synced_issue_id FROM journey_steps WHERE sales_project_id = ? ORDER BY position, id', sp.id);
    if (!steps.length) continue;
    const issues = all<any>(`SELECT i.id, i.summary, s.category AS status_category, i.due_date FROM issues i JOIN statuses s ON s.id = i.status_id WHERE i.project_id = ?`, sp.project_id);
    const updates = syncUpdates(steps, issues);
    if (!updates.length) continue;
    tx(() => updates.forEach((u) => run(`UPDATE journey_steps SET status = COALESCE(?, status), due_date = CASE WHEN ? THEN ? ELSE due_date END,
        synced_status = ?, synced_due = ?, synced_issue_id = ?, updated_at = ? WHERE id = ?`,
      u.status ?? null, u.due_date !== undefined ? 1 : 0, u.due_date ?? null, u.synced_status, u.synced_due, u.synced_issue_id, now(), u.id)));
  }
}

