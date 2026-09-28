import { useState, type DragEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, qs, queryClient, refreshAll } from '../api';
import { can, useIssueModal, useSprints } from '../hooks';
import type { Issue, Status } from '../types';
import { fmtDate, isOverdue, today } from '../util';
import { Avatar, Empty, PriorityIcon, Spinner, toastError, TypeIcon } from '../components/ui';
import { FilterBar, useFilters } from '../components/FilterBar';
import { EpicTag } from '../components/IssueRow';
import { CompleteSprintModal } from '../components/SprintModals';
import { QuickCreate } from './Backlog';
import { useProjectCtx } from './ProjectLayout';

type Group = 'none' | 'assignee' | 'epic';

export default function Board() {
  const project = useProjectCtx();
  const { open } = useIssueModal();
  const isScrum = project.type === 'scrum';
  const sprint = project.active_sprint;
  const issuesKey = ['issues', 'board', project.key];
  const { data: issues, isLoading } = useQuery<Issue[]>({
    queryKey: issuesKey,
    queryFn: () => api.get(`/issues${qs(isScrum
      ? { project: project.key, sprint: 'active', excludeEpics: '1' }
      : { project: project.key, excludeEpics: '1', hideDoneOlderThanDays: 14 })}`),
    enabled: !isScrum || !!sprint,
  });
  const { data: epics } = useQuery<Issue[]>({
    queryKey: ['issues', 'epics', project.key],
    queryFn: () => api.get(`/issues${qs({ project: project.key, type: 'epic' })}`),
  });
  const { data: futureSprints } = useSprints(project.key, 'future');
  const { filters, setFilters, apply } = useFilters();
  const [group, setGroup] = useState<Group>('none');
  const [showSub, setShowSub] = useState(true);
  const [drag, setDrag] = useState<Issue | null>(null);
  const [drop, setDrop] = useState<{ lane: string; status: number; index: number } | null>(null);
  const [completing, setCompleting] = useState(false);

  const canTransition = can(project.permissions, 'issue.transition');

  if (isScrum && !sprint) {
    return (
      <div className="page-pad">
        <Empty title="Chưa có sprint nào đang chạy">
          <p className="muted">Vào <Link to={`/p/${project.key}/backlog`}>Backlog</Link> để lên kế hoạch và bắt đầu sprint.</p>
        </Empty>
      </div>
    );
  }
  if (isLoading || !issues) return <Spinner />;

  const statuses = project.statuses;
  const visible = apply(issues).filter((i) => showSub || i.type !== 'subtask');

  const allowed = (from: number, to: number) => from === to || !project.workflow_strict ||
    project.transitions.some((t) => t.from_status_id === from && t.to_status_id === to);

  // Nhóm theo làn (swimlane)
  let lanes: { key: string; title: React.ReactNode; items: Issue[] }[];
  if (group === 'assignee') {
    const map = new Map<string, Issue[]>();
    visible.forEach((i) => { const k = String(i.assignee_id ?? 'none'); map.set(k, [...(map.get(k) || []), i]); });
    lanes = [...map.entries()].map(([k, items]) => ({
      key: k, items,
      title: <><Avatar name={items[0].assignee_name} size={22} /> {items[0].assignee_name || 'Chưa giao'}</>,
    })).sort((a, b) => (a.key === 'none' ? 1 : b.key === 'none' ? -1 : 0));
  } else if (group === 'epic') {
    const epicOf = (i: Issue) => (i.parent_type === 'epic' ? String(i.parent_id) : 'none');
    const map = new Map<string, Issue[]>();
    visible.forEach((i) => { const k = epicOf(i); map.set(k, [...(map.get(k) || []), i]); });
    lanes = [...map.entries()].map(([k, items]) => ({
      key: k, items,
      title: k === 'none' ? 'Không thuộc epic' : <><TypeIcon type="epic" size={14} /> {items[0].parent_summary}</>,
    })).sort((a, b) => (a.key === 'none' ? 1 : b.key === 'none' ? -1 : 0));
  } else {
    lanes = [{ key: 'all', title: null, items: visible }];
  }

  const onDragOverCard = (e: DragEvent, lane: string, status: Status, index: number) => {
    if (!drag || !allowed(drag.status_id, status.id)) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDrop({ lane, status: status.id, index: e.clientY < rect.top + rect.height / 2 ? index : index + 1 });
  };

  const onDrop = async (lane: string, status: Status, cards: Issue[]) => {
    const d = drag, target = drop;
    setDrag(null); setDrop(null);
    if (!d || !target || target.status !== status.id || target.lane !== lane) return;
    const without = cards.filter((i) => i.id !== d.id);
    let idx = target.index;
    const oldIdx = cards.findIndex((i) => i.id === d.id);
    if (oldIdx >= 0 && oldIdx < idx) idx--;
    if (d.status_id === status.id && oldIdx === idx) return;
    const after = without[idx - 1], before = without[idx];
    const newRank = after && before ? (after.rank + before.rank) / 2 : after ? after.rank + 1000 : before ? before.rank - 1000 : d.rank;
    queryClient.setQueryData<Issue[]>(issuesKey, (old) => old?.map((i) => i.id === d.id
      ? { ...i, status_id: status.id, status_name: status.name, status_category: status.category, rank: newRank } : i)
      .sort((a, b) => a.rank - b.rank));
    try {
      await api.post(`/issues/${d.key}/move`, { status_id: status.id, after_id: after?.id ?? null, before_id: before?.id ?? null });
    } catch (e) { toastError(e); }
    await refreshAll();
  };

  const daysLeft = sprint?.end_date ? Math.ceil((new Date(`${sprint.end_date}T23:59:59`).getTime() - Date.now()) / 86400_000) : null;

  return (
    <div className="page-pad board-page">
      {isScrum && sprint && (
        <div className="sprint-bar">
          <div>
            <b>{sprint.name}</b>
            <span className="muted small"> · {fmtDate(sprint.start_date)} – {fmtDate(sprint.end_date)}</span>
            {daysLeft !== null && <span className={`small ${daysLeft < 0 ? 'overdue' : 'muted'}`}> · {daysLeft >= 0 ? `còn ${daysLeft} ngày` : `trễ ${-daysLeft} ngày`}</span>}
            {sprint.goal && <div className="muted small">🎯 {sprint.goal}</div>}
          </div>
          <div className="spacer" />
          {can(project.permissions, 'sprint.manage') && <button className="btn" onClick={() => setCompleting(true)}>Hoàn thành sprint</button>}
        </div>
      )}

      <FilterBar project={project} filters={filters} setFilters={setFilters} epics={epics}>
        <label className="check small"><input type="checkbox" checked={showSub} onChange={(e) => setShowSub(e.target.checked)} /> Hiện sub-task</label>
        <select value={group} onChange={(e) => setGroup(e.target.value as Group)}>
          <option value="none">Không phân làn</option>
          <option value="assignee">Phân làn theo người thực hiện</option>
          <option value="epic">Phân làn theo epic</option>
        </select>
      </FilterBar>

      <div className="board" style={{ gridTemplateColumns: `repeat(${statuses.length}, minmax(220px, 1fr))` }}>
        {statuses.map((s) => {
          const count = visible.filter((i) => i.status_id === s.id).length;
          const over = s.wip_limit != null && count > s.wip_limit;
          return (
            <div key={s.id} className={`board-col-head ${over ? 'wip-over' : ''}`}>
              <span>{s.name}</span>
              <span className="muted">{count}{s.wip_limit ? ` / ${s.wip_limit}` : ''}</span>
            </div>
          );
        })}
        {lanes.map((lane) => (
          <Lane key={lane.key} lane={lane} statuses={statuses} group={group}>
            {statuses.map((s) => {
              const cards = lane.items.filter((i) => i.status_id === s.id);
              const blocked = drag && !allowed(drag.status_id, s.id);
              const isTarget = drop?.lane === lane.key && drop.status === s.id;
              return (
                <div key={s.id} className={`board-col ${blocked ? 'blocked' : ''} ${isTarget ? 'drop-active' : ''}`}
                  onDragOver={(e) => {
                    if (!drag || blocked) return;
                    e.preventDefault();
                    if (!isTarget) setDrop({ lane: lane.key, status: s.id, index: cards.length });
                  }}
                  onDrop={(e) => { e.preventDefault(); onDrop(lane.key, s, cards); }}>
                  {cards.map((i, idx) => (
                    <div key={i.id} draggable={canTransition}
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDrag(i); }}
                      onDragEnd={() => { setDrag(null); setDrop(null); }}
                      onDragOver={(e) => onDragOverCard(e, lane.key, s, idx)}>
                      {isTarget && drop!.index === idx && <div className="drop-line" />}
                      <Card issue={i} dragging={drag?.id === i.id} onOpen={() => open(i.key)} />
                    </div>
                  ))}
                  {isTarget && drop!.index === cards.length && cards.length > 0 && <div className="drop-line" />}
                  {s.id === statuses[0].id && lane.key === lanes[0].key && can(project.permissions, 'issue.create') &&
                    <QuickCreate projectKey={project.key} sprintId={sprint?.id} statusId={s.id} compact />}
                </div>
              );
            })}
          </Lane>
        ))}
      </div>

      {completing && sprint && (
        <CompleteSprintModal project={project} sprint={sprint} futureSprints={futureSprints || []}
          doneCount={issues.filter((i) => i.type !== 'subtask' && i.status_category === 'done').length}
          openCount={issues.filter((i) => i.type !== 'subtask' && i.status_category !== 'done').length}
          onClose={() => setCompleting(false)} />
      )}
    </div>
  );
}

function Lane({ lane, statuses, group, children }: {
  lane: { key: string; title: React.ReactNode; items: Issue[] }; statuses: Status[]; group: Group; children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (group === 'none') return <>{children}</>;
  return (
    <>
      <div className="lane-head" style={{ gridColumn: `1 / span ${statuses.length}` }} onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? '▸' : '▾'} {lane.title} <span className="muted small">({lane.items.length} issue)</span>
      </div>
      {!collapsed && children}
    </>
  );
}

function Card({ issue, onOpen, dragging }: { issue: Issue; onOpen: () => void; dragging: boolean }) {
  return (
    <div className={`card-issue ${dragging ? 'dragging' : ''}`} onClick={onOpen}>
      {issue.type === 'subtask' && issue.parent_key && <div className="muted small ellipsis">↳ {issue.parent_key} {issue.parent_summary}</div>}
      <div className={`card-title ${issue.status_category === 'done' ? 'done-text' : ''}`}>{issue.summary}</div>
      <div className="card-tags">
        <EpicTag issue={issue} />
        {issue.labels.map((l) => <span key={l} className="label-chip sm">{l}</span>)}
      </div>
      <div className="card-foot">
        <TypeIcon type={issue.type} />
        <span className="issue-key small">{issue.key}</span>
        {issue.child_count > 0 && <span className="muted small nowrap" title="Sub-task hoàn thành">☑ {issue.child_done}/{issue.child_count}</span>}
        {issue.due_date && <span className={`small ${isOverdue(issue) ? 'overdue' : issue.due_date === today() ? 'warn' : 'muted'}`}>📅 {fmtDate(issue.due_date).slice(0, 5)}</span>}
        <div className="spacer" />
        <PriorityIcon priority={issue.priority} />
        {issue.story_points != null && <span className="points">{issue.story_points}</span>}
        <Avatar name={issue.assignee_name} size={24} />
      </div>
    </div>
  );
}
