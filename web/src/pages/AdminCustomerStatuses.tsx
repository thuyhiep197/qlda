import { useRef, useState, type FormEvent } from 'react';
import { Check, GripVertical, Pencil, X } from 'lucide-react';
import { api, queryClient } from '../api';
import { hasPerm, useCustomerStatuses, useMe } from '../hooks';
import type { CustomerStatus } from '../types';
import { Spinner, toast, toastError } from '../components/ui';
import { moveItem } from '../reorder';

const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['customer-statuses'] }), queryClient.invalidateQueries({ queryKey: ['customers'] })]);

/**
 * Danh mục Tình trạng khách hàng: thêm, sửa tên, ngừng / dùng lại; kéo thả dòng để sắp xếp thứ tự hiển thị
 * (thứ tự dùng ở ô chọn tình trạng của khách hàng và Dashboard). Tình trạng ngừng sử dụng không chọn được nữa,
 * khách hàng đang ở tình trạng đó giữ nguyên.
 */
export default function AdminCustomerStatuses() {
  const { data: me } = useMe();
  const { data: list, isLoading } = useCustomerStatuses();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const [order, setOrder] = useState<CustomerStatus[] | null>(null);
  // Thứ tự đang kéo (ref: thả ngay sau khi rê vẫn lấy đúng thứ tự mới nhất)
  const orderRef = useRef<CustomerStatus[] | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const canCreate = hasPerm(me, 'cstatus.create'), canEdit = hasPerm(me, 'cstatus.edit'), canStop = hasPerm(me, 'cstatus.delete');
  if (isLoading || !list) return <div className="page"><Spinner /></div>;
  const rows = order ?? list;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    // Chưa nhập tên: đưa con trỏ vào ô tên và nhắc (nút Thêm luôn bấm được)
    if (!name.trim()) { nameRef.current?.focus(); toastError(new Error('Nhập tên tình trạng mới vào ô bên trái rồi bấm Thêm')); return; }
    try { await api.post('/customer-statuses', { name }); setName(''); toast('Đã thêm — kéo dòng để đặt vị trí hiển thị'); await refresh(); } catch (err) { toastError(err); }
  };
  const rename = async () => {
    if (!editing) return;
    try { await api.patch(`/customer-statuses/${editing.id}`, { name: editing.name }); setEditing(null); toast('Đã lưu'); await refresh(); } catch (err) { toastError(err); }
  };
  const toggle = async (s: CustomerStatus) => {
    if (s.is_active && !confirm(`Ngừng sử dụng "${s.name}"? Không chọn được tình trạng này cho khách hàng nữa; ${s.customer_count} khách hàng đang ở tình trạng này giữ nguyên.`)) return;
    try { await api.patch(`/customer-statuses/${s.id}`, { is_active: !s.is_active }); await refresh(); } catch (err) { toastError(err); }
  };
  // Kéo thả: đổi chỗ khi rê qua dòng khác, thả thì lưu thứ tự
  const over = (target: number) => {
    const cur = orderRef.current ?? list;
    const from = cur.findIndex((x) => x.id === dragRef.current);
    if (from < 0 || dragRef.current === target) return;
    orderRef.current = moveItem(cur, from, cur.findIndex((x) => x.id === target));
    setOrder(orderRef.current);
  };
  const drop = async () => {
    const final = orderRef.current;
    dragRef.current = null; orderRef.current = null; setDragId(null);
    if (!final || final.map((x) => x.id).join() === list.map((x) => x.id).join()) { setOrder(null); return; }
    try { await api.put('/customer-statuses/order', { ids: final.map((x) => x.id) }); await refresh(); toast('Đã lưu thứ tự'); } catch (err) { toastError(err); } finally { setOrder(null); }
  };

  return (
    <div className="page narrow-page">
      <div className="page-head"><h1>Tình trạng khách hàng</h1></div>
      <p className="muted small">Tình trạng chọn cho khách hàng. {canEdit ? 'Kéo biểu tượng ⋮⋮ ở đầu dòng để sắp xếp thứ tự hiển thị. ' : ''}Tình trạng ngừng sử dụng không chọn được nữa; khách hàng đang ở tình trạng đó giữ nguyên.</p>
      {canCreate && (
        <form className="row gap-sm mb-sm" onSubmit={add}>
          <input ref={nameRef} className="grow" placeholder="Nhập tên tình trạng mới, VD: Tạm dừng" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          <button className="btn btn-primary">+ Thêm</button>
        </form>
      )}
      <table className="table status-catalog">
        <thead><tr><th style={{ width: 32 }} /><th className="num" style={{ width: 40 }}>STT</th><th>Tình trạng</th><th className="num">Số khách hàng</th><th>Trạng thái</th><th className="num">Thao tác</th></tr></thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={s.id} draggable={canEdit && !editing} className={`${dragId === s.id ? 'dragging' : ''} ${s.is_active ? '' : 'inactive'}`}
              onDragStart={() => { dragRef.current = s.id; setDragId(s.id); }} onDragOver={(e) => { e.preventDefault(); over(s.id); }} onDrop={(e) => { e.preventDefault(); void drop(); }} onDragEnd={() => dragRef.current !== null && void drop()}>
              <td className="drag-handle">{canEdit && <GripVertical size={15} className="muted" data-tip="Kéo để sắp xếp" />}</td>
              <td className="num muted">{i + 1}</td>
              <td>{editing?.id === s.id
                ? <div className="row gap-xs"><input autoFocus value={editing.name} maxLength={100} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') void rename(); if (e.key === 'Escape') setEditing(null); }} />
                    <button className="icon-btn" aria-label="Lưu" data-tip="Lưu" onClick={rename}><Check size={15} /></button>
                    <button className="icon-btn" aria-label="Hủy" data-tip="Hủy" onClick={() => setEditing(null)}><X size={15} /></button></div>
                : <span className="lozenge lozenge-default">{s.name}</span>}</td>
              <td className="num">{s.customer_count || <span className="muted">—</span>}</td>
              <td>{s.is_active ? <span className="lozenge lozenge-green">Đang sử dụng</span> : <span className="lozenge lozenge-red">Ngừng sử dụng</span>}</td>
              <td className="num nowrap">
                {canEdit && editing?.id !== s.id && <button className="icon-btn" aria-label="Sửa tên" data-tip="Sửa tên" onClick={() => setEditing({ id: s.id, name: s.name })}><Pencil size={14} /></button>}
                {canStop && <button className="btn btn-subtle btn-sm" onClick={() => toggle(s)}>{s.is_active ? 'Ngừng sử dụng' : 'Dùng lại'}</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
