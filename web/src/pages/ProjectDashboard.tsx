import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CheckCircle2, Flag, Gauge, Timer } from 'lucide-react';
import { api } from '../api';
import { useIssueModal } from '../hooks';
import type { Issue, IssueType } from '../types';
import { fmtDate, timeAgo } from '../util';
import { Avatar, Empty, Spinner, TypeIcon } from '../components/ui';
import { IssueLine } from '../components/IssueRow';
import { useProjectCtx } from './ProjectLayout';

type Health = 'done' | 'late' | 'behind' | 'not_started' | 'on_track';
interface Measure {
  total_issues: number; done_issues: number; inprogress_issues: number; points: number; done_points: number;
  pct_done: number; pct_planned: number; overdue: number;
}
interface DashData {
  today: string;
  overall: Measure & { start: string | null; end: string | null; pct_time: number; health: Health; done_week: number };
  epics: (Measure & { id: number; key: string; summary: string; start_date: string | null; due_date: string | null; health: Health })[];
  labels: (Measure & { name: string; start: string | null; end: string | null })[];
  sprints: (Measure & { id: number; name: string; start_date: string; end_date: string; goal: string | null; days_left: number; pct_time: number })[];
  next_sprint: { id: number; name: string; start_date: string | null; end_date: string | null } | null;
  byAssignee: { name: string; todo: number; inprogress: number; overdue: number }[];
  overdue: Issue[];
  upcoming: Issue[];
  milestones: { key: string; type: IssueType; summary: string; due_date: string; days: number }[];
  activity: { id: number; field: string; new_label: string; created_at: string; user_name: string; key: string; summary: string; type: IssueType }[];
}

const HEALTH: Record<Health, { label: string; tone: string; tip: string }> = {
  done: { label: 'Hoàn thành', tone: 'green', tip: 'Tất cả issue đã hoàn thành' },
  on_track: { label: 'Đúng tiến độ', tone: 'blue', tip: 'Khối lượng hoàn thành theo kịp kế hoạch' },
  behind: { label: 'Chậm tiến độ', tone: 'yellow', tip: 'Hoàn thành thấp hơn kế hoạch quá 10%' },
  late: { label: 'Trễ hạn', tone: 'red', tip: 'Đã qua hạn kết thúc nhưng còn issue chưa xong' },
  not_started: { label: 'Chưa bắt đầu', tone: 'default', tip: 'Chưa có issue nào đang làm hoặc hoàn thành' },
};
const HealthBadge = ({ h }: { h: Health }) => <span className={`lozenge lozenge-${HEALTH[h].tone}`} data-tip={HEALTH[h].tip}>{HEALTH[h].label}</span>;

/** Thanh tiến độ: phần xanh = đã hoàn thành, vạch dọc = khối lượng lẽ ra phải xong theo kế hoạch. */
function PlanBar({ m, big }: { m: Measure; big?: boolean }) {
  return (
    <div className={`plan-bar ${big ? 'big' : ''}`} data-tip={`Thực tế ${m.pct_done}% · Kế hoạch ${m.pct_planned}%`}>
      <div className="plan-done" style={{ width: `${m.pct_done}%` }} />
      {m.pct_planned > 0 && <div className="plan-mark" style={{ left: `${m.pct_planned}%` }} />}
    </div>
  );
}

const range = (a: string | null, b: string | null) => (a || b ? `${fmtDate(a)} – ${fmtDate(b)}` : 'Chưa có ngày');

/** Dashboard dự án: nắm nhanh tiến độ, rủi ro và việc cần chú ý. */
export default function ProjectDashboard() {
  const project = useProjectCtx();
  const { open } = useIssueModal();
  const { data, isLoading } = useQuery<DashData>({
    queryKey: ['project-dashboard', project.key],
    queryFn: () => api.get(`/reports/projects/${project.key}/dashboard`),
  });
  if (isLoading || !data) return <Spinner />;
  const o = data.overall;
  if (!o.total_issues) {
    return <div className="page-pad"><Empty title="Dự án chưa có issue nào">
      <p className="muted">Tạo issue hoặc nhập từ Excel ở Backlog, dashboard sẽ tự tổng hợp tiến độ.</p>
    </Empty></div>;
  }
  const gap = o.pct_done - o.pct_planned;
  const maxLoad = Math.max(1, ...data.byAssignee.map((a) => a.todo + a.inprogress));

  return (
    <div className="page-pad dashboard">
      {/* Chỉ số chính */}
      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label"><Gauge size={15} /> Hoàn thành</div>
          <div className="kpi-num">{o.pct_done}%</div>
          <div className="muted small">{o.done_issues}/{o.total_issues} issue{o.points ? ` · ${o.done_points}/${o.points} điểm` : ''}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><CalendarClock size={15} /> So với kế hoạch</div>
          <div className={`kpi-num ${gap < -10 ? 'bad' : gap < 0 ? 'warn' : 'good'}`}>{gap > 0 ? '+' : ''}{gap}%</div>
          <div className="muted small">Kế hoạch đến hôm nay: {o.pct_planned}%</div>
        </div>
        <div className={`kpi ${o.overdue ? 'kpi-danger' : ''}`}>
          <div className="kpi-label"><AlertTriangle size={15} /> Quá hạn</div>
          <div className="kpi-num">{o.overdue}</div>
          <div className="muted small">issue chưa xong đã qua hạn</div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><Timer size={15} /> Đang thực hiện</div>
          <div className="kpi-num">{o.inprogress_issues}</div>
          <div className="muted small">{data.upcoming.length} issue đến hạn trong 7 ngày</div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><CheckCircle2 size={15} /> Hoàn thành 7 ngày qua</div>
          <div className="kpi-num">{o.done_week}</div>
          <div className="muted small">issue</div>
        </div>
      </div>

      {/* Tiến độ tổng thể */}
      <div className="card">
        <div className="card-head">
          <h3>Tiến độ dự án</h3>
          <HealthBadge h={o.health} />
          <span className="muted small">{range(o.start, o.end)}</span>
        </div>
        <div className="plan-legend small">
          <span><i className="lg-done" /> Thực tế hoàn thành <b>{o.pct_done}%</b></span>
          <span><i className="lg-plan" /> Kế hoạch đến hôm nay <b>{o.pct_planned}%</b></span>
          <span><i className="lg-time" /> Thời gian đã trôi qua <b>{o.pct_time}%</b></span>
        </div>
        <PlanBar m={o} big />
        <div className="time-bar"><div style={{ width: `${o.pct_time}%` }} /></div>
      </div>

      <div className="dash-cols">
        {/* Giai đoạn (Epic) */}
        <div className="card">
          <div className="card-head"><h3>Tiến độ theo giai đoạn (Epic)</h3><Link className="small" to={`/p/${project.key}/roadmap`}>Xem lộ trình</Link></div>
          {data.epics.length === 0 ? <div className="muted small">Chưa có Epic</div> : (
            <div className="phase-list">
              {data.epics.map((e) => (
                <div key={e.id} className="phase-row" onClick={() => open(e.key)}>
                  <div className="phase-head">
                    <TypeIcon type="epic" size={14} />
                    <span className="ellipsis grow">{e.summary}</span>
                    <HealthBadge h={e.health} />
                  </div>
                  <PlanBar m={e} />
                  <div className="phase-meta muted small">
                    <span>{range(e.start_date, e.due_date)}</span>
                    <span>{e.done_issues}/{e.total_issues} issue · {e.pct_done}%</span>
                    {e.overdue > 0 && <span className="overdue">{e.overdue} quá hạn</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dash-side">
          {/* Sprint đang chạy */}
          {project.type === 'scrum' && (
            <div className="card">
              <div className="card-head"><h3>Sprint đang chạy</h3><Link className="small" to={`/p/${project.key}/board`}>Mở bảng</Link></div>
              {data.sprints.length === 0 ? (
                <div className="muted small">Chưa có sprint nào đang chạy{data.next_sprint ? <> · Sprint kế tiếp: <b>{data.next_sprint.name}</b> ({range(data.next_sprint.start_date, data.next_sprint.end_date)})</> : ''}</div>
              ) : data.sprints.map((s) => (
                <div key={s.id} className="sprint-mini">
                  <div className="row gap-xs">
                    <b className="grow">{s.name}</b>
                    <span className={`small ${s.days_left < 0 ? 'overdue' : 'muted'}`}>{s.days_left >= 0 ? `còn ${s.days_left} ngày` : `trễ ${-s.days_left} ngày`}</span>
                  </div>
                  <div className="muted small">{range(s.start_date, s.end_date)}</div>
                  <div className="progress" data-tip={`Hoàn thành ${s.pct_done}% · Thời gian đã qua ${s.pct_time}%`}>
                    <div style={{ width: `${s.pct_done}%` }} />
                  </div>
                  <div className="muted small">{s.done_issues}/{s.total_issues} issue{s.points ? ` · ${s.done_points}/${s.points} điểm` : ''} · thời gian đã qua {s.pct_time}%</div>
                </div>
              ))}
            </div>
          )}

          {/* Mốc sắp tới */}
          <div className="card">
            <div className="card-head"><h3>Mốc sắp tới</h3></div>
            {data.milestones.length === 0 ? <div className="muted small">Không có mốc nào sắp tới</div> : (
              <div className="milestones">
                {data.milestones.map((m) => (
                  <a key={m.key} className="milestone" onClick={() => open(m.key)}>
                    <Flag size={14} className={m.days <= 7 ? 'warn' : 'muted'} />
                    <span className="ellipsis grow">{m.summary}</span>
                    <span className="small nowrap">{fmtDate(m.due_date)}</span>
                    <span className={`small nowrap ${m.days <= 7 ? 'warn' : 'muted'}`}>{m.days === 0 ? 'hôm nay' : `${m.days} ngày`}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="dash-cols">
        {/* Mô-đun (nhãn) */}
        <div className="card">
          <div className="card-head"><h3>Tiến độ theo nhãn / mô-đun</h3></div>
          {data.labels.length === 0 ? <div className="muted small">Chưa gắn nhãn cho issue nào</div> : (
            <table className="table compact module-table">
              <thead><tr><th>Nhãn</th><th>Thời gian</th><th style={{ width: '32%' }}>Tiến độ</th><th className="num">Xong</th></tr></thead>
              <tbody>
                {data.labels.map((l) => (
                  <tr key={l.name}>
                    <td><Link to={`/p/${project.key}/issues?label=${encodeURIComponent(l.name)}`}>{l.name}</Link></td>
                    <td className="muted small nowrap">{range(l.start, l.end)}</td>
                    <td><PlanBar m={l} /></td>
                    <td className="num nowrap">{l.done_issues}/{l.total_issues}{l.overdue ? <span className="overdue"> · {l.overdue} trễ</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Khối lượng theo người */}
        <div className="card">
          <div className="card-head"><h3>Khối lượng đang mở theo người</h3></div>
          {data.byAssignee.length === 0 ? <div className="muted small">Không còn việc đang mở</div> : (
            <div className="load-list">
              {data.byAssignee.map((a) => (
                <div key={a.name} className="load-row">
                  <Avatar name={a.name === 'Chưa giao' ? null : a.name} size={24} />
                  <span className="ellipsis load-name">{a.name}</span>
                  <div className="load-bar" data-tip={`Cần làm ${a.todo} · Đang làm ${a.inprogress}${a.overdue ? ` · Quá hạn ${a.overdue}` : ''}`}>
                    <div className="lb-ip" style={{ width: `${(a.inprogress / maxLoad) * 100}%` }} />
                    <div className="lb-todo" style={{ width: `${(a.todo / maxLoad) * 100}%` }} />
                  </div>
                  <span className="small nowrap">{a.todo + a.inprogress}{a.overdue ? <span className="overdue"> ({a.overdue} trễ)</span> : null}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="dash-cols three">
        <div className="card">
          <div className="card-head"><h3>Quá hạn ({o.overdue})</h3></div>
          {data.overdue.length === 0 ? <div className="muted small">Không có issue quá hạn</div> :
            <div className="issue-lines">{data.overdue.map((i) => <IssueLine key={i.id} issue={i} onOpen={() => open(i.key)} />)}</div>}
        </div>
        <div className="card">
          <div className="card-head"><h3>Đến hạn trong 7 ngày ({data.upcoming.length})</h3></div>
          {data.upcoming.length === 0 ? <div className="muted small">Không có issue nào sắp đến hạn</div> :
            <div className="issue-lines">{data.upcoming.map((i) => <IssueLine key={i.id} issue={i} onOpen={() => open(i.key)} />)}</div>}
        </div>
        <div className="card">
          <div className="card-head"><h3>Hoạt động gần đây</h3></div>
          <div className="activity">
            {data.activity.length === 0 && <div className="muted small">Chưa có hoạt động</div>}
            {data.activity.map((a) => (
              <div key={a.id} className="activity-row">
                <Avatar name={a.user_name} size={24} />
                <div className="grow">
                  <div><b>{a.user_name}</b> {a.field === 'created' ? 'đã tạo' : a.field === 'status' ? <>chuyển <b>{a.new_label}</b></> : <>giao cho <b>{a.new_label || 'không ai'}</b></>}</div>
                  <a className="row gap-xs small" onClick={() => open(a.key)}><TypeIcon type={a.type} size={14} /> <span className="nowrap">{a.key}</span> <span className="ellipsis">{a.summary}</span></a>
                  <div className="muted small">{timeAgo(a.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
