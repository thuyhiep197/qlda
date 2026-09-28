import { useState, type DragEvent, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, qs, queryClient, refreshAll } from '../api';
import { can, useIssueModal, useSprints } from '../hooks';
import type { Issue, IssueType, Sprint } from '../types';
import { fmtDate, TYPE_LABELS } from '../util';
import { Spinner, toast, toastError } from '../components/ui';
import { FilterBar, useFilters } from '../components/FilterBar';
import { IssueLine } from '../components/IssueRow';
import { CompleteSprintModal, StartSprintModal } from '../components/SprintModals';
import CreateIssueModal from '../components/CreateIssueModal';
import { useProjectCtx } from './ProjectLayout';

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
  const { data: epics } = useQuery<Issue[]>({
    queryKey: ['issues', 'epics', project.key],
    queryFn: () => api.get(`/issues${qs({ project: project.key, type: 'epic' })}`),
  });
  const { filters, setFilters, apply } = useFilters();
  const [drag, setDrag] = useState<Issue | null>(null);
  const [drop, setDrop] = useState<{ c: Container; index: number } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [startModal, setStartModal] = useState<{ sprint: Sprint; mode: 'start' | 'edit' } | null>(null);
  const [completeModal, setCompleteModal] = useState<Sprint | null>(null);

  const canSprint = can(project.permissions, 'sprint.manage');
  const canCreate = can(project.permissions, 'issue.create');

  if (isLoading || !sprints || !issues) return <Spinner />;

  const visible = apply(issues);
  const listFor = (c: Container) => visible.filter((i) =>
    c === 'backlog' ? i.sprint_id == null && i.status_category !== 'done' : i.sprint_id === c);

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
    const list = listFor(c);
    const without = list.filter((i) => i.id !== d.id);
    let idx = target.index;
    const oldIdx = list.findIndex((i) => i.id === d.id);
    if (oldIdx >= 0 && oldIdx < idx) idx--;
    const after = without[idx - 1], before = without[idx];
    const sprintId = c === 'backlog' ? null : c;
    if (d.sprint_id === sprintId && oldIdx === idx) return;

    // Cập nhật lạc quan để giao diện phản hồi ngay
    const newRank = after && before ? (after.rank + before.rank) / 2 : after ? after.rank + 1000 : before ? before.rank - 1000 : d.rank;
    queryClient.setQueryData<Issue[]>(issuesKey, (old) => old?.map((i) => i.id === d.id ? { ...i, sprint_id: sprintId, rank: newRank } : i)
      .sort((a, b) => a.rank - b.rank));
    try {
      await api.post(`/issues/${d.key}/move`, { sprint_id: sprintId, after_id: after?.id ?? null, before_id: before?.id ?? null });
    } catch (e) { toastError(e); }
    await refreshAll();
  };

  const createSprint = async () => {
    try { await api.post(`/projects/${project.key}/sprints`, {}); await refreshAll(); } catch (e) { toastError(e); }
  };

  const deleteSprint = async (s: Sprint) => {
    if (!confirm(`Xóa ${s.name}? Các issue trong sprint sẽ được chuyển về Backlog.`)) return;
    try { await api.del(`/projects/${project.key}/sprints/${s.id}`); toast('Đã xóa sprint'); await refreshAll(); } catch (e) { toastError(e); }
  };

  const hasActive = sprints.some((s) => s.state === 'active');
  const containers: { c: Container; sprint?: Sprint }[] = [...sprints.map((s) => ({ c: s.id as Container, sprint: s })), { c: 'backlog' }];

  return (
    <div className="page-pad">
      <FilterBar project={project} filters={filters} setFilters={setFilters} epics={epics} />

      {containers.map(({ c, sprint }) => {
        const list = listFor(c);
        const all = c === 'backlog' ? issues.filter((i) => i.sprint_id == null && i.status_category !== 'done') : issues.filter((i) => i.sprint_id === c);
        const sum = (cat?: string) => all.filter((i) => !cat || i.status_category === cat).reduce((a, i) => a + (i.story_points || 0), 0);
        const key = String(c);
        const isCollapsed = collapsed[key];
        return (
          <section key={key} className={`backlog-section ${drop?.c === c ? 'drop-active' : ''}`}
            onDragOver={(e) => { if (drag) { e.preventDefault(); if (drop?.c !== c) setDrop({ c, index: list.length }); } }}
            onDrop={(e) => { e.preventDefault(); onDrop(c); }}>
            <div className="backlog-head">
              <button className="icon-btn" onClick={() => setCollapsed({ ...collapsed, [key]: !isCollapsed })}>{isCollapsed ? '▸' : '▾'}</button>
              <b>{sprint ? sprint.name : 'Backlog'}</b>
              {sprint?.state === 'active' && <span className="lozenge lozenge-green">Đang chạy</span>}
              {sprint?.start_date && <span className="muted small">{fmtDate(sprint.start_date)} – {fmtDate(sprint.end_date)}</span>}
              <span className="muted small">({all.length} issue)</span>
              <div className="spacer" />
              <span className="pts pts-todo" title="Cần làm">{sum('todo')}</span>
              <span className="pts pts-inprogress" title="Đang thực hiện">{sum('inprogress')}</span>
              <span className="pts pts-done" title="Hoàn thành">{sum('done')}</span>
              {sprint && canSprint && sprint.state === 'future' && (
                <button className="btn btn-sm" disabled={hasActive || all.length === 0}
                  title={hasActive ? 'Đang có sprint chạy' : all.length === 0 ? 'Sprint chưa có issue' : ''}
                  onClick={() => setStartModal({ sprint, mode: 'start' })}>Bắt đầu sprint</button>
              )}
              {sprint && canSprint && sprint.state === 'active' && (
                <button className="btn btn-sm" onClick={() => setCompleteModal(sprint)}>Hoàn thành sprint</button>
              )}
              {sprint && canSprint && <button className="btn btn-subtle btn-sm" onClick={() => setStartModal({ sprint, mode: 'edit' })}>Sửa</button>}
              {sprint && canSprint && sprint.state === 'future' && <button className="btn btn-subtle btn-sm" onClick={() => deleteSprint(sprint)}>Xóa</button>}
              {!sprint && canSprint && <button className="btn btn-sm" onClick={createSprint}>Tạo sprint</button>}
            </div>
            {sprint?.goal && !isCollapsed && <div className="sprint-goal muted small">🎯 {sprint.goal}</div>}
            {!isCollapsed && (
              <div className="issue-lines">
                {list.length === 0 && (
                  <div className="backlog-empty">
                    {sprint ? 'Kéo issue từ Backlog vào đây để lên kế hoạch sprint' : 'Backlog trống'}
                  </div>
                )}
                {list.map((i, idx) => (
                  <div key={i.id} draggable={canSprint}
                    className={`drag-row ${drag?.id === i.id ? 'dragging' : ''}`}
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDrag(i); }}
                    onDragEnd={() => { setDrag(null); setDrop(null); }}
                    onDragOver={(e) => onDragOverRow(e, c, idx)}>
                    {drop?.c === c && drop.index === idx && <div className="drop-line" />}
                    <IssueLine issue={i} onOpen={() => open(i.key)} />
                  </div>
                ))}
                {drop?.c === c && drop.index === list.length && list.length > 0 && <div className="drop-line" />}
              </div>
            )}
            {!isCollapsed && canCreate && <QuickCreate projectKey={project.key} sprintId={sprint?.id ?? null} />}
          </section>
        );
      })}

      {startModal && <StartSprintModal project={project} sprint={startModal.sprint} mode={startModal.mode} onClose={() => setStartModal(null)} />}
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
