import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { CUSTOMER_STATUS_CLASS, NO_PERSON } from '../customer-filter';
import { useCustomerStatuses } from '../hooks';
import { lozengeOf, PROJECT_STATUSES } from '../util';

interface PersonStats { people: { id: number; name: string; n: number }[]; none: number }
interface CustomerSummary { total: number; by_status: { status: string; n: number }[]; by_kd: PersonStats; by_am: PersonStats }
interface ProjectOverview { total: number; by_status: { status: string | null; n: number }[]; by_ba: PersonStats; by_dev: PersonStats }

const NONE_LABEL = 'Chưa phân công';
const UNKNOWN_STATUS = 'Chưa xác định';

/** Thống kê theo người phụ trách, dạng thanh ngang: người nhiều nhất trước, Chưa phân công ở cuối; bấm một dòng mở danh sách đã lọc */
function PersonBars({ title, stats, to }: { title: string; stats: PersonStats; to: (person: string) => string }) {
  const rows = [...stats.people].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'vi'));
  const max = Math.max(1, stats.none, ...rows.map((r) => r.n));
  const bar = (key: string | number, label: string, n: number, person: string, none = false) => (
    <Link key={key} to={to(person)} className={`person-bar ${none ? 'person-bar-none' : ''}`} title={label}>
      <span className="ellipsis">{label}</span>
      <span className="person-bar-track"><i style={{ width: `${(n / max) * 100}%` }} /></span>
      <b>{n}</b>
    </Link>
  );
  return (
    <div className="person-bars">
      <h4>{title}</h4>
      {!rows.length && !stats.none && <div className="muted small">Chưa có dữ liệu</div>}
      {rows.map((r) => bar(r.id, r.name, r.n, r.name))}
      {stats.none > 0 && bar('none', NONE_LABEL, stats.none, NO_PERSON, true)}
    </div>
  );
}

const q = (params: Record<string, string>) => new URLSearchParams({ g: 'all', ...params }).toString();

/** Thống kê khách hàng: tổng số, theo tình trạng, theo Sale, theo AM (cần Thông tin khách hàng – Xem) */
export function CustomerStats() {
  const { data } = useQuery<CustomerSummary>({ queryKey: ['customer-summary'], queryFn: () => api.get('/customers/summary') });
  const { data: statuses } = useCustomerStatuses();
  if (!data) return null;
  // Tình trạng theo thứ tự danh mục: đang sử dụng, hoặc đã ngừng nhưng còn khách hàng
  const shown = (statuses ?? []).filter((s) => s.is_active || data.by_status.some((x) => x.status === s.name && x.n > 0));
  const count = (s: string) => data.by_status.find((x) => x.status === s)?.n ?? 0;
  return (
    <div className="card mb" data-stats="customer">
      <div className="card-head"><h3>Khách hàng</h3><Link to="/customers" className="small">Quản lý khách hàng</Link></div>
      <div className="status-funnel">
        <Link to="/customers?g=all" className="funnel-step funnel-total"><span>Tổng số</span><b>{data.total}</b></Link>
        {shown.map(({ name }) => (
          <Link key={name} to={`/customers?${q({ status: name })}`} className="funnel-step">
            <span className={CUSTOMER_STATUS_CLASS}>{name}</span>
            <b>{count(name)}</b>
          </Link>
        ))}
      </div>
      <div className="person-bars-grid">
        <PersonBars title="Theo Sale" stats={data.by_kd} to={(p) => `/customers?${q({ kd: p })}`} />
        <PersonBars title="Theo AM" stats={data.by_am} to={(p) => `/customers?${q({ am: p })}`} />
      </div>
    </div>
  );
}

/** Thống kê dự án (phân hệ Dự án): tổng số, theo trạng thái, theo BA/PM, theo Dev (cần Dự án – Xem) */
export function ProjectStats() {
  const { data } = useQuery<ProjectOverview>({ queryKey: ['project-overview'], queryFn: () => api.get('/reports/project-overview') });
  if (!data) return null;
  const count = (s: string | null) => data.by_status.find((x) => x.status === s)?.n ?? 0;
  const unknown = count(null);
  return (
    <div className="card mb" data-stats="project">
      <div className="card-head"><h3>Dự án</h3><Link to="/projects" className="small">Quản lý dự án</Link></div>
      <div className="status-funnel">
        <Link to="/projects?g=all" className="funnel-step funnel-total"><span>Tổng số</span><b>{data.total}</b></Link>
        {PROJECT_STATUSES.map(([name]) => (
          <Link key={name} to={`/projects?${q({ status: name })}`} className="funnel-step">
            <span className={lozengeOf(PROJECT_STATUSES, name)}>{name}</span>
            <b>{count(name)}</b>
          </Link>
        ))}
        {unknown > 0 && (
          <Link to={`/projects?${q({ status: NO_PERSON })}`} className="funnel-step">
            <span className="lozenge lozenge-default">{UNKNOWN_STATUS}</span>
            <b>{unknown}</b>
          </Link>
        )}
      </div>
      <div className="person-bars-grid">
        <PersonBars title="Theo BA" stats={data.by_ba} to={(p) => `/projects?${q({ ba: p })}`} />
        <PersonBars title="Theo Dev" stats={data.by_dev} to={(p) => `/projects?${q({ dev: p })}`} />
      </div>
    </div>
  );
}
