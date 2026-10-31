import { useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { api, refreshAll } from '../api';
import { hasPerm, useMe, useProvinces, useWards } from '../hooks';
import type { GeoProvince, GeoWard } from '../types';
import { fold } from '../customer-filter';
import { Empty, Modal, Spinner, toast, toastError } from '../components/ui';
import { HelpButton } from '../help/HelpMenu';

type Edit = { kind: 'province' | 'ward'; code: string; name: string; isNew: boolean };

/** Danh mục địa chính (Danh mục dùng chung): tỉnh/thành phố bên trái, phường/xã của tỉnh đang chọn bên phải */
export default function AdminGeo() {
  const { data: me } = useMe();
  const { data: provinces, isLoading } = useProvinces();
  const [sel, setSel] = useState('');
  const [pq, setPq] = useState('');
  const [wq, setWq] = useState('');
  const [edit, setEdit] = useState<Edit | null>(null);
  const province = provinces?.find((p) => p.code === sel) ?? provinces?.[0];
  const { data: wards, isLoading: loadingWards } = useWards(province?.code);
  const canCreate = hasPerm(me, 'geo.create'), canEdit = hasPerm(me, 'geo.edit'), canDelete = hasPerm(me, 'geo.delete');
  const pList = (provinces || []).filter((p) => !pq || fold(p.name).includes(fold(pq)));
  const wList = (wards || []).filter((w) => !wq || fold(w.name).includes(fold(wq)) || w.code.includes(wq));
  const totalWards = provinces?.reduce((n, p) => n + p.ward_count, 0) ?? 0;

  const remove = async (kind: 'province' | 'ward', x: GeoProvince | GeoWard) => {
    if (!confirm(`Xóa ${x.name} khỏi Danh mục địa chính?`)) return;
    try { await api.del(`/geo/${kind === 'province' ? 'provinces' : 'wards'}/${x.code}`); toast('Đã xóa'); await refreshAll(); } catch (e) { toastError(e); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Danh mục địa chính <HelpButton /></h1>
        <span className="muted small">{provinces?.length ?? 0} tỉnh/thành phố · {totalWards.toLocaleString('vi')} phường/xã</span>
        <div className="spacer" />
        {canCreate && <button className="btn" onClick={() => setEdit({ kind: 'province', code: '', name: '', isNew: true })}>+ Thêm tỉnh/thành phố</button>}
        {canCreate && province && <button className="btn btn-primary" onClick={() => setEdit({ kind: 'ward', code: '', name: '', isNew: true })}>+ Thêm phường/xã</button>}
      </div>
      <p className="muted small">Đơn vị hành chính 2 cấp (từ 01/7/2025), dùng để chọn Tỉnh thành, Phường/Xã cho khách hàng. Dữ liệu nạp sẵn theo Nghị quyết 388/NQ-UBTVQH16; khi có thay đổi địa giới, quản trị viên cập nhật tại đây.</p>
      {isLoading ? <Spinner /> : (
        <div className="geo-layout">
          <div className="card geo-side">
            <input className="filter-search" style={{ width: '100%' }} placeholder="Tìm tỉnh/thành phố…" value={pq} onChange={(e) => setPq(e.target.value)} />
            <div className="geo-list">
              {pList.map((p) => (
                <button key={p.code} className={`geo-item ${province?.code === p.code ? 'active' : ''}`} onClick={() => { setSel(p.code); setWq(''); }}>
                  <span className="grow ellipsis">{p.name}</span><span className="muted small">{p.ward_count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="card" style={{ minWidth: 0 }}>
            {province && (
              <div className="card-head">
                <h3>{province.name} <span className="muted small">· mã {province.code}</span></h3>
                {canEdit && <button className="icon-btn" aria-label={`Đổi tên ${province.name}`} data-tip="Đổi tên" onClick={() => setEdit({ kind: 'province', code: province.code, name: province.name, isNew: false })}><Pencil size={15} /></button>}
                {canDelete && <button className="icon-btn" aria-label={`Xóa ${province.name}`} data-tip="Xóa" onClick={() => remove('province', province)}><Trash2 size={15} /></button>}
              </div>
            )}
            <div className="filter-bar">
              <input className="filter-search" placeholder="Tìm phường/xã hoặc mã…" value={wq} onChange={(e) => setWq(e.target.value)} />
              <span className="muted small">{wList.length}/{wards?.length ?? 0} phường/xã</span>
            </div>
            {loadingWards ? <Spinner /> : !wList.length ? <Empty title="Không có phường/xã phù hợp" /> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Mã</th><th>Tên phường/xã</th><th className="num">Khách hàng</th>{(canEdit || canDelete) && <th />}</tr></thead>
                <tbody>{wList.map((w) => (
                  <tr key={w.code}>
                    <td className="muted small" style={{ fontVariantNumeric: 'tabular-nums' }}>{w.code}</td>
                    <td>{w.name}</td>
                    <td className="num">{w.customer_count || ''}</td>
                    {(canEdit || canDelete) && <td className="num nowrap">
                      {canEdit && <button className="icon-btn" aria-label={`Đổi tên ${w.name}`} data-tip="Đổi tên" onClick={() => setEdit({ kind: 'ward', code: w.code, name: w.name, isNew: false })}><Pencil size={14} /></button>}
                      {canDelete && <button className="icon-btn" aria-label={`Xóa ${w.name}`} data-tip="Xóa" onClick={() => remove('ward', w)}><Trash2 size={14} /></button>}
                    </td>}
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </div>
      )}
      {edit && <GeoModal edit={edit} provinceCode={province?.code} provinceName={province?.name} onClose={() => setEdit(null)} />}
    </div>
  );
}

function GeoModal({ edit, provinceCode, provinceName, onClose }: { edit: Edit; provinceCode?: string; provinceName?: string; onClose: () => void }) {
  const [code, setCode] = useState(edit.code);
  const [name, setName] = useState(edit.name);
  const label = edit.kind === 'province' ? 'tỉnh/thành phố' : 'phường/xã';
  const path = edit.kind === 'province' ? '/geo/provinces' : '/geo/wards';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (edit.isNew) await api.post(path, { code, name, province_code: provinceCode });
      else await api.patch(`${path}/${edit.code}`, { name });
      toast('Đã lưu');
      await refreshAll();
      onClose();
    } catch (err) { toastError(err); }
  };
  return (
    <Modal title={`${edit.isNew ? 'Thêm' : 'Đổi tên'} ${label}`} width={460} onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" form="geo-form">{edit.isNew ? 'Thêm' : 'Lưu'}</button>
    </>}>
      <form id="geo-form" className="stack" onSubmit={submit}>
        {edit.kind === 'ward' && <div className="muted small">Thuộc: <b>{provinceName}</b></div>}
        <label className="field"><span>Mã {label} *</span>
          <input required disabled={!edit.isNew} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder={edit.kind === 'province' ? 'VD: 01' : 'VD: 00004'} /></label>
        <label className="field"><span>Tên {label} *</span>
          <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder={edit.kind === 'province' ? 'VD: Thành phố Hà Nội' : 'VD: Phường Ba Đình'} /></label>
      </form>
    </Modal>
  );
}
