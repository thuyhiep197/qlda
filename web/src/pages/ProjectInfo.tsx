import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Pencil, Phone } from 'lucide-react';
import { hasPerm, useMe, useProjects } from '../hooks';
import { CUSTOMER_STATUSES } from '../customer-filter';
import { fmtDate, lozengeOf, PROJECT_PRIORITIES, PROJECT_STATUSES, STAFF_POSITIONS } from '../util';
import { splitNames } from '../components/ProjectInfoFields';
import { Avatar } from '../components/ui';
import { useProjectCtx } from './ProjectLayout';

const Props = ({ rows }: { rows: [string, ReactNode][] }) => (
  <div className="props">
    {rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><span className="prop-label">{k}</span><span>{v || <span className="muted">—</span>}</span></div>)}
  </div>
);

/** Module Thông tin dự án: thông tin chung, khách hàng của dự án (đầu mối, nhân viên phụ trách), nhân sự, thành viên */
export default function ProjectInfo({ onEdit }: { onEdit?: () => void }) {
  const project = useProjectCtx();
  const { data: me } = useMe();
  const { data: projects } = useProjects();
  const summary = projects?.find((p) => p.key === project.key);
  const status = project.project_status || summary?.status_auto;
  const c = project.customer_info;
  const canEdit = !!onEdit;
  const sprint = project.active_sprints[0];

  return (
    <div>
      <div className="two-col">
        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Thông tin chung</h3>
              {canEdit && <button className="btn btn-sm" onClick={onEdit}><Pencil size={14} /> Sửa</button>}</div>
            <Props rows={[
              ['Tên dự án', <b>{project.name}</b>], ['Mã dự án', project.key], ['Mô hình', project.type === 'scrum' ? 'Scrum' : 'Kanban'],
              ['Trưởng dự án', project.lead?.full_name],
              ['Trạng thái', status && <span className="nowrap"><span className={lozengeOf(PROJECT_STATUSES, status)}>{status}</span> <span className="muted small">{project.project_status ? '📌 ghim tay' : '⚙ tự động'}</span></span>],
              ['Ưu tiên', project.priority && <span className={lozengeOf(PROJECT_PRIORITIES, project.priority)}>{project.priority}</span>],
              ['Sprint đang chạy', sprint && `${sprint.name}${sprint.end_date ? ` (đến ${fmtDate(sprint.end_date)})` : ''}`],
              ['Mô tả', project.description && <span style={{ whiteSpace: 'pre-wrap' }}>{project.description}</span>],
            ]} />
          </div>
          <div className="card">
            <div className="card-head"><h3>Nhân sự</h3></div>
            <Props rows={STAFF_POSITIONS.map((p) => [p.label, splitNames(project[p.field]).join(', ')] as [string, ReactNode])} />
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Khách hàng</h3>
              {c && hasPerm(me, 'customer.view') && <Link className="small" to={`/customers/${c.id}`}>Mở trang khách hàng →</Link>}</div>
            {!c ? <p className="muted small">{project.customer ? `${project.customer} (chưa có trong danh mục Khách hàng)` : 'Dự án chưa gắn với khách hàng.'}
              {canEdit && <> <a onClick={onEdit}>Gắn khách hàng</a>.</>}</p> : (
              <div className="stack-sm">
                <Props rows={[
                  ['Cơ quan/đơn vị', <b>{c.name}</b>],
                  ['Tình trạng', <span className={lozengeOf(CUSTOMER_STATUSES, c.status)}>{c.status}</span>],
                  ['Địa chỉ', [c.ward_name, c.province_name].filter(Boolean).join(', ')],
                  ['Kinh doanh phụ trách', c.kd_names], ['AM hỗ trợ', c.am_names],
                  ['Dự án của khách hàng', c.sales_project
                    ? (hasPerm(me, 'customer.view')
                      ? <Link to={`/customers/${c.id}/p/${c.sales_project.id}`}>{c.sales_project.code} · {c.sales_project.name}</Link>
                      : `${c.sales_project.code} · ${c.sales_project.name}`)
                    : <span className="muted small">Chưa gắn{canEdit ? ' — chọn ở Sửa thông tin' : ''}</span>],
                ]} />
                <div className="prop-label">Đầu mối liên hệ</div>
                {!c.contacts.length ? <span className="muted small">Chưa có đầu mối</span> : c.contacts.map((ct) => (
                  <div key={ct.id}>
                    <b>{ct.full_name}</b>
                    <div className="row gap-sm small" style={{ flexWrap: 'wrap' }}>
                      {ct.phone && <a href={`tel:${ct.phone}`} className="row gap-xs"><Phone size={13} /> {ct.phone}</a>}
                      {ct.email && <a href={`mailto:${ct.email}`} className="row gap-xs"><Mail size={13} /> {ct.email}</a>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <div className="card-head"><h3>Thành viên ({project.members.length})</h3></div>
            <div className="stack-sm">
              {project.members.map((m) => (
                <div key={m.id} className="row gap-sm"><Avatar name={m.full_name} src={m.avatar_url} size={24} /> {m.full_name} <span className="muted small">{m.role_name}</span></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
