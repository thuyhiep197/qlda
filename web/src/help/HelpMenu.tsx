import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, CircleHelp, Compass, Info, Rocket, ShieldCheck, Sparkles } from 'lucide-react';
import { articleForRoute } from './help-core';
import { NEWS_ID, MY_PERMS_ID, START_ID, openHelp, startTour, useHasUnreadNews, useHelpArticles } from './articles';

/** Mục "Hướng dẫn sử dụng" cuối thanh bên: hướng dẫn màn hình đang mở, trung tâm hướng dẫn, bắt đầu nhanh, có gì mới, quyền của tôi, tour */
export default function HelpMenu({ collapsed, onDone }: { collapsed?: boolean; onDone?: () => void }) {
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { visible } = useHelpArticles();
  const unread = useHasUnreadNews();
  const here = articleForRoute(visible, location.pathname, location.search);
  const close = () => setPos(null);
  const done = () => { close(); onDone?.(); };
  const go = (path: string) => { done(); navigate(path); };
  // Menu nổi bên phải thanh bên (thanh bên cuộn được nên không đặt menu bên trong); bấm ra ngoài thì đóng
  const toggle = () => {
    if (pos) return close();
    const r = (wrap.current!.closest('.sidebar') ?? wrap.current!).getBoundingClientRect();
    setPos({ left: Math.min(r.right + 8, window.innerWidth - 280), bottom: Math.max(8, window.innerHeight - wrap.current!.getBoundingClientRect().bottom) });
  };
  useEffect(() => {
    if (!pos) return;
    const out = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, [pos]);
  return (
    <div className="side-help" ref={wrap} data-tour="help">
      <button className={`side-help-btn ${pos ? 'open' : ''}`} aria-label="Hướng dẫn sử dụng" data-tip={collapsed && !pos ? 'Hướng dẫn sử dụng' : undefined} onClick={toggle}>
        <span className="side-help-icon"><CircleHelp size={18} />{unread && <span className="help-dot" aria-label="Có cập nhật mới" />}</span>
        <span className="nav-label">Hướng dẫn sử dụng</span>
      </button>
      {pos && (
        <div className="dropdown help-menu" style={{ position: 'fixed', top: 'auto', right: 'auto', left: pos.left, bottom: pos.bottom }}>
          {here && <button onClick={() => { done(); openHelp(here.id); }}><Info size={16} /> Hướng dẫn màn hình này<div className="muted small">{here.title}</div></button>}
          <button onClick={() => go('/help')}><BookOpen size={16} /> Trung tâm hướng dẫn</button>
          <button onClick={() => go(`/help/${START_ID}`)}><Rocket size={16} /> Bắt đầu nhanh theo vai trò</button>
          <button onClick={() => go(`/help/${NEWS_ID}`)}><Sparkles size={16} /> Có gì mới {unread && <span className="help-new">Mới</span>}</button>
          <button onClick={() => go(`/help/${MY_PERMS_ID}`)}><ShieldCheck size={16} /> Quyền của tôi</button>
          <button onClick={() => { done(); startTour(); }}><Compass size={16} /> Xem lại hướng dẫn nhanh</button>
        </div>
      )}
    </div>
  );
}

/** Nút ⓘ đặt cạnh tiêu đề màn hình: mở ngăn hướng dẫn của màn hình đang mở (hoặc bài id) */
export function HelpButton({ id }: { id?: string }) {
  return (
    <button className="icon-btn help-inline" aria-label="Hướng dẫn màn hình này" data-tip="Hướng dẫn màn hình này" onClick={() => openHelp(id ?? null)}>
      <CircleHelp size={16} />
    </button>
  );
}
