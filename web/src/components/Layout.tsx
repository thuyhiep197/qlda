import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { api, logout, queryClient } from '../api';
import { applyTheme } from '../theme';
import { hasPerm, useIssueModal, useMe } from '../hooks';
import { Avatar } from './ui';
import CreateIssueModal from './CreateIssueModal';
import IssueDetailModal from './IssueDetail';
import NotificationBell from './NotificationBell';
import { Building2, FolderKanban, LayoutDashboard, LogOut, Menu, Moon, Plus, Search, Settings, Sun, Wrench } from 'lucide-react';
import { adminTabs } from '../pages/AdminLayout';

export default function Layout() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const match = useMatch('/p/:key/*');
  const { current, open } = useIssueModal();
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setNavOpen(false); }, [location.pathname]);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const toggleTheme = async () => {
    const t = isDark ? 'light' : 'dark';
    applyTheme(t);
    setMenu(false);
    try { await api.put('/auth/preferences', { theme: t }); await queryClient.invalidateQueries({ queryKey: ['me'] }); } catch { /* vẫn đổi trên máy này */ }
  };

  const search = (e: FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    if (/^[A-Za-z][A-Za-z0-9]+-\d+$/.test(v)) open(v.toUpperCase());
    else navigate(`/issues?q=${encodeURIComponent(v)}`);
    setQ('');
  };


  return (
    <div className={`app ${navOpen ? 'nav-open' : ''}`}>
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <img src="/favicon.svg" width={28} height={28} alt="" />
          <span>QLDA</span>
        </NavLink>
        {/* 4 phân hệ: Dashboard · Khách hàng · Dự án · Quản trị */}
        <nav className="nav nav-main">
          <NavLink to="/home"><LayoutDashboard size={18} /> Dashboard</NavLink>
          {hasPerm(me, 'customer.view') && <NavLink to="/customers"><Building2 size={18} /> Khách hàng</NavLink>}
          <NavLink to="/projects" className={({ isActive }) => (isActive || match ? 'active' : '')}><FolderKanban size={18} /> Dự án</NavLink>
          {adminTabs(me).length > 0 && <NavLink to="/admin"><Wrench size={18} /> Quản trị</NavLink>}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Mở menu" onClick={() => setNavOpen(true)}><Menu size={20} /></button>
          <form onSubmit={search} className="search">
            <Search size={16} className="search-icon" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm issue theo từ khóa hoặc mã (VD: DEMO-12)…" />
          </form>
          {hasPerm(me, 'issue.create') && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} strokeWidth={2.5} /> Tạo issue</button>}
          <div className="spacer" />
          <NotificationBell />
          <div className="user-menu">
            <button className="user-btn" onClick={() => setMenu(!menu)}>
              <Avatar name={me?.full_name} src={me?.avatar_url} size={30} />
              <span className="hide-sm">{me?.full_name}</span>
            </button>
            {menu && (
              <div className="dropdown" onMouseLeave={() => setMenu(false)}>
                <div className="dropdown-head">
                  <b>{me?.full_name}</b>
                  <div className="muted small">@{me?.username}{me?.is_admin ? ' · Quản trị hệ thống' : ''}</div>
                </div>
                <button onClick={() => { setMenu(false); navigate('/profile'); }}><Settings size={16} /> Cài đặt tài khoản</button>
                <button onClick={toggleTheme}>{isDark ? <><Sun size={16} /> Chuyển giao diện sáng</> : <><Moon size={16} /> Chuyển giao diện tối</>}</button>
                <button onClick={logout}><LogOut size={16} /> Đăng xuất</button>
              </div>
            )}
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>

      {creating && (
        <CreateIssueModal
          projectKey={match?.params.key}
          onClose={() => setCreating(false)}
          onCreated={(issue) => open(issue.key)}
        />
      )}
      {current && <IssueDetailModal issueKey={current} />}
    </div>
  );
}
