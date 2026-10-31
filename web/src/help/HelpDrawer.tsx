import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ExternalLink, X } from 'lucide-react';
import { articleForRoute } from './help-core';
import { HelpArticleView } from './HelpArticleView';
import { closeHelp, openHelp, useHelpArticles, useHelpDrawer, MY_PERMS_ID } from './articles';
import { MyPermissions } from './MyPermissions';

/** Ngăn hướng dẫn bên phải: bài của màn hình đang mở (hoặc bài được chọn), không rời màn hình đang làm */
export default function HelpDrawer() {
  const { open, id } = useHelpDrawer();
  const location = useLocation();
  const navigate = useNavigate();
  const { visible } = useHelpArticles();
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeHelp(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);
  if (!open) return null;
  const article = (id ? visible.find((a) => a.id === id) : articleForRoute(visible, location.pathname, location.search)) ?? null;
  const onLink = (href: string) => {
    const m = /^\/help\/([a-z0-9-]+)/.exec(href);
    if (m) openHelp(m[1]);
    else { closeHelp(); navigate(href); }
  };
  return (
    <aside className="help-drawer" role="dialog" aria-label="Hướng dẫn sử dụng">
      <div className="help-drawer-head">
        <div className="help-drawer-title">
          <div className="muted small">Hướng dẫn{article?.module ? ` · ${article.module}` : ''}</div>
          <h3>{article?.title ?? 'Hướng dẫn sử dụng'}</h3>
        </div>
        <button className="icon-btn" data-tip="Mở trong Trung tâm hướng dẫn" aria-label="Mở trong Trung tâm hướng dẫn"
          onClick={() => { closeHelp(); navigate(article ? `/help/${article.id}` : '/help'); }}><ExternalLink size={16} /></button>
        <button className="icon-btn" aria-label="Đóng" onClick={closeHelp}><X size={18} /></button>
      </div>
      <div className="help-drawer-body">
        {article ? <>
          <HelpArticleView article={article} onLink={onLink} />
          {article.id === MY_PERMS_ID && <MyPermissions />}
        </> : <p className="muted">Màn hình này chưa có bài hướng dẫn riêng. Mở <a href="/help" onClick={(e) => { e.preventDefault(); onLink('/help'); }}>Trung tâm hướng dẫn</a> để tra cứu.</p>}
      </div>
    </aside>
  );
}
