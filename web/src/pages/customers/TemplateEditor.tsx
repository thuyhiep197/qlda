import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { api } from '../../api';
import type { SalesProject } from '../../types';
import { Spinner, toast, toastError } from '../../components/ui';
import { MAX_DEPTH, refreshCustomer } from './JourneyPane';

interface Row { key: number; depth: number; code: string; title: string; unit: string; support: string; on: boolean }

/** Bước và các bước con của nó (vị trí trong danh sách) */
function branchEnd(rows: Row[], i: number) {
  let j = i;
  while (rows[j + 1] && rows[j + 1].depth > rows[i].depth) j++;
  return j;
}

/**
 * Áp dụng quy trình mẫu cho một dự án của khách hàng: xem trước toàn bộ quy trình I–IV,
 * bỏ chọn nhánh không áp dụng (bỏ cha thì bỏ cả con), thêm bước mới, rồi Lưu để tạo hành trình.
 */
export default function TemplateEditor({ customerId, sp, onClose }: { customerId: number; sp: SalesProject; onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState<{ key: number; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get<{ rows: Omit<Row, 'key' | 'on'>[] }>('/customers/journey-template')
      .then((r) => setRows(r.rows.map((x, i) => ({ ...x, key: i + 1, on: true }))))
      .catch(toastError);
  }, []);
  if (!rows) return <Spinner />;

  // Bỏ chọn một bước → bỏ cả nhánh; chọn lại → chọn cả nhánh và các bước cha
  const toggle = (i: number) => {
    const on = !rows[i].on;
    const next = rows.map((r) => ({ ...r }));
    for (let j = i; j <= branchEnd(rows, i); j++) next[j].on = on;
    if (on) { let d = rows[i].depth; for (let j = i - 1; j >= 0 && d > 0; j--) if (next[j].depth < d) { next[j].on = true; d = next[j].depth; } }
    setRows(next);
  };
  const saveAdd = () => {
    if (!adding) return;
    const title = adding.title.trim();
    if (!title) { setAdding(null); return; }
    const i = rows.findIndex((r) => r.key === adding.key);
    const end = branchEnd(rows, i);
    const key = Math.max(...rows.map((r) => r.key)) + 1;
    setRows([...rows.slice(0, end + 1), { key, depth: rows[i].depth + 1, code: '', title, unit: '', support: '', on: true }, ...rows.slice(end + 1)]);
    setAdding({ key: rows[i].key, title: '' });
  };
  const save = async () => {
    const chosen = rows.filter((r) => r.on);
    if (!chosen.length) { toastError('Chưa chọn bước nào'); return; }
    setBusy(true);
    try {
      await api.post(`/customers/${customerId}/projects/${sp.id}/journey/apply`, { rows: chosen.map(({ depth, code, title, unit, support }) => ({ depth, code, title, unit, support })) });
      toast(`Đã áp dụng quy trình (${chosen.length} bước)`);
      await refreshCustomer(customerId);
      onClose();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  // Ẩn bước con của các bước đang thu gọn
  const visible: { r: Row; i: number }[] = [];
  let hideBelow: number | null = null;
  rows.forEach((r, i) => {
    if (hideBelow !== null && r.depth > hideBelow) return;
    hideBelow = closed.has(r.key) ? r.depth : null;
    visible.push({ r, i });
  });
  const hasChildren = (i: number) => !!rows[i + 1] && rows[i + 1].depth > rows[i].depth;
  const count = rows.filter((r) => r.on).length;

  return (
    <>
      <div className="cw-toolbar">
        <div className="grow"><b>Áp dụng quy trình mẫu</b> <span className="muted small">· Bỏ chọn các nhánh không áp dụng, bấm + để thêm bước; Lưu để áp dụng cho dự án</span></div>
        <span className="muted small">Đã chọn {count}/{rows.length} bước</span>
        <button className="btn" onClick={onClose} disabled={busy}>Hủy</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu và áp dụng'}</button>
      </div>
      <div className="cw-scroll">
        <table className="table journey-table tpl-table">
          <thead><tr><th>Nội dung</th><th>Phòng thực hiện</th><th>Phòng phối hợp</th></tr></thead>
          <tbody>{visible.map(({ r, i }) => (
            <TplRow key={r.key} r={r} parent={hasChildren(i)} closed={closed.has(r.key)}
              onFold={() => { const n = new Set(closed); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); setClosed(n); }}
              onToggle={() => toggle(i)} onAdd={() => { const n = new Set(closed); n.delete(r.key); setClosed(n); setAdding({ key: r.key, title: '' }); }}
              adding={adding?.key === r.key ? adding.title : null} setAdding={(t) => setAdding(t === null ? null : { key: r.key, title: t })} saveAdd={saveAdd} />
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

function TplRow({ r, parent, closed, onFold, onToggle, onAdd, adding, setAdding, saveAdd }: {
  r: Row; parent: boolean; closed: boolean; onFold: () => void; onToggle: () => void; onAdd: () => void;
  adding: string | null; setAdding: (t: string | null) => void; saveAdd: () => void;
}) {
  return (
    <>
      <tr className={`${r.depth === 0 ? 'j-section' : `j-d${r.depth}`} ${r.on ? '' : 'tpl-off'}`}>
        <td style={{ paddingLeft: 8 + r.depth * 18 }}>
          <span className="row gap-xs">
            {parent ? <button className="cw-caret" aria-label={closed ? 'Mở rộng' : 'Thu gọn'} onClick={onFold}>{closed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</button>
              : <span className="cw-caret-space" />}
            <input type="checkbox" checked={r.on} onChange={onToggle} aria-label={`Áp dụng ${r.title}`} />
            <span className={r.depth === 0 ? 'strong' : ''}>{r.code ? `${r.code}${r.depth === 0 ? '.' : ''} ` : r.depth >= 3 ? '– ' : ''}{r.title}</span>
            {r.on && r.depth < MAX_DEPTH && <button className="icon-btn j-plus" aria-label="Thêm bước con" data-tip="Thêm bước con" onClick={onAdd}><Plus size={14} /></button>}
          </span>
        </td>
        <td>{r.unit && <span className="unit-chip planned">{r.unit}</span>}</td>
        <td>{r.support && <span className="unit-chip planned">{r.support}</span>}</td>
      </tr>
      {adding !== null && (
        <tr className="j-add-row">
          <td colSpan={3} style={{ paddingLeft: 8 + (r.depth + 1) * 18 }}>
            <input autoFocus value={adding} placeholder={`Tên bước mới trong "${r.title}" — Enter để thêm, Esc để xong`}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveAdd(); if (e.key === 'Escape') setAdding(null); }} />
            <button className="btn btn-primary btn-sm" onClick={saveAdd}>Thêm</button>
            <button className="btn btn-subtle btn-sm" onClick={() => setAdding(null)}>Xong</button>
          </td>
        </tr>
      )}
    </>
  );
}
