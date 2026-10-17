import { useState } from 'react';
import { Link, Outlet, useMatch, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, LayoutList, Search, Star } from 'lucide-react';
import { useProjects } from '../hooks';
import type { ProjectSummary } from '../types';
import { fold } from '../customer-filter';
import { colorOf } from '../util';

/** Nhóm dự án đang chọn ở cột trái: mặc định Dự án của tôi, chưa tham gia dự án nào thì Tất cả dự án */
export function useProjectGroup(projects: ProjectSummary[] | undefined): 'mine' | 'all' {
  const [params] = useSearchParams();
  const hasMine = (projects || []).some((p) => p.my_role);
  return params.get('g') === 'all' || (params.get('g') !== 'mine' && !hasMine) ? 'all' : 'mine';
}

/**
 * Phân hệ Dự án — cùng bố cục với Khách hàng: cột trái là Dự án của tôi / Tất cả dự án (hiện luôn tên dự án),
 * giữa là danh sách dự án hoặc các module của dự án đang chọn.
 */
export default function ProjectShell() {
  return (
    <div className="cw">
      <ProjectTree />
      <section className="cw-page"><Outlet /></section>
    </div>
  );
}

function ProjectTree() {
  const { data: projects } = useProjects();
  const match = useMatch('/p/:key/*');
  const current = match?.params.key?.toUpperCase();
  const group = useProjectGroup(projects);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');
  const hit = (p: ProjectSummary) => !q.trim() || fold(`${p.name} ${p.key} ${p.customer ?? ''}`).includes(fold(q.trim()));
  const groups: ['mine' | 'all', string, ProjectSummary[], React.ReactNode][] = [
    ['mine', 'Dự án của tôi', (projects || []).filter((p) => p.my_role), <Star size={16} />],
    ['all', 'Tất cả dự án', projects || [], <LayoutList size={16} />],
  ];
  return (
    <aside className="cw-left">
      <div className="cw-search"><Search size={14} /><input placeholder="Tìm dự án, khách hàng…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {groups.map(([key, label, items, icon]) => {
        const open = !closed[key] || !!q.trim();
        return (
          <div key={key} className="cw-group">
            <div className={`cw-item ${!current && group === key ? 'active' : ''}`}>
              <button className="cw-caret" aria-label={open ? 'Thu gọn' : 'Mở rộng'} onClick={() => setClosed({ ...closed, [key]: open })}>
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
              <Link to={`/projects?g=${key}`} className="cw-group-link">{icon}<span className="grow ellipsis">{label}</span></Link>
              <span className="cw-count">{items.length}</span>
            </div>
            {open && items.filter(hit).map((p) => (
              <Link key={p.id} to={`/p/${p.key}?g=${key}`} title={p.customer ? `${p.name} — ${p.customer}` : p.name}
                className={`cw-sub ${p.key === current && group === key ? 'active' : ''}`}>
                <span className="proj-dot sm" style={{ background: colorOf(p.key) }}>{p.key.slice(0, 2)}</span>
                <span className="ellipsis">{p.name}</span>
              </Link>
            ))}
            {open && !items.some(hit) && <div className="muted small cw-sub-empty">{key === 'mine' ? 'Bạn chưa tham gia dự án nào' : 'Không có dự án phù hợp'}</div>}
          </div>
        );
      })}
    </aside>
  );
}
