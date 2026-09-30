import { useMemo, useState } from 'react';
import type { Issue, Project } from '../types';
import { TYPE_LABELS } from '../util';
import { Avatar } from './ui';
import { useComponents } from '../hooks';

export interface Filters {
  q: string;
  assignees: (number | 'none')[];
  epic: string;
  type: string;
  label: string;
  component: string;
}

export const emptyFilters: Filters = { q: '', assignees: [], epic: '', type: '', label: '', component: '' };

export function useFilters() {
  const [f, setF] = useState<Filters>(emptyFilters);
  const apply = useMemo(() => (issues: Issue[]) => issues.filter((i) => {
    if (f.q) {
      const q = f.q.toLowerCase();
      if (!i.summary.toLowerCase().includes(q) && !i.key.toLowerCase().includes(q)) return false;
    }
    if (f.assignees.length && !f.assignees.includes(i.assignee_id ?? 'none')) return false;
    if (f.epic === 'none' && i.parent_type === 'epic') return false;
    if (f.epic && f.epic !== 'none' && String(i.parent_id) !== f.epic) return false;
    if (f.type && i.type !== f.type) return false;
    if (f.label && !i.labels.includes(f.label)) return false;
    if (f.component === 'none' && i.component_id) return false;
    if (f.component && f.component !== 'none' && String(i.component_id) !== f.component) return false;
    return true;
  }), [f]);
  const active = !!(f.q || f.assignees.length || f.epic || f.type || f.label || f.component);
  return { filters: f, setFilters: setF, apply, active };
}

export function FilterBar({ project, filters, setFilters, epics, children }: {
  project: Project; filters: Filters; setFilters: (f: Filters) => void; epics?: Issue[]; children?: React.ReactNode;
}) {
  const toggle = (id: number | 'none') => setFilters({
    ...filters,
    assignees: filters.assignees.includes(id) ? filters.assignees.filter((x) => x !== id) : [...filters.assignees, id],
  });
  const active = filters.q || filters.assignees.length || filters.epic || filters.type || filters.label || filters.component;
  const { data: components } = useComponents(project.key);
  return (
    <div className="filter-bar">
      <input className="filter-search" placeholder="Tìm trong bảng…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
      <div className="avatar-filter">
        {project.members.map((m) => (
          <button key={m.id} className={filters.assignees.includes(m.id) ? 'on' : ''} onClick={() => toggle(m.id)} title={m.full_name}>
            <Avatar name={m.full_name} size={28} />
          </button>
        ))}
        <button className={filters.assignees.includes('none') ? 'on' : ''} onClick={() => toggle('none')} title="Chưa giao"><Avatar size={28} /></button>
      </div>
      {epics && (
        <select value={filters.epic} onChange={(e) => setFilters({ ...filters, epic: e.target.value })}>
          <option value="">Tất cả epic</option>
          <option value="none">Không thuộc epic</option>
          {epics.map((e) => <option key={e.id} value={e.id}>{e.summary}</option>)}
        </select>
      )}
      {!!components?.length && (
        <select value={filters.component} onChange={(e) => setFilters({ ...filters, component: e.target.value })}>
          <option value="">Tất cả mô-đun</option>
          <option value="none">Không thuộc mô-đun</option>
          {components.map((c) => <option key={c.id} value={c.id}>{c.name}{c.lead_name ? ` · ${c.lead_name}` : ''}</option>)}
        </select>
      )}
      <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
        <option value="">Mọi loại</option>
        {(['story', 'task', 'bug', 'subtask'] as const).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
      </select>
      {project.labels.length > 0 && (
        <select value={filters.label} onChange={(e) => setFilters({ ...filters, label: e.target.value })}>
          <option value="">Mọi nhãn</option>
          {project.labels.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      )}
      {active && <button className="btn btn-subtle btn-sm" onClick={() => setFilters(emptyFilters)}>Xóa lọc</button>}
      <div className="spacer" />
      {children}
    </div>
  );
}
