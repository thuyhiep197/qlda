import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { api, logout, queryClient } from '../api';
import { applyTheme } from '../theme';
import { useIssueModal, useMe, useProjects } from '../hooks';
import { Avatar } from './ui';
import CreateIssueModal from './CreateIssueModal';
import IssueDetailModal from './IssueDetail';
import NotificationBell from './NotificationBell';
import { colorOf } from '../util';

export default function Layout() {
  const { data: me } = useMe();
  const { data: projects } = useProjects();
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
        <nav className="nav">
          <NavLink to="/" end>🏠 Trang chủ</NavLink>
          <NavLink to="/projects">📁 Tất cả dự án</NavLink>
          <NavLink to="/issues" end>🔎 Tìm kiếm issue</NavLink>
        </nav>
        <div className="nav-section">Dự án của tôi</div>
        <nav className="nav nav-projects">
          {projects?.map((p) => (
            <NavLink key={p.id} to={`/p/${p.key}`} className={match?.params.key === p.key ? 'active' : ''}>
              <span className="proj-dot" style={{ background: colorOf(p.key) }}>{p.key.slice(0, 2)}</span>
              <span className="ellipsis">{p.name}</span>
            </NavLink>
          ))}
          {projects?.length === 0 && <div className="muted small pad">Bạn chưa tham gia dự án nào</div>}
        </nav>
        {!!me?.is_admin && (
          <>
            <div className="nav-section">Quản trị hệ thống</div>
            <nav className="nav">
              <NavLink to="/admin/users">👤 Người dùng</NavLink>
              <NavLink to="/admin/roles">🛡️ Vai trò & quyền</NavLink>
            </nav>
          </>
        )}
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Mở menu" onClick={() => setNavOpen(true)}>☰</button>
          <form onSubmit={search} className="search">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm issue theo từ khóa hoặc mã (VD: DEMO-12)…" />
          </form>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Tạo issue</button>
          <div className="spacer" />
          <NotificationBell />
          <div className="user-menu">
            <button className="user-btn" onClick={() => setMenu(!menu)}>
              <Avatar name={me?.full_name} size={30} />
              <span className="hide-sm">{me?.full_name}</span>
            </button>
            {menu && (
              <div className="dropdown" onMouseLeave={() => setMenu(false)}>
                <div className="dropdown-head">
                  <b>{me?.full_name}</b>
                  <div className="muted small">@{me?.username}{me?.is_admin ? ' · Quản trị hệ thống' : ''}</div>
                </div>
                <button onClick={() => { setMenu(false); navigate('/profile'); }}>⚙️ Cài đặt tài khoản</button>
                <button onClick={toggleTheme}>{isDark ? '☀️ Chuyển giao diện sáng' : '🌙 Chuyển giao diện tối'}</button>
                <button onClick={logout}>↩ Đăng xuất</button>
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
