import { useRef, useState, type DragEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, FileText, FileCode, Folder, FolderOpen, FolderPlus, HardDrive, Pencil, Search, Trash2, Upload, Cog } from 'lucide-react';
import { api, queryClient } from '../api';
import { hasPerm, useMe } from '../hooks';
import { fold } from '../customer-filter';
import { fmtDateTime, fmtSize } from '../util';
import { Empty, Spinner, toast, toastError } from '../components/ui';

interface DocFolder { id: number; parent_id: number | null; name: string; created_by: number | null; created_by_name: string | null; created_at: string; file_count: number }
interface DocFile { id: number; folder_id: number | null; filename: string; size: number; uploader_id: number | null; uploader_name: string | null; created_at: string; folder_name: string | null }

const ACCEPT = '.xls,.xlsx,.pdf,.doc,.docx,.html,.htm,.exe';
const ext = (n: string) => n.split('.').pop()?.toLowerCase() ?? '';
function FileIcon({ name }: { name: string }) {
  const e = ext(name);
  if (e === 'xls' || e === 'xlsx') return <FileSpreadsheet size={16} className="doc-ic xls" />;
  if (e === 'pdf') return <FileText size={16} className="doc-ic pdf" />;
  if (e === 'doc' || e === 'docx') return <FileText size={16} className="doc-ic doc" />;
  if (e === 'html' || e === 'htm') return <FileCode size={16} className="doc-ic html" />;
  if (e === 'exe') return <Cog size={16} className="doc-ic exe" />;
  return <FileText size={16} />;
}

/**
 * Phân hệ Tài liệu nội bộ: cột trái là cây thư mục, giữa là thư mục con + tài liệu của thư mục đang chọn.
 * Mọi người tra cứu, tạo thư mục, tải lên (Excel, PDF, Word, HTML, EXE), tải xuống.
 */
export default function Docs() {
  const { data: me } = useMe();
  const [params, setParams] = useSearchParams();
  const current = params.get('folder') ? Number(params.get('folder')) : null;
  const open = (id: number | null) => setParams(id ? { folder: String(id) } : {}, { replace: false });
  const { data: folders, isLoading } = useQuery<DocFolder[]>({ queryKey: ['doc-folders'], queryFn: () => api.get('/docs/folders') });
  const [q, setQ] = useState('');
  const { data: files, isLoading: loadingFiles } = useQuery<DocFile[]>({
    queryKey: ['doc-files', current, q.trim()],
    queryFn: () => api.get(q.trim() ? `/docs/files?q=${encodeURIComponent(q.trim())}` : `/docs/files?folder=${current ?? 'root'}`),
  });
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const highlight = Number(params.get('file')) || null;

  if (isLoading || !folders) return <Spinner />;
  const children = (id: number | null) => folders.filter((f) => f.parent_id === id);
  const path: DocFolder[] = [];
  for (let f = folders.find((x) => x.id === current); f; f = folders.find((x) => x.id === f!.parent_id)) path.unshift(f);
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['doc-folders'] }), queryClient.invalidateQueries({ queryKey: ['doc-files'] })]);
  const canEditAny = hasPerm(me, 'document.edit'), canDeleteAny = hasPerm(me, 'document.delete');
  const mine = (owner: number | null) => owner === me?.id;

  const newFolder = async () => {
    const name = prompt(`Tên thư mục mới${path.length ? ` trong "${path[path.length - 1].name}"` : ''}:`)?.trim();
    if (!name) return;
    try { await api.post('/docs/folders', { name, parent_id: current }); toast('Đã tạo thư mục'); await refresh(); } catch (e) { toastError(e); }
  };
  const upload = async (list: FileList | File[] | null) => {
    const arr = Array.from(list ?? []);
    if (!arr.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      arr.forEach((f) => fd.append('files', f));
      await api.post(`/docs/files?folder=${current ?? 'root'}`, fd);
      toast(`Đã tải lên ${arr.length} tài liệu`);
      await refresh();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const renameFolder = async (f: DocFolder) => {
    const name = prompt('Đổi tên thư mục:', f.name)?.trim();
    if (!name || name === f.name) return;
    try { await api.patch(`/docs/folders/${f.id}`, { name }); await refresh(); } catch (e) { toastError(e); }
  };
  const deleteFolder = async (f: DocFolder) => {
    if (!confirm(`Xóa thư mục "${f.name}"? (chỉ xóa được thư mục rỗng)`)) return;
    try { await api.del(`/docs/folders/${f.id}`); toast('Đã xóa'); if (current === f.id) open(f.parent_id); await refresh(); } catch (e) { toastError(e); }
  };
  const renameFile = async (d: DocFile) => {
    const name = prompt('Đổi tên tài liệu (giữ nguyên phần mở rộng):', d.filename)?.trim();
    if (!name || name === d.filename) return;
    try { await api.patch(`/docs/files/${d.id}`, { filename: name }); await refresh(); } catch (e) { toastError(e); }
  };
  const deleteFile = async (d: DocFile) => {
    if (!confirm(`Xóa tài liệu "${d.filename}"?`)) return;
    try { await api.del(`/docs/files/${d.id}`); toast('Đã xóa'); await refresh(); } catch (e) { toastError(e); }
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); if (!q.trim()) upload(e.dataTransfer.files); };

  const tree = (id: number | null, depth: number): React.ReactNode => children(id).map((f) => {
    const kids = children(f.id);
    const isOpen = !closed.has(f.id);
    return (
      <div key={f.id}>
        <div className={`cw-item doc-tree-item ${current === f.id && !q.trim() ? 'active' : ''}`} style={{ paddingLeft: 6 + depth * 14 }}>
          <button className="cw-caret" style={{ visibility: kids.length ? 'visible' : 'hidden' }} aria-label={isOpen ? 'Thu gọn' : 'Mở rộng'}
            onClick={() => { const n = new Set(closed); if (isOpen) n.add(f.id); else n.delete(f.id); setClosed(n); }}>
            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
          <a className="cw-group-link" onClick={() => { setQ(''); open(f.id); }}>
            {current === f.id ? <FolderOpen size={15} /> : <Folder size={15} />}<span className="grow ellipsis">{f.name}</span></a>
          <span className="cw-count">{f.file_count || ''}</span>
        </div>
        {isOpen && tree(f.id, depth + 1)}
      </div>
    );
  });

  const subfolders = q.trim() ? folders.filter((f) => fold(f.name).includes(fold(q.trim()))) : children(current);
  return (
    <div className="cw">
      <aside className="cw-left">
        <div className={`cw-item ${current === null && !q.trim() ? 'active' : ''}`} onClick={() => { setQ(''); open(null); }} style={{ cursor: 'pointer' }}>
          <HardDrive size={16} /><span className="grow">Tài liệu nội bộ</span>
        </div>
        {tree(null, 1)}
        {!folders.length && <div className="muted small cw-sub-empty">Chưa có thư mục</div>}
      </aside>
      <section className={`cw-main doc-main ${drag ? 'drag' : ''}`} onDragOver={(e) => { e.preventDefault(); if (!q.trim()) setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
        <div className="cw-toolbar">
          <div className="breadcrumb doc-crumb">
            <a onClick={() => open(null)}>Tài liệu nội bộ</a>
            {path.map((f) => <span key={f.id}> › <a onClick={() => open(f.id)}>{f.name}</a></span>)}
          </div>
          <div className="spacer" />
          <div className="cw-search" style={{ width: 260 }}><Search size={14} /><input placeholder="Tìm tài liệu, thư mục trong toàn bộ…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <button className="btn" onClick={newFolder} disabled={!!q.trim()}><FolderPlus size={15} /> Thư mục mới</button>
          <button className="btn btn-primary" onClick={() => input.current?.click()} disabled={busy || !!q.trim()}><Upload size={15} /> {busy ? 'Đang tải lên…' : 'Tải lên'}</button>
          <input ref={input} type="file" multiple hidden accept={ACCEPT} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
        </div>
        <div className="muted small">{q.trim() ? `Kết quả tìm "${q.trim()}" trong toàn bộ tài liệu` : 'Kéo thả tệp vào đây để tải lên thư mục này.'} Nhận tệp Excel, PDF, Word, HTML, EXE.</div>
        <div className="cw-scroll">
          {loadingFiles ? <Spinner /> : !subfolders.length && !files?.length ? (
            <Empty title={q.trim() ? 'Không tìm thấy tài liệu phù hợp' : 'Thư mục trống'}>
              {!q.trim() && <p className="muted small">Bấm "Tải lên" hoặc kéo thả tệp vào đây; "Thư mục mới" để chia nhỏ tài liệu.</p>}
            </Empty>
          ) : (
            <table className="table doc-table">
              <thead><tr><th>Tên</th><th>Thư mục</th><th className="num">Dung lượng</th><th>Người tải lên</th><th>Ngày</th><th /></tr></thead>
              <tbody>
                {subfolders.map((f) => (
                  <tr key={`f${f.id}`} className="click-row" onClick={() => { setQ(''); open(f.id); }}>
                    <td><span className="row gap-sm"><Folder size={16} className="doc-ic folder" /> <b>{f.name}</b></span></td>
                    <td className="small muted">{q.trim() ? folders.find((x) => x.id === f.parent_id)?.name ?? 'Gốc' : ''}</td>
                    <td className="num small muted">{f.file_count ? `${f.file_count} tệp` : ''}</td>
                    <td className="small">{f.created_by_name}</td>
                    <td className="small nowrap">{fmtDateTime(f.created_at)}</td>
                    <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                      {(mine(f.created_by) || canEditAny) && <button className="icon-btn" aria-label={`Đổi tên ${f.name}`} data-tip="Đổi tên" onClick={() => renameFolder(f)}><Pencil size={14} /></button>}
                      {(mine(f.created_by) || canDeleteAny) && <button className="icon-btn" aria-label={`Xóa ${f.name}`} data-tip="Xóa thư mục rỗng" onClick={() => deleteFolder(f)}><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                ))}
                {files?.map((d) => (
                  <tr key={d.id} className={highlight === d.id ? 'j-selected' : ''}>
                    <td><a className="row gap-sm" href={`/api/docs/files/${d.id}/download`} data-tip="Tải xuống"><FileIcon name={d.filename} /> <span className="ellipsis">{d.filename}</span></a></td>
                    <td className="small muted">{q.trim() ? (d.folder_id ? <Link to={`/docs?folder=${d.folder_id}`}>{d.folder_name}</Link> : 'Gốc') : ''}</td>
                    <td className="num small">{fmtSize(d.size)}</td>
                    <td className="small">{d.uploader_name}</td>
                    <td className="small nowrap">{fmtDateTime(d.created_at)}</td>
                    <td className="nowrap">
                      <a className="icon-btn" href={`/api/docs/files/${d.id}/download`} aria-label={`Tải xuống ${d.filename}`} data-tip="Tải xuống"><Download size={14} /></a>
                      {(mine(d.uploader_id) || canEditAny) && <button className="icon-btn" aria-label={`Đổi tên ${d.filename}`} data-tip="Đổi tên" onClick={() => renameFile(d)}><Pencil size={14} /></button>}
                      {(mine(d.uploader_id) || canDeleteAny) && <button className="icon-btn" aria-label={`Xóa ${d.filename}`} data-tip="Xóa" onClick={() => deleteFile(d)}><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
