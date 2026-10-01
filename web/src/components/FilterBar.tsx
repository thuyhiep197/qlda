import { useMemo, useState } from 'react';
import type { Issue, Project } from '../types';
import { HEALTH_LABELS, issueHealth, TYPE_LABELS, type Health } from '../util';
import { Avatar, MoreFilters } from './ui';
import { useComponents } from '../hooks';

export interface Filters {
  q: string;
  assignees: (number | 'none')[];
  epic: string;
  type: string;
  label: string;
  component: string;
  owner: string;
  status: string;
  health: string;
}

export const emptyFilters: Filters = { q: '', assignees: [], epic: '', type: '', label: '', component: '', owner: '', status: '', health: '' };

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
    if (f.type && i.type !== f.type && i.subtype !== f.type) return false;
    if (f.label && !i.labels.includes(f.label)) return false;
    if (f.component === 'none' && i.component_id) return false;
    if (f.component && f.component !== 'none' && String(i.component_id) !== f.component) return false;
    if (f.owner && (f.owner === 'none' ? !!i.component_lead_id : String(i.component_lead_id) !== f.owner)) return false;
    if (f.status && String(i.status_id) !== f.status) return false;
    if (f.health && issueHealth(i) !== f.health) return false;
    return true;
  }), [f]);
  const active = !!(f.q || f.assignees.length || f.epic || f.type || f.label || f.component || f.owner || f.status || f.health);
  return { filters: f, setFilters: setF, apply, active };
}

export function FilterBar({ project, filters, setFilters, epics, children }: {
  project: Project; filters: Filters; setFilters: (f: Filters) => void; epics?: Issue[]; children?: React.ReactNode;
}) {
  const toggle = (id: number | 'none') => setFilters({
    ...filters,
    assignees: filters.assignees.includes(id) ? filters.assignees.filter((x) => x !== id) : [...filters.assignees, id],
  });
  const active = filters.q || filters.assignees.length || filters.epic || filters.type || filters.label || filters.component || filters.owner || filters.status || filters.health;
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
      <MoreFilters count={[filters.assignees.length ? 'x' : '', filters.owner, filters.epic, filters.component, filters.type, filters.status, filters.health, filters.label].filter(Boolean).length}>
        <select value={filters.assignees.length === 1 ? String(filters.assignees[0]) : ''} className={filters.assignees.length ? 'filter-on' : ''}
          onChange={(e) => setFilters({ ...filters, assignees: e.target.value ? [e.target.value === 'none' ? 'none' : Number(e.target.value)] : [] })}>
          <option value="">Người thực hiện</option>
          <option value="none">— Chưa giao —</option>
          {project.members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
        <select value={filters.owner} className={filters.owner ? 'filter-on' : ''} onChange={(e) => setFilters({ ...filters, owner: e.target.value })}>
          <option value="">Người phụ trách (BA)</option>
          <option value="none">— Chưa có —</option>
          {project.members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
        {epics && (
          <select value={filters.epic} className={filters.epic ? 'filter-on' : ''} onChange={(e) => setFilters({ ...filters, epic: e.target.value })}>
            <option value="">Giai đoạn (Epic)</option>
            <option value="none">Không thuộc epic</option>
            {epics.map((e) => <option key={e.id} value={e.id}>{e.summary}</option>)}
          </select>
        )}
        {!!components?.length && (
          <select value={filters.component} className={filters.component ? 'filter-on' : ''} onChange={(e) => setFilters({ ...filters, component: e.target.value })}>
            <option value="">Mô-đun</option>
            <option value="none">Không thuộc mô-đun</option>
            {components.map((c) => <option key={c.id} value={c.id}>{c.name}{c.lead_name ? ` · ${c.lead_name}` : ''}</option>)}
          </select>
        )}
        <select value={filters.type} className={filters.type ? 'filter-on' : ''} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
          <option value="">Loại (Story/Task…)</option>
          {(['story', 'task', 'bug', 'subtask'] as const).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
        <select value={filters.status} className={filters.status ? 'filter-on' : ''} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Trạng thái</option>
          {project.statuses.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
        </select>
        <select value={filters.health} className={filters.health ? 'filter-on' : ''} onChange={(e) => setFilters({ ...filters, health: e.target.value })}>
          <option value="">Đánh giá</option>
          {(Object.keys(HEALTH_LABELS) as Health[]).map((h) => <option key={h} value={h}>{HEALTH_LABELS[h]}</option>)}
        </select>
        {project.labels.length > 0 && (
          <select value={filters.label} className={filters.label ? 'filter-on' : ''} onChange={(e) => setFilters({ ...filters, label: e.target.value })}>
            <option value="">Nhãn</option>
            {project.labels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
      </MoreFilters>
      {active && <button className="btn btn-subtle btn-sm" onClick={() => setFilters(emptyFilters)}>Xóa lọc</button>}
      <div className="spacer" />
      {children}
    </div>
  );
}
