import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../api';
import { useIssueModal, useSprints } from '../hooks';
import type { Issue, IssueType, Priority } from '../types';
import { addDays as addDaysStr, fmtDate, fmtHours, PRIORITY_LABELS, today as todayStr, TYPE_LABELS } from '../util';
import { Empty, Spinner, StatusBadge, TypeIcon } from '../components/ui';
import { IssueLine } from '../components/IssueRow';
import { useProjectCtx } from './ProjectLayout';
import { Download, Target } from 'lucide-react';
import { DateInput } from '../components/fields';

const C = { todo: '#8590a2', inprogress: '#1d7afc', done: '#22a06b', ideal: '#b3b9c4', remaining: '#c9372c', committed: '#b3b9c4', completed: '#22a06b' };
const TYPE_COLORS: Record<string, string> = { epic: '#904ee2', story: '#63ba3c', task: '#4bade8', bug: '#e5493a', subtask: '#8fb8f6' };
const PRIO_COLORS: Record<string, string> = { highest: '#c9372c', high: '#f87462', medium: '#e2b203', low: '#579dff', lowest: '#85b8ff' };
const short = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

interface Summary {
  byStatus: { id: number; name: string; category: 'todo' | 'inprogress' | 'done'; count: number }[];
  byType: { name: IssueType; count: number }[];
  byPriority: { name: Priority; count: number }[];
  byAssignee: { name: string; id: number | null; todo: number; inprogress: number; done: number; open_points: number }[];
  trend: { date: string; created: number; resolved: number }[];
  overdue: Issue[];
}

export default function Reports() {
  const project = useProjectCtx();
  const [tab, setTab] = useState(project.type === 'scrum' ? 'burndown' : 'summary');
  const tabs = [
    ...(project.type === 'scrum' ? [['burndown', 'Khối lượng còn lại'], ['sprint', 'Báo cáo sprint'], ['velocity', 'Năng suất sprint']] : []),
    ['summary', 'Tổng quan dự án'],
    ['worklog', 'Giờ công'],
  ];
  return (
    <div className="page-pad">
      <div className="tabs tabs-sm">
        {tabs.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'summary' && <SummaryReport />}
      {tab === 'burndown' && <Burndown />}
      {tab === 'sprint' && <SprintReport />}
      {tab === 'velocity' && <Velocity />}
      {tab === 'worklog' && <Timesheet />}
    </div>
  );
}

function SummaryReport() {
  const project = useProjectCtx();
  const { open } = useIssueModal();
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery<Summary>({
    queryKey: ['report-summary', project.key, days],
    queryFn: () => api.get(`/reports/projects/${project.key}/summary?days=${days}`),
  });
  if (isLoading || !data) return <Spinner />;
  const total = data.byStatus.reduce((a, s) => a + s.count, 0);
  const cats = (['todo', 'inprogress', 'done'] as const).map((c) => ({
    name: c === 'todo' ? 'Cần làm' : c === 'inprogress' ? 'Đang thực hiện' : 'Hoàn thành', key: c,
    count: data.byStatus.filter((s) => s.category === c).reduce((a, s) => a + s.count, 0),
  }));

  return (
    <div className="report-grid">
      <div className="card">
        <h3>Tiến độ tổng ({total} issue, không tính epic)</h3>
        <div className="stacked-bar">
          {cats.map((c) => c.count > 0 && <div key={c.key} style={{ flex: c.count, background: C[c.key] }} title={`${c.name}: ${c.count}`}>{Math.round((c.count / total) * 100)}%</div>)}
        </div>
        <div className="legend-row">{cats.map((c) => <span key={c.key}><i style={{ background: C[c.key] }} />{c.name}: <b>{c.count}</b></span>)}</div>
        <table className="table compact mt-sm">
          <tbody>{data.byStatus.map((s) => <tr key={s.id}><td>{s.name}</td><td className="num">{s.count}</td></tr>)}</tbody>
        </table>
      </div>

      <div className="card">
        <h3>Theo loại issue</h3>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={data.byType.map((t) => ({ ...t, label: TYPE_LABELS[t.name] }))} dataKey="count" nameKey="label" innerRadius={50} outerRadius={85} label>
              {data.byType.map((t) => <Cell key={t.name} fill={TYPE_COLORS[t.name]} />)}
            </Pie>
            <Tooltip /><Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h3>Issue chưa xong theo độ ưu tiên</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={(['highest', 'high', 'medium', 'low', 'lowest'] as Priority[]).map((p) => ({ name: PRIORITY_LABELS[p], key: p, count: data.byPriority.find((x) => x.name === p)?.count || 0 }))}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" fontSize={12} /><YAxis allowDecimals={false} fontSize={12} /><Tooltip />
            <Bar dataKey="count" name="Số issue">{['highest', 'high', 'medium', 'low', 'lowest'].map((p) => <Cell key={p} fill={PRIO_COLORS[p]} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card span-2">
        <h3>Khối lượng theo người thực hiện</h3>
        <ResponsiveContainer width="100%" height={Math.max(160, data.byAssignee.length * 38 + 40)}>
          <BarChart data={data.byAssignee} layout="vertical" margin={{ left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} fontSize={12} />
            <YAxis type="category" dataKey="name" width={140} fontSize={12} />
            <Tooltip /><Legend />
            <Bar dataKey="todo" stackId="a" name="Cần làm" fill={C.todo} />
            <Bar dataKey="inprogress" stackId="a" name="Đang thực hiện" fill={C.inprogress} />
            <Bar dataKey="done" stackId="a" name="Hoàn thành" fill={C.done} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h3>Issue quá hạn ({data.overdue.length})</h3>
        {data.overdue.length === 0 ? <div className="muted small">Không có issue quá hạn</div> :
          <div className="issue-lines">{data.overdue.map((i) => <IssueLine key={i.id} issue={i} onOpen={() => open(i.key)} />)}</div>}
      </div>

      <div className="card span-3">
        <div className="card-head">
          <h3>Tạo mới và hoàn thành</h3>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={14}>14 ngày</option><option value={30}>30 ngày</option><option value={90}>90 ngày</option>
          </select>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data.trend}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={short} fontSize={12} />
            <YAxis allowDecimals={false} fontSize={12} />
            <Tooltip labelFormatter={(d) => fmtDate(String(d))} /><Legend />
            <Line type="monotone" dataKey="created" name="Tạo mới" stroke="#c9372c" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="resolved" name="Hoàn thành" stroke="#22a06b" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Burndown() {
  const project = useProjectCtx();
  const { data: sprints } = useSprints(project.key, 'active,closed');
  const [sel, setSel] = useState<number | null>(null);
  const sprintId = sel ?? sprints?.[0]?.id;
  const [unit, setUnit] = useState<'points' | 'issues'>('points');
  const { data, isLoading } = useQuery<{ series: { date: string; ideal: number; remaining: number | null; remaining_issues: number | null }[] }>({
    queryKey: ['burndown', project.key, sprintId],
    queryFn: () => api.get(`/reports/projects/${project.key}/burndown?sprint=${sprintId}`),
    enabled: !!sprintId,
  });
  if (!sprints) return <Spinner />;
  if (!sprints.length) return <Empty title="Chưa có sprint nào đã bắt đầu" />;
  const series = data?.series.map((s, i, arr) => ({
    ...s,
    idealIssues: arr[0].remaining_issues != null ? Math.max(0, +((arr[0].remaining_issues) * (1 - i / (arr.length - 1))).toFixed(2)) : null,
  }));
  return (
    <div className="card">
      <div className="card-head">
        <select value={sprintId} onChange={(e) => setSel(Number(e.target.value))}>
          {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}{s.state === 'active' ? ' (đang chạy)' : ''}</option>)}
        </select>
        <select value={unit} onChange={(e) => setUnit(e.target.value as 'points' | 'issues')}>
          <option value="points">Theo điểm ước lượng</option>
          <option value="issues">Theo số issue</option>
        </select>
      </div>
      {isLoading || !series ? <Spinner /> : (
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={short} fontSize={12} />
            <YAxis allowDecimals={false} fontSize={12} />
            <Tooltip labelFormatter={(d) => fmtDate(String(d))} /><Legend />
            <Line type="linear" dataKey={unit === 'points' ? 'ideal' : 'idealIssues'} name="Đường lý tưởng" stroke={C.ideal} strokeDasharray="6 4" dot={false} />
            <Line type="stepAfter" dataKey={unit === 'points' ? 'remaining' : 'remaining_issues'} name="Còn lại" stroke={C.remaining} strokeWidth={2} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
      <p className="muted small">Biểu đồ khối lượng còn lại (burndown) tính từ lịch sử thay đổi trạng thái và sprint của từng issue (không tính sub-task). Issue thêm vào giữa sprint làm đường "Còn lại" đi lên.</p>
    </div>
  );
}

function Velocity() {
  const project = useProjectCtx();
  const { data, isLoading } = useQuery<{ name: string; committed_points: number; completed_points: number; committed_issues: number; completed_issues: number }[]>({
    queryKey: ['velocity', project.key],
    queryFn: () => api.get(`/reports/projects/${project.key}/velocity`),
  });
  if (isLoading || !data) return <Spinner />;
  if (!data.length) return <Empty title="Chưa có sprint nào hoàn thành" />;
  const avg = data.reduce((a, s) => a + (s.completed_points || 0), 0) / data.length;
  return (
    <div className="card">
      <p>Năng suất trung bình: <b>{avg.toFixed(1)}</b> điểm ước lượng / sprint ({data.length} sprint gần nhất)</p>
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend />
          <Bar dataKey="committed_points" name="Cam kết" fill={C.committed} />
          <Bar dataKey="completed_points" name="Hoàn thành" fill={C.completed} />
        </BarChart>
      </ResponsiveContainer>
      <table className="table compact">
        <thead><tr><th>Sprint</th><th className="num">Điểm cam kết</th><th className="num">Điểm hoàn thành</th><th className="num">Issue cam kết</th><th className="num">Issue hoàn thành</th><th className="num">Tỷ lệ</th></tr></thead>
        <tbody>{data.map((s) => (
          <tr key={s.name}><td>{s.name}</td><td className="num">{s.committed_points}</td><td className="num">{s.completed_points}</td>
            <td className="num">{s.committed_issues}</td><td className="num">{s.completed_issues}</td>
            <td className="num">{s.committed_points ? Math.round((s.completed_points / s.committed_points) * 100) : 0}%</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

interface SprintReportItem {
  id: number; key: string; type: IssueType; summary: string; story_points: number | null; priority: Priority;
  status_name: string; status_category: 'todo' | 'inprogress' | 'done'; assignee_name: string | null; added: boolean;
}
interface SprintReportData {
  sprint: { name: string; start_date: string; end_date: string; state: string; goal: string | null; completed_at: string | null };
  completed: SprintReportItem[]; not_completed: SprintReportItem[]; removed: SprintReportItem[];
  totals: { committed_points: number | null; completed_points: number; not_completed_points: number; added_points: number; removed_points: number };
}

/** Báo cáo sprint như Jira: việc đã xong, chưa xong, thêm vào giữa sprint (*), bị rút khỏi sprint. */
function SprintReport() {
  const project = useProjectCtx();
  const { open } = useIssueModal();
  const { data: sprints } = useSprints(project.key, 'active,closed');
  const [sel, setSel] = useState<number | null>(null);
  const sprintId = sel ?? sprints?.[0]?.id;
  const { data, isLoading } = useQuery<SprintReportData>({
    queryKey: ['sprint-report', project.key, sprintId],
    queryFn: () => api.get(`/reports/projects/${project.key}/sprint-report?sprint=${sprintId}`),
    enabled: !!sprintId,
  });
  if (!sprints) return <Spinner />;
  if (!sprints.length) return <Empty title="Chưa có sprint nào đã bắt đầu" />;
  const Section = ({ title, items, tone }: { title: string; items: SprintReportItem[]; tone: string }) => (
    <div className="card">
      <h3>{title} <span className="muted small">({items.length} issue · {items.reduce((a, i) => a + (i.story_points || 0), 0)} điểm)</span></h3>
      {!items.length ? <div className="muted small">Không có</div> : (
        <table className="table compact">
          <thead><tr><th style={{ width: 24 }} /><th>Mã</th><th>Tiêu đề</th><th>Người thực hiện</th><th>Trạng thái</th><th className="num">Điểm</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="clickable" onClick={() => open(i.key)}>
                <td><TypeIcon type={i.type} /></td>
                <td className="nowrap"><span className="issue-key">{i.key}</span>{i.added && <span className={`added-mark ${tone}`} data-tip="Được thêm vào sau khi sprint đã bắt đầu"> *</span>}</td>
                <td>{i.summary}</td>
                <td className="small">{i.assignee_name || 'Chưa giao'}</td>
                <td><StatusBadge name={i.status_name} category={i.status_category} /></td>
                <td className="num">{i.story_points ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
  return (
    <div className="stack">
      <div className="row gap-sm">
        <select value={sprintId} onChange={(e) => setSel(Number(e.target.value))}>
          {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}{s.state === 'active' ? ' (đang chạy)' : ''}</option>)}
        </select>
        {data && <span className="muted small">{fmtDate(data.sprint.start_date)} – {fmtDate(data.sprint.end_date)}{data.sprint.completed_at ? ` · đóng ${fmtDate(data.sprint.completed_at)}` : ' · đang chạy'}</span>}
      </div>
      {isLoading || !data ? <Spinner /> : (
        <>
          {data.sprint.goal && <div className="muted icon-text"><Target size={14} /> Mục tiêu: {data.sprint.goal}</div>}
          <div className="stat-cards">
            <div className="stat-card"><div className="stat-num">{data.totals.committed_points ?? '—'}</div><div>Điểm cam kết lúc bắt đầu</div></div>
            <div className="stat-card"><div className="stat-num">{data.totals.completed_points}</div><div>Điểm đã hoàn thành</div></div>
            <div className="stat-card"><div className="stat-num">{data.totals.not_completed_points}</div><div>Điểm chưa hoàn thành</div></div>
            <div className="stat-card"><div className="stat-num">{data.totals.added_points}</div><div>Điểm thêm giữa sprint</div></div>
            <div className="stat-card"><div className="stat-num">{data.totals.removed_points}</div><div>Điểm bị rút khỏi sprint</div></div>
          </div>
          <Section title="Đã hoàn thành" items={data.completed} tone="ok" />
          <Section title={data.sprint.state === 'closed' ? 'Chưa hoàn thành (đã chuyển khỏi sprint khi đóng)' : 'Chưa hoàn thành'} items={data.not_completed} tone="warn" />
          <Section title="Bị rút khỏi sprint trong lúc chạy" items={data.removed} tone="bad" />
          <p className="muted small">Dấu <b>*</b>: issue được thêm vào sau khi sprint bắt đầu. Không tính sub-task.</p>
        </>
      )}
    </div>
  );
}

interface TimesheetData {
  from: string; to: string;
  rows: { id: number; work_date: string; minutes: number; comment: string | null; user_id: number; user_name: string; key: string; summary: string; type: IssueType }[];
  totals: { original: number; remaining: number; spent: number };
}

/** Giờ công: bảng người × ngày trong khoảng thời gian, tổng theo issue. */
function Timesheet() {
  const project = useProjectCtx();
  const { open } = useIssueModal();
  const [to, setTo] = useState(todayStr());
  const [from, setFrom] = useState(addDaysStr(todayStr(), -13));
  const { data, isLoading } = useQuery<TimesheetData>({
    queryKey: ['timesheet', project.key, from, to],
    queryFn: () => api.get(`/reports/projects/${project.key}/worklogs?from=${from}&to=${to}`),
  });
  const days: string[] = [];
  for (let d = from; d <= to && days.length < 62; d = addDaysStr(d, 1)) days.push(d);
  const users = new Map<number, string>();
  const cell = new Map<string, number>();
  const byIssue = new Map<string, { summary: string; type: IssueType; minutes: number }>();
  for (const r of data?.rows ?? []) {
    users.set(r.user_id, r.user_name);
    cell.set(`${r.user_id}|${r.work_date}`, (cell.get(`${r.user_id}|${r.work_date}`) || 0) + r.minutes);
    const it = byIssue.get(r.key) ?? { summary: r.summary, type: r.type, minutes: 0 };
    it.minutes += r.minutes;
    byIssue.set(r.key, it);
  }
  const userTotal = (u: number) => days.reduce((a, d) => a + (cell.get(`${u}|${d}`) || 0), 0);
  const dayTotal = (d: string) => [...users.keys()].reduce((a, u) => a + (cell.get(`${u}|${d}`) || 0), 0);
  const total = [...users.keys()].reduce((a, u) => a + userTotal(u), 0);
  const weekend = (d: string) => [0, 6].includes(new Date(`${d}T00:00:00`).getDay());
  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Ngày', 'Người', 'Mã issue', 'Tiêu đề', 'Số giờ', 'Nội dung'].map(esc).join(',')];
    for (const r of data?.rows ?? []) lines.push([r.work_date, r.user_name, r.key, r.summary, r.minutes / 60, r.comment].map(esc).join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `gio-cong-${project.key}-${from}-${to}.csv`;
    a.click();
  };
  return (
    <div className="stack">
      <div className="row gap-sm" style={{ flexWrap: 'wrap' }}>
        <label className="row gap-xs">Từ <DateInput value={from} max={to} onChange={(v) => v && setFrom(v)} /></label>
        <label className="row gap-xs">đến <DateInput value={to} min={from} onChange={(v) => v && setTo(v)} /></label>
        <button className="btn btn-sm" onClick={() => { setFrom(addDaysStr(todayStr(), -6)); setTo(todayStr()); }}>7 ngày</button>
        <button className="btn btn-sm" onClick={() => { setFrom(addDaysStr(todayStr(), -29)); setTo(todayStr()); }}>30 ngày</button>
        <div className="spacer" />
        <button className="btn btn-sm" disabled={!data?.rows.length} onClick={exportCsv}><Download size={14} /> Xuất Excel (CSV)</button>
      </div>
      {isLoading || !data ? <Spinner /> : (
        <>
          <div className="stat-cards">
            <div className="stat-card"><div className="stat-num">{fmtHours(total)}</div><div>Giờ ghi trong khoảng đã chọn</div></div>
            <div className="stat-card"><div className="stat-num">{fmtHours(data.totals.spent)}</div><div>Tổng giờ đã ghi của dự án</div></div>
            <div className="stat-card"><div className="stat-num">{fmtHours(data.totals.original)}</div><div>Tổng ước lượng của dự án</div></div>
            <div className="stat-card"><div className="stat-num">{fmtHours(data.totals.remaining)}</div><div>Tổng thời gian còn lại</div></div>
          </div>
          {!users.size ? <Empty title="Chưa có ai ghi giờ trong khoảng thời gian này"><p className="muted">Mở issue → Ghi thời gian.</p></Empty> : (
            <>
              <div className="card">
                <h3>Giờ công theo người và ngày</h3>
                <div className="table-wrap">
                  <table className="table compact timesheet">
                    <thead>
                      <tr><th>Người</th>{days.map((d) => <th key={d} className={`num ${weekend(d) ? 'weekend' : ''}`}>{d.slice(8, 10)}/{d.slice(5, 7)}</th>)}<th className="num">Tổng</th></tr>
                    </thead>
                    <tbody>
                      {[...users.entries()].map(([u, name]) => (
                        <tr key={u}>
                          <td className="nowrap">{name}</td>
                          {days.map((d) => { const m = cell.get(`${u}|${d}`); return <td key={d} className={`num ${weekend(d) ? 'weekend' : ''}`}>{m ? fmtHours(m) : ''}</td>; })}
                          <td className="num"><b>{fmtHours(userTotal(u))}</b></td>
                        </tr>
                      ))}
                      <tr className="group-row">
                        <td>Tổng</td>
                        {days.map((d) => <td key={d} className="num">{dayTotal(d) ? fmtHours(dayTotal(d)) : ''}</td>)}
                        <td className="num">{fmtHours(total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="card">
                <h3>Giờ công theo issue</h3>
                <table className="table compact">
                  <thead><tr><th style={{ width: 24 }} /><th>Mã</th><th>Tiêu đề</th><th className="num">Số giờ</th></tr></thead>
                  <tbody>
                    {[...byIssue.entries()].sort((a, b) => b[1].minutes - a[1].minutes).map(([k, v]) => (
                      <tr key={k} className="clickable" onClick={() => open(k)}>
                        <td><TypeIcon type={v.type} /></td><td className="issue-key">{k}</td><td>{v.summary}</td><td className="num">{fmtHours(v.minutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
