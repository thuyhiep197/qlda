import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom';
import { can, hasPerm, useIssueModal, useMe, useProject, useProjects } from '../hooks';
import CreateIssueModal from '../components/CreateIssueModal';
import type { Project } from '../types';
import { colorOf, RELEASES_ENABLED } from '../util';
import { Spinner } from '../components/ui';
import { Building2, Info, Mail, Phone, Plus, UserRound, ListTree, ChartGantt, List, ListTodo, Rocket, SquareKanban, type LucideIcon } from 'lucide-react';

const LAST_PROJECT = 'qlda:last-project';

/** Quyền Xem cần có để thấy từng tab. Kanban: bảng theo quyền xem issue. */
export const TAB_PERM: Record<string, string> = {
  plan: 'plan.view', board: 'sprint.view', backlog: 'backlog.view', issues: 'search.view',
  roadmap: 'plan.view', releases: 'backlog.view',
};
/** Mở dự án → Kế hoạch chi tiết (không có quyền xem kế hoạch thì Thông tin). */
export function firstTab(project: Project) {
  return can(project.permissions, 'plan.view') ? 'plan' : 'info';
}

export const useProjectCtx = () => useOutletContext<Project>();

export default function ProjectLayout() {
  const { key } = useParams();
  const { data: project, error, isLoading } = useProject(key?.toUpperCase());
  const [creating, setCreating] = useState(false);
  const { open: openIssue } = useIssueModal();
  const location = useLocation();
  // Nhớ dự án đang xem để lần đăng nhập sau mở thẳng vào đây
  useEffect(() => { if (project) try { localStorage.setItem(LAST_PROJECT, project.key); } catch { /* bỏ qua */ } }, [project?.key]);
  if (isLoading) return <Spinner />;
  if (error || !project) return <div className="page"><h2>Không truy cập được dự án</h2><p className="muted">{error instanceof Error ? error.message : ''}</p></div>;

  const tabs: [string, string, LucideIcon][] = [
    ['info', 'Thông tin', Info],
    ['roadmap', 'Kế hoạch tổng quan', ChartGantt],
    ['plan', 'Kế hoạch chi tiết', ListTree],
    ['board', project.type === 'scrum' ? 'Sprint đang chạy' : 'Bảng Kanban', SquareKanban],
    ['issues', 'Danh sách issue', List],
    ...(project.type === 'scrum' ? [['backlog', 'Backlog', ListTodo] as [string, string, LucideIcon]] : []),
    ...(RELEASES_ENABLED ? [['releases', 'Phát hành', Rocket] as [string, string, LucideIcon]] : []),
  ];
  // Mở thẳng một tab không có quyền xem (VD gõ địa chỉ) → về tab đầu tiên được phép
  const seg = location.pathname.split('/')[3];
  // Đường dẫn cũ: Cài đặt → Thông tin; Dashboard dự án đã bỏ → tab mặc định
  if (seg === 'settings') return <Navigate to={`/p/${project.key}/info`} replace />;
  if (seg === 'dashboard') return <Navigate to={`/p/${project.key}/${firstTab(project)}`} replace />;
  if (seg && TAB_PERM[seg] && !can(project.permissions, TAB_PERM[seg])) {
    return <Navigate to={`/p/${project.key}/${firstTab(project)}`} replace />;
  }
  // Chỉ hiện tab người dùng có quyền Xem
  const visibleTabs = tabs.filter(([p]) => p === 'info' || can(project.permissions, TAB_PERM[p] ?? ''));

  return (
    <div className="project project-in-shell">
      <div className="project-head">
        <span className="proj-dot lg" style={{ background: colorOf(project.key) }}>{project.key.slice(0, 2)}</span>
        <div>
          <div className="muted small">Dự án {project.type === 'scrum' ? 'Scrum' : 'Kanban'} · {project.key}</div>
          <h1>{project.name}</h1>
          <ProjectCustomer project={project} />
        </div>
        <div className="spacer" />
        {can(project.permissions, 'issue.create') && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} strokeWidth={2.5} /> Tạo issue</button>}
      </div>
      <nav className="tabs">
        {visibleTabs.map(([path, label, Icon]) => <NavLink key={path} to={`/p/${project.key}/${path}`}><Icon size={16} /> {label}</NavLink>)}
      </nav>
      <Outlet context={project} />
      {creating && <CreateIssueModal projectKey={project.key} onClose={() => setCreating(false)} onCreated={(issue) => openIssue(issue.key)} />}
    </div>
  );
}

/** Khách hàng của dự án: tên (mở trang khách hàng nếu có quyền), đầu mối liên hệ đầu tiên, nhân viên phụ trách */
function ProjectCustomer({ project }: { project: Project }) {
  const { data: me } = useMe();
  const c = project.customer_info;
  if (!c) return project.customer ? <div className="project-customer"><span><Building2 size={14} /> <b>{project.customer}</b></span></div> : null;
  const primary = c.contacts[0];
  return (
    <div className="project-customer">
      <span><Building2 size={14} /> Khách hàng: {hasPerm(me, 'customer.view') ? <Link to={`/customers/${c.id}`}><b>{c.name}</b></Link> : <b>{c.name}</b>}</span>
      {primary && <span data-tip={c.contacts.length > 1 ? c.contacts.map((x) => [x.full_name, x.phone, x.email].filter(Boolean).join(' · ')).join('; ') : undefined}>
        <UserRound size={14} /> Đầu mối: <b>{primary.full_name}</b>
        {primary.phone && <> · <a href={`tel:${primary.phone}`}><Phone size={12} /> {primary.phone}</a></>}
        {primary.email && <> · <a href={`mailto:${primary.email}`}><Mail size={12} /> {primary.email}</a></>}
        {c.contacts.length > 1 && <span> (+{c.contacts.length - 1})</span>}
      </span>}
      {c.kd_names && <span>Kinh doanh: <b>{c.kd_names}</b></span>}
      {c.am_names && <span>AM: <b>{c.am_names}</b></span>}
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
