import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, logout, queryClient } from '../api';
import { applyTheme } from '../theme';
import { hasPerm, hasSubsystem, useIssueModal, useMe } from '../hooks';
import { Avatar } from './ui';
import GlobalSearch from './GlobalSearch';
import { CustomerModal } from '../pages/Customers';
import { CreateProjectModal } from '../pages/Projects';
import IssueDetailModal from './IssueDetail';
import NotificationBell from './NotificationBell';
import { Building2, FolderKanban, LayoutDashboard, LibraryBig, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Plus, Settings, Sun, Wrench } from 'lucide-react';
import { clampWidth, COLLAPSE_BELOW, readCollapsed, readWidth, saveCollapsed, saveWidth } from '../sidebar-pref';

export default function Layout() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const { current } = useIssueModal();
  const [creating, setCreating] = useState(false);
  const [menu, setMenu] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  // Thanh bên thu gọn: chỉ còn biểu tượng (rê chuột để xem tên phân hệ); mở rộng thì người dùng kéo mép phải để co giãn
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [width, setWidth] = useState(readWidth);
  const toggleSidebar = () => { setCollapsed(!collapsed); saveCollapsed(!collapsed); };
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = collapsed ? 64 : width;
    let last = { collapsed, width };
    document.body.classList.add('side-resizing');
    const move = (ev: PointerEvent) => {
      const w = startW + ev.clientX - startX;
      last = w < COLLAPSE_BELOW ? { collapsed: true, width } : { collapsed: false, width: clampWidth(w) };
      setCollapsed(last.collapsed);
      if (!last.collapsed) setWidth(last.width);
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.body.classList.remove('side-resizing');
      saveCollapsed(last.collapsed);
      saveWidth(last.width);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };
  const location = useLocation();
  useEffect(() => { setNavOpen(false); }, [location.pathname]);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const toggleTheme = async () => {
    const t = isDark ? 'light' : 'dark';
    applyTheme(t);
    setMenu(false);
    try { await api.put('/auth/preferences', { theme: t }); await queryClient.invalidateQueries({ queryKey: ['me'] }); } catch { /* vẫn đổi trên máy này */ }
  };

  // Phân hệ đang mở → nút tạo trên thanh trên cùng: Khách hàng → Tạo khách hàng, Dự án → Tạo dự án; Dashboard, Quản trị: không có
  const path = location.pathname;
  const subsystem = path.startsWith('/customers') ? 'customer' : path.startsWith('/projects') || path.startsWith('/p/') || path.startsWith('/issues') ? 'project' : null;
  const createBtn = subsystem === 'customer' && hasPerm(me, 'customer.create') ? 'Tạo khách hàng'
    : subsystem === 'project' && hasPerm(me, 'project.create') ? 'Tạo dự án' : null;
  useEffect(() => { setCreating(false); }, [subsystem]);


  return (
    <div className={`app ${navOpen ? 'nav-open' : ''} ${collapsed ? 'side-collapsed' : ''}`} style={{ '--side-w': `${width}px` } as React.CSSProperties}>
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      <aside className="sidebar">
        {/* Đầu thanh bên: logo + nút thu gọn / mở rộng */}
        <div className="side-head">
          <NavLink to="/" className="brand">
            <img src="/favicon.svg" width={28} height={28} alt="" />
            <span className="nav-label">QLDA</span>
          </NavLink>
          <button className="side-toggle" onClick={toggleSidebar} aria-label={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
            data-tip={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        {/* Phân hệ: Dashboard · Khách hàng · Dự án · Tài liệu nội bộ · Quản trị — mỗi mục chỉ hiện khi có ô Xem nào của phân hệ; thu gọn thì tên hiện khi rê chuột */}
        <nav className="nav nav-main">
          {hasSubsystem(me, 'dashboard') && <NavLink to="/home" data-tip={collapsed ? 'Dashboard' : undefined}><LayoutDashboard size={18} /> <span className="nav-label">Dashboard</span></NavLink>}
          {hasSubsystem(me, 'customer') && <NavLink to="/customers" data-tip={collapsed ? 'Khách hàng' : undefined}><Building2 size={18} /> <span className="nav-label">Khách hàng</span></NavLink>}
          {hasSubsystem(me, 'project') && <NavLink to="/projects" data-tip={collapsed ? 'Dự án' : undefined} className={() => (subsystem === 'project' ? 'active' : '')}><FolderKanban size={18} /> <span className="nav-label">Dự án</span></NavLink>}
          {hasSubsystem(me, 'docs') && <NavLink to="/docs" data-tip={collapsed ? 'Tài liệu' : undefined}><LibraryBig size={18} /> <span className="nav-label">Tài liệu</span></NavLink>}
          {hasSubsystem(me, 'admin') && <NavLink to="/admin" data-tip={collapsed ? 'Quản trị' : undefined}><Wrench size={18} /> <span className="nav-label">Quản trị</span></NavLink>}
        </nav>
        {/* Kéo mép phải để co giãn; kéo hẹp quá thì thu gọn chỉ còn biểu tượng */}
        <div className="side-resizer" role="separator" aria-orientation="vertical" aria-label="Kéo để co giãn thanh bên" onPointerDown={startResize} />
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Mở menu" onClick={() => setNavOpen(true)}><Menu size={20} /></button>
          <GlobalSearch />
          {createBtn && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} strokeWidth={2.5} /> {createBtn}</button>}
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

      {creating && subsystem === 'customer' && <CustomerModal onClose={() => setCreating(false)} onSaved={(id) => navigate(`/customers/${id}?g=all`)} />}
      {creating && subsystem === 'project' && <CreateProjectModal onClose={() => setCreating(false)} />}
      {/* ?issue=KEY (VD mở từ thông báo): chỉ khi có Issue – Xem */}
      {current && hasPerm(me, 'issue.view') && <IssueDetailModal issueKey={current} />}
    </div>
  );
}
