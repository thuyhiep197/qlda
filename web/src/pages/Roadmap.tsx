import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useIssueModal } from '../hooks';
import type { Category, IssueType } from '../types';
import { colorOf, fmtDate, today } from '../util';
import { Avatar, Empty, Spinner, StatusBadge, TypeIcon } from '../components/ui';
import { useProjectCtx } from './ProjectLayout';
import { CreateEpicButton } from '../components/CreateIssueModal';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';

interface Child {
  id: number; key: string; type: IssueType; summary: string; start_date: string | null; due_date: string | null;
  story_points: number | null; assignee_name: string | null; status_name: string; status_category: Category;
  sprint_start: string | null; sprint_end: string | null; sprint_name: string | null;
}
interface Epic {
  id: number; key: string; summary: string; start_date: string | null; due_date: string | null;
  assignee_name: string | null; status_name: string; status_category: Category;
  total: number; done: number; inprogress: number; points: number; done_points: number;
  sprint_start: string | null; sprint_end: string | null; children: Child[];
}

const DAY = 86400_000;
const t = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

/** Khoảng thời gian hiển thị: ngày bắt đầu/hạn của issue; thiếu thì lấy theo sprint. */
function range(x: { start_date: string | null; due_date: string | null; sprint_start: string | null; sprint_end: string | null }): [string, string] | null {
  const s = x.start_date || x.sprint_start, d = x.due_date || x.sprint_end;
  if (s && d) return s <= d ? [s, d] : [d, s];
  if (s) return [s, s];
  if (d) return [d, d];
  return null;
}

/** Lộ trình (Timeline) như Jira: Epic theo tháng, mở rộng để xem các issue con. */
export default function Roadmap() {
  const project = useProjectCtx();
  const { open } = useIssueModal();
  const [expanded, setExpanded] = useState<Set<number> | null>(null); // null = mặc định mở hết các epic
  const { data: epics, isLoading } = useQuery<Epic[]>({
    queryKey: ['roadmap', project.key],
    queryFn: () => api.get(`/reports/projects/${project.key}/roadmap`),
  });
  if (isLoading || !epics) return <Spinner />;
  if (!epics.length) {
    return <div className="page-pad"><Empty title="Chưa có epic nào">
      <p className="muted">Tạo Epic, đặt ngày bắt đầu và hạn hoàn thành để hiển thị trên kế hoạch tổng quan.</p>
      <CreateEpicButton project={project} small={false} />
    </Empty></div>;
  }

  const dated = [...epics.map(range), ...epics.flatMap((e) => e.children.map(range))].filter(Boolean) as [string, string][];
  const now = today();
  const min = new Date(Math.min(t(now), ...dated.map((r) => t(r[0]))));
  const max = new Date(Math.max(t(now) + 30 * DAY, ...dated.map((r) => t(r[1]))));
  // Làm tròn theo tháng
  const start = Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), 1);
  const end = Date.UTC(max.getUTCFullYear(), max.getUTCMonth() + 1, 1);
  const span = end - start;
  const pct = (ms: number) => ((ms - start) / span) * 100;

  const months: { label: string; left: number; width: number }[] = [];
  for (let d = new Date(start); d.getTime() < end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    months.push({ label: `T${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`, left: pct(d.getTime()), width: pct(next) - pct(d.getTime()) });
  }
  const width = Math.max(800, months.length * 160);
  const isOpen = (id: number) => (expanded ? expanded.has(id) : true);
  const toggle = (id: number) => { const n = new Set(expanded ?? epics.map((e) => e.id)); n.has(id) ? n.delete(id) : n.add(id); setExpanded(n); };
  const allOpen = epics.every((e) => !e.children.length || isOpen(e.id));

  // Mỗi hàng: epic, tiếp theo là các issue con khi được mở rộng
  const rows: ({ kind: 'epic'; e: Epic } | { kind: 'child'; c: Child; color: string })[] = [];
  for (const e of epics) {
    rows.push({ kind: 'epic', e });
    if (isOpen(e.id)) for (const c of e.children) rows.push({ kind: 'child', c, color: colorOf(e.key) });
  }

  const bar = (r: [string, string], color: string, done: number, tip: string, onClick: () => void, child = false) => (
    <div className={`bar ${child ? 'bar-child' : ''}`} onClick={onClick} data-tip={tip}
      style={{ left: `${pct(t(r[0]))}%`, width: `max(12px, ${pct(t(r[1]) + DAY) - pct(t(r[0]))}%)`, background: `${color}33`, borderColor: color }}>
      <div className="bar-fill" style={{ width: `${done}%`, background: color }} />
    </div>
  );

  return (
    <div className="page-pad">
      <div className="row gap-sm mb-sm">
        <button className="btn btn-sm" onClick={() => setExpanded(allOpen ? new Set() : new Set(epics.map((e) => e.id)))}>
          {allOpen ? <><ChevronsDownUp size={14} /> Thu gọn tất cả</> : <><ChevronsUpDown size={14} /> Mở rộng tất cả</>}
        </button>
        <CreateEpicButton project={project} />
        <span className="muted small">Bấm mũi tên cạnh epic để xem các issue trong epic. Thanh thời gian lấy theo ngày bắt đầu – hạn hoàn thành, nếu thiếu thì theo sprint.</span>
      </div>
      <div className="roadmap">
        <div className="roadmap-left">
          <div className="roadmap-cell head">Epic / issue</div>
          {rows.map((row) => {
            if (row.kind === 'epic') {
              const e = row.e;
              const pctDone = e.total ? Math.round((e.done / e.total) * 100) : 0;
              return (
                <div key={`e${e.id}`} className="roadmap-cell" onClick={() => open(e.key)}>
                  <button className="icon-btn" disabled={!e.children.length} data-tip={e.children.length ? `${e.children.length} issue con` : 'Chưa có issue con'}
                    onClick={(ev) => { ev.stopPropagation(); toggle(e.id); }}>{isOpen(e.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                  <TypeIcon type="epic" />
                  <div className="grow ellipsis">
                    <div className="ellipsis"><span className="issue-key">{e.key}</span> {e.summary}</div>
                    <div className="progress sm" data-tip={`${e.done}/${e.total} issue hoàn thành · ${e.done_points}/${e.points} điểm`}>
                      <div style={{ width: `${pctDone}%` }} />
                      <div className="progress-ip" style={{ width: `${e.total ? (e.inprogress / e.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <StatusBadge name={e.status_name} category={e.status_category} />
                  <Avatar name={e.assignee_name} size={22} />
                </div>
              );
            }
            const c = row.c;
            return (
              <div key={`c${c.id}`} className="roadmap-cell roadmap-child" onClick={() => open(c.key)}>
                <TypeIcon type={c.type} size={14} />
                <div className="grow ellipsis small"><span className="issue-key">{c.key}</span> {c.summary}</div>
                <StatusBadge name={c.status_name} category={c.status_category} />
                <Avatar name={c.assignee_name} size={20} />
              </div>
            );
          })}
        </div>
        <div className="roadmap-right">
          <div style={{ width, position: 'relative' }}>
            <div className="roadmap-cell head timeline-head">
              {months.map((m) => <div key={m.label} className="month" style={{ left: `${m.left}%`, width: `${m.width}%` }}>{m.label}</div>)}
            </div>
            <div className="today-line" style={{ left: `${pct(t(now))}%` }} data-tip={`Hôm nay ${fmtDate(now)}`} />
            {months.map((m) => <div key={m.label} className="month-grid" style={{ left: `${m.left}%` }} />)}
            {rows.map((row) => {
              if (row.kind === 'epic') {
                const e = row.e;
                const r = range(e);
                return (
                  <div key={`e${e.id}`} className="roadmap-cell timeline-row">
                    {r ? bar(r, colorOf(e.key), e.total ? (e.done / e.total) * 100 : 0,
                      `${e.summary}\n${fmtDate(r[0])} – ${fmtDate(r[1])}\n${e.done}/${e.total} issue · ${e.done_points}/${e.points} điểm`, () => open(e.key))
                      : <span className="muted small pad-x">Chưa đặt lịch — mở epic để đặt ngày bắt đầu/kết thúc</span>}
                  </div>
                );
              }
              const c = row.c;
              const r = range(c);
              return (
                <div key={`c${c.id}`} className="roadmap-cell timeline-row roadmap-child">
                  {r ? bar(r, row.color, c.status_category === 'done' ? 100 : c.status_category === 'inprogress' ? 50 : 0,
                    `${c.key} ${c.summary}\n${fmtDate(r[0])} – ${fmtDate(r[1])}${!c.start_date && c.sprint_name ? `\n(theo ${c.sprint_name})` : ''}\n${c.status_name}`, () => open(c.key), true)
                    : <span className="muted small pad-x">Chưa có ngày</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
