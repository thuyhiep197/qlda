import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api, refreshAll } from '../api';
import { hasPerm, useMe } from '../hooks';
import type { Customer } from '../types';
import { CUSTOMER_KINDS, CUSTOMER_STATUSES, filterCustomers } from '../customer-filter';
import { fmtDate, lozengeOf } from '../util';
import { StaffPicker, splitNames } from '../components/ProjectInfoFields';
import { Empty, Modal, Spinner, toast, toastError } from '../components/ui';

export const useCustomers = () => useQuery<Customer[]>({ queryKey: ['customers'], queryFn: () => api.get('/customers') });

/** Danh sách khách hàng (module CRM): tìm kiếm, lọc theo trạng thái & loại, bấm vào tên để xem chi tiết. */
export default function Customers() {
  const { data: me } = useMe();
  const { data: customers, isLoading } = useCustomers();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [creating, setCreating] = useState(false);
  const list = filterCustomers(customers || [], { q, status, kind });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Khách hàng</h1>
        <div className="spacer" />
        {hasPerm(me, 'customer.create') && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Thêm khách hàng</button>}
      </div>
      <div className="filter-bar">
        <input className="filter-search" placeholder="Tìm theo tên, MST, tỉnh, SĐT, người liên hệ, AM…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} className={status ? 'filter-on' : ''} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Trạng thái: Tất cả</option>
          {CUSTOMER_STATUSES.map(([n]) => <option key={n} value={n}>{n} ({customers?.filter((c) => c.status === n).length ?? 0})</option>)}
        </select>
        <select value={kind} className={kind ? 'filter-on' : ''} onChange={(e) => setKind(e.target.value)}>
          <option value="">Loại: Tất cả</option>
          {CUSTOMER_KINDS.map((n) => <option key={n} value={n}>{n}</option>)}
          <option value="-">(Chưa phân loại)</option>
        </select>
        {customers && <span className="muted small">{list.length}/{customers.length} khách hàng</span>}
      </div>
      {isLoading ? <Spinner /> : !list.length ? (
        <Empty title={customers?.length ? 'Không có khách hàng phù hợp' : 'Chưa có khách hàng nào'} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Tên khách hàng</th><th>Loại</th><th>Trạng thái</th><th>Tỉnh/TP</th><th>Người liên hệ chính</th><th>AM phụ trách</th><th className="num">Dự án</th><th>Chăm sóc gần nhất</th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/customers/${c.id}`)}>
                  <td><Link to={`/customers/${c.id}`} onClick={(e) => e.stopPropagation()}><b>{c.name}</b></Link></td>
                  <td>{c.kind}</td>
                  <td><span className={lozengeOf(CUSTOMER_STATUSES, c.status)}>{c.status}</span></td>
                  <td>{c.province}</td>
                  <td>{c.contact_name}{c.contact_phone && <div className="muted small">{c.contact_phone}</div>}</td>
                  <td className="people">{splitNames(c.am).map((n) => <div key={n}>{n}</div>)}</td>
                  <td className="num">{c.project_count || ''}</td>
                  <td className="nowrap">{c.last_activity_date ? fmtDate(c.last_activity_date) : <span className="muted small">Chưa có</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <CustomerModal onClose={() => setCreating(false)} onSaved={(id) => navigate(`/customers/${id}`)} />}
    </div>
  );
}

type Draft = Record<'name' | 'kind' | 'status' | 'tax_code' | 'province' | 'address' | 'phone' | 'email' | 'website' | 'am' | 'note', string>;
const draftOf = (c?: Customer): Draft => ({
  name: c?.name ?? '', kind: c?.kind ?? '', status: c?.status ?? 'Đang hợp tác', tax_code: c?.tax_code ?? '', province: c?.province ?? '',
  address: c?.address ?? '', phone: c?.phone ?? '', email: c?.email ?? '', website: c?.website ?? '', am: c?.am ?? '', note: c?.note ?? '',
});

/** Thêm / sửa thông tin khách hàng */
export function CustomerModal({ customer, onClose, onSaved }: { customer?: Customer; onClose: () => void; onSaved?: (id: number) => void }) {
  const [d, setD] = useState(draftOf(customer));
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      let id = customer?.id;
      if (id) await api.patch(`/customers/${id}`, d);
      else id = (await api.post<Customer>('/customers', d)).id;
      toast(customer ? 'Đã lưu' : 'Đã thêm khách hàng');
      await refreshAll();
      onClose();
      onSaved?.(id);
    } catch (err) { toastError(err); }
  };
  return (
    <Modal title={customer ? 'Sửa thông tin khách hàng' : 'Thêm khách hàng'} width={680} onClose={onClose} footer={<>
      {customer && customer.name !== d.name.trim() && <span className="muted small">Tên mới sẽ được cập nhật vào các dự án của khách hàng</span>}
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" form="customer-form">{customer ? 'Lưu' : 'Thêm'}</button>
    </>}>
      <form id="customer-form" className="stack" onSubmit={submit}>
        <label className="field"><span>Tên khách hàng *</span>
          <input autoFocus required value={d.name} onChange={set('name')} placeholder="VD: Sở Tài chính - Đồng Nai" /></label>
        <div className="form-grid">
          <label className="field"><span>Loại khách hàng</span>
            <select value={d.kind} onChange={set('kind')}>
              <option value="">—</option>
              {CUSTOMER_KINDS.map((n) => <option key={n}>{n}</option>)}
            </select></label>
          <label className="field"><span>Trạng thái</span>
            <select value={d.status} onChange={set('status')}>
              {CUSTOMER_STATUSES.map(([n]) => <option key={n}>{n}</option>)}
            </select></label>
          <label className="field"><span>Mã số thuế</span><input value={d.tax_code} onChange={set('tax_code')} /></label>
          <label className="field"><span>Tỉnh/Thành phố</span><input value={d.province} onChange={set('province')} placeholder="VD: Đồng Nai" /></label>
          <label className="field"><span>Điện thoại</span><input value={d.phone} onChange={set('phone')} /></label>
          <label className="field"><span>Email</span><input type="email" value={d.email} onChange={set('email')} /></label>
        </div>
        <label className="field"><span>Địa chỉ</span><input value={d.address} onChange={set('address')} /></label>
        <label className="field"><span>Website</span><input value={d.website} onChange={set('website')} placeholder="VD: stc.dongnai.gov.vn" /></label>
        <div className="field"><span>AM phụ trách <small className="muted">(chọn từ Danh mục nhân sự)</small></span>
          <StaffPicker position="am" value={d.am} onChange={(v) => setD({ ...d, am: v })} /></div>
        <label className="field"><span>Ghi chú</span><textarea rows={3} value={d.note} onChange={set('note')} /></label>
      </form>
    </Modal>
  );
}
