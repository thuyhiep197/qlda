import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Paperclip, Plus, Trash2 } from 'lucide-react';
import { api, queryClient } from '../../api';
import { useMe, useUsersBasic } from '../../hooks';
import type { JourneyData, JourneyStep, StepStatus } from '../../types';
import { filterSteps } from '../../customer-filter';
import { fmtDate, today } from '../../util';
import { Empty, Spinner, toast, toastError } from '../../components/ui';

export const STEP_STATUS: Record<StepStatus, { label: string; tone: string }> = {
  todo: { label: 'Chưa bắt đầu', tone: 'default' }, doing: { label: 'Bắt đầu', tone: 'blue' }, done: { label: 'Kết thúc', tone: 'green' },
};
const UNITS = ['KD', 'AM', 'BA', 'DEV', 'HC', 'BGĐ', 'Đối tác'];

/** Hành trình khách hàng theo quy trình I–IV: tiến độ từng phần, cây bước với đơn vị, trạng thái, người phụ trách, hạn, Ping, tài liệu kết quả */
export default function Journey({ customerId, canEdit, canReset }: { customerId: number; canEdit: boolean; canReset: boolean }) {
  const { data: me } = useMe();
  const { data: users } = useUsersBasic();
  const { data, isLoading } = useQuery<JourneyData>({ queryKey: ['journey', customerId], queryFn: () => api.get(`/customers/${customerId}/journey`) });
  const [collapsed, setCollapsed] = useState<Set<number> | null>(null);
  const [f, setF] = useState({ status: '', unit: '', mine: false, q: '' });
  const [busy, setBusy] = useState(false);
  const now = today();

  if (isLoading || !data) return <Spinner />;
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['journey', customerId] }), queryClient.invalidateQueries({ queryKey: ['customer', String(customerId)] })]);
  const apply = async () => {
    setBusy(true);
    try { await api.post(`/customers/${customerId}/journey/apply`); toast('Đã tạo hành trình theo quy trình mẫu'); await refresh(); } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  if (!data.steps.length) {
    return (
      <div className="card">
        <Empty title="Khách hàng chưa có hành trình">
          <p className="muted">Hành trình theo quy trình I. Giải pháp → II. Hợp đồng → III. Triển khai → IV. Nghiệm thu – Thanh toán (457 bước, có sẵn đơn vị thực hiện và phối hợp). Sau khi tạo có thể bỏ các nhánh không áp dụng.</p>
          {canEdit && <button className="btn btn-primary" disabled={busy} onClick={apply}>Áp dụng quy trình mẫu</button>}
        </Empty>
      </div>
    );
  }

  const { steps, progress } = data;
  // Mặc định chỉ mở phần đang thực hiện
  const currentSection = (() => { let sec = steps[0]?.id; for (const s of steps) { if (s.depth === 0) sec = s.id; if (s.id === progress.current?.id) return sec; } return sec; })();
  const closed = collapsed ?? new Set(steps.filter((s) => s.depth === 0 && s.id !== currentSection).map((s) => s.id));
  const toggle = (id: number) => { const n = new Set(closed); if (n.has(id)) n.delete(id); else n.add(id); setCollapsed(n); };
  const filtered = filterSteps(steps, { ...f, mine: f.mine ? me?.id ?? null : null });
  // Ẩn bước con khi phần/giai đoạn cha đang thu gọn
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
  const hasChildren = (i: number) => steps[i + 1] && steps[i + 1].depth > steps[i].depth;

  const patch = async (s: JourneyStep, body: Partial<Record<'status' | 'assignee_id' | 'due_date' | 'ping_days' | 'title', unknown>>) => {
    try { await api.patch(`/customers/${customerId}/journey/${s.id}`, body); await refresh(); } catch (e) { toastError(e); }
  };
  const addChild = async (s: JourneyStep) => {
    const title = prompt(`Thêm bước con cho "${s.title}":`)?.trim();
    if (!title) return;
    try { await api.post(`/customers/${customerId}/journey/${s.id}/children`, { title }); await refresh(); } catch (e) { toastError(e); }
  };
  const remove = async (s: JourneyStep) => {
    if (!confirm(`Bỏ "${s.title}"${hasChildren(steps.indexOf(s)) ? ' cùng toàn bộ bước con' : ''} khỏi hành trình của khách hàng này?`)) return;
    try { const r = await api.del<{ removed: number }>(`/customers/${customerId}/journey/${s.id}`); toast(`Đã bỏ ${r.removed} bước`); await refresh(); } catch (e) { toastError(e); }
  };
  const upload = async (s: JourneyStep, files: FileList | null) => {
    if (!files?.length) return;
    const fd = new FormData();
    Array.from(files).forEach((x) => fd.append('files', x));
    try { await api.post(`/customers/${customerId}/files?step=${s.id}`, fd); toast('Đã gắn tài liệu kết quả'); await refresh(); } catch (e) { toastError(e); }
  };
  const reset = async () => {
    if (!confirm('Xóa toàn bộ hành trình của khách hàng này (gồm trạng thái, người phụ trách, hạn của mọi bước)? Tài liệu đã gắn vẫn giữ ở mục Tài liệu.')) return;
    try { await api.del(`/customers/${customerId}/journey`); await refresh(); } catch (e) { toastError(e); }
  };

  return (
    <div className="stack">
      <div className="journey-phases">
        {progress.sections.map((sec) => {
          const pct = sec.total ? Math.round((sec.done / sec.total) * 100) : 0;
          const state = sec.total && sec.done === sec.total ? 'done' : sec.done || sec.doing ? 'cur' : 'todo';
          return (
            <button key={sec.id} className={`journey-phase ${state}`} onClick={() => { setF({ status: '', unit: '', mine: false, q: '' }); setCollapsed(new Set(steps.filter((s) => s.depth === 0 && s.id !== sec.id).map((s) => s.id))); }}>
              <b>{sec.title}</b>
              <div className="cust-bar"><div style={{ width: `${pct}%` }} /></div>
              <span className="muted small">{sec.done}/{sec.total} bước · {pct}%{sec.overdue ? <span className="overdue"> · {sec.overdue} trễ hạn</span> : null}</span>
            </button>
          );
        })}
      </div>
      <div className="filter-bar">
        <span className="small">Đang thực hiện: <b>{progress.current ? `${progress.current.code ?? ''} ${progress.current.title}` : 'Đã hoàn thành mọi bước'}</b></span>
        <div className="spacer" />
        <input className="filter-search" placeholder="Tìm bước…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select value={f.status} className={f.status ? 'filter-on' : ''} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Trạng thái: Tất cả</option>
          {(Object.keys(STEP_STATUS) as StepStatus[]).map((k) => <option key={k} value={k}>{STEP_STATUS[k].label}</option>)}
        </select>
        <select value={f.unit} className={f.unit ? 'filter-on' : ''} onChange={(e) => setF({ ...f, unit: e.target.value })}>
          <option value="">Đơn vị: Tất cả</option>
          {UNITS.map((u) => <option key={u}>{u}</option>)}
        </select>
        <label className="check small"><input type="checkbox" checked={f.mine} onChange={(e) => setF({ ...f, mine: e.target.checked })} /> Việc của tôi</label>
        {canReset && <button className="btn btn-subtle btn-sm" onClick={reset} data-tip="Xóa hành trình để áp dụng lại quy trình mẫu">Làm lại từ đầu</button>}
      </div>
      <div className="card table-wrap" style={{ padding: '4px 8px' }}>
        <table className="table journey-table">
          <thead><tr><th>Nội dung</th><th>Thực hiện</th><th>Phối hợp</th><th>Trạng thái</th><th>Người phụ trách</th><th>Hạn</th><th>Ping</th><th>Tài liệu kết quả</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {filtered && !filtered.length && <tr><td colSpan={9} className="muted center">Không có bước phù hợp</td></tr>}
            {visible.map((s) => {
              const i = steps.indexOf(s);
              if (s.depth === 0) {
                const sec = progress.sections.find((x) => x.id === s.id);
                return (
                  <tr key={s.id} className="j-section" onClick={() => toggle(s.id)}>
                    <td colSpan={canEdit ? 9 : 8}>{closed.has(s.id) ? <ChevronRight size={15} /> : <ChevronDown size={15} />} {s.code} {s.title}
                      {sec && <span className="muted small" style={{ fontWeight: 400 }}> · {sec.done}/{sec.total} bước</span>}</td>
                  </tr>
                );
              }
              const late = s.status !== 'done' && s.due_date && s.due_date < now;
              return (
                <tr key={s.id} className={`j-d${s.depth} ${s.status === 'done' ? 'j-done' : ''}`}>
                  <td className="j-title" style={{ paddingLeft: filtered ? 8 : 8 + (s.depth - 1) * 18 }}>
                    {!filtered && hasChildren(i) && s.depth === 1
                      ? <a onClick={() => toggle(s.id)}>{closed.has(s.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />} {s.code} {s.title}</a>
                      : <>{s.code ? `${s.code} ` : s.depth === 3 ? '– ' : ''}{s.title}</>}
                  </td>
                  <td>{s.unit && <span className="unit-chip">{s.unit}</span>}</td>
                  <td>{s.support && <span className="unit-chip">{s.support}</span>}</td>
                  <td>{canEdit
                    ? <select className={`j-status j-${s.status}`} value={s.status} onChange={(e) => patch(s, { status: e.target.value })} aria-label="Trạng thái">
                        {(Object.keys(STEP_STATUS) as StepStatus[]).map((k) => <option key={k} value={k}>{STEP_STATUS[k].label}</option>)}
                      </select>
                    : <span className={`lozenge lozenge-${STEP_STATUS[s.status].tone}`}>{STEP_STATUS[s.status].label}</span>}</td>
                  <td>{canEdit
                    ? <select value={s.assignee_id ?? ''} onChange={(e) => patch(s, { assignee_id: e.target.value || null })} aria-label="Người phụ trách">
                        <option value="">—</option>
                        {users?.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                      </select>
                    : <span className="small">{s.assignee_name}</span>}</td>
                  <td className={late ? 'overdue' : ''}>{canEdit
                    ? <input type="date" value={s.due_date ?? ''} onChange={(e) => patch(s, { due_date: e.target.value || null })} aria-label="Hạn" />
                    : <span className="small">{fmtDate(s.due_date)}</span>}</td>
                  <td>{canEdit
                    ? <select value={s.ping_days} onChange={(e) => patch(s, { ping_days: Number(e.target.value) })} aria-label="Ping"
                        data-tip="Nhắc người phụ trách qua chuông thông báo, mỗi ngày từ N ngày trước hạn cho tới khi kết thúc">
                        {data.ping_days.map((d) => <option key={d} value={d}>{d ? `${d} ngày` : 'Tắt'}</option>)}
                      </select>
                    : <span className="small muted">{s.ping_days ? `${s.ping_days} ngày` : ''}</span>}</td>
                  <td className="j-files">
                    {s.files.map((x) => <a key={x.id} className="small ellipsis" href={`/api/customers/${customerId}/files/${x.id}`} title={x.filename}>📎 {x.filename}</a>)}
                    {canEdit && <label className="small j-attach"><Paperclip size={12} /> Gắn file<input type="file" multiple hidden onChange={(e) => { upload(s, e.target.files); e.target.value = ''; }} /></label>}
                  </td>
                  {canEdit && <td className="nowrap">
                    {s.depth < 3 && <button className="icon-btn" aria-label="Thêm bước con" data-tip="Thêm bước con" onClick={() => addChild(s)}><Plus size={14} /></button>}
                    <button className="icon-btn" aria-label="Bỏ bước" data-tip={hasChildren(i) ? 'Bỏ bước cùng các bước con' : 'Bỏ bước'} onClick={() => remove(s)}><Trash2 size={14} /></button>
                  </td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
