import fs from 'node:fs';
import path from 'node:path';

/**
 * Hành trình khách hàng theo quy trình I–IV (Giải pháp → Hợp đồng → Triển khai → Nghiệm thu – Thanh toán).
 * depth: 0 = phần (I, II…), 1 = giai đoạn (1, 1.1…), 2 = đầu việc (+), 3 = việc chi tiết (-).
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
