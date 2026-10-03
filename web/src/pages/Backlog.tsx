import { Fragment, useEffect, useState, type DragEvent, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, qs, queryClient, refreshAll } from '../api';
import { can, useIssueModal, useSprints } from '../hooks';
import type { Issue, IssueType, Sprint } from '../types';
import { fmtDate, TYPE_LABELS } from '../util';
import { Spinner, toast, toastError, HelpTip } from '../components/ui';
import { FilterBar, useFilters } from '../components/FilterBar';
import { IssueLine } from '../components/IssueRow';
import { CompleteSprintModal, SprintSeriesModal, StartSprintModal } from '../components/SprintModals';
import CreateIssueModal from '../components/CreateIssueModal';
import { ImportButton } from '../components/ImportIssues';
import { BulkBar, runBulk } from '../components/BulkBar';
import { useProjectCtx } from './ProjectLayout';
import { CalendarRange, ChevronDown, ChevronRight, Plus, Target } from 'lucide-react';

type Container = number | 'backlog';

export default function Backlog() {
  const project = useProjectCtx();
  const { open } = useIssueModal();
  const { data: sprints } = useSprints(project.key, 'future,active');
  const issuesKey = ['issues', 'backlog', project.key];
  const { data: issues, isLoading } = useQuery<Issue[]>({
    queryKey: issuesKey,
    queryFn: () => api.get(`/issues${qs({ project: project.key, sprint: 'open', excludeSubtasks: '1', excludeEpics: '1' })}`),
  });
  // Việc con chỉ để xem (thụt vào dưới việc cha): đi theo sprint của việc cha nên không kéo thả, không cộng điểm
  const { data: subtasks } = useQuery<Issue[]>({
    queryKey: ['issues', 'backlog-sub', project.key],
    queryFn: () => api.get(`/issues${qs({ project: project.key, type: 'subtask' })}`),
  });
  const { data: epics } = useQuery<Issue[]>({
    queryKey: ['issues', 'epics', project.key],
    queryFn: () => api.get(`/issues${qs({ project: project.key, type: 'epic' })}`),
  });
  const { filters, setFilters, apply } = useFilters();
  const [drag, setDrag] = useState<Issue | null>(null);
  const [drop, setDrop] = useState<{ c: Container; index: number } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [startModal, setStartModal] = useState<{ sprint: Sprint; mode: 'start' | 'edit' } | null>(null);
  const [series, setSeries] = useState(false);
  const [completeModal, setCompleteModal] = useState<Sprint | null>(null);
  // Chọn nhiều issue (Ctrl/Shift + bấm, hoặc ô tick) để kéo cả nhóm hoặc sửa hàng loạt
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal')) setSelected(new Set()); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Quyền chi tiết: tạo / sửa (bắt đầu, hoàn thành) / xóa sprint; sắp xếp & kéo issue vào sprint (Sửa Backlog)
  const canSprint = can(project.permissions, 'sprint.manage');
  const canNewSprint = can(project.permissions, 'sprint.create');
  const canEditSprint = can(project.permissions, 'sprint.edit');
  const canDelSprint = can(project.permissions, 'sprint.delete');
  const canCreate = can(project.permissions, 'issue.create');

  if (isLoading || !sprints || !issues) return <Spinner />;

  const visible = apply(issues);
  const subsOf = new Map<number, Issue[]>();
  for (const s of subtasks || []) if (s.parent_id) subsOf.set(s.parent_id, [...(subsOf.get(s.parent_id) || []), s]);
  const listFor = (c: Container) => visible.filter((i) =>
    c === 'backlog' ? i.sprint_id == null && i.status_category !== 'done' : i.sprint_id === c);
  const selectedIssues = issues.filter((i) => selected.has(i.id)).sort((a, b) => a.rank - b.rank);

  const toggle = (i: Issue, list: Issue[], range: boolean) => {
    const n = new Set(selected);
    if (range && anchor !== null) {
      const a = list.findIndex((x) => x.id === anchor), b = list.findIndex((x) => x.id === i.id);
      if (a >= 0 && b >= 0) {
        for (let k = Math.min(a, b); k <= Math.max(a, b); k++) n.add(list[k].id);
        setSelected(n);
        return;
      }
    }
    n.has(i.id) ? n.delete(i.id) : n.add(i.id);
    setSelected(n);
    setAnchor(i.id);
  };

  const onDragOverRow = (e: DragEvent, c: Container, index: number) => {
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDrop({ c, index: e.clientY < rect.top + rect.height / 2 ? index : index + 1 });
  };

  const onDrop = async (c: Container) => {
    const d = drag, target = drop;
    setDrag(null); setDrop(null);
    if (!d || !target || target.c !== c) return;
    const sprintId = c === 'backlog' ? null : c;
    // Kéo một issue đang nằm trong nhóm đã chọn → di chuyển cả nhóm, giữ thứ tự
    const group = selected.has(d.id) && selected.size > 1 ? selectedIssues : [d];
    const groupIds = new Set(group.map((g) => g.id));
    const list = listFor(c);
    // Vị trí thả tính trên danh sách đã bỏ các issue đang kéo
    const before = list.slice(0, target.index).filter((i) => !groupIds.has(i.id));
    const after = list.slice(target.index).filter((i) => !groupIds.has(i.id));
    const prev = before[before.length - 1], next = after[0];
    if (group.length === 1) {
      const oldIdx = list.findIndex((i) => i.id === d.id);
      if (d.sprint_id === sprintId && oldIdx >= 0 && list[oldIdx - 1]?.id === prev?.id && list[oldIdx + 1]?.id === next?.id) return;
      const newRank = prev && next ? (prev.rank + next.rank) / 2 : prev ? prev.rank + 1000 : next ? next.rank - 1000 : d.rank;
      queryClient.setQueryData<Issue[]>(issuesKey, (old) => old?.map((i) => i.id === d.id ? { ...i, sprint_id: sprintId, rank: newRank } : i)
        .sort((a, b) => a.rank - b.rank));
      try {
        await api.post(`/issues/${d.key}/move`, { sprint_id: sprintId, after_id: prev?.id ?? null, before_id: next?.id ?? null });
      } catch (e) { toastError(e); }
      await refreshAll();
      return;
    }
    try {
      await runBulk({ keys: group.map((g) => g.key), changes: { sprint_id: sprintId }, after_id: prev?.id ?? null, before_id: next?.id ?? null },
        `Đã chuyển vào ${c === 'backlog' ? 'Backlog' : sprints.find((s) => s.id === c)?.name}`);
      setSelected(new Set());
    } catch (e) { toastError(e); }
  };

  const createSprint = async () => {
    try {
      // Như Jira: tạo sprint rồi mở ngay hộp đặt tên, ngày bắt đầu/kết thúc, mục tiêu
      const s = await api.post<Sprint>(`/projects/${project.key}/sprints`, {});
      await refreshAll();
      toast(`Đã tạo ${s.name}`);
      setStartModal({ sprint: s, mode: 'edit' });
    } catch (e) { toastError(e); }
  };

  const deleteSprint = async (s: Sprint) => {
    if (!confirm(`Xóa ${s.name}? Các issue trong sprint sẽ được chuyển về Backlog.`)) return;
    try { await api.del(`/projects/${project.key}/sprints/${s.id}`); toast('Đã xóa sprint'); await refreshAll(); } catch (e) { toastError(e); }
  };

  const hasActive = sprints.some((s) => s.state === 'active');
  const containers: { c: Container; sprint?: Sprint }[] = [...sprints.map((s) => ({ c: s.id as Container, sprint: s })), { c: 'backlog' }];
  const dragGroup = drag && selected.has(drag.id) && selected.size > 1;

  return (
    <div className={`page-pad ${selected.size ? 'has-selection' : ''}`}>
      <FilterBar project={project} filters={filters} setFilters={setFilters} epics={epics}>
        {canNewSprint && <button className="btn btn-sm btn-primary" onClick={createSprint}><Plus size={14} strokeWidth={2.5} /> Tạo sprint</button>}
        {canNewSprint && sprints.length > 0 && <button className="btn btn-sm" onClick={() => setSeries(true)} data-tip="Tạo tiếp nhiều sprint theo độ dài và nhịp của các sprint đã có"><CalendarRange size={14} /> Tạo loạt sprint</button>}
        <ImportButton project={project} />
        {canSprint && <HelpTip text="Giữ Ctrl (hoặc Shift để chọn liên tiếp) rồi bấm vào issue, hoặc tick ô đầu dòng, để chọn nhiều issue rồi kéo cả nhóm vào sprint" />}
      </FilterBar>
      {selected.size > 0 && <BulkBar issues={selectedIssues} onClear={() => setSelected(new Set())} />}

      {containers.map(({ c, sprint }) => {
        const list = listFor(c);
        const all = c === 'backlog' ? issues.filter((i) => i.sprint_id == null && i.status_category !== 'done') : issues.filter((i) => i.sprint_id === c);
        const sum = (cat?: string) => all.filter((i) => !cat || i.status_category === cat).reduce((a, i) => a + (i.story_points || 0), 0);
        const key = String(c);
        const isCollapsed = collapsed[key];
        const allSelected = list.length > 0 && list.every((i) => selected.has(i.id));
        return (
          <section key={key} className={`backlog-section ${drop?.c === c ? 'drop-active' : ''}`}
            onDragOver={(e) => { if (drag) { e.preventDefault(); if (drop?.c !== c) setDrop({ c, index: list.length }); } }}
            onDrop={(e) => { e.preventDefault(); onDrop(c); }}>
            <div className="backlog-head">
              <button className="icon-btn" onClick={() => setCollapsed({ ...collapsed, [key]: !isCollapsed })}>{isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</button>
              {list.length > 0 && (
                <input type="checkbox" checked={allSelected} data-tip={allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả issue trong mục này'}
                  onChange={() => {
                    const n = new Set(selected);
                    list.forEach((i) => (allSelected ? n.delete(i.id) : n.add(i.id)));
                    setSelected(n);
                  }} />
              )}
              <b>{sprint ? sprint.name : 'Backlog'}</b>
              {sprint?.state === 'active' && <span className="lozenge lozenge-green">Đang chạy</span>}
              {sprint?.start_date && <span className="muted small">{fmtDate(sprint.start_date)} – {fmtDate(sprint.end_date)}</span>}
              <span className="muted small">({all.length} issue)</span>
              <div className="spacer" />
              <span className="pts pts-todo" data-tip="Tổng điểm ước lượng: Cần làm">{sum('todo')}</span>
              <span className="pts pts-inprogress" data-tip="Tổng điểm ước lượng: Đang thực hiện">{sum('inprogress')}</span>
              <span className="pts pts-done" data-tip="Tổng điểm ước lượng: Hoàn thành">{sum('done')}</span>
              {sprint && canEditSprint && sprint.state === 'future' && (
                <button className="btn btn-sm" disabled={all.length === 0}
                  data-tip={all.length === 0 ? 'Sprint chưa có issue' : hasActive ? 'Chạy song song với sprint đang chạy' : undefined}
                  onClick={() => setStartModal({ sprint, mode: 'start' })}>Bắt đầu sprint</button>
              )}
              {sprint && canEditSprint && sprint.state === 'active' && (
                <button className="btn btn-sm" onClick={() => setCompleteModal(sprint)}>Hoàn thành sprint</button>
              )}
              {sprint && canEditSprint && <button className="btn btn-subtle btn-sm" onClick={() => setStartModal({ sprint, mode: 'edit' })}>Sửa</button>}
              {sprint && canDelSprint && sprint.state === 'future' && <button className="btn btn-subtle btn-sm" onClick={() => deleteSprint(sprint)}>Xóa</button>}
              {!sprint && canNewSprint && <button className="btn btn-sm" onClick={createSprint}><Plus size={14} /> Tạo sprint</button>}
            </div>
            {sprint?.goal && !isCollapsed && <div className="sprint-goal muted small"><Target size={13} /> {sprint.goal}</div>}
            {!isCollapsed && (
              <div className="issue-lines">
                {list.length === 0 && (
                  <div className="backlog-empty">
                    {sprint ? 'Kéo issue từ Backlog vào đây để lên kế hoạch sprint' : 'Backlog trống'}
                  </div>
                )}
                {list.map((i, idx) => {
                  const isSel = selected.has(i.id);
                  return (
                    <Fragment key={i.id}>
                    <div draggable={canSprint}
                      className={`drag-row ${isSel ? 'selected' : ''} ${drag?.id === i.id || (dragGroup && isSel) ? 'dragging' : ''}`}
                      style={{ position: 'relative' }}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        if (selected.has(i.id) && selected.size > 1) e.dataTransfer.setData('text/plain', `${selected.size} issue`);
                        setDrag(i);
                      }}
                      onDragEnd={() => { setDrag(null); setDrop(null); }}
                      onDragOver={(e) => onDragOverRow(e, c, idx)}
                      onClickCapture={(e) => {
                        if (e.ctrlKey || e.metaKey || e.shiftKey) { e.preventDefault(); e.stopPropagation(); toggle(i, list, e.shiftKey); }
                      }}>
                      {drop?.c === c && drop.index === idx && <div className="drop-line" />}
                      <label className="row-check" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isSel} onChange={(e) => toggle(i, list, (e.nativeEvent as MouseEvent).shiftKey)} aria-label={`Chọn ${i.key}`} />
                      </label>
                      <IssueLine issue={i} onOpen={() => open(i.key)} />
                    </div>
                    {(subsOf.get(i.id) || []).map((s) => (
                      <div key={s.id} className="sub-line"><IssueLine issue={s} onOpen={() => open(s.key)} /></div>
                    ))}
                    </Fragment>
                  );
                })}
                {drop?.c === c && drop.index === list.length && list.length > 0 && <div className="drop-line" />}
              </div>
            )}
            {!isCollapsed && canCreate && <QuickCreate projectKey={project.key} sprintId={sprint?.id ?? null} />}
          </section>
        );
      })}

      {startModal && <StartSprintModal project={project} sprint={startModal.sprint} mode={startModal.mode} onClose={() => setStartModal(null)} />}
      {series && <SprintSeriesModal project={project} sprints={sprints} onClose={() => setSeries(false)} />}
      {completeModal && (
        <CompleteSprintModal project={project} sprint={completeModal}
          futureSprints={sprints.filter((s) => s.state === 'future')}
          doneCount={issues.filter((i) => i.sprint_id === completeModal.id && i.status_category === 'done').length}
          openCount={issues.filter((i) => i.sprint_id === completeModal.id && i.status_category !== 'done').length}
          onClose={() => setCompleteModal(null)} />
      )}
    </div>
  );
}

export function QuickCreate({ projectKey, sprintId, statusId, compact }: {
  projectKey: string; sprintId?: number | null; statusId?: number; compact?: boolean;
}) {
  const { open } = useIssueModal();
  const [active, setActive] = useState(false);
  const [full, setFull] = useState(false);
  const [type, setType] = useState<IssueType>('story');
  const [summary, setSummary] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) return;
    try {
      await api.post('/issues', { project_key: projectKey, type, summary, sprint_id: sprintId, status_id: statusId });
      setSummary('');
      await refreshAll();
    } catch (err) { toastError(err); }
  };
  const modal = full && (
    <CreateIssueModal projectKey={projectKey} defaults={{ type, sprint_id: sprintId ?? null, status_id: statusId }}
      onClose={() => setFull(false)} onCreated={(issue) => open(issue.key)} />
  );
  if (!active) {
    return <>
      <button className={`quick-create-btn ${compact ? 'compact' : ''}`} onClick={() => setActive(true)}>+ Tạo issue</button>
      {modal}
    </>;
  }
  return (
    <>
      {/* Chỉ đóng khi con trỏ rời hẳn khỏi dòng tạo nhanh (bấm ô chọn loại không làm đóng) */}
      <form className="quick-create" onSubmit={submit}
        onBlur={(e) => { if (!summary && !e.currentTarget.contains(e.relatedTarget as Node | null)) setActive(false); }}>
        <select value={type} onChange={(e) => setType(e.target.value as IssueType)} title="Loại issue">
          {(['story', 'task', 'bug'] as IssueType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
        <input autoFocus value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Nhập tiêu đề rồi Enter (Esc để đóng)"
          onKeyDown={(e) => { if (e.key === 'Escape') setActive(false); }} />
        <button type="button" className="btn" title="Mở form đầy đủ: Epic, Sub-task, mô tả, người thực hiện..."
          onClick={() => { setFull(true); setActive(false); }}>Chi tiết…</button>
      </form>
      {modal}
    </>
  );
}
