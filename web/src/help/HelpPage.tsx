import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { api, queryClient } from '../api';
import { useMe } from '../hooks';
import { Empty, Markdown, Modal, toast, toastError } from '../components/ui';
import { fmtDateTime } from '../util';
import { HELP_SECTIONS, latestNewsKey, searchArticles, type HelpArticle, type HelpSection } from './help-core';
import { HelpArticleView } from './HelpArticleView';
import { BUILTIN_ARTICLES, MY_PERMS_ID, NEWS_ID, START_ID, useHelpArticles } from './articles';
import { MyPermissions } from './MyPermissions';

/**
 * Trung tâm hướng dẫn (/help, /help/:id): mục lục Bắt đầu → Dùng chung → các phân hệ (mỗi phân hệ chia theo module),
 * ô tìm kiếm không phân biệt dấu, nội dung bài ở giữa. Chỉ hiện bài người xem có quyền dùng.
 * Quản trị hệ thống sửa bài, thêm bài mới, khôi phục bản gốc ngay trên trang.
 */
export default function HelpPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { visible, all } = useHelpArticles();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<HelpArticle | 'new' | null>(null);
  const article = visible.find((a) => a.id === (id ?? START_ID)) ?? null;
  const hits = useMemo(() => searchArticles(visible, q), [visible, q]);

  // Mở "Có gì mới" = đã đọc mục mới nhất
  const newsKey = article?.id === NEWS_ID ? latestNewsKey(article.body) : '';
  useEffect(() => {
    if (!me || !newsKey || me.preferences?.help_seen === newsKey) return;
    api.put('/auth/preferences', { help_seen: newsKey }).then(() => queryClient.invalidateQueries({ queryKey: ['me'] })).catch(() => undefined);
  }, [me, newsKey]);

  const open = (articleId: string) => { setQ(''); navigate(`/help/${articleId}`); };
  const onLink = (href: string) => navigate(href);
  const builtin = article && BUILTIN_ARTICLES.some((a) => a.id === article.id);
  const restore = async () => {
    if (!article || !confirm(builtin ? 'Khôi phục bài này về bản gốc? Nội dung đã sửa trên tool sẽ mất.' : 'Xóa bài hướng dẫn này?')) return;
    try {
      await api.del(`/help/${article.id}`);
      await queryClient.invalidateQueries({ queryKey: ['help'] });
      toast(builtin ? 'Đã khôi phục bản gốc' : 'Đã xóa bài');
      if (!builtin) navigate('/help');
    } catch (e) { toastError(e); }
  };

  return (
    <div className="help-page">
      <nav className="help-toc">
        <div className="help-search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm hướng dẫn, VD: import excel" aria-label="Tìm hướng dẫn" />
        </div>
        {q.trim() ? (
          <div className="help-hits">
            {hits.length ? hits.map((h) => (
              <button key={h.article.id} className="help-hit" onClick={() => open(h.article.id)}>
                <b>{h.article.title}</b><span className="muted small">{h.snippet}</span>
              </button>
            )) : <p className="muted small">Không tìm thấy bài nào. Thử từ khóa khác.</p>}
          </div>
        ) : <Toc list={visible} current={article?.id} onOpen={open} />}
        {!!me?.is_admin && <button className="btn btn-sm help-new-btn" onClick={() => setEditing('new')}><Plus size={14} /> Thêm bài hướng dẫn</button>}
      </nav>
      <main className="help-main">
        {article ? <>
          <div className="help-crumb muted small">
            {HELP_SECTIONS.find((s) => s.key === article.section)?.label}{article.module ? ` › ${article.module}` : ''}
          </div>
          <div className="page-head help-head">
            <h1>{article.title}</h1>
            {!!me?.is_admin && <>
              <button className="btn btn-sm" onClick={() => setEditing(article)}><Pencil size={14} /> Sửa bài</button>
              {article.edited && <button className="btn btn-sm" onClick={restore}>{builtin ? <><RotateCcw size={14} /> Khôi phục bản gốc</> : <><Trash2 size={14} /> Xóa bài</>}</button>}
            </>}
          </div>
          {article.summary && <p className="help-summary">{article.summary}</p>}
          <HelpArticleView article={article} onLink={onLink} />
          {article.id === MY_PERMS_ID && <MyPermissions />}
          {article.edited && <p className="muted small help-edited">Cập nhật trên tool {article.edited.by ? `bởi ${article.edited.by} ` : ''}lúc {fmtDateTime(article.edited.at)}</p>}
        </> : <Empty title="Không có bài hướng dẫn này hoặc bạn không có quyền xem chức năng này" />}
      </main>
      {editing && <HelpEditor article={editing === 'new' ? null : editing} taken={new Set(all.map((a) => a.id))}
        onClose={() => setEditing(null)} onSaved={(savedId) => { setEditing(null); navigate(`/help/${savedId}`); }} />}
    </div>
  );
}

/** Mục lục: mục lớn → module → bài */
function Toc({ list, current, onOpen }: { list: HelpArticle[]; current?: string; onOpen: (id: string) => void }) {
  return <>
    {HELP_SECTIONS.map((s) => {
      const items = list.filter((a) => a.section === s.key);
      if (!items.length) return null;
      const modules = [...new Set(items.map((a) => a.module ?? ''))];
      return (
        <div key={s.key} className="help-toc-sec">
          <div className="help-toc-title">{s.label}</div>
          {modules.map((m) => (
            <div key={m}>
              {m && <div className="help-toc-mod">{m}</div>}
              {items.filter((a) => (a.module ?? '') === m).map((a) => (
                <button key={a.id} className={`help-toc-item ${a.id === current ? 'active' : ''} ${m ? 'indent' : ''}`} onClick={() => onOpen(a.id)}>{a.title}</button>
              ))}
            </div>
          ))}
        </div>
      );
    })}
  </>;
}

/** Soạn / sửa bài (Quản trị hệ thống). Nội dung Markdown; đoạn thao tác cần quyền viết trong ":::perm mã.quyền" … ":::" */
function HelpEditor({ article, taken, onClose, onSaved }: { article: HelpArticle | null; taken: Set<string>; onClose: () => void; onSaved: (id: string) => void }) {
  const [id, setId] = useState(article?.id ?? '');
  const [title, setTitle] = useState(article?.title ?? '');
  const [section, setSection] = useState<HelpSection>(article?.section ?? 'general');
  const [module, setModule] = useState(article?.module ?? '');
  const [body, setBody] = useState(article?.body ?? '');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const isNew = !article;
  const save = async () => {
    if (isNew && taken.has(id)) { toast('Mã bài đã có, chọn mã khác', 'error'); return; }
    setBusy(true);
    try {
      await api.put(`/help/${id}`, { title, section, module, body, is_custom: isNew || !!article?.custom });
      await queryClient.invalidateQueries({ queryKey: ['help'] });
      toast('Đã lưu bài hướng dẫn');
      onSaved(id);
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <Modal title={isNew ? 'Thêm bài hướng dẫn' : `Sửa bài: ${article.title}`} onClose={onClose} width={900}
      footer={<>
        <span className="muted small" style={{ flex: 1 }}>Thao tác cần quyền: viết giữa hai dòng <code>:::perm mã.quyền</code> và <code>:::</code> (VD <code>:::perm issue.create</code>).</span>
        <button className="btn" onClick={onClose}>Hủy</button>
        <button className="btn btn-primary" disabled={busy || !id || !title.trim() || !body.trim()} onClick={save}>Lưu</button>
      </>}>
      <div className="form-grid help-editor">
        {isNew && <label className="field"><span>Mã bài (chữ thường không dấu, gạch ngang)</span><input value={id} onChange={(e) => setId(e.target.value.toLowerCase())} placeholder="vd: quy-trinh-bao-gia" /></label>}
        <label className="field"><span>Tiêu đề</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        {(isNew || article?.custom) && <>
          <label className="field"><span>Mục</span><select value={section} onChange={(e) => setSection(e.target.value as HelpSection)}>
            {HELP_SECTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select></label>
          <label className="field"><span>Module (nhóm trong mục lục, có thể để trống)</span><input value={module} onChange={(e) => setModule(e.target.value)} /></label>
        </>}
        <div className="help-editor-tabs">
          <button className={`btn btn-sm ${preview ? '' : 'btn-primary'}`} onClick={() => setPreview(false)}>Soạn</button>
          <button className={`btn btn-sm ${preview ? 'btn-primary' : ''}`} onClick={() => setPreview(true)}>Xem trước</button>
        </div>
        {preview
          ? <div className="help-editor-preview"><Markdown text={body.replace(/^:::.*$/gm, '')} /></div>
          : <textarea className="help-editor-body" value={body} onChange={(e) => setBody(e.target.value)} rows={22} spellCheck={false} />}
      </div>
    </Modal>
  );
}
