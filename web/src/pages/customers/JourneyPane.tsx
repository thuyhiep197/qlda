import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, MessageSquare, Paperclip } from 'lucide-react';
import { api, queryClient } from '../../api';
import { hasPerm, useMe } from '../../hooks';
import type { CustomerDetail, JourneyData, JourneyStep, StepStatus } from '../../types';
import { CUSTOMER_STATUSES, filterSteps } from '../../customer-filter';
import { fmtDate, lozengeOf, today } from '../../util';
import { Avatar, Empty, Spinner, toast, toastError } from '../../components/ui';

export const STEP_STATUS: Record<StepStatus, { label: string; tone: string }> = {
  todo: { label: 'Chưa bắt đầu', tone: 'default' }, doing: { label: 'Bắt đầu', tone: 'blue' }, done: { label: 'Kết thúc', tone: 'green' },
};
export const UNITS = ['KD', 'AM', 'BA', 'DEV', 'HC', 'BGĐ', 'Đối tác'];

export const refreshCustomer = (customerId: number) => Promise.all([
  queryClient.invalidateQueries({ queryKey: ['journey', customerId] }),
  queryClient.invalidateQueries({ queryKey: ['customer', String(customerId)] }),
  queryClient.invalidateQueries({ queryKey: ['step'] }),
  queryClient.invalidateQueries({ queryKey: ['customers'] }),
]);

/** Cột giữa: hành trình khách hàng theo quy trình I–IV. Bấm một bước để xem Trao đổi và Tài liệu của bước ở cột phải. */
export default function JourneyPane({ c, selected, onSelect }: { c: CustomerDetail; selected: number | null; onSelect: (id: number | null) => void }) {
  const { data: me } = useMe();
  const canEdit = hasPerm(me, 'customer.edit');
  const { data, isLoading } = useQuery<JourneyData>({ queryKey: ['journey', c.id], queryFn: () => api.get(`/customers/${c.id}/journey`) });
  const [collapsed, setCollapsed] = useState<Set<number> | null>(null);
  const [f, setF] = useState({ status: '', unit: '', mine: false, q: '' });
  const [busy, setBusy] = useState(false);
  const now = today();

  const head = (
    <div className="cw-head">
      <div className="grow" style={{ minWidth: 0 }}>
        <h2 className="ellipsis">{c.name}</h2>
        <div className="row gap-sm small muted" style={{ flexWrap: 'wrap' }}>
          <span className={lozengeOf(CUSTOMER_STATUSES, c.status)}>{c.status}</span>
          {[c.ward_name, c.province_name].filter(Boolean).join(', ')}
          {c.owners.length > 0 && <span>· Phụ trách: {c.owners.map((o) => o.full_name).join(', ')}</span>}
        </div>
      </div>
    </div>
  );
  if (isLoading || !data) return <>{head}<Spinner /></>;

  const apply = async () => {
    setBusy(true);
    try { await api.post(`/customers/${c.id}/journey/apply`); toast('Đã tạo hành trình theo quy trình mẫu'); await refreshCustomer(c.id); } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  if (!data.steps.length) {
    return <>{head}<div className="cw-scroll"><Empty title="Khách hàng chưa có hành trình">
      <p className="muted">Hành trình theo quy trình I. Giải pháp → II. Hợp đồng → III. Triển khai → IV. Nghiệm thu – Thanh toán (457 bước, có sẵn phòng thực hiện và phối hợp). Sau khi tạo có thể bỏ các nhánh không áp dụng.</p>
      {canEdit && <button className="btn btn-primary" disabled={busy} onClick={apply}>Áp dụng quy trình mẫu</button>}
    </Empty></div></>;
  }

  const { steps, progress } = data;
  const sectionOf = (id: number | null | undefined) => { let sec = steps[0]?.id; for (const s of steps) { if (s.depth === 0) sec = s.id; if (s.id === id) return sec; } return null; };
  const openSec = sectionOf(selected) ?? sectionOf(progress.current?.id) ?? steps[0]?.id;
  const closed = collapsed ?? new Set(steps.filter((s) => s.depth === 0 && s.id !== openSec).map((s) => s.id));
  const toggle = (id: number) => { const n = new Set(closed); if (n.has(id)) n.delete(id); else n.add(id); setCollapsed(n); };
  const filtered = filterSteps(steps, { ...f, mine: f.mine ? me?.id ?? null : null });
  const visible: JourneyStep[] = filtered ?? (() => {
    const out: JourneyStep[] = []; let hideBelow: number | null = null;
    for (const s of steps) {
      if (hideBelow !== null && s.depth > hideBelow) continue;
      hideBelow = null;
      out.push(s);
      if (closed.has(s.id)) hideBelow = s.depth;
    }
    return out;
  })();
  const hasChildren = (s: JourneyStep) => { const i = steps.indexOf(s); return !!steps[i + 1] && steps[i + 1].depth > s.depth; };

  return (
    <>
      {head}
      <div className="journey-phases">
        {progress.sections.map((sec) => {
          const pct = sec.total ? Math.round((sec.done / sec.total) * 100) : 0;
          const state = sec.total && sec.done === sec.total ? 'done' : sec.done || sec.doing ? 'cur' : 'todo';
          return (
            <button key={sec.id} className={`journey-phase ${state}`} onClick={() => { setF({ status: '', unit: '', mine: false, q: '' }); setCollapsed(new Set(steps.filter((s) => s.depth === 0 && s.id !== sec.id).map((s) => s.id))); }}>
              <b className="ellipsis">{sec.title}</b>
              <div className="cust-bar"><div style={{ width: `${pct}%` }} /></div>
              <span className="muted small">{sec.done}/{sec.total} · {pct}%{sec.overdue ? <span className="overdue"> · {sec.overdue} trễ</span> : null}</span>
            </button>
          );
        })}
      </div>
      <div className="cw-toolbar">
        <div className="cw-search grow"><input placeholder="Tìm bước…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
        <select value={f.status} className={f.status ? 'filter-on' : ''} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Lọc trạng thái">
          <option value="">Mọi trạng thái</option>
          {(Object.keys(STEP_STATUS) as StepStatus[]).map((k) => <option key={k} value={k}>{STEP_STATUS[k].label}</option>)}
        </select>
        <select value={f.unit} className={f.unit ? 'filter-on' : ''} onChange={(e) => setF({ ...f, unit: e.target.value })} aria-label="Lọc phòng">
          <option value="">Mọi phòng</option>
          {UNITS.map((u) => <option key={u}>{u}</option>)}
        </select>
        <label className="check small"><input type="checkbox" checked={f.mine} onChange={(e) => setF({ ...f, mine: e.target.checked })} /> Việc của tôi</label>
      </div>
      <div className="cw-scroll">
        <table className="table journey-table">
          <thead><tr><th>Nội dung</th><th>Phòng thực hiện</th><th>Phòng phối hợp</th><th>Trạng thái</th><th>Phụ trách</th><th>Hạn</th><th /></tr></thead>
          <tbody>
            {filtered && !filtered.length && <tr><td colSpan={7} className="muted center">Không có bước phù hợp</td></tr>}
            {visible.map((s) => {
              if (s.depth === 0) {
                const sec = progress.sections.find((x) => x.id === s.id);
                return (
                  <tr key={s.id} className="j-section" onClick={() => toggle(s.id)}>
                    <td colSpan={7}>{closed.has(s.id) ? <ChevronRight size={15} /> : <ChevronDown size={15} />} {s.code}. {s.title}
                      {sec && <span className="muted small" style={{ fontWeight: 400 }}> · {sec.done}/{sec.total} bước</span>}</td>
                  </tr>
                );
              }
              const late = s.status !== 'done' && s.due_date && s.due_date < now;
              return (
                <tr key={s.id} className={`j-d${s.depth} click-row ${s.status === 'done' ? 'j-done' : ''} ${selected === s.id ? 'j-selected' : ''}`} onClick={() => onSelect(s.id)}>
                  <td className="j-title" style={{ paddingLeft: filtered ? 8 : 8 + (s.depth - 1) * 18 }}>
                    {!filtered && s.depth === 1 && hasChildren(s)
                      ? <span onClick={(e) => { e.stopPropagation(); toggle(s.id); }} className="j-toggle">{closed.has(s.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span> : null}
                    {s.code ? `${s.code} ` : s.depth === 3 ? '– ' : ''}{s.title}
                  </td>
                  <td>{s.unit && <span className="unit-chip">{s.unit}</span>}</td>
                  <td>{s.support && <span className="unit-chip">{s.support}</span>}</td>
                  <td><span className={`lozenge lozenge-${STEP_STATUS[s.status].tone}`}>{STEP_STATUS[s.status].label}</span></td>
                  <td>{s.assignee_name && <span data-tip={s.assignee_name}><Avatar name={s.assignee_name} size={22} /></span>}</td>
                  <td className={`small nowrap ${late ? 'overdue' : 'muted'}`}>{s.due_date ? fmtDate(s.due_date) : ''}</td>
                  <td className="nowrap muted small">
                    {s.talk_count > 0 && <span data-tip="Trao đổi"><MessageSquare size={12} /> {s.talk_count} </span>}
                    {s.files.length > 0 && <span data-tip="Tài liệu kết quả"><Paperclip size={12} /> {s.files.length}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
