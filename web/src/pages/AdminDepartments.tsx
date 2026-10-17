import { useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { api, refreshAll } from '../api';
import { hasPerm, useDepartments, useMe } from '../hooks';
import type { Department } from '../types';
import { Empty, Modal, Spinner, toast, toastError } from '../components/ui';

/** Danh mục phòng ban: gán cho tài khoản (Quản trị → Người dùng); tự hiện cạnh Người thực hiện / phối hợp trong hành trình khách hàng */
export default function AdminDepartments() {
  const { data: me } = useMe();
  const { data: list, isLoading } = useDepartments();
  const [editing, setEditing] = useState<Partial<Department> | null>(null);
  const canCreate = hasPerm(me, 'department.create'), canEdit = hasPerm(me, 'department.edit'), canDelete = hasPerm(me, 'department.delete');
  const remove = async (d: Department) => {
    if (!confirm(`Xóa phòng ban ${d.code} · ${d.name}?`)) return;
    try { await api.del(`/departments/${d.id}`); toast('Đã xóa'); await refreshAll(); } catch (e) { toastError(e); }
  };
  return (
    <div className="page">
      <div className="page-head">
        <h1>Danh mục phòng ban</h1>
        <div className="spacer" />
        {canCreate && <button className="btn btn-primary" onClick={() => setEditing({})}>+ Thêm phòng ban</button>}
      </div>
      <p className="muted small">Gán phòng ban cho từng tài khoản ở Quản trị → Người dùng. Trong hành trình khách hàng, mã phòng ban hiện tự động cạnh tên Người thực hiện và Người phối hợp.</p>
      {isLoading ? <Spinner /> : !list?.length ? <Empty title="Chưa có phòng ban" /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Mã</th><th>Tên phòng ban</th><th className="num">Số tài khoản</th>{(canEdit || canDelete) && <th />}</tr></thead>
          <tbody>{list.map((d) => (
            <tr key={d.id}>
              <td><span className="unit-chip">{d.code}</span></td>
              <td>{d.name}</td>
              <td className="num">{d.user_count || ''}</td>
              {(canEdit || canDelete) && <td className="num nowrap">
                {canEdit && <button className="icon-btn" aria-label={`Sửa ${d.name}`} data-tip="Sửa" onClick={() => setEditing(d)}><Pencil size={15} /></button>}
                {canDelete && <button className="icon-btn" aria-label={`Xóa ${d.name}`} data-tip="Xóa" onClick={() => remove(d)}><Trash2 size={15} /></button>}
              </td>}
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {editing && <DeptModal d={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DeptModal({ d, onClose }: { d: Partial<Department>; onClose: () => void }) {
  const [code, setCode] = useState(d.code ?? '');
  const [name, setName] = useState(d.name ?? '');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (d.id) await api.patch(`/departments/${d.id}`, { code, name }); else await api.post('/departments', { code, name });
      toast('Đã lưu');
      await refreshAll();
      onClose();
    } catch (err) { toastError(err); }
  };
  return (
    <Modal title={d.id ? 'Sửa phòng ban' : 'Thêm phòng ban'} width={460} onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" form="dept-form">{d.id ? 'Lưu' : 'Thêm'}</button>
    </>}>
      <form id="dept-form" className="stack" onSubmit={submit}>
        <label className="field"><span>Mã phòng ban * <small className="muted">(dùng trong quy trình, VD: KD, BA, DEV)</small></span>
          <input autoFocus required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></label>
        <label className="field"><span>Tên phòng ban *</span><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Kinh doanh" /></label>
      </form>
    </Modal>
  );
}
