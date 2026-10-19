import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Lock, Mail, Phone, Plus, Trash2, Users, X } from 'lucide-react';
import { api } from '../../api';
import { hasPerm, useMe, useUsersBasic } from '../../hooks';
import type { ActivityKind, CustomerActivity, CustomerDetail, StepDetail, StepStatus } from '../../types';
import { fmtDate, timeAgo, today } from '../../util';
import { overdueDays } from '../../customer-filter';
import { Avatar, Markdown, Spinner, toast, toastError } from '../../components/ui';
import { MentionTextarea } from '../../components/MentionTextarea';
import { MAX_DEPTH, refreshCustomer, STEP_STATUS } from './JourneyPane';
import { PersonChip, UserPickerPopover } from '../../components/UserPicker';
import { Block, FileList, Props, UploadButton } from './CustomerSide';

/** Loại trao đổi; ghi chú gộp vào Nội bộ (dữ liệu ghi chú cũ hiển thị như Nội bộ) */
const KIND: Partial<Record<ActivityKind, { label: string; icon: ReactNode }>> = {
  internal: { label: 'Nội bộ / Ghi chú', icon: <Lock size={13} /> },
  call: { label: 'Gọi điện', icon: <Phone size={13} /> },
  meeting: { label: 'Gặp mặt', icon: <Users size={13} /> },
  email: { label: 'Email', icon: <Mail size={13} /> },
};

/** Cột phải khi chọn một bước của hành trình (như một issue của kinh doanh): Phòng thực hiện, Phòng phối hợp, Trạng thái; Trao đổi và Tài liệu của bước */
export default function StepPanel({ customer, stepId, onClose }: { customer: CustomerDetail; stepId: number; onClose: () => void }) {
  const { data: me } = useMe();
  const { data: users } = useUsersBasic();
  const canEdit = hasPerm(me, 'customer.edit');
  const [picking, setPicking] = useState<'assignee' | 'supporters' | null>(null);
  const { data: s, isLoading, error } = useQuery<StepDetail>({ queryKey: ['step', stepId], queryFn: () => api.get(`/customers/${customer.id}/journey/${stepId}`) });

  if (isLoading) return <Spinner />;
  if (!s) return <div className="pad muted">{error instanceof Error ? error.message : 'Không tìm thấy bước'} <a onClick={onClose}>Đóng</a></div>;

  const patch = async (body: Record<string, unknown>) => {
    try { await api.patch(`/customers/${customer.id}/journey/${s.id}`, body); await refreshCustomer(customer.id); } catch (e) { toastError(e); }
  };
  const addChild = async () => {
    const title = prompt(`Thêm bước con cho "${s.title}":`)?.trim();
    if (!title) return;
    try { await api.post(`/customers/${customer.id}/journey/${s.id}/children`, { title }); await refreshCustomer(customer.id); } catch (e) { toastError(e); }
  };
  const remove = async () => {
    if (!confirm(`Bỏ "${s.title}" (cùng các bước con nếu có) khỏi hành trình của khách hàng này?`)) return;
    try { const r = await api.del<{ removed: number }>(`/customers/${customer.id}/journey/${s.id}`); toast(`Đã bỏ ${r.removed} bước`); onClose(); await refreshCustomer(customer.id); } catch (e) { toastError(e); }
  };
  const people = (field: 'assignee' | 'supporters') => {
    const list = field === 'assignee' ? (s.assignee_id ? [{ id: s.assignee_id, full_name: s.assignee_name ?? '', dept: s.assignee_dept }] : []) : s.supporters;
    const planned = field === 'assignee' ? s.unit : s.support;
    return (
      <div className="j-person-field">
        <button type="button" className="j-person-btn" disabled={!canEdit} onClick={() => setPicking(picking === field ? null : field)}>
          {list.length ? list.map((p) => <PersonChip key={p.id} name={p.full_name} dept={p.dept} />) : <span className="muted">{canEdit ? 'Chọn người…' : '—'}</span>}
        </button>
        {planned && <div className="muted small">Theo quy trình: <span className="unit-chip planned">{planned}</span></div>}
        {picking === field && <UserPickerPopover value={list.map((p) => p.id)} multi={field === 'supporters'} prefer={planned} onClose={() => setPicking(null)}
          onChange={(ids) => patch(field === 'assignee' ? { assignee_id: ids[0] ?? null } : { supporter_ids: ids })} />}
      </div>
    );
  };

  return (
    <>
      <div className="cw-step-head">
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="muted small ellipsis">{s.path.map((p) => `${p.code ? `${p.code}. ` : ''}${p.title}`).join(' › ')}</div>
          <h3>{s.code ? `${s.code} ` : ''}{s.title}</h3>
        </div>
        <button className="icon-btn" aria-label="Đóng, về thông tin khách hàng" data-tip="Về thông tin khách hàng" onClick={onClose}><X size={16} /></button>
      </div>
      {overdueDays(s.due_date, s.status, today()) > 0 && (
        <div className="j-late-banner"><AlertTriangle size={15} /> Quá hạn {overdueDays(s.due_date, s.status, today())} ngày (hạn {fmtDate(s.due_date)}) — bước chưa hoàn thành</div>
      )}
      <Block title="Thông tin bước" extra={canEdit && <>
        {s.depth < MAX_DEPTH && <button className="icon-btn" aria-label="Thêm bước con" data-tip="Thêm bước con" onClick={addChild}><Plus size={14} /></button>}
        <button className="icon-btn" aria-label="Bỏ bước" data-tip="Bỏ bước (cùng bước con)" onClick={remove}><Trash2 size={14} /></button>
      </>}>
        <Props rows={[
          ['Người thực hiện', people('assignee')],
          ['Người phối hợp', people('supporters')],
          ['Trạng thái', canEdit
            ? <select className={`j-status j-${s.status}`} value={s.status} onChange={(e) => patch({ status: e.target.value })}>
                {(Object.keys(STEP_STATUS) as StepStatus[]).map((k) => <option key={k} value={k}>{STEP_STATUS[k].label}</option>)}</select>
            : <span className={`lozenge lozenge-${STEP_STATUS[s.status].tone}`}>{STEP_STATUS[s.status].label}</span>],
          ['Hạn', canEdit ? <input type="date" value={s.due_date ?? ''} onChange={(e) => patch({ due_date: e.target.value || null })} /> : fmtDate(s.due_date)],
          ['Nhắc nhở', canEdit
            ? <select value={s.ping_days} onChange={(e) => patch({ ping_days: Number(e.target.value) })}
                data-tip="Nhắc người thực hiện qua chuông thông báo, mỗi ngày từ N ngày trước hạn cho tới khi Hoàn thành">
                {s.ping_options.map((d) => <option key={d} value={d}>{d ? `Trước hạn ${d} ngày` : 'Tắt'}</option>)}</select>
            : s.ping_days ? `Trước hạn ${s.ping_days} ngày` : 'Tắt'],
        ]} />
      </Block>
      <Talk customerId={customer.id} activities={s.activities} target={{ step_id: s.id }} empty="Chưa có trao đổi về bước này" canAdd={canEdit} users={users ?? []} />
      <Block title={`Tài liệu kết quả (${s.files.length})`} extra={canEdit && <UploadButton customerId={customer.id} stepId={s.id} />}>
        <FileList customerId={customer.id} files={s.files} />
      </Block>
    </>
  );
}

/** Trao đổi (của khách hàng, của dự án, hoặc của một bước): thảo luận nội bộ (gõ @ để nhắc đồng nghiệp) hoặc ghi lại làm việc với khách hàng */
export function Talk({ customerId, activities, target, empty, canAdd, users }: {
  customerId: number; activities: CustomerActivity[]; target: { step_id?: number; sales_project_id?: number }; empty: string; canAdd: boolean;
  users: NonNullable<ReturnType<typeof useUsersBasic>['data']>;
}) {
  const { data: me } = useMe();
  const [kind, setKind] = useState<ActivityKind>('internal');
  const [date, setDate] = useState(today());
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    try {
      await api.post(`/customers/${customerId}/activities`, { kind, ...target, activity_date: kind === 'internal' ? today() : date, content });
      setContent('');
      await refreshCustomer(customerId);
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };
  const remove = async (id: number) => {
    if (!confirm('Xóa trao đổi này?')) return;
    try { await api.del(`/customers/${customerId}/activities/${id}`); await refreshCustomer(customerId); } catch (e) { toastError(e); }
  };
  return (
    <Block title={`Trao đổi (${activities.length})`}>
      <div className="cw-talk">
        {!activities.length && <p className="muted small">{empty}</p>}
        {activities.map((a) => (
          <div key={a.id} className="cw-msg">
            <Avatar name={a.user_name} size={26} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="small"><b>{a.user_name ?? '—'}</b> <span className="muted">· {(KIND[a.kind] ?? KIND.internal)!.icon} {(KIND[a.kind] ?? KIND.internal)!.label} · {a.kind === 'internal' ? timeAgo(a.created_at) : fmtDate(a.activity_date)}</span></div>
              {a.kind === 'internal' ? <Markdown text={a.content} users={users} /> : <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{a.content}</div>}
            </div>
            {(hasPerm(me, 'customer.delete') || (canAdd && a.user_id === me?.id)) &&
              <button className="icon-btn" aria-label="Xóa trao đổi" onClick={() => remove(a.id)}><Trash2 size={13} /></button>}
          </div>
        ))}
      </div>
      {canAdd && (
        <form className="stack-sm mt" onSubmit={send}>
          <div className="seg seg-sm" role="group" aria-label="Loại trao đổi">
            {(Object.keys(KIND) as ActivityKind[]).map((k) => <button type="button" key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{KIND[k]!.icon} {KIND[k]!.label}</button>)}
          </div>
          {kind !== 'internal' && <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} aria-label="Ngày làm việc với khách hàng" />}
          {kind === 'internal'
            ? <MentionTextarea value={content} onChange={setContent} members={users} rows={3} placeholder="Trao đổi nội bộ — gõ @ để nhắc đồng nghiệp" />
            : <textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Nội dung làm việc với khách hàng, kết quả…" />}
          <div className="row"><div className="spacer" /><button className="btn btn-primary btn-sm" disabled={busy || !content.trim()}>Gửi</button></div>
        </form>
      )}
    </Block>
  );
}
