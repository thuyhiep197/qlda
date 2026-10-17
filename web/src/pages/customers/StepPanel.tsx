import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lock, Mail, MessageSquareText, Phone, Plus, Trash2, Users, X } from 'lucide-react';
import { api } from '../../api';
import { hasPerm, useMe, useUsersBasic } from '../../hooks';
import type { ActivityKind, CustomerDetail, StepDetail, StepStatus } from '../../types';
import { fmtDate, timeAgo, today } from '../../util';
import { Avatar, Markdown, Spinner, toast, toastError } from '../../components/ui';
import { MentionTextarea } from '../../components/MentionTextarea';
import { refreshCustomer, STEP_STATUS, UNITS } from './JourneyPane';
import { Block, FileList, Props, UploadButton } from './CustomerSide';

const KIND: Record<ActivityKind, { label: string; icon: ReactNode }> = {
  internal: { label: 'Nội bộ', icon: <Lock size={13} /> },
  call: { label: 'Gọi điện', icon: <Phone size={13} /> },
  meeting: { label: 'Gặp mặt', icon: <Users size={13} /> },
  email: { label: 'Email', icon: <Mail size={13} /> },
  note: { label: 'Ghi chú', icon: <MessageSquareText size={13} /> },
};

/** Cột phải khi chọn một bước của hành trình (như một issue của kinh doanh): Phòng thực hiện, Phòng phối hợp, Trạng thái; Trao đổi và Tài liệu của bước */
export default function StepPanel({ customer, stepId, onClose }: { customer: CustomerDetail; stepId: number; onClose: () => void }) {
  const { data: me } = useMe();
  const { data: users } = useUsersBasic();
  const canEdit = hasPerm(me, 'customer.edit');
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
  const unitInput = (key: 'unit' | 'support', value: string | null) => canEdit
    ? <input list="unit-options" defaultValue={value ?? ''} key={`${s.id}-${key}-${value}`} placeholder="VD: AM, BA+DEV"
        onBlur={(e) => e.target.value.trim() !== (value ?? '') && patch({ [key]: e.target.value })} aria-label={key === 'unit' ? 'Phòng thực hiện' : 'Phòng phối hợp'} />
    : value && <span className="unit-chip">{value}</span>;

  return (
    <>
      <div className="cw-step-head">
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="muted small ellipsis">{s.path.map((p) => `${p.code ? `${p.code}. ` : ''}${p.title}`).join(' › ')}</div>
          <h3>{s.code ? `${s.code} ` : ''}{s.title}</h3>
        </div>
        <button className="icon-btn" aria-label="Đóng, về thông tin khách hàng" data-tip="Về thông tin khách hàng" onClick={onClose}><X size={16} /></button>
      </div>
      <Block title="Thông tin bước" extra={canEdit && <>
        {s.depth < 3 && <button className="icon-btn" aria-label="Thêm bước con" data-tip="Thêm bước con" onClick={addChild}><Plus size={14} /></button>}
        <button className="icon-btn" aria-label="Bỏ bước" data-tip="Bỏ bước (cùng bước con)" onClick={remove}><Trash2 size={14} /></button>
      </>}>
        <datalist id="unit-options">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
        <Props rows={[
          ['Phòng thực hiện', unitInput('unit', s.unit)],
          ['Phòng phối hợp', unitInput('support', s.support)],
          ['Trạng thái', canEdit
            ? <select className={`j-status j-${s.status}`} value={s.status} onChange={(e) => patch({ status: e.target.value })}>
                {(Object.keys(STEP_STATUS) as StepStatus[]).map((k) => <option key={k} value={k}>{STEP_STATUS[k].label}</option>)}</select>
            : <span className={`lozenge lozenge-${STEP_STATUS[s.status].tone}`}>{STEP_STATUS[s.status].label}</span>],
          ['Người phụ trách', canEdit
            ? <select value={s.assignee_id ?? ''} onChange={(e) => patch({ assignee_id: e.target.value || null })}>
                <option value="">—</option>{users?.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select>
            : s.assignee_name],
          ['Hạn', canEdit ? <input type="date" value={s.due_date ?? ''} onChange={(e) => patch({ due_date: e.target.value || null })} /> : fmtDate(s.due_date)],
          ['Ping', canEdit
            ? <select value={s.ping_days} onChange={(e) => patch({ ping_days: Number(e.target.value) })}
                data-tip="Nhắc người phụ trách qua chuông thông báo, mỗi ngày từ N ngày trước hạn cho tới khi Kết thúc">
                {s.ping_options.map((d) => <option key={d} value={d}>{d ? `Trước hạn ${d} ngày` : 'Tắt'}</option>)}</select>
            : s.ping_days ? `Trước hạn ${s.ping_days} ngày` : 'Tắt'],
        ]} />
      </Block>
      <Talk customerId={customer.id} step={s} canAdd={canEdit} users={users ?? []} />
      <Block title={`Tài liệu kết quả (${s.files.length})`} extra={canEdit && <UploadButton customerId={customer.id} stepId={s.id} />}>
        <FileList customerId={customer.id} files={s.files} />
      </Block>
    </>
  );
}

/** Trao đổi của bước: thảo luận nội bộ (gõ @ để nhắc đồng nghiệp) hoặc ghi lại làm việc với khách hàng */
function Talk({ customerId, step, canAdd, users }: { customerId: number; step: StepDetail; canAdd: boolean; users: NonNullable<ReturnType<typeof useUsersBasic>['data']> }) {
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
      await api.post(`/customers/${customerId}/activities`, { kind, step_id: step.id, activity_date: kind === 'internal' ? today() : date, content });
      setContent('');
      await refreshCustomer(customerId);
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };
  const remove = async (id: number) => {
    if (!confirm('Xóa trao đổi này?')) return;
    try { await api.del(`/customers/${customerId}/activities/${id}`); await refreshCustomer(customerId); } catch (e) { toastError(e); }
  };
  return (
    <Block title={`Trao đổi (${step.activities.length})`}>
      <div className="cw-talk">
        {!step.activities.length && <p className="muted small">Chưa có trao đổi về bước này</p>}
        {step.activities.map((a) => (
          <div key={a.id} className="cw-msg">
            <Avatar name={a.user_name} size={26} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="small"><b>{a.user_name ?? '—'}</b> <span className="muted">· {KIND[a.kind]?.icon} {KIND[a.kind]?.label} · {a.kind === 'internal' ? timeAgo(a.created_at) : fmtDate(a.activity_date)}</span></div>
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
            {(Object.keys(KIND) as ActivityKind[]).map((k) => <button type="button" key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{KIND[k].icon} {KIND[k].label}</button>)}
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
