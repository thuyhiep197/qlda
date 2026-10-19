import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, logout, queryClient } from '../api';
import { applyTheme } from '../theme';
import { hasPerm, useIssueModal, useMe } from '../hooks';
import { Avatar } from './ui';
import GlobalSearch from './GlobalSearch';
import { CustomerModal } from '../pages/Customers';
import { CreateProjectModal } from '../pages/Projects';
import IssueDetailModal from './IssueDetail';
import NotificationBell from './NotificationBell';
import { Building2, FolderKanban, LayoutDashboard, LibraryBig, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Plus, Settings, Sun, Wrench } from 'lucide-react';
import { adminTabs } from '../pages/AdminLayout';
import { readCollapsed, saveCollapsed } from '../sidebar-pref';

export default function Layout() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const { current } = useIssueModal();
  const [creating, setCreating] = useState(false);
  const [menu, setMenu] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  // Thanh bên thu gọn: chỉ còn biểu tượng (rê chuột để xem tên phân hệ)
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleSidebar = () => { setCollapsed(!collapsed); saveCollapsed(!collapsed); };
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
    <div className={`app ${navOpen ? 'nav-open' : ''} ${collapsed ? 'side-collapsed' : ''}`}>
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <img src="/favicon.svg" width={28} height={28} alt="" />
          <span className="nav-label">QLDA</span>
        </NavLink>
        {/* Phân hệ: Dashboard · Khách hàng · Dự án · Tài liệu nội bộ · Quản trị; thu gọn thì tên hiện khi rê chuột */}
        <nav className="nav nav-main">
          <NavLink to="/home" data-tip={collapsed ? 'Dashboard' : undefined}><LayoutDashboard size={18} /> <span className="nav-label">Dashboard</span></NavLink>
          {hasPerm(me, 'customer.view') && <NavLink to="/customers" data-tip={collapsed ? 'Khách hàng' : undefined}><Building2 size={18} /> <span className="nav-label">Khách hàng</span></NavLink>}
          <NavLink to="/projects" data-tip={collapsed ? 'Dự án' : undefined} className={() => (subsystem === 'project' ? 'active' : '')}><FolderKanban size={18} /> <span className="nav-label">Dự án</span></NavLink>
          <NavLink to="/docs" data-tip={collapsed ? 'Tài liệu' : undefined}><LibraryBig size={18} /> <span className="nav-label">Tài liệu</span></NavLink>
          {adminTabs(me).length > 0 && <NavLink to="/admin" data-tip={collapsed ? 'Quản trị' : undefined}><Wrench size={18} /> <span className="nav-label">Quản trị</span></NavLink>}
        </nav>
        <button className="side-toggle" onClick={toggleSidebar} aria-label={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
          data-tip={collapsed ? 'Mở rộng thanh bên' : undefined}>
          {collapsed ? <PanelLeftOpen size={18} /> : <><PanelLeftClose size={18} /> <span className="nav-label">Thu gọn</span></>}
        </button>
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
      {current && <IssueDetailModal issueKey={current} />}
    </div>
  );
}
