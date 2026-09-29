import { Navigate, NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom';
import { can, useProject } from '../hooks';
import type { Project } from '../types';
import { colorOf } from '../util';
import { Spinner } from '../components/ui';
import { ChartColumn, ChartGantt, List, ListTodo, Rocket, Settings, SquareKanban, type LucideIcon } from 'lucide-react';

export const useProjectCtx = () => useOutletContext<Project>();

export default function ProjectLayout() {
  const { key } = useParams();
  const { data: project, error, isLoading } = useProject(key?.toUpperCase());
  if (isLoading) return <Spinner />;
  if (error || !project) return <div className="page"><h2>Không truy cập được dự án</h2><p className="muted">{error instanceof Error ? error.message : ''}</p></div>;

  const tabs: [string, string, LucideIcon][] = [
    ...(project.type === 'scrum' ? [['backlog', 'Backlog', ListTodo] as [string, string, LucideIcon]] : []),
    ['board', project.type === 'scrum' ? 'Sprint đang chạy' : 'Bảng Kanban', SquareKanban],
    ['issues', 'Danh sách issue', List],
    ['roadmap', 'Lộ trình', ChartGantt],
    ['releases', 'Phát hành', Rocket],
    ['reports', 'Báo cáo', ChartColumn],
    ...(can(project.permissions, 'project.admin') ? [['settings', 'Cài đặt', Settings] as [string, string, LucideIcon]] : []),
  ];

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
        {tabs.map(([path, label, Icon]) => <NavLink key={path} to={`/p/${project.key}/${path}`}><Icon size={16} /> {label}</NavLink>)}
      </nav>
      <Outlet context={project} />
    </div>
  );
}

export function ProjectHome() {
  const project = useProjectCtx();
  return <Navigate to={`/p/${project.key}/${project.type === 'scrum' ? 'backlog' : 'board'}`} replace />;
}
