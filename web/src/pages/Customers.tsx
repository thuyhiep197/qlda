import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Paperclip, Plus, X } from 'lucide-react';
import { api, refreshAll } from '../api';
import { useProducts, useProductTypes, useProvinces, useStaff, useWards } from '../hooks';
import type { Customer, CustomerContact } from '../types';
import { CUSTOMER_SOURCES, CUSTOMER_STATUSES, descriptionOf, wardCodeOf } from '../customer-filter';
import { Modal, toast, toastError } from '../components/ui';

export const useCustomers = () => useQuery<Customer[]>({ queryKey: ['customers'], queryFn: () => api.get('/customers') });

type Draft = Record<'name' | 'province_code' | 'ward_code' | 'product_type_id' | 'product_id' | 'product_description' | 'source' | 'status', string>;
type ContactDraft = { id?: number; full_name: string; phone: string; email: string };
const draftOf = (c?: Customer): Draft => ({
  name: c?.name ?? '', province_code: c?.province_code ?? '', ward_code: c?.ward_code ?? '',
  product_type_id: c?.product_type_id ? String(c.product_type_id) : '', product_id: c?.product_id ? String(c.product_id) : '',
  product_description: c?.product_description ?? '', source: c?.source ?? '', status: c?.status ?? 'Mới',
});
const blankContact = (): ContactDraft => ({ full_name: '', phone: '', email: '' });

/** Thêm / sửa thông tin khách hàng, gồm nhiều đầu mối liên hệ và tài liệu (khi thêm mới) */
export function CustomerModal({ customer, contacts, ownerIds, onClose, onSaved }: {
  customer?: Customer; contacts?: CustomerContact[]; ownerIds?: number[]; onClose: () => void; onSaved?: (id: number) => void;
}) {
  const [owners, setOwners] = useState<number[]>(ownerIds ?? []);
  const { data: types } = useProductTypes();
  const { data: products } = useProducts();
  const [d, setD] = useState(draftOf(customer));
  const { data: provinces } = useProvinces();
  const { data: wards } = useWards(d.province_code);
  // Ô phường/xã: gõ để tìm trong danh mục của tỉnh đã chọn; chỉ nhận tên có trong danh mục
  const [wardText, setWardText] = useState(customer?.ward_name ?? '');
  const typeWard = (v: string) => { setWardText(v); setD({ ...d, ward_code: wardCodeOf(wards, v) ?? '' }); };
  const [people, setPeople] = useState<ContactDraft[]>(contacts?.length
    ? contacts.map((c) => ({ id: c.id, full_name: c.full_name, phone: c.phone ?? '', email: c.email ?? '' })) : [blankContact()]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });
  const typeProducts = (products || []).filter((p) => !d.product_type_id || String(p.type_id) === d.product_type_id);
  const pickType = (v: string) => {
    const keep = products?.find((p) => String(p.id) === d.product_id && String(p.type_id) === v);
    setD({ ...d, product_type_id: v, product_id: keep ? d.product_id : '' });
  };
  // Chọn sản phẩm → mô tả lấy theo danh mục (chưa có thì để trống cho người dùng điền)
  const pickProduct = (v: string) => {
    const p = products?.find((x) => String(x.id) === v);
    setD({ ...d, product_id: v, product_type_id: p ? String(p.type_id) : d.product_type_id, product_description: v ? descriptionOf(p) : d.product_description });
  };
  const setPerson = (i: number, k: keyof Omit<ContactDraft, 'id'>, v: string) => setPeople(people.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (wardText.trim() && !d.ward_code) { toastError('Phường/xã không có trong Danh mục địa chính của tỉnh/thành phố đã chọn'); return; }
    setBusy(true);
    try {
      const body = { ...d, contacts: people, owner_ids: owners };
      let id = customer?.id;
      if (id) await api.patch(`/customers/${id}`, body);
      else id = (await api.post<Customer>('/customers', body)).id;
      if (files.length) {
        const fd = new FormData();
        files.forEach((f) => fd.append('files', f));
        await api.post(`/customers/${id}/files`, fd);
      }
      toast(customer ? 'Đã lưu' : 'Đã thêm khách hàng');
      await refreshAll();
      onClose();
      onSaved?.(id);
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };
  return (
    <Modal title={customer ? 'Sửa thông tin khách hàng' : 'Thêm khách hàng'} width={720} onClose={onClose} footer={<>
      {customer && customer.name !== d.name.trim() && <span className="muted small">Tên mới sẽ được cập nhật vào các dự án của khách hàng</span>}
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" form="customer-form" disabled={busy}>{customer ? 'Lưu' : 'Thêm'}</button>
    </>}>
      <form id="customer-form" className="stack" onSubmit={submit}>
        <label className="field"><span>Tên cơ quan/đơn vị *</span>
          <input autoFocus required value={d.name} onChange={set('name')} placeholder="VD: Sở Tài chính tỉnh Đồng Nai" /></label>
        <div className="form-grid">
          <label className="field"><span>Tỉnh thành</span>
            <select value={d.province_code} onChange={(e) => { setD({ ...d, province_code: e.target.value, ward_code: '' }); setWardText(''); }}>
              <option value="">—</option>
              {provinces?.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select></label>
          <label className="field"><span>Phường/Xã</span>
            <input list="ward-options" value={wardText} disabled={!d.province_code} onChange={(e) => typeWard(e.target.value)}
              placeholder={d.province_code ? `Gõ để tìm trong ${wards?.length ?? '…'} phường/xã` : 'Chọn tỉnh thành trước'} />
            <datalist id="ward-options">{wards?.map((w) => <option key={w.code} value={w.name} />)}</datalist>
            {wardText.trim() && !d.ward_code && <small className="overdue">Chọn phường/xã trong danh sách gợi ý</small>}</label>
          <label className="field"><span>Loại sản phẩm</span>
            <select value={d.product_type_id} onChange={(e) => pickType(e.target.value)}>
              <option value="">—</option>
              {types?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></label>
          <label className="field"><span>Sản phẩm</span>
            <select value={d.product_id} onChange={(e) => pickProduct(e.target.value)}>
              <option value="">{typeProducts.length ? '—' : 'Chưa có sản phẩm trong danh mục'}</option>
              {typeProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
        </div>
        <label className="field"><span>Mô tả sản phẩm <small className="muted">(tự lấy từ danh mục khi chọn sản phẩm; sửa được)</small></span>
          <textarea rows={3} value={d.product_description} onChange={set('product_description')} /></label>

        <div className="field"><span>Đầu mối liên hệ</span>
          <div className="stack-sm">
            {people.map((p, i) => (
              <div key={p.id ?? `new-${i}`} className="contact-row">
                <input aria-label="Tên đầu mối" placeholder="Tên *" value={p.full_name} onChange={(e) => setPerson(i, 'full_name', e.target.value)} />
                <input aria-label="Số điện thoại" placeholder="SĐT" value={p.phone} onChange={(e) => setPerson(i, 'phone', e.target.value)} />
                <input aria-label="Email" type="email" placeholder="Email" value={p.email} onChange={(e) => setPerson(i, 'email', e.target.value)} />
                <button type="button" className="icon-btn" aria-label="Bỏ đầu mối này" data-tip="Bỏ" onClick={() => setPeople(people.filter((_, j) => j !== i))}><X size={15} /></button>
              </div>
            ))}
            <div><button type="button" className="btn btn-subtle btn-sm" onClick={() => setPeople([...people, blankContact()])}><Plus size={14} /> Thêm đầu mối</button></div>
          </div>
        </div>

        <div className="form-grid">
          <label className="field"><span>Nguồn khách hàng</span>
            <input list="customer-sources" value={d.source} onChange={set('source')} placeholder="Chọn hoặc gõ nguồn" />
            <datalist id="customer-sources">{CUSTOMER_SOURCES.map((n) => <option key={n} value={n} />)}</datalist></label>
          <label className="field"><span>Tình trạng</span>
            <select value={d.status} onChange={set('status')}>
              {CUSTOMER_STATUSES.map(([n]) => <option key={n}>{n}</option>)}
            </select></label>
        </div>
        <div className="field"><span>Nhân viên phụ trách <small className="muted">(nhân sự Kinh doanh hoặc AM trong Danh mục nhân sự)</small></span>
          <OwnerPicker value={owners} onChange={setOwners} /></div>
        {!customer && (
          <div className="field"><span>Tài liệu</span>
            <label className="btn btn-subtle btn-sm" style={{ alignSelf: 'flex-start' }}><Paperclip size={14} /> Chọn tệp…
              <input type="file" multiple hidden onChange={(e) => setFiles([...files, ...Array.from(e.target.files || [])])} /></label>
            {files.map((f, i) => <div key={i} className="small row gap-sm">{f.name}
              <button type="button" className="icon-btn" aria-label={`Bỏ ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={13} /></button></div>)}
          </div>
        )}
      </form>
    </Modal>
  );
}

/** Chọn Nhân viên phụ trách: nhân sự vị trí Kinh doanh hoặc AM trong Danh mục nhân sự (người phụ trách mới xem được khách hàng) */
function OwnerPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const { data: staff } = useStaff();
  const pool = (staff || []).filter((x) => x.positions.split(',').some((p) => p === 'kd' || p === 'am'));
  const name = (id: number) => staff?.find((x) => x.id === id)?.full_name ?? `#${id}`;
  return (
    <div className="staff-picker">
      {value.map((id) => (
        <span key={id} className="chip">{name(id)}
          <button type="button" aria-label={`Bỏ ${name(id)}`} onClick={() => onChange(value.filter((x) => x !== id))}><X size={12} /></button></span>
      ))}
      <select value="" onChange={(e) => e.target.value && onChange([...value, Number(e.target.value)])} aria-label="Thêm nhân viên phụ trách">
        <option value="">+ Thêm…</option>
        {pool.filter((x) => !value.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.full_name}{x.user_id ? '' : ' (chưa gắn tài khoản)'}</option>)}
      </select>
    </div>
  );
}
