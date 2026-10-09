import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, qs, refreshAll } from '../api';
import { useComponents, useIssueModal, useMe, useProject, useProjects, useSprints, useUsersBasic, useVersions, hasPerm } from '../hooks';
import type { Issue, SavedFilter } from '../types';
import { CATEGORY_LABELS, fmtDate, fmtDuration, isOverdue, PRIORITIES, PRIORITY_LABELS, RELEASES_ENABLED, TYPE_LABELS, HEALTH_LABELS, issueHealth, type Health } from '../util';
import { Empty, FlagMark, Modal, PriorityIcon, Spinner, StatusBadge, toast, toastError, TypeIcon, HelpTip, MoreFilters } from '../components/ui';
import { EpicTag } from '../components/IssueRow';
import { ImportButton } from '../components/ImportIssues';
import { BulkBar } from '../components/BulkBar';
import { ChevronDown, Download, Star, X } from 'lucide-react';
import { issueListAssignee } from '../issue-filter-defaults';
import { InlineAssignee } from '../components/InlineAssignee';

const FILTER_KEYS = ['project', 'type', 'status', 'statusCategory', 'assignee', 'priority', 'sprint', 'version', 'component', 'ba', 'parent', 'label', 'health', 'q', 'sort'] as const;

export default function IssueList() {
  const { key: routeKey } = useParams();
  const [params, setParams] = useSearchParams();
  const { open } = useIssueModal();
  const { data: me } = useMe();
  const projectKey = routeKey?.toUpperCase() || params.get('project') || '';
  const { data: projects } = useProjects();
  const { data: project } = useProject(projectKey || undefined);
  const { data: users } = useUsersBasic();
  const { data: sprints } = useSprints(projectKey || undefined);
  const { data: versions } = useVersions(projectKey || undefined);
  const { data: components } = useComponents(projectKey || undefined);
  const showComponent = !!components?.length;
  const { data: epics } = useQuery<Issue[]>({
    queryKey: ['issues', 'epics', projectKey],
    queryFn: () => api.get(`/issues${qs({ project: projectKey, type: 'epic', sort: 'rank' })}`),
    enabled: !!projectKey,
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const filter: Record<string, string> = {};
  FILTER_KEYS.forEach((k) => { const v = params.get(k); if (v) filter[k] = v; });
  const assigneeFilter = issueListAssignee(params.get('assignee'));
  if (assigneeFilter.api) filter.assignee = assigneeFilter.api; else delete filter.assignee;
  if (projectKey) filter.project = projectKey;
  // Mặc định không hiện issue Hoàn thành (trừ khi chọn nhóm trạng thái, trạng thái cụ thể hoặc đánh giá); 'all' = mọi nhóm
  const catParam = params.get('statusCategory');
  if (catParam === 'all') delete filter.statusCategory;
  else if (!catParam && !filter.status && !filter.health) filter.statusCategory = 'todo,inprogress';
  const sort = filter.sort || 'updated';

  const { data: fetched, isLoading } = useQuery<Issue[]>({
    queryKey: ['issues', 'list', filter],
    queryFn: () => api.get(`/issues${qs({ ...filter, sort, limit: 1000 })}`),
  });
  // Đánh giá (trễ hạn, chậm tiến độ…) tính theo ngày hôm nay nên lọc ngay trên danh sách
  const issues = filter.health && fetched ? fetched.filter((i) => issueHealth(i) === filter.health) : fetched;
  // Đổi bộ lọc thì bỏ các issue không còn trong danh sách khỏi lựa chọn
  useEffect(() => {
    if (!issues) return;
    setSelected((s) => new Set([...s].filter((id) => issues.some((i) => i.id === id))));
  }, [issues]);

  const set = (k: string, v: string) => setParams((p) => {
    const n = new URLSearchParams(p);
    if (v) n.set(k, v); else n.delete(k);
    return n;
  }, { replace: true });

  const exportCsv = () => {
    if (!issues) return;
    const cols: [string, (i: Issue) => unknown][] = [
      ['Mã', (i) => i.key], ['Loại', (i) => (i.type === 'subtask' && i.subtype ? `${TYPE_LABELS[i.subtype]} (việc con)` : TYPE_LABELS[i.type])], ['Tiêu đề', (i) => i.summary],
      ['Trạng thái', (i) => i.status_name], ['Độ ưu tiên', (i) => PRIORITY_LABELS[i.priority]],
      ['Người thực hiện', (i) => i.assignee_name], ['Người tạo', (i) => i.reporter_name],
      ['Epic/Issue cha', (i) => i.parent_key ? `${i.parent_key} ${i.parent_summary}` : ''], ['Sprint', (i) => i.sprint_name],
      ['Mô-đun', (i) => i.component_name], ['BA phụ trách', (i) => i.component_lead_name],
      ...(RELEASES_ENABLED ? [['Phiên bản', (i: Issue) => i.version_name] as [string, (i: Issue) => unknown]] : []), ['Điểm ước lượng', (i) => i.story_points], ['Nhãn', (i) => i.labels.join(', ')],
      ['Ngày bắt đầu', (i) => i.start_date], ['Hạn', (i) => i.due_date],
      ['Ước lượng (giờ)', (i) => (i.original_estimate != null ? i.original_estimate / 60 : '')],
      ['Đã làm (giờ)', (i) => (i.time_spent ? i.time_spent / 60 : '')],
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
    <th className="sortable" onClick={() => set('sort', k)}>{children}{sort === k ? <ChevronDown size={13} className="sort-caret" /> : null}</th>
  );
  const hasFilter = Object.keys(filter).some((k) => k !== 'project' && k !== 'sort' && !(k === 'assignee' && filter[k] === 'me'));
  const selectedIssues = issues?.filter((i) => selected.has(i.id)) ?? [];
  const allChecked = !!issues?.length && issues.every((i) => selected.has(i.id));
  const showVersion = !!versions?.length;
  const showTime = !!issues?.some((i) => i.time_spent || i.original_estimate);

  return (
    <div className={routeKey ? 'page-pad' : 'page'}>
      {!routeKey && <h1>Tìm kiếm issue</h1>}
      <div className="filter-bar wrap">
        <SavedFilters projectKey={projectKey || undefined} routeScoped={!!routeKey} current={filter}
          apply={(query) => {
            const n = new URLSearchParams(query);
            if (routeKey) n.delete('project');
            setParams(n, { replace: true });
          }} />
        <input className="filter-search" placeholder="Từ khóa…" defaultValue={filter.q || ''} key={filter.q}
          onKeyDown={(e) => { if (e.key === 'Enter') set('q', (e.target as HTMLInputElement).value); }}
          onBlur={(e) => set('q', e.target.value)} />
        {!routeKey && (
          <select value={filter.project || ''} onChange={(e) => { set('project', e.target.value); set('status', ''); set('sprint', ''); set('version', ''); set('parent', ''); }}>
            <option value="">Tất cả dự án</option>
            {projects?.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        )}
        <select value={assigneeFilter.control} onChange={(e) => set('assignee', e.target.value)}>
          <option value="all">Mọi người thực hiện</option>
          <option value="me">Tôi</option>
          <option value="none">Chưa giao</option>
          {(project?.members ?? users ?? []).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
        <select value={catParam ?? (filter.statusCategory ? 'todo,inprogress' : 'all')} onChange={(e) => set('statusCategory', e.target.value === 'todo,inprogress' ? '' : e.target.value)}
          className={catParam && catParam !== 'todo,inprogress' ? 'filter-on' : ''}>
          <option value="todo,inprogress">Chưa hoàn thành</option>
          <option value="all">Mọi nhóm trạng thái</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <MoreFilters count={(['type', 'status', 'priority', 'parent', 'sprint', 'version', 'component', 'ba', 'label', 'health'] as const).filter((k) => filter[k]).length}>
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
          <select value={filter.priority || ''} onChange={(e) => set('priority', e.target.value)}>
            <option value="">Mọi độ ưu tiên</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
          </select>
          {!!epics?.length && (
            <select value={filter.parent || ''} onChange={(e) => set('parent', e.target.value)}>
              <option value="">Mọi epic</option>
              {epics.map((e) => <option key={e.id} value={e.id}>{e.key} · {e.summary}</option>)}
            </select>
          )}
          {project?.type === 'scrum' && (
            <select value={filter.sprint || ''} onChange={(e) => set('sprint', e.target.value)}>
              <option value="">Mọi sprint</option>
              <option value="active">Sprint đang chạy</option>
              <option value="backlog">Backlog (chưa vào sprint)</option>
              {sprints?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {showVersion && (
            <select value={filter.version || ''} onChange={(e) => set('version', e.target.value)}>
              <option value="">Mọi phiên bản</option>
              <option value="none">Chưa gán phiên bản</option>
              {versions!.map((v) => <option key={v.id} value={v.id}>{v.name}{v.status === 'released' ? ' (đã phát hành)' : ''}</option>)}
            </select>
          )}
          {showComponent && (
            <select value={filter.component || ''} onChange={(e) => set('component', e.target.value)}>
              <option value="">Tất cả mô-đun</option>
              <option value="none">Không thuộc mô-đun</option>
              {components!.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {showComponent && (
            <select value={filter.ba || ''} onChange={(e) => set('ba', e.target.value)}>
              <option value="">Mọi BA phụ trách</option>
              <option value="me">BA phụ trách: tôi</option>
              {[...new Map(components!.filter((c) => c.lead_id).map((c) => [c.lead_id, c.lead_name])).entries()].map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}
            </select>
          )}
          <select value={filter.health || ''} onChange={(e) => set('health', e.target.value)}>
            <option value="">Đánh giá</option>
            {(Object.keys(HEALTH_LABELS) as Health[]).map((h) => <option key={h} value={h}>{HEALTH_LABELS[h]}</option>)}
          </select>
          {project && project.labels.length > 0 && (
            <select value={filter.label || ''} onChange={(e) => set('label', e.target.value)}>
              <option value="">Mọi nhãn</option>
              {project.labels.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
        </MoreFilters>
        {hasFilter && <button className="btn btn-subtle btn-sm" onClick={() => setParams(routeKey ? {} : filter.project ? { project: filter.project } : {})}>Xóa lọc</button>}
        <div className="spacer" />
        <span className="muted small">{issues?.length ?? 0} issue</span>
        <HelpTip text="Tick ô đầu dòng (hoặc ô trên cùng để chọn tất cả theo bộ lọc) rồi bấm Giao cho… để giao việc, đổi trạng thái hàng loạt" />
        {routeKey && project && <ImportButton project={project} />}
        {hasPerm(me, 'search.export') && <button className="btn btn-sm" onClick={exportCsv} disabled={!issues?.length}><Download size={14} /> Xuất Excel (CSV)</button>}
      </div>

      {selectedIssues.length > 0 ? <BulkBar issues={selectedIssues} onClear={() => setSelected(new Set())} />
        : null}

      {isLoading ? <Spinner /> : !issues?.length ? <Empty title="Không có issue phù hợp" /> : (
        <div className="table-wrap">
          <table className="table table-issues">
            <thead>
              <tr>
                <th style={{ width: 28 }}>
                  <input type="checkbox" checked={allChecked} data-tip={allChecked ? 'Bỏ chọn tất cả' : 'Chọn tất cả issue trong danh sách'}
                    onChange={() => setSelected(allChecked ? new Set() : new Set(issues.map((i) => i.id)))} />
                </th>
                <th style={{ width: 28 }} />
                <Th k="key">Mã</Th>
                <th>Tiêu đề</th>
                <th>Trạng thái</th>
                <Th k="priority">Ưu tiên</Th>
                <th>Người thực hiện</th>
                {project?.type !== 'kanban' && <th>Sprint</th>}
                {showComponent && <th>Mô-đun</th>}
                {showVersion && <th>Phiên bản</th>}
                <th className="num" data-tip="Điểm ước lượng (story point)">Điểm</th>
                {showTime && <th className="num" data-tip="Thời gian đã ghi / ước lượng">Giờ công</th>}
                <Th k="due">Hạn</Th>
                <Th k="created">Ngày tạo</Th>
                <Th k="updated">Cập nhật</Th>
              </tr>
            </thead>
            <tbody>
              {issues.map((i) => (
                <tr key={i.id} onClick={() => open(i.key)} className={`clickable ${selected.has(i.id) ? 'row-selected' : ''}`}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(i.id)} aria-label={`Chọn ${i.key}`}
                      onChange={() => { const n = new Set(selected); n.has(i.id) ? n.delete(i.id) : n.add(i.id); setSelected(n); }} />
                  </td>
                  <td><TypeIcon type={i.type} subtype={i.subtype} /></td>
                  <td className="nowrap"><span className={`issue-key ${i.status_category === 'done' ? 'done-text' : ''}`}>{i.key}</span> <FlagMark flagged={i.flagged} /></td>
                  <td><div className="row gap-xs"><span className="ellipsis">{i.summary}</span><EpicTag issue={i} /></div></td>
                  <td><StatusBadge name={i.status_name} category={i.status_category} /></td>
                  <td><div className="row gap-xs"><PriorityIcon priority={i.priority} /> <span className="small">{PRIORITY_LABELS[i.priority]}</span></div></td>
                  <td><InlineAssignee issue={i} project={project} /></td>
                  {project?.type !== 'kanban' && <td className="small">{i.sprint_name || ''}</td>}
                  {showComponent && <td className="small" data-tip={i.component_lead_name ? `BA phụ trách: ${i.component_lead_name}` : undefined}>{i.component_name || ''}</td>}
                  {showVersion && <td className="small">{i.version_name || ''}</td>}
                  <td className="num">{i.story_points ?? ''}</td>
                  {showTime && <td className="num small nowrap">{i.time_spent ? fmtDuration(i.time_spent) : ''}{i.original_estimate != null ? ` / ${fmtDuration(i.original_estimate)}` : ''}</td>}
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

/** Bộ lọc đã lưu: mở lại nhanh, lưu bộ lọc hiện tại, chia sẻ cho thành viên dự án. */
function SavedFilters({ projectKey, routeScoped, current, apply }: {
  projectKey?: string; routeScoped: boolean; current: Record<string, string>; apply: (query: string) => void;
}) {
  const { data: me } = useMe();
  const { data: filters } = useQuery<SavedFilter[]>({ queryKey: ['filters'], queryFn: () => api.get('/filters') });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  // Trong một dự án chỉ hiện bộ lọc của dự án đó và bộ lọc chung
  const list = (filters ?? []).filter((f) => !routeScoped || !f.project_key || f.project_key === projectKey);
  const query = new URLSearchParams(Object.entries(current).filter(([k]) => k !== 'sort' || current.sort !== 'updated')).toString();
  const del = async (f: SavedFilter) => {
    if (!confirm(`Xóa bộ lọc "${f.name}"?`)) return;
    try { await api.del(`/filters/${f.id}`); await refreshAll(); } catch (e) { toastError(e); }
  };
  return (
    <div className="saved-filters" ref={box}>
      <button className="btn btn-sm" onClick={() => setOpen(!open)}><Star size={14} /> Bộ lọc đã lưu <ChevronDown size={14} /></button>
      {open && (
        <div className="dropdown saved-filters-menu">
          {!list.length && <div className="muted small pad">Chưa có bộ lọc nào được lưu.</div>}
          {list.map((f) => (
            <div key={f.id} className="saved-filter-item">
              <button onClick={() => { apply(f.query); setOpen(false); }}>
                <b>{f.name}</b>
                <span className="muted small">
                  {f.project_key ? f.project_key : 'Mọi dự án'}{f.shared ? ' · chia sẻ' : ''}{f.user_id !== me?.id ? ` · của ${f.owner_name}` : ''}
                </span>
              </button>
              {(f.user_id === me?.id || me?.is_admin) && <button className="icon-btn" data-tip="Xóa bộ lọc" onClick={() => del(f)}><X size={14} /></button>}
            </div>
          ))}
          <div className="dropdown-foot">
            <button className="btn btn-sm btn-primary" onClick={() => { setSaving(true); setOpen(false); }}>+ Lưu bộ lọc hiện tại</button>
          </div>
        </div>
      )}
      {saving && <SaveFilterModal projectKey={projectKey} query={query} onClose={() => setSaving(false)} />}
    </div>
  );
}

function SaveFilterModal({ projectKey, query, onClose }: { projectKey?: string; query: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const submit = async () => {
    try {
      await api.post('/filters', { name, query, project_key: projectKey, shared });
      toast('Đã lưu bộ lọc');
      await refreshAll();
      onClose();
    } catch (e) { toastError(e); }
  };
  return (
    <Modal title="Lưu bộ lọc" onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" disabled={!name.trim()} onClick={submit}>Lưu</button>
    </>}>
      <div className="stack">
        <label className="field"><span>Tên bộ lọc</span><input autoFocus value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="VD: Bug chưa xong của sprint" /></label>
        <label className="check"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Chia sẻ cho {projectKey ? `thành viên dự án ${projectKey}` : 'mọi người'}</label>
        <div className="muted small">Điều kiện: {query ? decodeURIComponent(query).replace(/&/g, ' · ') : 'không có (toàn bộ issue)'}</div>
      </div>
    </Modal>
  );
}
