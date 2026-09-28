import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { useIssueModal, useProject, useProjects, useSprints } from '../hooks';
import type { Issue } from '../types';
import { CATEGORY_LABELS, fmtDate, isOverdue, PRIORITIES, PRIORITY_LABELS, TYPE_LABELS } from '../util';
import { Avatar, Empty, PriorityIcon, Spinner, StatusBadge, TypeIcon } from '../components/ui';
import { EpicTag } from '../components/IssueRow';

const FILTER_KEYS = ['project', 'type', 'status', 'statusCategory', 'assignee', 'priority', 'sprint', 'label', 'q', 'sort'] as const;

export default function IssueList() {
  const { key: routeKey } = useParams();
  const [params, setParams] = useSearchParams();
  const { open } = useIssueModal();
  const projectKey = routeKey?.toUpperCase() || params.get('project') || '';
  const { data: projects } = useProjects();
  const { data: project } = useProject(projectKey || undefined);
  const { data: sprints } = useSprints(projectKey || undefined);

  const filter: Record<string, string> = {};
  FILTER_KEYS.forEach((k) => { const v = params.get(k); if (v) filter[k] = v; });
  if (projectKey) filter.project = projectKey;
  const sort = filter.sort || 'updated';

  const { data: issues, isLoading } = useQuery<Issue[]>({
    queryKey: ['issues', 'list', filter],
    queryFn: () => api.get(`/issues${qs({ ...filter, sort, limit: 1000 })}`),
  });

  const set = (k: string, v: string) => setParams((p) => {
    const n = new URLSearchParams(p);
    if (v) n.set(k, v); else n.delete(k);
    return n;
  }, { replace: true });

  const exportCsv = () => {
    if (!issues) return;
    const cols: [string, (i: Issue) => unknown][] = [
      ['Mã', (i) => i.key], ['Loại', (i) => TYPE_LABELS[i.type]], ['Tiêu đề', (i) => i.summary],
      ['Trạng thái', (i) => i.status_name], ['Độ ưu tiên', (i) => PRIORITY_LABELS[i.priority]],
      ['Người thực hiện', (i) => i.assignee_name], ['Người tạo', (i) => i.reporter_name],
      ['Epic/Issue cha', (i) => i.parent_key ? `${i.parent_key} ${i.parent_summary}` : ''], ['Sprint', (i) => i.sprint_name],
      ['Story point', (i) => i.story_points], ['Nhãn', (i) => i.labels.join(', ')], ['Hạn', (i) => i.due_date],
      ['Ngày tạo', (i) => i.created_at.slice(0, 10)], ['Ngày hoàn thành', (i) => i.resolved_at?.slice(0, 10)],
    ];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.map((c) => esc(c[0])).join(','), ...issues.map((i) => cols.map((c) => esc(c[1](i))).join(','))].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `issues-${projectKey || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const Th = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <th className="sortable" onClick={() => set('sort', k)}>{children}{sort === k ? ' ▾' : ''}</th>
  );

  return (
    <div className={routeKey ? 'page-pad' : 'page'}>
      {!routeKey && <h1>Tìm kiếm issue</h1>}
      <div className="filter-bar wrap">
        <input className="filter-search" placeholder="Từ khóa…" defaultValue={filter.q || ''} key={filter.q}
          onKeyDown={(e) => { if (e.key === 'Enter') set('q', (e.target as HTMLInputElement).value); }}
          onBlur={(e) => set('q', e.target.value)} />
        {!routeKey && (
          <select value={filter.project || ''} onChange={(e) => { set('project', e.target.value); set('status', ''); set('sprint', ''); }}>
            <option value="">Tất cả dự án</option>
            {projects?.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        )}
        <select value={filter.type || ''} onChange={(e) => set('type', e.target.value)}>
          <option value="">Mọi loại</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {project ? (
          <select value={filter.status || ''} onChange={(e) => set('status', e.target.value)}>
            <option value="">Mọi trạng thái</option>
            {project.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : null}
        <select value={filter.statusCategory || ''} onChange={(e) => set('statusCategory', e.target.value)}>
          <option value="">Mọi nhóm trạng thái</option>
          <option value="todo,inprogress">Chưa hoàn thành</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filter.assignee || ''} onChange={(e) => set('assignee', e.target.value)}>
          <option value="">Mọi người thực hiện</option>
          <option value="me">Tôi</option>
          <option value="none">Chưa giao</option>
          {project?.members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
        <select value={filter.priority || ''} onChange={(e) => set('priority', e.target.value)}>
          <option value="">Mọi độ ưu tiên</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
        </select>
        {project?.type === 'scrum' && (
          <select value={filter.sprint || ''} onChange={(e) => set('sprint', e.target.value)}>
            <option value="">Mọi sprint</option>
            <option value="active">Sprint đang chạy</option>
            <option value="backlog">Backlog (chưa vào sprint)</option>
            {sprints?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {project && project.labels.length > 0 && (
          <select value={filter.label || ''} onChange={(e) => set('label', e.target.value)}>
            <option value="">Mọi nhãn</option>
            {project.labels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        {Object.keys(filter).some((k) => k !== 'project' && k !== 'sort') &&
          <button className="btn btn-subtle btn-sm" onClick={() => setParams(routeKey ? {} : filter.project ? { project: filter.project } : {})}>Xóa lọc</button>}
        <div className="spacer" />
        <span className="muted small">{issues?.length ?? 0} issue</span>
        <button className="btn btn-sm" onClick={exportCsv} disabled={!issues?.length}>⬇ Xuất CSV (Excel)</button>
      </div>

      {isLoading ? <Spinner /> : !issues?.length ? <Empty title="Không có issue phù hợp" /> : (
        <div className="table-wrap">
          <table className="table table-issues">
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <Th k="key">Mã</Th>
                <th>Tiêu đề</th>
                <th>Trạng thái</th>
                <Th k="priority">Ưu tiên</Th>
                <th>Người thực hiện</th>
                {project?.type !== 'kanban' && <th>Sprint</th>}
                <th className="num">SP</th>
                <Th k="due">Hạn</Th>
                <Th k="created">Ngày tạo</Th>
                <Th k="updated">Cập nhật</Th>
              </tr>
            </thead>
            <tbody>
              {issues.map((i) => (
                <tr key={i.id} onClick={() => open(i.key)} className="clickable">
                  <td><TypeIcon type={i.type} /></td>
                  <td className="nowrap"><span className={`issue-key ${i.status_category === 'done' ? 'done-text' : ''}`}>{i.key}</span></td>
                  <td><div className="row gap-xs"><span className="ellipsis">{i.summary}</span><EpicTag issue={i} /></div></td>
                  <td><StatusBadge name={i.status_name} category={i.status_category} /></td>
                  <td><div className="row gap-xs"><PriorityIcon priority={i.priority} /> <span className="small">{PRIORITY_LABELS[i.priority]}</span></div></td>
                  <td><div className="row gap-xs"><Avatar name={i.assignee_name} size={22} /> <span className="small">{i.assignee_name || 'Chưa giao'}</span></div></td>
                  {project?.type !== 'kanban' && <td className="small">{i.sprint_name || ''}</td>}
                  <td className="num">{i.story_points ?? ''}</td>
                  <td className={`nowrap small ${isOverdue(i) ? 'overdue' : ''}`}>{fmtDate(i.due_date)}</td>
                  <td className="nowrap small">{fmtDate(i.created_at)}</td>
                  <td className="nowrap small">{fmtDate(i.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
