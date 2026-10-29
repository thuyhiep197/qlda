import { useState, type FormEvent } from 'react';
import { AlertTriangle, Check, Pencil, PhoneCall, PhoneMissed, Plus, Trash2 } from 'lucide-react';
import { api, queryClient } from '../../api';
import { useMe, useUsersBasic } from '../../hooks';
import { useCan } from './manage';
import type { CustomerCall } from '../../types';
import { fmtDate, today } from '../../util';
import { callAlert } from '../../customer-filter';
import { toast, toastError } from '../../components/ui';
import { refreshCustomer } from './JourneyPane';
import { Block } from './CustomerSide';
import { SearchSelect } from '../../components/SearchSelect';

const refresh = (customerId: number) => Promise.all([refreshCustomer(customerId), queryClient.invalidateQueries({ queryKey: ['customers'] })]);

/** Ô đặt lịch: ngày gọi, người gọi (chỉ người tham gia dự án; mặc định mình), ghi chú */
function CallFields({ d, setD, members }: { d: CallDraft; setD: (d: CallDraft) => void; members: number[] }) {
  const { data: users } = useUsersBasic();
  return (
    <>
      <div className="row gap-sm">
        <input type="date" required value={d.call_date} onChange={(e) => setD({ ...d, call_date: e.target.value })} aria-label="Ngày gọi" />
        <SearchSelect className="grow" value={d.assignee_id} onChange={(e) => setD({ ...d, assignee_id: e.target.value })} aria-label="Người gọi">
          {users?.filter((u) => members.includes(u.id) || String(u.id) === d.assignee_id).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </SearchSelect>
      </div>
      <input placeholder="Ghi chú: gọi để làm gì…" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} aria-label="Ghi chú lịch gọi" />
    </>
  );
}
interface CallDraft { call_date: string; assignee_id: string; note: string }
const body = (d: CallDraft) => ({ call_date: d.call_date, assignee_id: d.assignee_id ? Number(d.assignee_id) : null, note: d.note });

/**
 * Lịch gọi điện của dự án của khách hàng (tách khỏi Trao đổi): đặt lịch ngày gọi và giao người gọi;
 * đến ngày mà chưa xác nhận → chuông nhắc người gọi mỗi ngày, mọi người xem dự án thấy cảnh báo.
 * Xác nhận Đã gọi / Chưa gọi được kèm kết quả, và đặt luôn lịch kế tiếp. Dùng chung quyền Trao đổi.
 */
export default function CallSchedule({ customerId, projectId, calls, members }: { customerId: number; projectId: number; calls: CustomerCall[]; members: number[] }) {
  const can = useCan();
  const { data: me } = useMe();
  const canAdd = can('ctalk.create'), canDeleteAll = can('ctalk.delete');
  const mine = me && members.includes(me.id) ? String(me.id) : '';
  const blank = (): CallDraft => ({ call_date: '', assignee_id: mine, note: '' });
  const [adding, setAdding] = useState(false);
  const [d, setD] = useState<CallDraft>(blank);
  const [editing, setEditing] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<{ id: number; status: 'done' | 'failed' } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const now = today();
  const planned = calls.filter((k) => k.status === 'planned');
  const history = calls.filter((k) => k.status !== 'planned');
  const alert = callAlert(planned.map((k) => k.call_date), now);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try { await api.post(`/customers/${customerId}/projects/${projectId}/calls`, body(d)); toast('Đã đặt lịch gọi'); setAdding(false); setD(blank()); await refresh(customerId); } catch (err) { toastError(err); }
  };
  const remove = async (k: CustomerCall) => {
    if (!confirm(`Xóa lịch gọi ngày ${fmtDate(k.call_date)}?`)) return;
    try { await api.del(`/customers/${customerId}/calls/${k.id}`); await refresh(customerId); } catch (e) { toastError(e); }
  };

  return (
    <Block title={`Lịch gọi điện${planned.length ? ` (${planned.length} chờ gọi)` : ''}`}
      extra={canAdd && !adding && <button className="icon-btn" aria-label="Đặt lịch gọi" data-tip="Đặt lịch gọi khách hàng" onClick={() => { setD(blank()); setAdding(true); }}><Plus size={14} /></button>}>
      {alert && <div className="call-alert"><AlertTriangle size={14} /> {alert.late > 0 ? `Quá hạn gọi khách hàng ${alert.late} ngày` : 'Hôm nay phải gọi khách hàng'}</div>}
      {adding && (
        <form className="stack-sm mb" onSubmit={add}>
          <CallFields d={d} setD={setD} members={members} />
          <div className="row gap-sm"><div className="spacer" /><button type="button" className="btn btn-sm" onClick={() => setAdding(false)}>Hủy</button>
            <button className="btn btn-primary btn-sm" disabled={!d.call_date}>Đặt lịch</button></div>
        </form>
      )}
      {!planned.length && !adding && <p className="muted small">Chưa có lịch gọi.{canAdd ? ' Bấm + để đặt lịch gọi khách hàng.' : ''}</p>}
      {planned.map((k) => {
        const late = k.call_date < now ? Math.round((Date.parse(now) - Date.parse(k.call_date)) / 86400_000) : 0;
        const due = k.call_date <= now;
        if (editing === k.id) return <EditCall key={k.id} k={k} customerId={customerId} members={members} onDone={() => setEditing(null)} />;
        return (
          <div key={k.id} className={`call-item ${due ? 'due' : ''}`}>
            <div className="row gap-sm">
              <b className={due ? 'overdue' : ''}>{fmtDate(k.call_date)}</b>
              {due && <span className="overdue small">{late ? `Quá ${late} ngày` : 'Hôm nay'}</span>}
              <span className="grow ellipsis small">· {k.assignee_name ?? 'Chưa giao'}</span>
              {canAdd && <button className="icon-btn" aria-label="Sửa lịch gọi" data-tip="Sửa lịch" onClick={() => setEditing(k.id)}><Pencil size={13} /></button>}
              {(canDeleteAll || (canAdd && k.created_by === me?.id)) && <button className="icon-btn" aria-label="Xóa lịch gọi" onClick={() => remove(k)}><Trash2 size={13} /></button>}
            </div>
            {k.note && <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{k.note}</div>}
            <div className="muted small">Đặt bởi {k.created_by_name ?? '—'}</div>
            {canAdd && (confirming?.id === k.id
              ? <ConfirmCall k={k} status={confirming.status} customerId={customerId} members={members} onDone={() => setConfirming(null)} />
              : <div className="row gap-sm mt-sm">
                  <button className="btn btn-sm" onClick={() => setConfirming({ id: k.id, status: 'done' })}><PhoneCall size={13} /> Đã gọi</button>
                  <button className="btn btn-sm" onClick={() => setConfirming({ id: k.id, status: 'failed' })}><PhoneMissed size={13} /> Chưa gọi được</button>
                </div>)}
          </div>
        );
      })}
      {history.length > 0 && <a className="small" onClick={() => setShowHistory(!showHistory)}>{showHistory ? 'Ẩn lịch sử gọi' : `Xem lịch sử gọi (${history.length})`}</a>}
      {showHistory && history.map((k) => (
        <div key={k.id} className="call-item past">
          <div className="row gap-sm small">
            <b>{fmtDate(k.call_date)}</b>
            {k.status === 'done' ? <span className="lozenge lozenge-green"><Check size={11} /> Đã gọi</span> : <span className="lozenge lozenge-yellow">Chưa gọi được</span>}
            <span className="grow ellipsis muted">· {k.done_by_name ?? k.assignee_name ?? '—'}</span>
            {(canDeleteAll || (canAdd && k.created_by === me?.id)) && <button className="icon-btn" aria-label="Xóa lịch gọi" onClick={() => remove(k)}><Trash2 size={13} /></button>}
          </div>
          {k.note && <div className="muted small">{k.note}</div>}
          {k.result && <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{k.result}</div>}
        </div>
      ))}
    </Block>
  );
}

function EditCall({ k, customerId, members, onDone }: { k: CustomerCall; customerId: number; members: number[]; onDone: () => void }) {
  const [d, setD] = useState<CallDraft>({ call_date: k.call_date, assignee_id: k.assignee_id ? String(k.assignee_id) : '', note: k.note ?? '' });
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try { await api.patch(`/customers/${customerId}/calls/${k.id}`, body(d)); onDone(); await refresh(customerId); } catch (err) { toastError(err); }
  };
  return (
    <form className="call-item stack-sm" onSubmit={save}>
      <CallFields d={d} setD={setD} members={members} />
      <div className="row gap-sm"><div className="spacer" /><button type="button" className="btn btn-sm" onClick={onDone}>Hủy</button><button className="btn btn-primary btn-sm">Lưu</button></div>
    </form>
  );
}

/** Xác nhận Đã gọi / Chưa gọi được: kết quả cuộc gọi; tích "Đặt lịch kế tiếp" để hẹn ngày gọi tiếp (người gọi mặc định như lịch này) */
function ConfirmCall({ k, status, customerId, members, onDone }: { k: CustomerCall; status: 'done' | 'failed'; customerId: number; members: number[]; onDone: () => void }) {
  const [result, setResult] = useState('');
  const [hasNext, setHasNext] = useState(status === 'failed');
  const [next, setNext] = useState<CallDraft>({ call_date: '', assignee_id: k.assignee_id ? String(k.assignee_id) : '', note: k.note ?? '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/customers/${customerId}/calls/${k.id}/confirm`, { status, result, next: hasNext ? body(next) : null });
      toast(status === 'done' ? 'Đã ghi nhận cuộc gọi' : 'Đã ghi nhận chưa gọi được');
      onDone();
      await refresh(customerId);
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };
  return (
    <form className="stack-sm mt-sm" onSubmit={submit}>
      <textarea rows={2} autoFocus value={result} onChange={(e) => setResult(e.target.value)}
        placeholder={status === 'done' ? 'Kết quả cuộc gọi…' : 'Lý do chưa gọi được (không nghe máy, hẹn lại…)'} aria-label="Kết quả" />
      <label className="check small"><input type="checkbox" checked={hasNext} onChange={(e) => setHasNext(e.target.checked)} /> Đặt lịch kế tiếp</label>
      {hasNext && <CallFields d={next} setD={setNext} members={members} />}
      <div className="row gap-sm"><div className="spacer" /><button type="button" className="btn btn-sm" onClick={onDone}>Hủy</button>
        <button className="btn btn-primary btn-sm" disabled={busy || (hasNext && !next.call_date)}>{status === 'done' ? 'Xác nhận đã gọi' : 'Xác nhận chưa gọi được'}</button></div>
    </form>
  );
}
