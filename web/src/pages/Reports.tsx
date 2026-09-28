import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../api';
import { useIssueModal, useSprints } from '../hooks';
import type { Issue, IssueType, Priority } from '../types';
import { fmtDate, PRIORITY_LABELS, TYPE_LABELS } from '../util';
import { Empty, Spinner } from '../components/ui';
import { IssueLine } from '../components/IssueRow';
import { useProjectCtx } from './ProjectLayout';

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
    ...(project.type === 'scrum' ? [['burndown', 'Burndown sprint'], ['velocity', 'Velocity']] : []),
    ['summary', 'Tổng quan dự án'],
  ];
  return (
    <div className="page-pad">
      <div className="tabs tabs-sm">
        {tabs.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'summary' && <SummaryReport />}
      {tab === 'burndown' && <Burndown />}
      {tab === 'velocity' && <Velocity />}
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
        {data.overdue.length === 0 ? <div className="muted small">Không có issue quá hạn 👍</div> :
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
          <option value="points">Theo story point</option>
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
      <p className="muted small">Burndown tính từ lịch sử thay đổi trạng thái và sprint của từng issue (không tính sub-task). Issue thêm vào giữa sprint làm đường "Còn lại" đi lên.</p>
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
      <p>Velocity trung bình: <b>{avg.toFixed(1)}</b> story point / sprint ({data.length} sprint gần nhất)</p>
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend />
          <Bar dataKey="committed_points" name="Cam kết" fill={C.committed} />
          <Bar dataKey="completed_points" name="Hoàn thành" fill={C.completed} />
        </BarChart>
      </ResponsiveContainer>
      <table className="table compact">
        <thead><tr><th>Sprint</th><th className="num">SP cam kết</th><th className="num">SP hoàn thành</th><th className="num">Issue cam kết</th><th className="num">Issue hoàn thành</th><th className="num">Tỷ lệ</th></tr></thead>
        <tbody>{data.map((s) => (
          <tr key={s.name}><td>{s.name}</td><td className="num">{s.committed_points}</td><td className="num">{s.completed_points}</td>
            <td className="num">{s.committed_issues}</td><td className="num">{s.completed_issues}</td>
            <td className="num">{s.committed_points ? Math.round((s.completed_points / s.committed_points) * 100) : 0}%</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}
