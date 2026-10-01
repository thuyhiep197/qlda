import { useState, type DragEvent } from 'react';
import { ChevronDown, ChevronRight, CalendarDays } from 'lucide-react';
import { api, refreshAll } from '../api';
import { can, useIssueModal } from '../hooks';
import type { Issue, Project, Status } from '../types';
import { canMove, fmtDate, HEALTH_LABELS, issueHealth, type Health } from '../util';
import { Avatar, PriorityIcon, toast, toastError, TypeIcon } from './ui';

const HEALTH_TONE: Record<Health, string> = {
  late: 'red', behind: 'yellow', on_track: 'blue', not_started: 'default', done_late: 'purple', done: 'green', no_plan: 'default',
};

export interface KanbanLane { key: string; title: string; epicKey?: string; items: Issue[] }

/**
 * Kế hoạch chi tiết dạng Kanban: cột = trạng thái, làn = giai đoạn (Epic).
 * Kéo thẻ sang cột khác để đổi trạng thái (chỉ cột hợp lệ theo quy trình của loại issue).
 */
export function PlanKanban({ project, lanes }: { project: Project; lanes: KanbanLane[] }) {
  const { open } = useIssueModal();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<Issue | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const statuses = project.statuses;
  const canTransition = can(project.permissions, 'issue.transition');

  const drop = async (e: DragEvent, st: Status) => {
    e.preventDefault();
    const d = drag;
    setDrag(null); setOver(null);
    if (!d || d.status_id === st.id || !canMove(project, d.type, d.status_id, st.id)) return;
    try {
      await api.patch(`/issues/${d.key}`, { status_id: st.id });
      toast(`${d.key}: ${st.name}`);
      await refreshAll();
    } catch (err) { toastError(err); }
  };

  const total = lanes.reduce((a, l) => a + l.items.length, 0);
  if (!total) return <div className="muted pad">Không có công việc nào khớp bộ lọc.</div>;

  return (
    <div className="pk">
      <div className="board pk-board" style={{ gridTemplateColumns: `repeat(${statuses.length}, minmax(200px, 1fr))` }}>
        {statuses.map((s) => (
          <div key={s.id} className="board-col-head">
            <span>{s.name}</span>
            <span className="muted">{lanes.reduce((a, l) => a + l.items.filter((i) => i.status_id === s.id).length, 0)}</span>
          </div>
        ))}
        {lanes.filter((l) => l.items.length).map((lane) => {
          const isCollapsed = collapsed.has(lane.key);
          const done = lane.items.filter((i) => i.status_category === 'done').length;
          return (
            <div key={lane.key} className="pk-lane" style={{ gridColumn: `1 / span ${statuses.length}` }}>
              <div className="lane-head" onClick={() => { const n = new Set(collapsed); n.has(lane.key) ? n.delete(lane.key) : n.add(lane.key); setCollapsed(n); }}>
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                {lane.epicKey && <TypeIcon type="epic" size={14} />}
                <span className="ellipsis">{lane.title}</span>
                <span className="muted small nowrap">({done}/{lane.items.length} xong)</span>
              </div>
              {!isCollapsed && (
                <div className="pk-row" style={{ gridTemplateColumns: `repeat(${statuses.length}, minmax(200px, 1fr))` }}>
                  {statuses.map((s) => {
                    const cell = `${lane.key}:${s.id}`;
                    const allowed = !drag || canMove(project, drag.type, drag.status_id, s.id);
                    return (
                      <div key={s.id} className={`board-col ${over === cell && allowed ? 'drop-active' : ''} ${drag && !allowed ? 'blocked' : ''}`}
                        onDragOver={(e) => { if (drag && allowed) { e.preventDefault(); if (over !== cell) setOver(cell); } }}
                        onDragLeave={() => over === cell && setOver(null)}
                        onDrop={(e) => drop(e, s)}>
                        {lane.items.filter((i) => i.status_id === s.id).map((i) => {
                          const h = issueHealth(i);
                          return (
                            <div key={i.id} className={`card-issue ${drag?.id === i.id ? 'dragging' : ''}`} draggable={canTransition}
                              onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDrag(i); }}
                              onDragEnd={() => { setDrag(null); setOver(null); }}
                              onClick={() => open(i.key)}>
                              {i.type === 'subtask' && i.parent_key && <div className="muted small ellipsis">↳ {i.parent_key} {i.parent_summary}</div>}
                              <div className={`card-title ${i.status_category === 'done' ? 'done-text' : ''}`}>{i.summary}</div>
                              <div className="row gap-xs wrap">
                                <span className={`lozenge lozenge-${HEALTH_TONE[h]}`}>{HEALTH_LABELS[h]}</span>
                                {(i.start_date || i.due_date) && <span className={`small nowrap ${h === 'late' ? 'overdue' : 'muted'}`}><CalendarDays size={12} /> {fmtDate(i.start_date).slice(0, 5)}{i.due_date ? `–${fmtDate(i.due_date).slice(0, 5)}` : ''}</span>}
                              </div>
                              <div className="card-foot">
                                <TypeIcon type={i.type} size={14} />
                                <span className="issue-key">{i.key}</span>
                                <span className="spacer" />
                                <PriorityIcon priority={i.priority} size={14} />
                                {i.component_lead_name && <span className="muted small ellipsis pk-ba" data-tip={`BA phụ trách: ${i.component_lead_name}`}>BA: {i.component_lead_name.split(' ').slice(-1)[0]}</span>}
                                <Avatar name={i.assignee_name} size={22} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
