import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronRight, MessageSquare, Paperclip, Plus } from 'lucide-react';
import { api, queryClient } from '../../api';
import { hasPerm, useDepartments, useMe } from '../../hooks';
import type { JourneyData, JourneyStep, SalesProject, StepStatus } from '../../types';
import { filterSteps, overdueDays } from '../../customer-filter';
import { fmtDate, today } from '../../util';
import { Empty, Spinner, toastError } from '../../components/ui';
import TemplateEditor from './TemplateEditor';
import { PersonChip, UserPickerPopover } from '../../components/UserPicker';

export const STEP_STATUS: Record<StepStatus, { label: string; tone: string }> = {
  todo: { label: 'Chưa bắt đầu', tone: 'default' }, doing: { label: 'Đang thực hiện', tone: 'blue' }, done: { label: 'Hoàn thành', tone: 'green' },
};
/** Số cấp tối đa (khớp server/src/journey.ts) */
export const MAX_DEPTH = 6;
export const UNITS = ['KD', 'AM', 'BA', 'DEV', 'HC', 'BGĐ', 'Đối tác'];

export const refreshCustomer = (customerId: number) => Promise.all([
  queryClient.invalidateQueries({ queryKey: ['journey'] }),
  queryClient.invalidateQueries({ queryKey: ['sales-project'] }),
  queryClient.invalidateQueries({ queryKey: ['customer', String(customerId)] }),
  queryClient.invalidateQueries({ queryKey: ['step'] }),
  queryClient.invalidateQueries({ queryKey: ['customers'] }),
]);

/** Cột giữa: hành trình bán hàng của một dự án của khách hàng theo quy trình I–IV. Bấm một bước để xem Trao đổi và Tài liệu của bước ở cột phải. */
export default function JourneyPane({ customerId, sp, selected, onSelect }: { customerId: number; sp: SalesProject; selected: number | null; onSelect: (id: number | null) => void }) {
  const { data: me } = useMe();
  const { data: departments } = useDepartments();
  const canEdit = hasPerm(me, 'customer.edit');
  const { data, isLoading } = useQuery<JourneyData>({ queryKey: ['journey', sp.id], queryFn: () => api.get(`/customers/${customerId}/projects/${sp.id}/journey`) });
  const [collapsed, setCollapsed] = useState<Set<number> | null>(null);
  const [f, setF] = useState({ status: '', unit: '', mine: false, q: '' });
  const [applying, setApplying] = useState(false);
  const [picking, setPicking] = useState<{ id: number; field: 'assignee' | 'supporters' } | null>(null);
  // Thêm bước (issue) mới ngay trong bảng: bước con của phần / giai đoạn / đầu việc đang chọn
  const [adding, setAdding] = useState<{ parent: number; title: string } | null>(null);
  const now = today();

  if (isLoading || !data) return <Spinner />;
  // Chưa có hành trình: Áp dụng quy trình mẫu → xem trước, bỏ nhánh không áp dụng / thêm bước, rồi Lưu để áp dụng
  if (!data.steps.length) {
    if (applying) return <TemplateEditor customerId={customerId} sp={sp} onClose={() => setApplying(false)} />;
    return <div className="cw-scroll"><Empty title="Dự án chưa có hành trình">
      <p className="muted">Hành trình theo quy trình I. Giải pháp → II. Hợp đồng → III. Triển khai → IV. Nghiệm thu – Thanh toán (có sẵn phòng thực hiện và phối hợp).
        Trước khi lưu có thể bỏ các nhánh không áp dụng và thêm bước mới.</p>
      {canEdit && <button className="btn btn-primary" onClick={() => setApplying(true)}>Áp dụng quy trình mẫu</button>}
    </Empty></div>;
  }

  const { steps, progress } = data;
  const sectionOf = (id: number | null | undefined) => { let sec = steps[0]?.id; for (const s of steps) { if (s.depth === 0) sec = s.id; if (s.id === id) return sec; } return null; };
  const openSec = sectionOf(selected) ?? sectionOf(progress.current?.id) ?? steps[0]?.id;
  const closed = collapsed ?? new Set(steps.filter((s) => s.depth === 0 && s.id !== openSec).map((s) => s.id));
  const toggle = (id: number) => { const n = new Set(closed); if (n.has(id)) n.delete(id); else n.add(id); setCollapsed(n); };
  // Lọc theo phòng: phòng của người được giao, chưa giao thì theo quy trình mẫu; "Việc của tôi": thực hiện hoặc phối hợp
  const eff = steps.map((s) => ({ ...s, unit: s.assignee_dept ?? s.unit, support: s.supporters.length ? s.supporters.map((x) => x.dept).filter(Boolean).join('+') : s.support,
    assignee_id: f.mine && s.supporters.some((x) => x.id === me?.id) ? me?.id ?? null : s.assignee_id }));
  const filteredEff = filterSteps(eff, { ...f, mine: f.mine ? me?.id ?? null : null });
  const filtered = filteredEff && filteredEff.map((x) => steps.find((s) => s.id === x.id)!);
  const assign = async (s: JourneyStep, body: Record<string, unknown>) => {
    try { await api.patch(`/customers/${customerId}/journey/${s.id}`, body); await refreshCustomer(customerId); } catch (e) { toastError(e); }
  };
  const cell = (s: JourneyStep, field: 'assignee' | 'supporters') => {
    const people = field === 'assignee' ? (s.assignee_id ? [{ id: s.assignee_id, full_name: s.assignee_name ?? '', dept: s.assignee_dept }] : []) : s.supporters;
    const planned = field === 'assignee' ? s.unit : s.support;
    const open = picking?.id === s.id && picking.field === field;
    return (
      <td className={`j-person ${canEdit ? 'editable' : ''}`} onClick={(e) => { if (!canEdit) return; e.stopPropagation(); setPicking(open ? null : { id: s.id, field }); }}>
        {people.length ? people.map((p) => <PersonChip key={p.id} name={p.full_name} dept={p.dept} />)
          : planned ? <span className="unit-chip planned" data-tip="Phòng theo quy trình mẫu — chưa giao người">{planned}</span>
          : canEdit ? <span className="j-add">+ Giao</span> : null}
        {open && <UserPickerPopover value={people.map((p) => p.id)} multi={field === 'supporters'} prefer={planned} onClose={() => setPicking(null)}
          onChange={(ids) => assign(s, field === 'assignee' ? { assignee_id: ids[0] ?? null } : { supporter_ids: ids })} />}
      </td>
    );
  };
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
  const startAdd = (parent: JourneyStep) => {
    if (closed.has(parent.id)) { const n = new Set(closed); n.delete(parent.id); setCollapsed(n); }
    setAdding({ parent: parent.id, title: '' });
  };
  const saveAdd = async () => {
    if (!adding?.title.trim()) { setAdding(null); return; }
    try {
      const r = await api.post<{ id: number }>(`/customers/${customerId}/journey/${adding.parent}/children`, { title: adding.title.trim() });
      setAdding(null);
      await refreshCustomer(customerId);
      onSelect(r.id);
    } catch (e) { toastError(e); }
  };
  // Dòng nhập nằm sau bước con cuối cùng đang hiện của bước cha
  const addAfter = (() => {
    if (!adding) return null;
    const i = visible.findIndex((x) => x.id === adding.parent);
    if (i < 0) return null;
    let j = i;
    while (visible[j + 1] && visible[j + 1].depth > visible[i].depth) j++;
    return visible[j].id;
  })();
  const parentOf = adding ? steps.find((x) => x.id === adding.parent) : null;
  const addRow = adding && parentOf && (
    <tr className="j-add-row">
      <td colSpan={6} style={{ paddingLeft: 8 + parentOf.depth * 18 }}>
        <input autoFocus value={adding.title} placeholder={`Tên bước mới trong "${parentOf.code ? `${parentOf.code}. ` : ''}${parentOf.title}" — Enter để lưu, Esc để hủy`}
          onChange={(e) => setAdding({ ...adding, title: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') saveAdd(); if (e.key === 'Escape') setAdding(null); }}
          onBlur={() => { if (!adding.title.trim()) setAdding(null); }} />
        <button className="btn btn-primary btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={saveAdd}>Thêm</button>
        <button className="btn btn-subtle btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={() => setAdding(null)}>Hủy</button>
      </td>
    </tr>
  );
  const plus = (s: JourneyStep) => canEdit && !filtered && s.depth < MAX_DEPTH && (
    <button className="icon-btn j-plus" aria-label="Thêm bước con" data-tip={s.depth === 0 ? 'Thêm giai đoạn' : 'Thêm bước con'}
      onClick={(e) => { e.stopPropagation(); startAdd(s); }}><Plus size={14} /></button>
  );

  return (
    <>

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
        <select value={f.unit} className={f.unit ? 'filter-on' : ''} onChange={(e) => setF({ ...f, unit: e.target.value })} aria-label="Lọc phòng ban">
          <option value="">Mọi phòng ban</option>
          {(departments?.map((d) => d.code) ?? UNITS).map((u) => <option key={u}>{u}</option>)}
        </select>
        <label className="check small"><input type="checkbox" checked={f.mine} onChange={(e) => setF({ ...f, mine: e.target.checked })} /> Việc của tôi</label>
      </div>
      <div className="cw-scroll">
        <table className="table journey-table">
          <thead><tr><th>Nội dung</th><th>Người thực hiện</th><th>Người phối hợp</th><th>Trạng thái</th><th>Hạn</th><th /></tr></thead>
          <tbody>
            {filtered && !filtered.length && <tr><td colSpan={6} className="muted center">Không có bước phù hợp</td></tr>}
            {visible.map((s) => <Fragment key={s.id}>{(() => {
              if (s.depth === 0) {
                const sec = progress.sections.find((x) => x.id === s.id);
                return (
                  <tr className="j-section" onClick={() => toggle(s.id)}>
                    <td colSpan={6}>{closed.has(s.id) ? <ChevronRight size={15} /> : <ChevronDown size={15} />} {s.code}. {s.title}
                      {sec && <span className="muted small" style={{ fontWeight: 400 }}> · {sec.done}/{sec.total} bước</span>}
                      {!!sec?.overdue && <span className="lozenge lozenge-red j-late-badge"><AlertTriangle size={11} /> {sec.overdue} việc quá hạn</span>}
                      <span className="j-section-plus">{plus(s)}</span></td>
                  </tr>
                );
              }
              const late = overdueDays(s.due_date, s.status, now);
              return (
                <tr className={`j-d${s.depth} click-row ${s.status === 'done' ? 'j-done' : ''} ${late ? 'j-late' : ''} ${selected === s.id ? 'j-selected' : ''}`} onClick={() => onSelect(s.id)}>
                  <td className="j-title" style={{ paddingLeft: filtered ? 8 : 8 + (s.depth - 1) * 18 }}>
                    {!filtered && s.depth === 1 && hasChildren(s)
                      ? <span onClick={(e) => { e.stopPropagation(); toggle(s.id); }} className="j-toggle">{closed.has(s.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span> : null}
                    {s.code ? `${s.code} ` : s.depth >= 3 ? '– ' : ''}{s.title}{plus(s)}
                  </td>
                  {cell(s, 'assignee')}
                  {cell(s, 'supporters')}
                  <td className="nowrap"><span className={`lozenge lozenge-${STEP_STATUS[s.status].tone}`}>{STEP_STATUS[s.status].label}</span>
                    {late > 0 && <span className="lozenge lozenge-red j-late-badge"><AlertTriangle size={11} /> Quá hạn {late} ngày</span>}</td>
                  <td className={`small nowrap ${late ? 'overdue strong' : 'muted'}`}>{s.due_date ? fmtDate(s.due_date) : ''}</td>
                  <td className="nowrap muted small">
                    {s.talk_count > 0 && <span data-tip="Trao đổi"><MessageSquare size={12} /> {s.talk_count} </span>}
                    {s.files.length > 0 && <span data-tip="Tài liệu kết quả"><Paperclip size={12} /> {s.files.length}</span>}
                  </td>
                </tr>
              );
            })()}{addAfter === s.id && addRow}</Fragment>)}
          </tbody>
        </table>
      </div>
    </>
  );
}
