import { all, get, localDate, now, run } from './db.ts';

/** Sprint tự chạy chưa có ngày thì lấy hôm nay, kéo dài 2 tuần (như mặc định của Jira); ngày đã lên kế hoạch giữ nguyên. */
export function autoStartDates(start: string | null, end: string | null, today: string) {
  const s = start || (end && end < today ? end : today);
  const e = end || new Date(Date.parse(`${s}T00:00:00Z`) + 13 * 86400_000).toISOString().slice(0, 10);
  return { start: s, end: e };
}

/** Sprint chưa chạy tự chuyển Đang chạy ngay khi có issue rời trạng thái Cần làm (đang thực hiện hoặc đã hoàn thành). */
export function autoStartSprint(sprintId: number | null | undefined) {
  if (!sprintId) return;
  const sprint = get<{ id: number; start_date: string | null; end_date: string | null }>(
    `SELECT sp.id, sp.start_date, sp.end_date FROM sprints sp WHERE sp.id = ? AND sp.state = 'future'
       AND EXISTS (SELECT 1 FROM issues i JOIN statuses s ON s.id = i.status_id WHERE i.sprint_id = sp.id AND s.category <> 'todo')`, sprintId);
  if (!sprint) return;
  const { start, end } = autoStartDates(sprint.start_date, sprint.end_date, localDate());
  const stats = get<{ c: number; p: number }>(`SELECT COUNT(*) c, COALESCE(SUM(story_points),0) p FROM issues WHERE sprint_id = ? AND type <> 'subtask'`, sprint.id)!;
  run(`UPDATE sprints SET state = 'active', start_date = ?, end_date = ?, started_at = ?, committed_points = ?, committed_issues = ? WHERE id = ?`,
    start, end, now(), stats.p, stats.c, sprint.id);
}

/** Chạy khi khởi động: bắt kịp các sprint đã có issue đang làm từ trước. */
export function autoStartAllSprints() {
  for (const s of all<{ id: number }>("SELECT id FROM sprints WHERE state = 'future'")) autoStartSprint(s.id);
}
