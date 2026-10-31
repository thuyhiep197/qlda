/**
 * Hướng dẫn sử dụng — phần xử lý thuần (không phụ thuộc React / Vite) để kiểm thử được:
 * đọc bài viết Markdown (đầu bài dạng "khóa: giá trị" giữa hai dòng ---), tách đoạn cần quyền (:::perm … :::),
 * lọc bài theo quyền người xem, tìm bài theo màn hình đang mở, tìm kiếm không phân biệt dấu.
 */

/** Mục lớn của trung tâm hướng dẫn (theo thứ tự hiển thị): Bắt đầu, Chung rồi các phân hệ */
export const HELP_SECTIONS = [
  { key: 'start', label: 'Bắt đầu' },
  { key: 'general', label: 'Dùng chung' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'customer', label: 'Khách hàng' },
  { key: 'project', label: 'Dự án' },
  { key: 'docs', label: 'Tài liệu nội bộ' },
  { key: 'admin', label: 'Quản trị' },
] as const;
export type HelpSection = typeof HELP_SECTIONS[number]['key'];

export interface HelpArticle {
  id: string;
  title: string;
  section: HelpSection;
  /** Module trong phân hệ (nhóm bài trong mục lục) */
  module: string | null;
  order: number;
  summary: string;
  /** Đường dẫn màn hình mà bài hướng dẫn, VD /p/:key/plan; "?issue" = đang mở một issue */
  routes: string[];
  /** Điều kiện thấy bài: rỗng = mọi người; xem permOk */
  need: string;
  keywords: string;
  body: string;
  /** Bài Quản trị hệ thống thêm mới trên tool */
  custom?: boolean;
  /** Bài có sẵn đã được sửa trên tool */
  edited?: { by: string | null; at: string };
}

/** Người xem: quyền thực tế, phân hệ thấy được, là Quản trị hệ thống */
export interface HelpViewer { is_admin?: number | boolean; permissions?: string[]; subsystems?: string[] }

/** Đọc một tệp bài viết: đầu bài (title, section, module, order, summary, routes, need, keywords) + nội dung */
export function parseArticle(id: string, raw: string): HelpArticle {
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  const meta: Record<string, string> = {};
  if (m) for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const section = (HELP_SECTIONS.some((s) => s.key === meta.section) ? meta.section : 'general') as HelpSection;
  return {
    id, title: meta.title || id, section, module: meta.module || null, order: Number(meta.order) || 0, summary: meta.summary || '',
    routes: (meta.routes || '').split(',').map((x) => x.trim()).filter(Boolean), need: meta.need || '', keywords: meta.keywords || '',
    body: (m ? text.slice(m[0].length) : text).trim(),
  };
}

/**
 * Điều kiện quyền: các nhóm cách nhau dấu phẩy đều phải đạt; trong một nhóm, dấu | = chỉ cần một.
 * Mỗi mục là mã quyền (issue.create), phân hệ (sub:customer) hoặc "admin" (chỉ Quản trị hệ thống). Rỗng = luôn đạt. Quản trị hệ thống luôn đạt.
 */
export function permOk(viewer: HelpViewer | null | undefined, need: string): boolean {
  if (!need.trim()) return true;
  if (!viewer) return false;
  if (viewer.is_admin) return true;
  const perms = new Set(viewer.permissions ?? []);
  const subs = new Set(viewer.subsystems ?? []);
  return need.split(',').map((g) => g.trim()).filter(Boolean).every((g) => g.split('|').map((x) => x.trim()).filter(Boolean)
    .some((x) => (x.startsWith('sub:') ? subs.has(x.slice(4)) : perms.has(x))));
}

/** Các mã trong một điều kiện (để kiểm tra hợp lệ, hiện tên quyền) */
export const permCodes = (need: string) => need.split(/[,|]/).map((x) => x.trim()).filter(Boolean);

export interface HelpBlock { need: string | null; text: string }
/** Tách nội dung thành các đoạn: đoạn thường và đoạn ":::perm <điều kiện>" … ":::" (thao tác cần quyền) */
export function splitBlocks(body: string): HelpBlock[] {
  const out: HelpBlock[] = [];
  let cur: HelpBlock = { need: null, text: '' };
  const push = () => { if (cur.text.trim()) out.push({ need: cur.need, text: cur.text.trim() }); };
  for (const line of body.split('\n')) {
    const open = /^:::perm\s+(.+?)\s*$/.exec(line);
    if (open && cur.need === null) { push(); cur = { need: open[1], text: '' }; continue; }
    if (/^:::\s*$/.test(line) && cur.need !== null) { push(); cur = { need: null, text: '' }; continue; }
    cur.text += `${line}\n`;
  }
  push();
  return out;
}

/** Bài người xem thấy được, theo thứ tự mục lục */
export function visibleArticles(list: HelpArticle[], viewer: HelpViewer | null | undefined): HelpArticle[] {
  const sec = (s: HelpSection) => HELP_SECTIONS.findIndex((x) => x.key === s);
  return list.filter((a) => permOk(viewer, a.need))
    .sort((a, b) => sec(a.section) - sec(b.section) || a.order - b.order || a.title.localeCompare(b.title, 'vi'));
}

/** Độ khớp của mẫu đường dẫn với đường dẫn đang mở: -1 = không khớp; càng nhiều đoạn cố định càng cao */
export function routeScore(pattern: string, pathname: string, search = ''): number {
  if (pattern.startsWith('?')) return new URLSearchParams(search).has(pattern.slice(1)) ? 100 : -1;
  const p = pattern.split('/').filter(Boolean);
  const s = pathname.split('/').filter(Boolean);
  if (p.length !== s.length) return -1;
  let score = 0;
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) continue;
    if (p[i].toLowerCase() !== s[i].toLowerCase()) return -1;
    score++;
  }
  return score + 1;
}

/** Bài hướng dẫn cho màn hình đang mở (khớp nhất); không có thì null */
export function articleForRoute(list: HelpArticle[], pathname: string, search = ''): HelpArticle | null {
  let best: HelpArticle | null = null, bestScore = -1;
  for (const a of list) for (const r of a.routes) {
    const sc = routeScore(r, pathname, search);
    if (sc > bestScore) { best = a; bestScore = sc; }
  }
  return best;
}

/** Bỏ dấu tiếng Việt, chữ thường — để tìm "ke hoach" ra "Kế hoạch" */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** Chữ thuần của nội dung Markdown (bỏ ký hiệu, ảnh, đường dẫn) */
export const plainText = (md: string) => md.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/^:::.*$/gm, ' ').replace(/[#>*_`|~-]+/g, ' ').replace(/\s+/g, ' ').trim();

export interface HelpHit { article: HelpArticle; snippet: string; score: number }
/** Tìm bài: mọi từ khóa phải có trong tiêu đề / từ khóa / nội dung; tiêu đề khớp xếp trước */
export function searchArticles(list: HelpArticle[], query: string, limit = 20): HelpHit[] {
  const words = fold(query).split(/\s+/).filter((w) => w.length > 0);
  if (!words.length) return [];
  const hits: HelpHit[] = [];
  for (const a of list) {
    const title = fold(a.title), extra = fold(`${a.keywords} ${a.summary} ${a.module ?? ''}`);
    const plain = plainText(a.body), body = fold(plain);
    if (!words.every((w) => title.includes(w) || extra.includes(w) || body.includes(w))) continue;
    const score = words.reduce((n, w) => n + (title.includes(w) ? 10 : 0) + (extra.includes(w) ? 4 : 0) + (body.includes(w) ? 1 : 0), 0);
    const at = body.indexOf(words[0]);
    const snippet = at < 0 ? a.summary || plain.slice(0, 140) : `${at > 40 ? '…' : ''}${plain.slice(Math.max(0, at - 40), at + 100)}…`;
    hits.push({ article: a, snippet, score });
  }
  return hits.sort((x, y) => y.score - x.score).slice(0, limit);
}

/** Mã mục mới nhất của bài "Có gì mới" = tiêu đề "## …" đầu tiên (VD "31/10/2026 — Hướng dẫn sử dụng") */
export const latestNewsKey = (body: string) => /^##\s+(.+?)\s*$/m.exec(body)?.[1].slice(0, 60) ?? '';

/** Bài sửa trên tool (máy chủ) ghi đè bài có sẵn cùng mã; bài mới thêm vào danh sách */
export interface HelpOverride { id: string; title: string; section: string; module: string | null; body: string; is_custom: number; updated_by_name?: string | null; updated_at: string }
export function mergeOverrides(base: HelpArticle[], overrides: HelpOverride[]): HelpArticle[] {
  const byId = new Map(overrides.map((o) => [o.id, o]));
  const merged = base.map((a) => {
    const o = byId.get(a.id);
    return o ? { ...a, title: o.title, module: o.module ?? a.module, body: o.body, edited: { by: o.updated_by_name ?? null, at: o.updated_at } } : a;
  });
  const known = new Set(base.map((a) => a.id));
  for (const o of overrides) if (!known.has(o.id)) {
    merged.push({ ...parseArticle(o.id, o.body), title: o.title, section: (HELP_SECTIONS.some((s) => s.key === o.section) ? o.section : 'general') as HelpSection,
      module: o.module, order: 900, custom: true, edited: { by: o.updated_by_name ?? null, at: o.updated_at } });
  }
  return merged;
}
