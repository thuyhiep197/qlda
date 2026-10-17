import { useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { api, refreshAll } from '../api';
import { hasPerm, useMe, useProducts, useProductTypes } from '../hooks';
import type { Product, ProductType } from '../types';
import { Empty, Modal, Spinner, toast, toastError } from '../components/ui';

type Draft = { id?: number; type_id: string; name: string; description: string };

/** Danh mục Loại sản phẩm & Sản phẩm: chọn cho khách hàng; mô tả sản phẩm tự điền vào khách hàng khi chọn sản phẩm. */
export default function AdminProducts() {
  const { data: me } = useMe();
  const { data: types } = useProductTypes();
  const { data: products, isLoading } = useProducts();
  const [typeF, setTypeF] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [editingType, setEditingType] = useState<Partial<ProductType> | null>(null);
  const canCreate = hasPerm(me, 'product.create'), canEdit = hasPerm(me, 'product.edit'), canDelete = hasPerm(me, 'product.delete');
  const list = (products || []).filter((p) => (!typeF || String(p.type_id) === typeF) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));

  const remove = async (p: Product) => {
    if (!confirm(`Xóa sản phẩm ${p.name}?${p.customer_count ? ` ${p.customer_count} khách hàng đang chọn sản phẩm này sẽ được gỡ sản phẩm (vẫn giữ mô tả đã ghi).` : ''}`)) return;
    try { await api.del(`/products/${p.id}`); toast('Đã xóa'); await refreshAll(); } catch (e) { toastError(e); }
  };
  const removeType = async (t: ProductType) => {
    if (!confirm(`Xóa loại sản phẩm ${t.name}?`)) return;
    try { await api.del(`/products/types/${t.id}`); toast('Đã xóa'); await refreshAll(); if (typeF === String(t.id)) setTypeF(''); } catch (e) { toastError(e); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Danh mục sản phẩm</h1>
        <div className="spacer" />
        {canCreate && <button className="btn" onClick={() => setEditingType({})}>+ Thêm loại sản phẩm</button>}
        {canCreate && <button className="btn btn-primary" onClick={() => setEditing({ type_id: typeF || String(types?.[0]?.id ?? ''), name: '', description: '' })}>+ Thêm sản phẩm</button>}
      </div>
      <p className="muted small">Khi chọn sản phẩm cho khách hàng, mô tả ở đây được tự điền vào ô "Mô tả sản phẩm" của khách hàng. Sửa mô tả ở đây không đổi mô tả đã ghi ở các khách hàng.</p>

      <div className="card">
        <div className="card-head"><h3>Loại sản phẩm</h3></div>
        <div className="row gap-sm" style={{ flexWrap: 'wrap' }}>
          {types?.map((t) => (
            <span key={t.id} className="chip-type">
              <b>{t.name}</b> <span className="muted small">({t.product_count})</span>
              {canEdit && <button className="icon-btn" aria-label={`Đổi tên ${t.name}`} data-tip="Đổi tên" onClick={() => setEditingType(t)}><Pencil size={13} /></button>}
              {canDelete && <button className="icon-btn" aria-label={`Xóa ${t.name}`} data-tip="Xóa" onClick={() => removeType(t)}><Trash2 size={13} /></button>}
            </span>
          ))}
        </div>
      </div>

      <div className="filter-bar mt">
        <div className="seg" role="group" aria-label="Lọc theo loại sản phẩm">
          <button className={!typeF ? 'on' : ''} onClick={() => setTypeF('')}>Tất cả ({products?.length ?? 0})</button>
          {types?.map((t) => <button key={t.id} className={typeF === String(t.id) ? 'on' : ''} onClick={() => setTypeF(String(t.id))}>{t.name} ({t.product_count})</button>)}
        </div>
        <input className="filter-search" placeholder="Tìm theo tên sản phẩm…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {isLoading ? <Spinner /> : !list.length ? <Empty title="Chưa có sản phẩm nào" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Tên sản phẩm</th><th>Loại sản phẩm</th><th>Mô tả</th><th className="num">Khách hàng</th>{(canEdit || canDelete) && <th />}</tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.name}</b></td>
                  <td>{p.type_name}</td>
                  <td className="small" style={{ whiteSpace: 'pre-wrap', maxWidth: 480 }}>{p.description || <span className="muted">Chưa có mô tả</span>}</td>
                  <td className="num">{p.customer_count || ''}</td>
                  {(canEdit || canDelete) && (
                    <td className="num nowrap">
                      {canEdit && <button className="icon-btn" aria-label={`Sửa ${p.name}`} data-tip="Sửa"
                        onClick={() => setEditing({ id: p.id, type_id: String(p.type_id), name: p.name, description: p.description || '' })}><Pencil size={15} /></button>}
                      {canDelete && <button className="icon-btn" aria-label={`Xóa ${p.name}`} data-tip="Xóa" onClick={() => remove(p)}><Trash2 size={15} /></button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <ProductModal draft={editing} types={types || []} onClose={() => setEditing(null)} />}
      {editingType && <TypeModal type={editingType} onClose={() => setEditingType(null)} />}
    </div>
  );
}

function ProductModal({ draft, types, onClose }: { draft: Draft; types: ProductType[]; onClose: () => void }) {
  const [d, setD] = useState(draft);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const body = { type_id: d.type_id, name: d.name, description: d.description };
      if (d.id) await api.patch(`/products/${d.id}`, body); else await api.post('/products', body);
      toast(d.id ? 'Đã lưu' : 'Đã thêm sản phẩm');
      await refreshAll();
      onClose();
    } catch (err) { toastError(err); }
  };
  return (
    <Modal title={d.id ? 'Sửa sản phẩm' : 'Thêm sản phẩm'} onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" form="product-form">{d.id ? 'Lưu' : 'Thêm'}</button>
    </>}>
      <form id="product-form" className="stack" onSubmit={submit}>
        <label className="field"><span>Loại sản phẩm *</span>
          <select required value={d.type_id} onChange={(e) => setD({ ...d, type_id: e.target.value })}>
            <option value="">—</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></label>
        <label className="field"><span>Tên sản phẩm *</span>
          <input autoFocus required value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="VD: Phần mềm quản lý văn bản" /></label>
        <label className="field"><span>Mô tả sản phẩm</span>
          <textarea rows={5} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="Tự điền vào khách hàng khi chọn sản phẩm này" /></label>
      </form>
    </Modal>
  );
}

function TypeModal({ type, onClose }: { type: Partial<ProductType>; onClose: () => void }) {
  const [name, setName] = useState(type.name ?? '');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (type.id) await api.patch(`/products/types/${type.id}`, { name }); else await api.post('/products/types', { name });
      toast('Đã lưu');
      await refreshAll();
      onClose();
    } catch (err) { toastError(err); }
  };
  return (
    <Modal title={type.id ? 'Đổi tên loại sản phẩm' : 'Thêm loại sản phẩm'} width={440} onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" form="type-form">{type.id ? 'Lưu' : 'Thêm'}</button>
    </>}>
      <form id="type-form" className="stack" onSubmit={submit}>
        <label className="field"><span>Tên loại sản phẩm *</span>
          <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Dịch vụ thuê bao" /></label>
      </form>
    </Modal>
  );
}
