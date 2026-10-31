import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, CircleHelp, Compass, Info, Rocket, ShieldCheck, Sparkles } from 'lucide-react';
import { articleForRoute } from './help-core';
import { NEWS_ID, MY_PERMS_ID, START_ID, openHelp, startTour, useHasUnreadNews, useHelpArticles } from './articles';

/** Nút "Hướng dẫn sử dụng" trên thanh trên cùng: hướng dẫn màn hình đang mở, trung tâm hướng dẫn, bắt đầu nhanh, có gì mới, quyền của tôi, tour */
export default function HelpMenu() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { visible } = useHelpArticles();
  const unread = useHasUnreadNews();
  const here = articleForRoute(visible, location.pathname, location.search);
  const close = () => setOpen(false);
  const go = (path: string) => { close(); navigate(path); };
  // Bấm ra ngoài thì đóng
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, [open]);
  return (
    <div className="user-menu" ref={wrap} data-tour="help">
      <button className={`help-btn ${open ? 'open' : ''}`} aria-label="Hướng dẫn sử dụng" onClick={() => setOpen(!open)}>
        <span className="help-btn-icon"><CircleHelp size={18} />{unread && <span className="help-dot" aria-label="Có cập nhật mới" />}</span>
        <span className="help-btn-label">Hướng dẫn sử dụng</span>
      </button>
      {open && (
        <div className="dropdown help-menu">
          {here && <button onClick={() => { close(); openHelp(here.id); }}><Info size={16} /> Hướng dẫn màn hình này<div className="muted small">{here.title}</div></button>}
          <button onClick={() => go('/help')}><BookOpen size={16} /> Trung tâm hướng dẫn</button>
          <button onClick={() => go(`/help/${START_ID}`)}><Rocket size={16} /> Bắt đầu nhanh theo vai trò</button>
          <button onClick={() => go(`/help/${NEWS_ID}`)}><Sparkles size={16} /> Có gì mới {unread && <span className="help-new">Mới</span>}</button>
          <button onClick={() => go(`/help/${MY_PERMS_ID}`)}><ShieldCheck size={16} /> Quyền của tôi</button>
          <button onClick={() => { close(); startTour(); }}><Compass size={16} /> Xem lại hướng dẫn nhanh</button>
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
