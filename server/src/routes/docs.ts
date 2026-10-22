import { Router, type Request } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { all, get, now, run, UPLOAD_DIR } from '../db.ts';
import { audit } from '../audit.ts';
import { badRequest, forbidden, notFound, userPermissions } from '../permissions.ts';
import { utf8Name } from '../upload.ts';
import { cleanDocName, DOC_EXTENSIONS, isAllowedDoc } from '../docs-rules.ts';
import { fold } from '../customer.ts';

/**
 * Phân hệ Tài liệu nội bộ: thư mục nhiều cấp, tài liệu Excel / PDF / Word / HTML / EXE.
 * Mọi API cần Tài liệu nội bộ – Xem hoặc Xem tất cả. Xem: thấy mọi thư mục, chỉ thấy tệp mình tải lên; Xem tất cả: tệp của mọi người.
 * Tải về: ô Tải về (và thấy được tệp). Tạo thư mục, tải lên, sửa / xóa của mình: ô Thêm; của người khác: ô Sửa / Xóa.
 */
const r = Router();

const perms = (req: Request) => userPermissions(req.user);
r.use((req, _res, next) => {
  const p = perms(req);
  if (!p.has('document.view') && !p.has('document.view_all')) throw forbidden('Bạn không có quyền xem Tài liệu nội bộ');
  next();
});
/** Không có Xem tất cả: chỉ tệp mình tải lên */
const seesAllFiles = (req: Request) => perms(req).has('document.view_all');
const need = (req: Request, perm: string) => { if (!perms(req).has(perm)) throw forbidden(); };

const DOC_MAX_UPLOAD_MB = Number(process.env.DOC_MAX_UPLOAD_MB || 200);
const docUpload = multer({
  storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (_req, _file, cb) => cb(null, crypto.randomUUID()) }),
  limits: { fileSize: DOC_MAX_UPLOAD_MB * 1024 * 1024, files: 20 },
});

function check<T>(fn: () => T): T {
  try { return fn(); } catch (e) { throw badRequest(e instanceof Error ? e.message : String(e)); }
}
/** Sửa / xóa: của mình cần ô Thêm, của người khác cần ô Sửa / Xóa */
const canManage = (req: Request, ownerId: number | null, action: 'edit' | 'delete') =>
  perms(req).has(ownerId === req.user.id ? 'document.create' : `document.${action}`);

function folderOrNull(v: unknown) {
  if (v === null || v === undefined || v === '' || v === 'root') return null;
  const f = get<{ id: number }>('SELECT id FROM doc_folders WHERE id = ?', Number(v));
  if (!f) throw notFound('Không tìm thấy thư mục');
  return f.id;
}
const nameTaken = (table: 'doc_folders' | 'doc_files', col: 'name' | 'filename', parentCol: 'parent_id' | 'folder_id', parent: number | null, name: string, exceptId?: number) =>
  all<{ id: number; n: string }>(`SELECT id, ${col} AS n FROM ${table} WHERE ${parentCol} IS ?`, parent)
    .some((x) => x.id !== exceptId && x.n.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'));

// ---------------------------------------------------------------------------
// Thư mục
// ---------------------------------------------------------------------------
r.get('/folders', (req, res) => {
  // Mọi thư mục; số tệp chỉ đếm tệp mình thấy được
  const own = seesAllFiles(req) ? '' : ` AND d.uploader_id = ${Number(req.user.id)}`;
  res.json(all(`SELECT f.id, f.parent_id, f.name, f.created_by, u.full_name AS created_by_name, f.created_at,
      (SELECT COUNT(*) FROM doc_files d WHERE d.folder_id = f.id${own}) AS file_count
    FROM doc_folders f LEFT JOIN users u ON u.id = f.created_by ORDER BY f.name COLLATE NOCASE`));
});

r.post('/folders', (req, res) => {
  need(req, 'document.create');
  const name = check(() => cleanDocName(req.body?.name, 'thư mục'));
  const parent = folderOrNull(req.body?.parent_id);
  if (nameTaken('doc_folders', 'name', 'parent_id', parent, name)) throw badRequest('Đã có thư mục cùng tên ở đây');
  const { id } = run('INSERT INTO doc_folders(parent_id, name, created_by) VALUES (?,?,?)', parent, name, req.user.id);
  res.status(201).json({ id, name, parent_id: parent });
});

/** Đổi tên / chuyển thư mục (không chuyển vào chính nó hoặc thư mục con của nó) */
r.patch('/folders/:id', (req, res) => {
  const f = get('SELECT * FROM doc_folders WHERE id = ?', Number(req.params.id));
  if (!f) throw notFound('Không tìm thấy thư mục');
  if (!canManage(req, f.created_by, 'edit')) throw forbidden('Bạn chỉ sửa được thư mục do mình tạo');
  const name = req.body?.name !== undefined ? check(() => cleanDocName(req.body.name, 'thư mục')) : f.name;
  const parent = req.body?.parent_id !== undefined ? folderOrNull(req.body.parent_id) : f.parent_id;
  for (let p = parent, guard = 0; p && guard < 50; guard++) {
    if (p === f.id) throw badRequest('Không chuyển thư mục vào chính nó hoặc thư mục con của nó');
    p = get<{ parent_id: number | null }>('SELECT parent_id FROM doc_folders WHERE id = ?', p)?.parent_id ?? null;
  }
  if (nameTaken('doc_folders', 'name', 'parent_id', parent, name, f.id)) throw badRequest('Đã có thư mục cùng tên ở đây');
  run('UPDATE doc_folders SET name = ?, parent_id = ? WHERE id = ?', name, parent, f.id);
  res.json({ ok: true });
});

r.delete('/folders/:id', (req, res) => {
  const f = get('SELECT * FROM doc_folders WHERE id = ?', Number(req.params.id));
  if (!f) throw notFound('Không tìm thấy thư mục');
  if (!canManage(req, f.created_by, 'delete')) throw forbidden('Bạn chỉ xóa được thư mục do mình tạo');
  if (get('SELECT 1 FROM doc_folders WHERE parent_id = ?', f.id) || get('SELECT 1 FROM doc_files WHERE folder_id = ?', f.id)) {
    throw badRequest('Thư mục còn tài liệu hoặc thư mục con, hãy xóa hoặc chuyển chúng trước');
  }
  run('DELETE FROM doc_folders WHERE id = ?', f.id);
  audit(req, 'doc_folder_deleted', { target: f.name });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Tài liệu
// ---------------------------------------------------------------------------
const FILE_SELECT = `SELECT d.id, d.folder_id, d.filename, d.mime, d.size, d.uploader_id, u.full_name AS uploader_name, d.created_at, f.name AS folder_name
  FROM doc_files d LEFT JOIN users u ON u.id = d.uploader_id LEFT JOIN doc_folders f ON f.id = d.folder_id`;

/** Tài liệu trong một thư mục (folder=root: thư mục gốc); có q: tìm theo tên trong toàn bộ tài liệu (không dấu) */
r.get('/files', (req, res) => {
  const q = String(req.query.q ?? '').trim();
  // Không có Xem tất cả: chỉ tệp mình tải lên
  const own = seesAllFiles(req) ? '1=1' : 'd.uploader_id = ?';
  const ownArgs = seesAllFiles(req) ? [] : [req.user.id];
  if (q) {
    const fq = fold(q);
    return res.json(all(`${FILE_SELECT} WHERE ${own} ORDER BY d.filename COLLATE NOCASE`, ...ownArgs).filter((d: any) => fold(d.filename).includes(fq)).slice(0, 200));
  }
  const folder = folderOrNull(req.query.folder);
  res.json(all(`${FILE_SELECT} WHERE d.folder_id IS ? AND ${own} ORDER BY d.filename COLLATE NOCASE`, folder, ...ownArgs));
});

r.post('/files', docUpload.array('files'), (req, res) => {
  const files = (req.files as Express.Multer.File[]) || [];
  try {
    need(req, 'document.create');
    const folder = folderOrNull(req.query.folder);
    if (!files.length) throw badRequest('Chọn tệp để tải lên');
    const bad = files.map((f) => utf8Name(f.originalname)).filter((n) => !isAllowedDoc(n));
    if (bad.length) throw badRequest(`Chỉ nhận tệp ${DOC_EXTENSIONS.join(', ')} — không nhận: ${bad.join(', ')}`);
    // Trùng tên trong cùng thư mục: thay bản cũ (giữ một bản mới nhất) — chỉ người tải lên bản cũ hoặc có quyền Tài liệu nội bộ – Sửa.
    // Kiểm tra hết trước khi ghi để không thay dở một phần
    const plan = files.map((f) => {
      const filename = check(() => cleanDocName(utf8Name(f.originalname), 'tài liệu'));
      const old = get<{ id: number; stored_name: string; uploader_id: number | null }>(
        'SELECT id, stored_name, uploader_id FROM doc_files WHERE folder_id IS ? AND filename = ? COLLATE NOCASE', folder, filename);
      return { f, filename, old };
    });
    const locked = plan.filter((x) => x.old && !canManage(req, x.old.uploader_id, 'edit')).map((x) => x.filename);
    if (locked.length) throw forbidden(`Thư mục đã có tài liệu cùng tên do người khác tải lên: ${locked.join(', ')}. Hãy đổi tên tệp trước khi tải lên`);
    const created: number[] = [];
    for (const { f, filename, old } of plan) {
      if (old) {
        run('UPDATE doc_files SET stored_name = ?, mime = ?, size = ?, uploader_id = ?, created_at = ? WHERE id = ?', f.filename, f.mimetype, f.size, req.user.id, now(), old.id);
        fs.rm(path.join(UPLOAD_DIR, old.stored_name), { force: true }, () => {});
        created.push(old.id);
      } else {
        created.push(run('INSERT INTO doc_files(folder_id, filename, stored_name, mime, size, uploader_id, created_at) VALUES (?,?,?,?,?,?,?)',
          folder, filename, f.filename, f.mimetype, f.size, req.user.id, now()).id);
      }
    }
    audit(req, 'doc_uploaded', { target: files.map((f) => utf8Name(f.originalname)).join(', ') });
    res.status(201).json({ ok: true, count: created.length });
  } catch (e) {
    files.forEach((f) => fs.rm(f.path, { force: true }, () => {}));
    throw e;
  }
});

/** Tài liệu mình thấy được (không có Xem tất cả: chỉ tệp mình tải lên — tệp của người khác coi như không tồn tại) */
function loadFile(req: Request) {
  const d = get('SELECT * FROM doc_files WHERE id = ?', Number(req.params.id));
  if (!d || (!seesAllFiles(req) && d.uploader_id !== req.user.id)) throw notFound('Không tìm thấy tài liệu');
  return d;
}

/** Tải xuống: luôn tải về máy (HTML, EXE không mở trực tiếp trên trình duyệt) */
r.get('/files/:id/download', (req, res) => {
  need(req, 'document.export');
  const d = loadFile(req);
  const file = path.join(UPLOAD_DIR, d.stored_name);
  if (!fs.existsSync(file)) throw notFound('Tệp không còn tồn tại trên máy chủ');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(d.filename)}`);
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  fs.createReadStream(file).pipe(res);
});

/** Đổi tên (giữ nguyên phần mở rộng) / chuyển thư mục */
r.patch('/files/:id', (req, res) => {
  const d = loadFile(req);
  if (!canManage(req, d.uploader_id, 'edit')) throw forbidden('Bạn chỉ sửa được tài liệu do mình tải lên');
  const filename = req.body?.filename !== undefined ? check(() => cleanDocName(req.body.filename, 'tài liệu')) : d.filename;
  if (!isAllowedDoc(filename) || filename.split('.').pop()!.toLowerCase() !== d.filename.split('.').pop()!.toLowerCase()) throw badRequest('Giữ nguyên phần mở rộng của tệp');
  const folder = req.body?.folder_id !== undefined ? folderOrNull(req.body.folder_id) : d.folder_id;
  if (nameTaken('doc_files', 'filename', 'folder_id', folder, filename, d.id)) throw badRequest('Thư mục đã có tài liệu cùng tên');
  run('UPDATE doc_files SET filename = ?, folder_id = ? WHERE id = ?', filename, folder, d.id);
  res.json({ ok: true });
});

r.delete('/files/:id', (req, res) => {
  const d = loadFile(req);
  if (!canManage(req, d.uploader_id, 'delete')) throw forbidden('Bạn chỉ xóa được tài liệu do mình tải lên');
  run('DELETE FROM doc_files WHERE id = ?', d.id);
  fs.rm(path.join(UPLOAD_DIR, d.stored_name), { force: true }, () => {});
  audit(req, 'doc_deleted', { target: d.filename });
  res.json({ ok: true });
});

export default r;
