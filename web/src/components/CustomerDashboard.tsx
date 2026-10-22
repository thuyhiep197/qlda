import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { CustomerTask, StepStatus } from '../types';
import { CUSTOMER_STATUS_CLASS } from '../customer-filter';
import { hasPerm, useCustomerStatuses, useMe } from '../hooks';
import { fmtDate } from '../util';

interface Summary {
  total: number;
  by_status: { status: string; n: number }[];
  my_tasks: CustomerTask[];
  my_steps: { id: number; customer_id: number; sales_project_id: number; sales_project_name: string | null; code: string | null; title: string; status: StepStatus; due_date: string | null; customer_name: string }[];
  overdue: { tasks: number; steps: number };
  today: string;
}

/** Phần Khách hàng của Dashboard chung: khách hàng theo tình trạng, việc kinh doanh và bước hành trình được giao cho tôi */
export default function CustomerDashboard() {
  const { data } = useQuery<Summary>({ queryKey: ['customer-summary'], queryFn: () => api.get('/customers/summary') });
  const { data: statuses } = useCustomerStatuses();
  const { data: me } = useMe();
  if (!data) return null;
  // Khách hàng theo tình trạng: Thông tin khách hàng – Xem; việc kinh doanh: Công việc – Xem; bước hành trình: Hành trình – Xem (khớp server)
  const canInfo = hasPerm(me, 'customer.view'), canTasks = hasPerm(me, 'ctask.view'), canSteps = hasPerm(me, 'journey.view');
  const late = [canTasks && `${data.overdue.tasks} việc kinh doanh`, canSteps && `${data.overdue.steps} bước hành trình`].filter(Boolean).join(' · ');
  // Tình trạng theo thứ tự danh mục: đang sử dụng, hoặc đã ngừng nhưng còn khách hàng
  const shown = (statuses ?? []).filter((s) => s.is_active || data.by_status.some((x) => x.status === s.name && x.n > 0));
  const count = (s: string) => data.by_status.find((x) => x.status === s)?.n ?? 0;
  const due = (d: string | null) => <span className={d && d < data.today ? 'overdue small nowrap' : 'muted small nowrap'}>{d ? fmtDate(d) : ''}</span>;
  return (
    <div className="stack mb">
      {canInfo && <div className="card">
        <div className="card-head"><h3>Khách hàng ({data.total})</h3><Link to="/customers" className="small">Quản lý khách hàng</Link></div>
        <div className="status-funnel">
          {shown.map(({ name: s }) => (
            <Link key={s} to="/customers" className="funnel-step">
              <span className={CUSTOMER_STATUS_CLASS}>{s}</span>
              <b>{count(s)}</b>
            </Link>
          ))}
        </div>
        {(data.overdue.tasks > 0 || data.overdue.steps > 0) && (
          <p className="overdue small" style={{ margin: '8px 0 0' }}>Đang trễ hạn: {late}</p>
        )}
      </div>}
      {!canInfo && (data.overdue.tasks > 0 || data.overdue.steps > 0) && <p className="overdue small">Đang trễ hạn: {late}</p>}
      {(canTasks || canSteps) && <div className="dash-grid">
        {canTasks && <div className="card">
          <div className="card-head"><h3>Việc kinh doanh của tôi ({data.my_tasks.length})</h3></div>
          {!data.my_tasks.length ? <div className="muted small">Không có việc kinh doanh nào đang chờ bạn</div> : (
            <div className="stack-sm">{data.my_tasks.map((t) => (
              <Link key={t.id} to={t.sales_project_id ? `/customers/${t.customer_id}/p/${t.sales_project_id}` : `/customers/${t.customer_id}`} className="dash-line">
                <span className="grow ellipsis"><b>{t.title}</b> <span className="muted small">· {t.customer_name}</span></span>{due(t.due_date)}
              </Link>
            ))}</div>
          )}
        </div>}
        {canSteps && <div className="card">
          <div className="card-head"><h3>Bước hành trình tôi phụ trách ({data.my_steps.length})</h3></div>
          {!data.my_steps.length ? <div className="muted small">Không có bước nào đang chờ bạn</div> : (
            <div className="stack-sm">{data.my_steps.map((s) => (
              <Link key={s.id} to={`/customers/${s.customer_id}/p/${s.sales_project_id}?step=${s.id}`} className="dash-line">
                <span className="grow ellipsis"><b>{s.code ? `${s.code} ` : ''}{s.title}</b> <span className="muted small">· {s.customer_name}</span></span>{due(s.due_date)}
              </Link>
            ))}</div>
          )}
        </div>}
      </div>}
    </div>
  );
}
