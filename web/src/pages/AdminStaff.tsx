import { useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { api, refreshAll } from '../api';
import { hasPerm, useMe, useStaff } from '../hooks';
import type { StaffMember, StaffPosition } from '../types';
import { STAFF_POSITIONS } from '../util';
import { Empty, Modal, Spinner, toast, toastError } from '../components/ui';

type Draft = { id?: number; full_name: string; positions: StaffPosition[]; note: string };

/** Danh mục nhân sự dùng chung: người nào làm được vị trí nào (BA/PM, Dev, Tester, AM) — dùng để chọn nhân sự cho dự án. */
export default function AdminStaff() {
  const { data: me } = useMe();
  const { data: staff, isLoading } = useStaff();
  const [pos, setPos] = useState<StaffPosition | ''>('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Draft | null>(null);
  const canCreate = hasPerm(me, 'staff.create'), canEdit = hasPerm(me, 'staff.edit'), canDelete = hasPerm(me, 'staff.delete');

  const has = (s: StaffMember, p: string) => s.positions.split(',').includes(p);
  const list = (staff || []).filter((s) => (!pos || has(s, pos)) && (!q || s.full_name.toLowerCase().includes(q.toLowerCase())));

  const remove = async (s: StaffMember) => {
    if (!confirm(`Xóa ${s.full_name} khỏi danh mục? Dự án đã ghi tên người này vẫn giữ nguyên.`)) return;
    try { await api.del(`/staff/${s.id}`); toast('Đã xóa'); await refreshAll(); } catch (e) { toastError(e); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Danh mục nhân sự</h1>
        <div className="spacer" />
        {canCreate && <button className="btn btn-primary" onClick={() => setEditing({ full_name: '', positions: pos ? [pos] : [], note: '' })}>+ Thêm nhân sự</button>}
      </div>
      <p className="muted small">Danh sách dùng chung để chọn BA/PM, Dev, Tester, AM cho từng dự án (Cài đặt dự án → Thông tin chung). Một người có thể giữ nhiều vị trí. Đổi họ tên ở đây sẽ cập nhật luôn tên đó trong các dự án.</p>
      <div className="filter-bar">
        <div className="seg" role="group" aria-label="Lọc theo vị trí">
          <button className={!pos ? 'on' : ''} onClick={() => setPos('')}>Tất cả ({staff?.length ?? 0})</button>
          {STAFF_POSITIONS.map((p) => (
            <button key={p.key} className={pos === p.key ? 'on' : ''} onClick={() => setPos(p.key)}>
              {p.label} ({staff?.filter((s) => has(s, p.key)).length ?? 0})
            </button>
          ))}
        </div>
        <input className="filter-search" placeholder="Tìm theo tên…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {isLoading ? <Spinner /> : !list.length ? <Empty title="Chưa có ai trong danh mục" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Họ tên</th>{STAFF_POSITIONS.map((p) => <th key={p.key} className="center">{p.label}</th>)}<th>Ghi chú</th>{(canEdit || canDelete) && <th />}</tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.full_name}</b></td>
                  {STAFF_POSITIONS.map((p) => <td key={p.key} className="center">{has(s, p.key) ? '✓' : ''}</td>)}
                  <td className="muted">{s.note}</td>
                  {(canEdit || canDelete) && (
                    <td className="num nowrap">
                      {canEdit && <button className="icon-btn" aria-label={`Sửa ${s.full_name}`} data-tip="Sửa"
                        onClick={() => setEditing({ id: s.id, full_name: s.full_name, positions: s.positions.split(',').filter(Boolean) as StaffPosition[], note: s.note || '' })}><Pencil size={15} /></button>}
                      {canDelete && <button className="icon-btn" aria-label={`Xóa ${s.full_name}`} data-tip="Xóa" onClick={() => remove(s)}><Trash2 size={15} /></button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <StaffModal draft={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StaffModal({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const [d, setD] = useState(draft);
  const toggle = (p: StaffPosition) => setD({ ...d, positions: d.positions.includes(p) ? d.positions.filter((x) => x !== p) : [...d.positions, p] });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const body = { full_name: d.full_name, positions: d.positions, note: d.note };
      if (d.id) await api.patch(`/staff/${d.id}`, body); else await api.post('/staff', body);
      toast(d.id ? 'Đã lưu' : 'Đã thêm vào danh mục');
      await refreshAll();
      onClose();
    } catch (err) { toastError(err); }
  };
  return (
    <Modal title={d.id ? 'Sửa nhân sự' : 'Thêm nhân sự'} onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" form="staff-form">{d.id ? 'Lưu' : 'Thêm'}</button>
    </>}>
      <form id="staff-form" className="stack" onSubmit={submit}>
        <label className="field"><span>Họ tên *</span>
          <input autoFocus required value={d.full_name} onChange={(e) => setD({ ...d, full_name: e.target.value })} placeholder="VD: Nguyễn Văn A" /></label>
        <div className="field"><span>Vị trí * <small className="muted">(chọn một hoặc nhiều)</small></span>
          <div className="row gap-sm" style={{ flexWrap: 'wrap' }}>
            {STAFF_POSITIONS.map((p) => (
              <label key={p.key} className="check"><input type="checkbox" checked={d.positions.includes(p.key)} onChange={() => toggle(p.key)} /> {p.label}</label>
            ))}
          </div>
        </div>
        <label className="field"><span>Ghi chú</span>
          <input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="VD: TTS, CTV…" /></label>
      </form>
    </Modal>
  );
}
