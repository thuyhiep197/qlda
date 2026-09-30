import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { applyTheme } from './theme';
import { useMe } from './hooks';
import { Spinner, Toaster, TooltipLayer } from './components/ui';
import Layout from './components/Layout';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectLayout, { ProjectHome } from './pages/ProjectLayout';
import Backlog from './pages/Backlog';
import Board from './pages/Board';
import IssueList from './pages/IssueList';
import Roadmap from './pages/Roadmap';
import ProjectDashboard from './pages/ProjectDashboard';
import Reports from './pages/Reports';
import ProjectSettings from './pages/ProjectSettings';
import IssuePage from './pages/IssuePage';
import AdminUsers from './pages/AdminUsers';
import AdminRoles from './pages/AdminRoles';
import Profile from './pages/Profile';
import Releases from './pages/Releases';

export default function App() {
  const { data: me, isLoading } = useMe();
  // Giao diện sáng/tối theo cài đặt của tài khoản đang đăng nhập
  const theme = me?.preferences?.theme;
  useEffect(() => { if (me) applyTheme(theme); }, [me, theme]);
  if (isLoading) return <Spinner />;
  if (!me) return <><Login /><Toaster /></>;
  if (me.must_change_password) return <><ChangePassword forced /><Toaster /></>;

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="issues" element={<IssueList />} />
          <Route path="p/:key" element={<ProjectLayout />}>
            <Route index element={<ProjectHome />} />
            <Route path="dashboard" element={<ProjectDashboard />} />
            <Route path="backlog" element={<Backlog />} />
            <Route path="board" element={<Board />} />
            <Route path="issues" element={<IssueList />} />
            <Route path="roadmap" element={<Roadmap />} />
            <Route path="releases" element={<Releases />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<ProjectSettings />} />
          </Route>
          <Route path="browse/:issueKey" element={<IssuePage />} />
          <Route path="profile" element={<Profile />} />
          {!!me.is_admin && <Route path="admin/users" element={<AdminUsers />} />}
          {!!me.is_admin && <Route path="admin/roles" element={<AdminRoles />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
      <TooltipLayer />
    </>
  );
}
