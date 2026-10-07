import { all, localDate } from './db.ts';
import { badRequest } from './permissions.ts';

/**
 * Giai đoạn của dự án (theo vòng đời dự án CNTT của công ty), cũng là "Trạng thái dự án".
 * Mỗi Epic thuộc một giai đoạn (chọn tay, hoặc tự đoán theo tên Epic);
 * trạng thái dự án tự tính theo giai đoạn đang chạy, trừ khi được ghim tay (projects.project_status).
 */
export const PHASES = [
  'Chưa bắt đầu', 'Trình chủ trương', 'Lập HSYC', 'Khảo sát, phân tích', 'Xây dựng',
  'Kiểm thử', 'Triển khai', 'Nghiệm thu', 'Hỗ trợ vận hành',
] as const;
export type Phase = (typeof PHASES)[number];

export function checkPhase(v: unknown, allowEmpty = true): Phase | null {
  if ((v == null || v === '') && allowEmpty) return null;
  const s = String(v ?? '');
  if (!(PHASES as readonly string[]).includes(s)) throw badRequest('Giai đoạn dự án không hợp lệ');
  return s as Phase;
}

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
// Thứ tự kiểm tra quan trọng: từ khóa đặc thù trước, từ khóa chung (thiết kế, xây dựng) sau
const RULES: [RegExp, Phase][] = [
  [/chu truong/, 'Trình chủ trương'],
  [/hsyc|ho so yeu cau|ho so moi thau|hsmt|dau thau|lua chon nha thau/, 'Lập HSYC'],
  [/nghiem thu|ban giao/, 'Nghiệm thu'],
  [/van hanh|bao hanh|bao tri|ho tro/, 'Hỗ trợ vận hành'],
  [/kiem thu|\btest|\bsit\b|\buat\b/, 'Kiểm thử'],
  [/trien khai|dao tao|go ?live|cai dat/, 'Triển khai'],
  [/khoi dong|khao sat|phan tich|thu thap|yeu cau/, 'Khảo sát, phân tích'],
  [/thiet ke|xay dung|phat trien|lap trinh|tich hop|code/, 'Xây dựng'],
];

/** Đoán giai đoạn theo tên Epic; null nếu không đoán được. */
export function guessPhase(summary: string): Phase | null {
  const s = plain(summary || '');
  return RULES.find(([re]) => re.test(s))?.[1] ?? null;
}

const order = (p: Phase) => PHASES.indexOf(p);
const ddmm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '?');

/** Trạng thái tự tính của các dự án có công việc (dự án chưa có gì → "Chưa bắt đầu", do nơi gọi xử lý) */
export function autoProjectStatuses(): Map<number, { status: Phase | null; reason: string }> {
  const today = localDate();
  const counts = all<{ project_id: number; total: number; started: number }>(`
    SELECT i.project_id, COUNT(*) AS total, SUM(CASE WHEN s.category <> 'todo' THEN 1 ELSE 0 END) AS started
    FROM issues i JOIN statuses s ON s.id = i.status_id WHERE i.type <> 'epic' GROUP BY i.project_id`);
  const epics = all<{ project_id: number; key: string; summary: string; phase: string | null; category: string; start_date: string | null; due_date: string | null }>(`
    SELECT i.project_id, i.key, i.summary, i.phase, s.category, i.start_date, i.due_date
    FROM issues i JOIN statuses s ON s.id = i.status_id WHERE i.type = 'epic'`);
  const out = new Map<number, { status: Phase | null; reason: string }>();
  const byProject = new Map<number, typeof epics>();
  for (const e of epics) byProject.set(e.project_id, [...(byProject.get(e.project_id) || []), e]);
  const ids = new Set([...counts.map((c) => c.project_id), ...byProject.keys()]);

  for (const pid of ids) {
    const cnt = counts.find((c) => c.project_id === pid);
    const list = (byProject.get(pid) || []).map((e) => ({ ...e, ph: (e.phase as Phase | null) ?? guessPhase(e.summary) }))
      .filter((e) => e.ph && e.ph !== 'Chưa bắt đầu') as (typeof epics[number] & { ph: Phase })[];
    // Giai đoạn đang chạy: Epic chưa xong và đã bắt đầu (đến ngày bắt đầu, hoặc đã có việc đang làm). Nhiều giai đoạn chồng nhau → lấy giai đoạn xa nhất
    const running = list.filter((e) => e.category !== 'done' && (e.category === 'inprogress' || (e.start_date && e.start_date <= today)))
      .sort((a, b) => order(b.ph) - order(a.ph));
    if (running.length) {
      const e = running[0];
      out.set(pid, { status: e.ph, reason: `Theo giai đoạn ${e.key} "${e.summary}" đang chạy (${ddmm(e.start_date)} – ${ddmm(e.due_date)})` });
      continue;
    }
    const done = list.filter((e) => e.category === 'done').sort((a, b) => order(b.ph) - order(a.ph));
    const upcoming = list.filter((e) => e.category !== 'done');
    if (done.length && !upcoming.length) {
      out.set(pid, { status: done[0].ph, reason: `Đã xong mọi giai đoạn; giai đoạn cuối: ${done[0].key} "${done[0].summary}"` });
      continue;
    }
    if (!cnt?.started && !done.length) {
      out.set(pid, { status: 'Chưa bắt đầu', reason: cnt?.total ? 'Chưa có công việc nào bắt đầu' : 'Chưa có công việc nào' });
      continue;
    }
    if (done.length) {
      out.set(pid, { status: done[0].ph, reason: `Giai đoạn đã xong gần nhất: ${done[0].key} "${done[0].summary}"; giai đoạn sau chưa đến ngày bắt đầu` });
      continue;
    }
    out.set(pid, { status: null, reason: 'Đã có việc đang làm nhưng chưa Epic nào gắn được giai đoạn — chọn "Giai đoạn dự án" trong Epic' });
  }
  return out;
}
