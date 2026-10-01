import { useEffect } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom';
import { can, useProject, useProjects } from '../hooks';
import type { Project } from '../types';
import { colorOf, RELEASES_ENABLED } from '../util';
import { Spinner } from '../components/ui';
import { ChartColumn, LayoutDashboard, ListTree, ChartGantt, List, ListTodo, Rocket, Settings, SquareKanban, type LucideIcon } from 'lucide-react';

const LAST_PROJECT = 'qlda:last-project';

/** Quyền Xem cần có để thấy từng tab. Kanban: bảng theo quyền xem issue. */
export const TAB_PERM: Record<string, string> = {
  dashboard: 'dashboard.view', plan: 'plan.view', board: 'sprint.view', backlog: 'backlog.view', issues: 'search.view',
  roadmap: 'plan.view', releases: 'backlog.view', reports: 'report.view',
};
const canSettings = (perms: string[]) => ['project.edit', 'component.create', 'component.edit', 'component.delete'].some((p) => can(perms, p));
/** Tab đầu tiên được phép xem — dùng khi mở dự án. */
export function firstTab(project: Project) {
  const order = ['dashboard', 'plan', 'board', 'backlog', 'issues', 'roadmap', 'reports'];
  return order.find((t) => can(project.permissions, TAB_PERM[t]) && (t !== 'backlog' || project.type === 'scrum')) ?? (canSettings(project.permissions) ? 'settings' : 'dashboard');
}

export const useProjectCtx = () => useOutletContext<Project>();

export default function ProjectLayout() {
  const { key } = useParams();
  const { data: project, error, isLoading } = useProject(key?.toUpperCase());
  const location = useLocation();
  // Nhớ dự án đang xem để lần đăng nhập sau mở thẳng vào đây
  useEffect(() => { if (project) try { localStorage.setItem(LAST_PROJECT, project.key); } catch { /* bỏ qua */ } }, [project?.key]);
  if (isLoading) return <Spinner />;
  if (error || !project) return <div className="page"><h2>Không truy cập được dự án</h2><p className="muted">{error instanceof Error ? error.message : ''}</p></div>;

  const tabs: [string, string, LucideIcon][] = [
    ['dashboard', 'Dashboard', LayoutDashboard],
    ['plan', 'Kế hoạch chi tiết', ListTree],
    ['board', project.type === 'scrum' ? 'Sprint đang chạy' : 'Bảng Kanban', SquareKanban],
    ...(project.type === 'scrum' ? [['backlog', 'Backlog', ListTodo] as [string, string, LucideIcon]] : []),
    ['issues', 'Danh sách issue', List],
    ['roadmap', 'Kế hoạch tổng quan', ChartGantt],
    ...(RELEASES_ENABLED ? [['releases', 'Phát hành', Rocket] as [string, string, LucideIcon]] : []),
    ['reports', 'Báo cáo', ChartColumn],
    ...(canSettings(project.permissions) ? [['settings', 'Cài đặt', Settings] as [string, string, LucideIcon]] : []),
  ];
  // Mở thẳng một tab không có quyền xem (VD gõ địa chỉ) → về tab đầu tiên được phép
  const seg = location.pathname.split('/')[3];
  if (seg && ((TAB_PERM[seg] && !can(project.permissions, TAB_PERM[seg])) || (seg === 'settings' && !canSettings(project.permissions)))) {
    return <Navigate to={`/p/${project.key}/${firstTab(project)}`} replace />;
  }
  // Chỉ hiện tab người dùng có quyền Xem
  const visibleTabs = tabs.filter(([p]) => p === 'settings' || can(project.permissions, TAB_PERM[p] ?? ''));

  return (
    <div className="project">
      <div className="project-head">
        <span className="proj-dot lg" style={{ background: colorOf(project.key) }}>{project.key.slice(0, 2)}</span>
        <div>
          <div className="muted small">Dự án {project.type === 'scrum' ? 'Scrum' : 'Kanban'} · {project.key}</div>
          <h1>{project.name}</h1>
        </div>
      </div>
      <nav className="tabs">
        {visibleTabs.map(([path, label, Icon]) => <NavLink key={path} to={`/p/${project.key}/${path}`}><Icon size={16} /> {label}</NavLink>)}
      </nav>
      <Outlet context={project} />
    </div>
  );
}

/** Sau khi đăng nhập: mở dự án xem gần nhất (hoặc dự án đầu tiên của tôi); chưa có dự án thì về Trang chủ. */
export function Landing() {
  const { data: projects, isLoading } = useProjects();
  if (isLoading || !projects) return <Spinner />;
  let last: string | null = null;
  try { last = localStorage.getItem(LAST_PROJECT); } catch { /* bỏ qua */ }
  const target = projects.find((p) => p.key === last) ?? projects[0];
  return <Navigate to={target ? `/p/${target.key}` : '/home'} replace />;
}

export function ProjectHome() {
  const project = useProjectCtx();
  return <Navigate to={`/p/${project.key}/${firstTab(project)}`} replace />;
}
