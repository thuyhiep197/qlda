import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useIssueModal } from '../hooks';
import type { Category } from '../types';
import { colorOf, fmtDate, today } from '../util';
import { Avatar, Empty, Spinner, StatusBadge, TypeIcon } from '../components/ui';
import { useProjectCtx } from './ProjectLayout';

interface Epic {
  id: number; key: string; summary: string; start_date: string | null; due_date: string | null;
  assignee_name: string | null; status_name: string; status_category: Category;
  total: number; done: number; inprogress: number; points: number; done_points: number;
  sprint_start: string | null; sprint_end: string | null;
}

const DAY = 86400_000;
const t = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

export default function Roadmap() {
  const project = useProjectCtx();
  const { open } = useIssueModal();
  const { data: epics, isLoading } = useQuery<Epic[]>({
    queryKey: ['roadmap', project.key],
    queryFn: () => api.get(`/reports/projects/${project.key}/roadmap`),
  });
  if (isLoading || !epics) return <Spinner />;
  if (!epics.length) {
    return <div className="page-pad"><Empty title="Chưa có epic nào">
      <p className="muted">Tạo issue loại Epic, đặt ngày bắt đầu và hạn hoàn thành để hiển thị trên roadmap.</p>
    </Empty></div>;
  }

  const range = (e: Epic): [string, string] | null => {
    const s = e.start_date || e.sprint_start, d = e.due_date || e.sprint_end;
    if (s && d) return [s, d];
    if (s) return [s, s];
    if (d) return [d, d];
    return null;
  };
  const dated = epics.map(range).filter(Boolean) as [string, string][];
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
  const width = Math.max(800, months.length * 140);

  return (
    <div className="page-pad">
      <div className="roadmap">
        <div className="roadmap-left">
          <div className="roadmap-cell head">Epic</div>
          {epics.map((e) => {
            const pctDone = e.total ? Math.round((e.done / e.total) * 100) : 0;
            return (
              <div key={e.id} className="roadmap-cell" onClick={() => open(e.key)}>
                <TypeIcon type="epic" />
                <div className="grow ellipsis">
                  <div className="ellipsis"><span className="issue-key">{e.key}</span> {e.summary}</div>
                  <div className="progress sm" title={`${e.done}/${e.total} issue hoàn thành`}>
                    <div style={{ width: `${pctDone}%` }} />
                    <div className="progress-ip" style={{ width: `${e.total ? (e.inprogress / e.total) * 100 : 0}%` }} />
                  </div>
                </div>
                <StatusBadge name={e.status_name} category={e.status_category} />
                <Avatar name={e.assignee_name} size={22} />
              </div>
            );
          })}
        </div>
        <div className="roadmap-right">
          <div style={{ width, position: 'relative' }}>
            <div className="roadmap-cell head timeline-head">
              {months.map((m) => <div key={m.label} className="month" style={{ left: `${m.left}%`, width: `${m.width}%` }}>{m.label}</div>)}
            </div>
            <div className="today-line" style={{ left: `${pct(t(now))}%` }} title={`Hôm nay ${fmtDate(now)}`} />
            {months.map((m) => <div key={m.label} className="month-grid" style={{ left: `${m.left}%` }} />)}
            {epics.map((e) => {
              const r = range(e);
              const color = colorOf(e.key);
              const pctDone = e.total ? (e.done / e.total) * 100 : 0;
              return (
                <div key={e.id} className="roadmap-cell timeline-row">
                  {r ? (
                    <div className="bar" onClick={() => open(e.key)}
                      title={`${e.summary}\n${fmtDate(r[0])} – ${fmtDate(r[1])}\n${e.done}/${e.total} issue · ${e.done_points}/${e.points} SP`}
                      style={{ left: `${pct(t(r[0]))}%`, width: `max(12px, ${pct(t(r[1]) + DAY) - pct(t(r[0]))}%)`, background: `${color}33`, borderColor: color }}>
                      <div className="bar-fill" style={{ width: `${pctDone}%`, background: color }} />
                    </div>
                  ) : <span className="muted small pad-x">Chưa đặt lịch — mở epic để đặt ngày bắt đầu/kết thúc</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
