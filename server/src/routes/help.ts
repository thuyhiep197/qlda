import { Router } from 'express';
import { all, get, now, run } from '../db.ts';
import { audit } from '../audit.ts';
import { badRequest, forbidden, notFound } from '../permissions.ts';

/**
 * Hướng dẫn sử dụng: bài có sẵn nằm trong mã nguồn giao diện; bảng help_articles chỉ giữ bài Quản trị hệ thống sửa trên tool
 * (ghi đè bài có sẵn cùng mã) hoặc thêm mới. Mọi tài khoản đều đọc được; chỉ Quản trị hệ thống được sửa / thêm / xóa.
 */
const r = Router();

export const HELP_SECTIONS = ['start', 'general', 'dashboard', 'customer', 'project', 'docs', 'admin'];
const ID_RE = /^[a-z0-9][a-z0-9-]{1,59}$/;

const requireAdmin = (user: Express.Request['user']) => { if (!user.is_admin) throw forbidden('Chỉ Quản trị hệ thống được sửa hướng dẫn'); };

export function cleanHelpArticle(id: string, b: any) {
  if (!ID_RE.test(id)) throw badRequest('Mã bài không hợp lệ (chữ thường không dấu, số, dấu gạch ngang)');
  const title = String(b?.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!title) throw badRequest('Tiêu đề không được để trống');
  const body = String(b?.body ?? '');
  if (!body.trim()) throw badRequest('Nội dung không được để trống');
  if (body.length > 200_000) throw badRequest('Nội dung quá dài');
  const section = HELP_SECTIONS.includes(b?.section) ? b.section : 'general';
  const module = String(b?.module ?? '').trim().slice(0, 100) || null;
  return { title, body, section, module, is_custom: b?.is_custom ? 1 : 0 };
}

r.get('/', (_req, res) => {
  res.json(all(`SELECT h.*, u.full_name AS updated_by_name FROM help_articles h LEFT JOIN users u ON u.id = h.updated_by ORDER BY h.id`));
});

r.put('/:id', (req, res) => {
  requireAdmin(req.user);
  const id = String(req.params.id);
  const a = cleanHelpArticle(id, req.body);
  run(`INSERT INTO help_articles(id, title, section, module, body, is_custom, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, section = excluded.section, module = excluded.module, body = excluded.body,
         is_custom = excluded.is_custom, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  id, a.title, a.section, a.module, a.body, a.is_custom, req.user.id, now());
  audit(req, 'help_saved', { target: id, detail: a.title });
  res.json(get('SELECT * FROM help_articles WHERE id = ?', id));
});

/** Bài có sẵn: khôi phục bản gốc; bài thêm mới: xóa hẳn */
r.delete('/:id', (req, res) => {
  requireAdmin(req.user);
  const id = String(req.params.id);
  const row = get<{ title: string }>('SELECT title FROM help_articles WHERE id = ?', id);
  if (!row) throw notFound();
  run('DELETE FROM help_articles WHERE id = ?', id);
  audit(req, 'help_deleted', { target: id, detail: row.title });
  res.json({ ok: true });
});

export default r;
