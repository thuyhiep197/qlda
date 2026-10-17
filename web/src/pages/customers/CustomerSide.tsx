import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Download, FileText, Mail, Paperclip, Pencil, Phone, Trash2 } from 'lucide-react';
import { api, refreshAll } from '../../api';
import { hasPerm, useMe, useUsersBasic } from '../../hooks';
import type { CustomerDetail, CustomerFile, CustomerTask } from '../../types';
import { CUSTOMER_STATUSES, overdueDays } from '../../customer-filter';
import { colorOf, fmtDate, fmtDateTime, fmtSize, lozengeOf, PROJECT_STATUSES, today } from '../../util';
import { CustomerModal } from '../Customers';
import { toast, toastError } from '../../components/ui';
import { refreshCustomer } from './JourneyPane';

/** Khối thu gọn được trong cột phải */
export function Block({ title, extra, children, open: initial = true }: { title: ReactNode; extra?: ReactNode; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="cw-block">
      <div className="cw-block-head">
        <button className="cw-block-toggle" onClick={() => setOpen(!open)}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {title}</button>
        <div className="spacer" />{extra}
      </div>
      {open && <div className="cw-block-body">{children}</div>}
    </section>
  );
}

export const Props = ({ rows }: { rows: [string, ReactNode][] }) => (
  <div className="cw-props">
    {rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><span className="prop-label">{k}</span><span>{v || <span className="muted">—</span>}</span></div>)}
  </div>
);

/** Danh sách tài liệu; xóa: người tải lên, hoặc người có quyền xóa khách hàng */
export function FileList({ customerId, files, showStep }: { customerId: number; files: (CustomerFile & { step_title?: string | null })[]; showStep?: boolean }) {
  const { data: me } = useMe();
  const canDel = (f: CustomerFile) => hasPerm(me, 'customer.delete') || (hasPerm(me, 'customer.edit') && f.uploader_id === me?.id);
  const remove = async (f: CustomerFile) => {
    if (!confirm(`Xóa tài liệu ${f.filename}?`)) return;
    try { await api.del(`/customers/${customerId}/files/${f.id}`); await refreshCustomer(customerId); } catch (e) { toastError(e); }
  };
  if (!files.length) return <p className="muted small">Chưa có tài liệu</p>;
  return (
    <div className="file-list">{files.map((f) => (
      <div key={f.id} className="file-row">
        <FileText size={15} className="muted" />
        <div className="grow" style={{ minWidth: 0 }}>
          <a className="ellipsis" style={{ display: 'block' }} href={`/api/customers/${customerId}/files/${f.id}`}>{f.filename}</a>
          <div className="muted small">{showStep && f.step_title && <span className="unit-chip">{f.step_title}</span>} {fmtSize(f.size)} · {f.uploader_name ?? '—'} · {fmtDateTime(f.created_at)}</div>
        </div>
        <a className="icon-btn" aria-label={`Tải ${f.filename}`} data-tip="Tải về" href={`/api/customers/${customerId}/files/${f.id}`}><Download size={14} /></a>
        {canDel(f) && <button className="icon-btn" aria-label={`Xóa ${f.filename}`} data-tip="Xóa" onClick={() => remove(f)}><Trash2 size={14} /></button>}
      </div>
    ))}</div>
  );
}

export function UploadButton({ customerId, stepId }: { customerId: number; stepId?: number }) {
  const [busy, setBusy] = useState(false);
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      Array.from(list).forEach((f) => fd.append('files', f));
      await api.post(`/customers/${customerId}/files${stepId ? `?step=${stepId}` : ''}`, fd);
      toast('Đã tải lên');
      await refreshCustomer(customerId);
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <label className="btn btn-subtle btn-sm"><Paperclip size={13} /> {busy ? 'Đang tải…' : 'Tải lên'}
      <input type="file" multiple hidden disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} /></label>
  );
}

/** Cột phải khi chưa chọn bước: Thông tin khách hàng + Công việc + Tài liệu */
export default function CustomerSide({ c }: { c: CustomerDetail }) {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const canEdit = hasPerm(me, 'customer.edit'), canDelete = hasPerm(me, 'customer.delete');
  const remove = async () => {
    if (!confirm(`Xóa khách hàng ${c.name}? Đầu mối, hành trình, công việc, tài liệu và trao đổi sẽ bị xóa theo. Các dự án được gỡ khỏi khách hàng này (dữ liệu dự án vẫn giữ nguyên).`)) return;
    try { await api.del(`/customers/${c.id}`); toast('Đã xóa khách hàng'); await refreshAll(); navigate('/customers'); } catch (e) { toastError(e); }
  };
  return (
    <>
      <Block title="Thông tin khách hàng" extra={<>
        {canEdit && <button className="icon-btn" aria-label="Sửa thông tin" data-tip="Sửa thông tin" onClick={() => setEditing(true)}><Pencil size={14} /></button>}
        {canDelete && <button className="icon-btn" aria-label="Xóa khách hàng" data-tip="Xóa khách hàng" onClick={remove}><Trash2 size={14} /></button>}
      </>}>
        <Props rows={[
          ['Tình trạng', <span className={lozengeOf(CUSTOMER_STATUSES, c.status)}>{c.status}</span>],
          ['Tỉnh thành', c.province_name], ['Phường/Xã', c.ward_name],
          ['Loại sản phẩm', c.product_type_name], ['Sản phẩm', c.product_name],
          ['Mô tả sản phẩm', c.product_description && <span style={{ whiteSpace: 'pre-wrap' }}>{c.product_description}</span>],
          ['Nguồn', c.source], ['Phụ trách', c.owners.map((o) => o.full_name).join(', ')],
        ]} />
        <div className="prop-label mt">Đầu mối liên hệ</div>
        {!c.contacts.length ? <p className="muted small">Chưa có đầu mối</p> : c.contacts.map((ct) => (
          <div key={ct.id} className="cw-contact">
            <b>{ct.full_name}</b>
            <div className="row gap-sm small" style={{ flexWrap: 'wrap' }}>
              {ct.phone && <a href={`tel:${ct.phone}`} className="row gap-xs"><Phone size={12} /> {ct.phone}</a>}
              {ct.email && <a href={`mailto:${ct.email}`} className="row gap-xs"><Mail size={12} /> {ct.email}</a>}
            </div>
          </div>
        ))}
        <div className="prop-label mt">Dự án ({c.projects.filter((p) => !p.is_archived).length})</div>
        {!c.projects.some((p) => !p.is_archived) ? <p className="muted small">Chưa có dự án nào gắn với khách hàng này</p>
          : c.projects.filter((p) => !p.is_archived).map((p) => {
            const st = p.project_status || p.status_auto;
            const body = <>
              <span className="proj-dot sm" style={{ background: colorOf(p.key) }}>{p.key.slice(0, 2)}</span>
              <span className="grow ellipsis">{p.name}</span>
              {st && <span className={lozengeOf(PROJECT_STATUSES, st)}>{st}</span>}
            </>;
            // Mở dự án trong phân hệ Dự án (mặc định vào Kế hoạch chi tiết); chưa là thành viên thì chỉ xem tên
            return p.accessible
              ? <Link key={p.id} to={`/p/${p.key}?g=all`} className="cw-proj-link" data-tip="Mở dự án trong phân hệ Dự án">{body}</Link>
              : <div key={p.id} className="cw-proj-link disabled" data-tip="Bạn chưa là thành viên dự án này">{body}</div>;
          })}
      </Block>
      <Tasks c={c} canEdit={canEdit} canDeleteAll={canDelete} />
      <Block title={`Tài liệu (${c.files.length})`} extra={canEdit && <UploadButton customerId={c.id} />}>
        <FileList customerId={c.id} files={c.files} showStep />
      </Block>
      {editing && <CustomerModal customer={c} contacts={c.contacts} ownerIds={c.owner_ids} onClose={() => setEditing(false)} />}
    </>
  );
}

const TASK_STATUS = { todo: 'Chưa bắt đầu', doing: 'Đang thực hiện', done: 'Hoàn thành' } as const;

/** Công việc: Kinh doanh (mặc định) và Dự án (tiến độ; bấm để mở Kế hoạch chi tiết của dự án) */
function Tasks({ c, canEdit, canDeleteAll }: { c: CustomerDetail; canEdit: boolean; canDeleteAll: boolean }) {
  const { data: me } = useMe();
  const { data: users } = useUsersBasic();
  const [sub, setSub] = useState<'sales' | 'projects'>('sales');
  const [showDone, setShowDone] = useState(false);
  const [d, setD] = useState({ title: '', assignee_id: '', due_date: '' });
  const now = today();
  const open = c.tasks.filter((t) => t.status !== 'done');
  const list = showDone ? c.tasks : open;
  const projects = c.projects.filter((p) => !p.is_archived);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/customers/${c.id}/tasks`, { ...d, assignee_id: d.assignee_id || null, due_date: d.due_date || null });
      setD({ title: '', assignee_id: d.assignee_id, due_date: '' });
      await refreshCustomer(c.id);
    } catch (err) { toastError(err); }
  };
  const update = async (t: CustomerTask, body: object) => {
    try { await api.patch(`/customers/${c.id}/tasks/${t.id}`, body); await refreshCustomer(c.id); } catch (e) { toastError(e); }
  };
  const remove = async (t: CustomerTask) => {
    if (!confirm(`Xóa công việc "${t.title}"?`)) return;
    try { await api.del(`/customers/${c.id}/tasks/${t.id}`); await refreshCustomer(c.id); } catch (e) { toastError(e); }
  };

  return (
    <Block title="Công việc">
      <div className="seg seg-sm mb" role="tablist">
        <button role="tab" aria-selected={sub === 'sales'} className={sub === 'sales' ? 'on' : ''} onClick={() => setSub('sales')}>Kinh doanh ({open.length})</button>
        <button role="tab" aria-selected={sub === 'projects'} className={sub === 'projects' ? 'on' : ''} onClick={() => setSub('projects')}>Dự án ({projects.length})</button>
      </div>
      {sub === 'sales' ? <>
        {canEdit && (
          <form className="stack-sm mb" onSubmit={add}>
            <input required placeholder="+ Thêm việc, VD: Gửi báo giá…" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} aria-label="Tên công việc" />
            {d.title && <div className="row gap-sm">
              <select className="grow" value={d.assignee_id} onChange={(e) => setD({ ...d, assignee_id: e.target.value })} aria-label="Người thực hiện">
                <option value="">Người thực hiện…</option>
                {users?.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
              <input type="date" value={d.due_date} onChange={(e) => setD({ ...d, due_date: e.target.value })} aria-label="Hạn" />
              <button className="btn btn-primary btn-sm">Thêm</button>
            </div>}
          </form>
        )}
        {!list.length ? <p className="muted small">{c.tasks.length ? 'Không còn việc chưa xong' : 'Chưa có công việc kinh doanh'}</p> : list.map((t) => {
          const late = overdueDays(t.due_date, t.status, now);
          return (
            <div key={t.id} className={`cw-task ${t.status === 'done' ? 'j-done' : ''} ${late ? 'j-late' : ''}`}>
              <input type="checkbox" checked={t.status === 'done'} disabled={!canEdit} aria-label="Hoàn thành" onChange={(e) => update(t, { status: e.target.checked ? 'done' : 'todo' })} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="j-title">{t.title}</div>
                <div className="small muted">{t.assignee_name ?? 'Chưa giao'}{t.due_date && <> · <span className={late ? 'overdue strong' : ''}>{fmtDate(t.due_date)}{late ? ` · Quá hạn ${late} ngày` : ''}</span></>}
                  {t.status === 'doing' && <> · {TASK_STATUS.doing}</>}</div>
              </div>
              {canEdit && t.status !== 'done' && <select className="cw-mini-select" value={t.status} onChange={(e) => update(t, { status: e.target.value })} aria-label="Trạng thái">
                {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
              {(canDeleteAll || (canEdit && t.created_by === me?.id)) && <button className="icon-btn" aria-label={`Xóa ${t.title}`} onClick={() => remove(t)}><Trash2 size={13} /></button>}
            </div>
          );
        })}
        {c.tasks.length > open.length && <a className="small" onClick={() => setShowDone(!showDone)}>{showDone ? 'Ẩn việc đã xong' : `Xem cả ${c.tasks.length - open.length} việc đã xong`}</a>}
      </> : !projects.length ? <p className="muted small">Chưa có dự án. Gắn dự án với khách hàng ở Cài đặt dự án → Thông tin chung.</p> : projects.map((p) => {
        const pct = p.total_issues ? Math.round((p.done_issues / p.total_issues) * 100) : 0;
        const st = p.project_status || p.status_auto;
        const body = <>
          <div className="row gap-sm"><span className="proj-dot" style={{ background: colorOf(p.key) }}>{p.key.slice(0, 2)}</span><b className="grow ellipsis">{p.name}</b>
            {st && <span className={lozengeOf(PROJECT_STATUSES, st)}>{st}</span>}</div>
          <div className="cust-bar"><div style={{ width: `${pct}%` }} /></div>
          <div className="muted small">{p.done_issues}/{p.total_issues} việc · {pct}%{p.overdue_issues ? <span className="overdue"> · {p.overdue_issues} quá hạn</span> : null}
            {p.accessible ? ' · Mở Kế hoạch chi tiết →' : ' · Bạn chưa là thành viên dự án'}</div>
        </>;
        return p.accessible ? <Link key={p.id} to={`/p/${p.key}/plan`} className="cw-project">{body}</Link> : <div key={p.id} className="cw-project">{body}</div>;
      })}
    </Block>
  );
}
