import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useIssueModal, useMe, useProjects } from '../hooks';
import type { Issue, IssueType, Side } from '../types';
import { colorOf, FIELD_LABELS, timeAgo } from '../util';
import { Avatar, Empty, SideBadge, Spinner, TypeIcon } from '../components/ui';
import { IssueLine } from '../components/IssueRow';

interface DashboardData {
  stats: { assigned_open: number; in_progress: number; overdue: number; done_week: number; reported_open: number };
  mine: Issue[];
  toTest: Issue[];
  myModules: { id: number; name: string; side: Side | null; project_key: string; total: number; done: number; inprogress: number }[];
  activity: { id: number; field: string; old_label: string; new_label: string; created_at: string; user_name: string; user_avatar_url?: string | null; key: string; summary: string; type: IssueType }[];
}

export default function Dashboard() {
  const { data: me } = useMe();
  const { data: projects } = useProjects();
  const { open } = useIssueModal();
  const { data, isLoading } = useQuery<DashboardData>({ queryKey: ['dashboard'], queryFn: () => api.get('/reports/dashboard') });

  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';

  return (
    <div className="page">
      <h1>{greet}, {me?.full_name}</h1>
      {isLoading || !data ? <Spinner /> : (
        <>
          <div className="stat-cards stat-cards-3">
            <div className="stat-card"><div className="stat-num">{data.stats.assigned_open ?? 0}</div><div>Việc được giao chưa xong</div></div>
            <div className="stat-card"><div className="stat-num">{data.stats.in_progress ?? 0}</div><div>Đang thực hiện</div></div>
            <div className={`stat-card ${data.stats.overdue ? 'stat-danger' : ''}`}><div className="stat-num">{data.stats.overdue ?? 0}</div><div>Quá hạn</div></div>
          </div>

          {(data.toTest.length > 0 || data.myModules.length > 0) && (
            <div className="dash-grid mb">
              <div className="card">
                <div className="card-head">
                  <h3>Chờ tôi kiểm thử ({data.toTest.length})</h3>
                  <Link to="/issues?ba=me&statusCategory=inprogress" className="small">Việc của mô-đun tôi phụ trách</Link>
                </div>
                {data.toTest.length === 0 ? <div className="muted small">Chưa có việc nào chuyển sang Kiểm thử</div> :
                  <div className="issue-lines">{data.toTest.map((i) => <IssueLine key={i.id} issue={i} onOpen={() => open(i.key)} />)}</div>}
              </div>
              <div className="card">
                <div className="card-head"><h3>Mô-đun tôi phụ trách</h3></div>
                <div className="stack-sm">
                  {data.myModules.map((m) => (
                    <Link key={m.id} to={`/p/${m.project_key}/issues?component=${m.id}`} className="module-mini">
                      <div className="row gap-xs"><b className="grow ellipsis">{m.name}</b><SideBadge side={m.side} /></div>
                      <div className="progress"><div style={{ width: `${m.total ? (m.done / m.total) * 100 : 0}%` }} /><div className="progress-ip" style={{ width: `${m.total ? (m.inprogress / m.total) * 100 : 0}%` }} /></div>
                      <div className="muted small">{m.done}/{m.total} xong · {m.inprogress} đang làm</div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="dash-grid">
            <div className="card">
              <div className="card-head">
                <h3>Việc của tôi</h3>
                <Link to="/issues?assignee=me&statusCategory=todo,inprogress" className="small">Xem tất cả</Link>
              </div>
              {data.mine.length === 0 ? <Empty title="Không có việc nào đang chờ bạn" /> :
                <div className="issue-lines">{data.mine.map((i) => <IssueLine key={i.id} issue={i} onOpen={() => open(i.key)} />)}</div>}
            </div>

            <div className="card">
              <div className="card-head"><h3>Hoạt động gần đây</h3></div>
              <div className="activity">
                {data.activity.length === 0 && <div className="muted small">Chưa có hoạt động</div>}
                {data.activity.map((a) => (
                  <div key={a.id} className="activity-row">
                    <Avatar name={a.user_name} src={a.user_avatar_url} size={26} />
                    <div className="grow">
                      <div>
                        <b>{a.user_name}</b>{' '}
                        {a.field === 'created' ? 'đã tạo' : a.field === 'status' ? <>chuyển <b>{a.new_label}</b></> :
                          a.field === 'assignee' ? <>giao cho <b>{a.new_label || 'không ai'}</b></> :
                            <>{FIELD_LABELS[a.field]} → <b>{a.new_label || 'Backlog'}</b></>}
                      </div>
                      <a className="row gap-xs small" onClick={() => open(a.key)}>
                        <TypeIcon type={a.type} size={14} /> {a.key} <span className="ellipsis">{a.summary}</span>
                      </a>
                      <div className="muted small">{timeAgo(a.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <h3 className="mt">Dự án của tôi</h3>
          <div className="project-cards">
            {projects?.map((p) => (
              <Link key={p.id} to={`/p/${p.key}`} className="project-card">
                <div className="row gap-sm">
                  <span className="proj-dot lg" style={{ background: colorOf(p.key) }}>{p.key.slice(0, 2)}</span>
                  <div className="grow">
                    <b>{p.name}</b>
                    <div className="muted small">{p.key} · {p.type === 'scrum' ? 'Scrum' : 'Kanban'}</div>
                  </div>
                </div>
                <div className="muted small mt-sm">{p.open_count} issue đang mở · {p.member_count} thành viên</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
