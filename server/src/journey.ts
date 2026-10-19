import fs from 'node:fs';
import path from 'node:path';

/**
 * Hành trình khách hàng theo quy trình I–IV (Giải pháp → Hợp đồng → Triển khai → Nghiệm thu – Thanh toán).
 * depth: 0 = phần (I, II…), 1 = giai đoạn (1, 1.1…), 2 = đầu việc (+), 3 = việc chi tiết (-), sâu hơn = việc con do người dùng thêm (tối đa MAX_DEPTH).
 */
export const MAX_DEPTH = 6;
/**
 */
export const STEP_STATUSES = ['todo', 'doing', 'done'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];
export const STEP_STATUS_LABELS: Record<StepStatus, string> = { todo: 'Chưa bắt đầu', doing: 'Đang thực hiện', done: 'Hoàn thành' };
/** Nhắc nhở: nhắc người thực hiện trước hạn bao nhiêu ngày */
export const PING_DAYS = [0, 1, 2, 3, 5, 7, 10, 14, 30];

export interface TemplateRow { code: string; title: string; unit: string; support: string; depth: number }
export interface Step { id: number; depth: number; position: number; status: StepStatus; due_date?: string | null }

export function loadTemplate(file = path.join(import.meta.dirname, 'data/journey-template.json')): TemplateRow[] {
  return JSON.parse(fs.readFileSync(file, 'utf8')).rows;
}

/** Bước lá (không có bước con ngay sau nó) — dùng để tính tiến độ; bước có con thì tiến độ theo các con */
export function leafIds<T extends Pick<Step, 'id' | 'depth'>>(steps: T[]): Set<number> {
  const out = new Set<number>();
  steps.forEach((s, i) => { if (s.depth > 0 && !(steps[i + 1] && steps[i + 1].depth > s.depth)) out.add(s.id); });
  return out;
}

/** Bước và toàn bộ bước con của nó (theo thứ tự) — dùng khi bỏ một nhánh không áp dụng */
export function branchIds<T extends Pick<Step, 'id' | 'depth'>>(steps: T[], id: number): number[] {
  const i = steps.findIndex((s) => s.id === id);
  if (i < 0) return [];
  const ids = [steps[i].id];
  for (let j = i + 1; j < steps.length && steps[j].depth > steps[i].depth; j++) ids.push(steps[j].id);
  return ids;
}

/** Tiến độ từng phần (I–IV) và bước đang thực hiện: tính trên các bước lá */
export function journeyProgress<T extends Step & { code?: string; title?: string }>(steps: T[], today: string) {
  const leaves = leafIds(steps);
  const sections: { id: number; title: string; total: number; done: number; doing: number; overdue: number }[] = [];
  let cur: (typeof sections)[number] | null = null;
  for (const s of steps) {
    if (s.depth === 0) { cur = { id: s.id, title: `${s.code ?? ''} ${s.title ?? ''}`.trim(), total: 0, done: 0, doing: 0, overdue: 0 }; sections.push(cur); continue; }
    if (!cur || !leaves.has(s.id)) continue;
    cur.total++;
    if (s.status === 'done') cur.done++;
    else {
      if (s.status === 'doing') cur.doing++;
      if (s.due_date && s.due_date < today) cur.overdue++;
    }
  }
  // Bước đang làm: giai đoạn (depth 1) đầu tiên còn bước lá chưa kết thúc
  let current: T | null = null;
  let stage: T | null = null;
  for (const s of steps) {
    if (s.depth === 1) stage = s;
    if (leaves.has(s.id) && s.status !== 'done') { current = s.depth === 1 ? s : stage; break; }
  }
  const total = sections.reduce((n, x) => n + x.total, 0), done = sections.reduce((n, x) => n + x.done, 0);
  return { sections, current, total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** Đến lúc nhắc chưa: bước chưa kết thúc, có hạn, có người phụ trách, đã vào khoảng [hạn − ping ngày, …] và hôm nay chưa nhắc */
export function pingDue(s: { status: StepStatus; due_date: string | null; ping_days: number | null; assignee_id: number | null; pinged_on: string | null }, today: string) {
  if (s.status === 'done' || !s.due_date || !s.ping_days || !s.assignee_id || s.pinged_on === today) return false;
  const from = new Date(`${s.due_date}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - s.ping_days);
  return today >= from.toISOString().slice(0, 10);
}

/**
 * Tình trạng dự án của khách hàng, tự động theo hành trình: phần (I–IV) xa nhất đã có bước lá Đang thực hiện / Hoàn thành.
 * Chưa có hành trình → null (chưa áp dụng quy trình); chưa bước nào bắt đầu → Chưa bắt đầu; mọi bước lá hoàn thành → Hoàn thành.
 */
export function journeyStatus<T extends Step & { code?: string | null; title?: string }>(steps: T[]): string | null {
  if (!steps.length) return null;
  const leaves = leafIds(steps);
  let section: T | null = null, started: T | null = null, total = 0, done = 0;
  for (const s of steps) {
    if (s.depth === 0) { section = s; continue; }
    if (!leaves.has(s.id)) continue;
    total++;
    if (s.status === 'done') done++;
    if (s.status !== 'todo' && section) started = section;
  }
  if (total && done === total) return 'Hoàn thành';
  if (!started) return 'Chưa bắt đầu';
  return `${started.code ? `${started.code}. ` : ''}${sectionName(started.title ?? '')}`;
}
/** "GIẢI PHÁP" → "Giải pháp"; "NGHIỆM THU - THANH TOÁN" → "Nghiệm thu - Thanh toán" */
const sectionName = (t: string) => t.toLocaleLowerCase('vi').replace(/(^|[-–]\s*)(\p{L})/gu, (_m, p: string, c: string) => p + c.toLocaleUpperCase('vi'));

/** Quy trình mẫu đã được người dùng sửa trước khi áp dụng (bỏ nhánh, thêm bước): kiểm tra cấu trúc cây và chuẩn hóa */
export function cleanJourneyRows(rows: unknown): TemplateRow[] {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Quy trình không có bước nào');
  if (rows.length > 2000) throw new Error('Quy trình quá nhiều bước');
  let prev = -1;
  return rows.map((r: any, i) => {
    const depth = Number(r?.depth);
    const title = String(r?.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!Number.isInteger(depth) || depth < 0 || depth > MAX_DEPTH) throw new Error(`Bước thứ ${i + 1}: cấp không hợp lệ`);
    if (i === 0 && depth !== 0) throw new Error('Quy trình phải bắt đầu bằng một phần (I, II…)');
    if (depth > prev + 1) throw new Error(`Bước "${title}" không nằm dưới bước cha nào`);
    if (!title) throw new Error(`Bước thứ ${i + 1}: tên bước không được để trống`);
    prev = depth;
    const s = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
    return { depth, title, code: s(r.code, 20), unit: s(r.unit, 50), support: s(r.support, 80) };
  });
}

/** Bỏ dấu, chữ thường, gộp khoảng trắng — để khớp tên bước với tên đầu việc */
const foldName = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
/** Trạng thái đầu việc (nhóm trạng thái của phân hệ Dự án) → trạng thái bước */
const STATUS_OF_CATEGORY: Record<string, StepStatus> = { todo: 'todo', inprogress: 'doing', done: 'done' };

/** Các phần của hành trình được đồng bộ với dự án sản xuất */
export const SYNC_SECTIONS = ['III', 'IV'];

export interface SyncStep extends Step { title: string; code?: string | null; synced_status?: string | null; synced_due?: string | null; synced_issue_id?: number | null }
export interface SyncIssue { id: number; summary: string; status_category: string; due_date: string | null }

/**
 * Đồng bộ phần III. Triển khai và IV. Nghiệm thu – Thanh toán với dự án sản xuất (phân hệ Dự án):
 * bước trùng tên với một đầu việc thì nhận trạng thái và hạn của đầu việc.
 * Chỉ ghi khi đầu việc thay đổi so với lần đồng bộ trước (synced_*), nên Kinh doanh sửa tay vẫn giữ cho tới lần đổi tiếp bên Dự án.
 */
export function syncUpdates(steps: SyncStep[], issues: SyncIssue[]) {
  const byName = new Map<string, SyncIssue>();
  for (const i of [...issues].sort((a, b) => a.id - b.id)) if (!byName.has(foldName(i.summary))) byName.set(foldName(i.summary), i);
  const out: { id: number; status?: StepStatus; due_date?: string | null; synced_status: string; synced_due: string | null; synced_issue_id: number }[] = [];
  let inDeploy = false;
  for (const s of steps) {
    if (s.depth === 0) { inDeploy = SYNC_SECTIONS.includes((s.code ?? '').trim().toUpperCase()); continue; }
    if (!inDeploy) continue;
    const issue = byName.get(foldName(s.title));
    if (!issue) continue;
    const status = STATUS_OF_CATEGORY[issue.status_category] ?? 'todo';
    const u: (typeof out)[number] = { id: s.id, synced_status: status, synced_due: issue.due_date, synced_issue_id: issue.id };
    if (s.synced_status !== status || s.synced_issue_id !== issue.id) u.status = status;
    if ((s.synced_due ?? null) !== issue.due_date || s.synced_issue_id !== issue.id) u.due_date = issue.due_date;
    if (u.status !== undefined || u.due_date !== undefined) out.push(u);
  }
  return out;
}
