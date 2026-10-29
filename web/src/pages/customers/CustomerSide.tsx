import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Download, FileText, Mail, Paperclip, Pencil, Phone, Trash2 } from 'lucide-react';
import { api, refreshAll } from '../../api';
import { useMe, useUsersBasic } from '../../hooks';
import { useCan } from './manage';
import type { CustomerDetail, CustomerFile, CustomerTask } from '../../types';
import { CUSTOMER_STATUS_CLASS, overdueDays } from '../../customer-filter';
import { colorOf, fmtDate, fmtDateTime, fmtSize, lozengeOf, PROJECT_STATUSES, today } from '../../util';
import { CustomerModal } from '../Customers';
import { toast, toastError } from '../../components/ui';
import { refreshCustomer } from './JourneyPane';
import { Talk } from './StepPanel';
import { SearchSelect } from '../../components/SearchSelect';

/** Khối thu gọn được trong cột phải — mặc định thu gọn; bấm nút ở đầu khối (VD + đặt lịch) thì tự mở ra */
export function Block({ title, extra, children, open: initial = false }: { title: ReactNode; extra?: ReactNode; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="cw-block">
      <div className="cw-block-head">
        <button className="cw-block-toggle" onClick={() => setOpen(!open)}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {title}</button>
        <div className="spacer" />{extra && <div style={{ display: 'contents' }} onClick={() => setOpen(true)}>{extra}</div>}
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

/** Danh sách tài liệu; xóa: người tải lên, hoặc người có quyền xóa khách hàng. showWhere: hiện tài liệu thuộc dự án / bước nào */
export function FileList({ customerId, files, showWhere }: { customerId: number; files: CustomerFile[]; showWhere?: boolean }) {
  const { data: me } = useMe();
  const can = useCan();
  const canDel = (f: CustomerFile) => can('cfile.delete') || (can('cfile.create') && f.uploader_id === me?.id);
  const canGet = can('cfile.export');
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
          {canGet ? <a className="ellipsis" style={{ display: 'block' }} href={`/api/customers/${customerId}/files/${f.id}`}>{f.filename}</a> : <span className="ellipsis" style={{ display: 'block' }}>{f.filename}</span>}
          <div className="muted small">{showWhere && f.sales_project_name && <span className="unit-chip">{f.sales_project_name}</span>}
            {showWhere && f.step_title && <span className="unit-chip">{f.step_title}</span>} {fmtSize(f.size)} · {f.uploader_name ?? '—'} · {fmtDateTime(f.created_at)}</div>
        </div>
        {canGet && <a className="icon-btn" aria-label={`Tải ${f.filename}`} data-tip="Tải về" href={`/api/customers/${customerId}/files/${f.id}`}><Download size={14} /></a>}
        {canDel(f) && <button className="icon-btn" aria-label={`Xóa ${f.filename}`} data-tip="Xóa" onClick={() => remove(f)}><Trash2 size={14} /></button>}
      </div>
    ))}</div>
  );
}

/** Tải tài liệu lên: của khách hàng (chung), của một dự án (projectId) hoặc kết quả của một bước (stepId) */
export function UploadButton({ customerId, stepId, projectId }: { customerId: number; stepId?: number; projectId?: number }) {
  const [busy, setBusy] = useState(false);
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      Array.from(list).forEach((f) => fd.append('files', f));
      await api.post(`/customers/${customerId}/files${stepId ? `?step=${stepId}` : projectId ? `?project=${projectId}` : ''}`, fd);
      toast('Đã tải lên');
      await refreshCustomer(customerId);
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <label className="btn btn-subtle btn-sm"><Paperclip size={13} /> {busy ? 'Đang tải…' : 'Tải lên'}
      <input type="file" multiple hidden disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} /></label>
  );
}

/** Cột phải của màn khách hàng: Thông tin khách hàng, dự án sản xuất đã gắn, Công việc, Tài liệu, Trao đổi chung */
export default function CustomerSide({ c }: { c: CustomerDetail }) {
  const can = useCan();
  const { data: users } = useUsersBasic();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const canEdit = can('customer.edit'), canArchive = can('customer.delete');
  // Khách hàng chỉ lưu trữ (không xóa): ẩn khỏi danh sách, mở lại được
  const archive = async (archived: boolean) => {
    if (archived && !confirm(`Lưu trữ khách hàng ${c.name}? Khách hàng (cùng các dự án) ẩn khỏi danh sách; xem lại bằng ô "Xem đã lưu trữ" và mở lại được.`)) return;
    try { await api.post(`/customers/${c.id}/archive`, { archived }); toast(archived ? 'Đã lưu trữ khách hàng' : 'Đã mở lại khách hàng'); await refreshAll(); if (archived) navigate('/customers'); } catch (e) { toastError(e); }
  };
  return (
    <>
      <Block title="Thông tin khách hàng" extra={<>
        {canEdit && <button className="icon-btn" aria-label="Sửa thông tin" data-tip="Sửa thông tin" onClick={() => setEditing(true)}><Pencil size={14} /></button>}
        {canArchive && (c.is_archived
          ? <button className="icon-btn" aria-label="Mở lại khách hàng" data-tip="Mở lại khách hàng" onClick={() => archive(false)}><ArchiveRestore size={14} /></button>
          : <button className="icon-btn" aria-label="Lưu trữ khách hàng" data-tip="Lưu trữ khách hàng" onClick={() => archive(true)}><Archive size={14} /></button>)}
      </>}>
        <Props rows={[
          ['Mã khách hàng', c.code],
          ['Tình trạng', <span className={CUSTOMER_STATUS_CLASS}>{c.status}</span>],
          ['Tỉnh thành', c.province_name], ['Phường/Xã', c.ward_name], ['Nguồn', c.source],
          ['Sale', c.kd_names], ['AM', c.am_names],
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
      </Block>
      {/* Công việc, Tài liệu, Trao đổi: chỉ khi có quyền Xem chức năng đó */}
      {can('ctask.view') && <Tasks customerId={c.id} tasks={c.tasks} showProject members={c.member_ids} />}
      {can('cfile.view') && <Block title={`Tài liệu (${c.files.length})`} extra={can('cfile.create') && <UploadButton customerId={c.id} />}>
        <FileList customerId={c.id} files={c.files} showWhere />
      </Block>}
      {can('ctalk.view') && <Talk customerId={c.id} activities={c.activities} target={{}} empty="Chưa có trao đổi chung về khách hàng" canAdd={can('ctalk.create')} users={users ?? []} mentionIds={c.mention_ids} />}
      {editing && <CustomerModal customer={c} contacts={c.contacts} kdIds={c.kd_ids} amIds={c.am_ids} onClose={() => setEditing(false)} />}
    </>
  );
}

const TASK_STATUS = { todo: 'Chưa bắt đầu', doing: 'Đang thực hiện', done: 'Hoàn thành' } as const;

/**
 * Công việc: của khách hàng (gộp cả việc chung và việc của các dự án, showProject) hoặc của một dự án (projectId).
 */
export function Tasks({ customerId, tasks, projectId, showProject, members }: {
  customerId: number; tasks: CustomerTask[]; projectId?: number; showProject?: boolean;
  /** Chỉ giao việc cho người tham gia dự án của khách hàng */
  members: number[];
}) {
  const { data: me } = useMe();
  const can = useCan();
  const { data: users } = useUsersBasic();
  const canAdd = can('ctask.create'), canEdit = can('ctask.edit'), canDeleteAll = can('ctask.delete');
  const [showDone, setShowDone] = useState(false);
  const [d, setD] = useState({ title: '', assignee_id: '', due_date: '' });
  const now = today();
  const open = tasks.filter((t) => t.status !== 'done');
  const list = showDone ? tasks : open;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/customers/${customerId}/tasks`, { ...d, assignee_id: d.assignee_id || null, due_date: d.due_date || null, sales_project_id: projectId ?? null });
      setD({ title: '', assignee_id: d.assignee_id, due_date: '' });
      await refreshCustomer(customerId);
    } catch (err) { toastError(err); }
  };
  const update = async (t: CustomerTask, body: object) => {
    try { await api.patch(`/customers/${customerId}/tasks/${t.id}`, body); await refreshCustomer(customerId); } catch (e) { toastError(e); }
  };
  const remove = async (t: CustomerTask) => {
    if (!confirm(`Xóa công việc "${t.title}"?`)) return;
    try { await api.del(`/customers/${customerId}/tasks/${t.id}`); await refreshCustomer(customerId); } catch (e) { toastError(e); }
  };

  return (
    <Block title="Công việc">
      {canAdd && (
        <form className="stack-sm mb" onSubmit={add}>
          <input required placeholder={projectId ? '+ Thêm việc của dự án, VD: Gửi báo giá…' : '+ Thêm việc chung của khách hàng…'} value={d.title}
            onChange={(e) => setD({ ...d, title: e.target.value })} aria-label="Tên công việc" />
          {d.title && <div className="row gap-sm">
            <SearchSelect className="grow" value={d.assignee_id} onChange={(e) => setD({ ...d, assignee_id: e.target.value })} aria-label="Người thực hiện">
              <option value="">Người thực hiện…</option>
              {users?.filter((u) => members.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </SearchSelect>
            <input type="date" value={d.due_date} onChange={(e) => setD({ ...d, due_date: e.target.value })} aria-label="Hạn" />
            <button className="btn btn-primary btn-sm">Thêm</button>
          </div>}
        </form>
      )}
      {!list.length ? <p className="muted small">{tasks.length ? 'Không còn việc chưa xong' : 'Chưa có công việc'}</p> : list.map((t) => {
        const late = overdueDays(t.due_date, t.status, now);
        return (
          <div key={t.id} className={`cw-task ${t.status === 'done' ? 'j-done' : ''} ${late ? 'j-late' : ''}`}>
            <input type="checkbox" checked={t.status === 'done'} disabled={!canEdit} aria-label="Hoàn thành" onChange={(e) => update(t, { status: e.target.checked ? 'done' : 'todo' })} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="j-title">{t.title}</div>
              <div className="small muted">{showProject && t.sales_project_name && <span className="unit-chip">{t.sales_project_name}</span>} {t.assignee_name ?? 'Chưa giao'}
                {t.due_date && <> · <span className={late ? 'overdue strong' : ''}>{fmtDate(t.due_date)}{late ? ` · Quá hạn ${late} ngày` : ''}</span></>}
                {t.status === 'doing' && <> · {TASK_STATUS.doing}</>}</div>
            </div>
            {canEdit && t.status !== 'done' && <select className="cw-mini-select" value={t.status} onChange={(e) => update(t, { status: e.target.value })} aria-label="Trạng thái">
              {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
            {(canDeleteAll || (canAdd && t.created_by === me?.id)) && <button className="icon-btn" aria-label={`Xóa ${t.title}`} onClick={() => remove(t)}><Trash2 size={13} /></button>}
          </div>
        );
      })}
      {tasks.length > open.length && <a className="small" onClick={() => setShowDone(!showDone)}>{showDone ? 'Ẩn việc đã xong' : `Xem cả ${tasks.length - open.length} việc đã xong`}</a>}
    </Block>
  );
}

/** Liên kết tiến độ sản xuất của một dự án của khách hàng (dữ liệu phân hệ Dự án — người gọi kiểm tra quyền Kế hoạch – Xem); bấm mở Kế hoạch chi tiết */
export function ProductionBlock({ production }: { production: { id: number; key: string; name: string; project_status: string | null; status_auto: string; total_issues: number; done_issues: number; accessible: boolean; ba?: string | null }[] }) {
  return (
    <Block title={`Liên kết tiến độ sản xuất (${production.length})`}>
      {!production.length ? <p className="muted small">Dự án chưa gắn với dự án sản xuất nào</p>
          : production.map((p) => {
            const st = p.project_status || p.status_auto;
            const pct = p.total_issues ? Math.round((p.done_issues / p.total_issues) * 100) : 0;
            const body = <>
              <div className="row gap-sm" style={{ minWidth: 0 }}>
                <span className="proj-dot sm" style={{ background: colorOf(p.key) }}>{p.key.slice(0, 2)}</span>
                <b className="grow ellipsis">{p.name}</b>
                {st && <span className={lozengeOf(PROJECT_STATUSES, st)}>{st}</span>}
              </div>
              <div className="muted small">{p.key}{p.ba ? ` · BA/PM: ${p.ba}` : ''}{p.total_issues ? ` · ${p.done_issues}/${p.total_issues} việc (${pct}%)` : ''}</div>
            </>;
            return p.accessible
              ? <Link key={p.id} to={`/p/${p.key}/plan`} className="cw-project" data-tip="Mở Kế hoạch chi tiết">{body}</Link>
              : <div key={p.id} className="cw-project disabled" data-tip="Bạn không phải thành viên dự án sản xuất này">{body}</div>;
          })}
    </Block>
  );
}
