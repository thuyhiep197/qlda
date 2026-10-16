import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Mail, MessageSquareText, Pencil, Phone, Star, Trash2, Users } from 'lucide-react';
import { api, refreshAll } from '../api';
import { hasPerm, useMe } from '../hooks';
import type { ActivityKind, CustomerContact, CustomerDetail as Detail } from '../types';
import { CUSTOMER_STATUSES } from '../customer-filter';
import { colorOf, fmtDate, lozengeOf, PROJECT_PRIORITIES, PROJECT_STATUSES, today } from '../util';
import { CustomerModal } from './Customers';
import { Empty, Modal, Spinner, toast, toastError } from '../components/ui';

const ACTIVITY: Record<ActivityKind, { label: string; icon: ReactNode }> = {
  call: { label: 'Gọi điện', icon: <Phone size={14} /> },
  meeting: { label: 'Gặp mặt', icon: <Users size={14} /> },
  email: { label: 'Email', icon: <Mail size={14} /> },
  note: { label: 'Ghi chú', icon: <MessageSquareText size={14} /> },
};

/** Chi tiết khách hàng: thông tin chung, người liên hệ, dự án, lịch sử chăm sóc */
export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { data: c, isLoading, error } = useQuery<Detail>({ queryKey: ['customer', id], queryFn: () => api.get(`/customers/${id}`) });
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState<Partial<CustomerContact> | null>(null);
  const canEdit = hasPerm(me, 'customer.edit'), canDelete = hasPerm(me, 'customer.delete');

  if (isLoading) return <Spinner />;
  if (!c) return <div className="page"><Empty title={error instanceof Error ? error.message : 'Không tìm thấy khách hàng'} /></div>;

  const remove = async () => {
    if (!confirm(`Xóa khách hàng ${c.name}? Người liên hệ và lịch sử chăm sóc sẽ bị xóa theo. Dự án đã ghi tên khách hàng này vẫn giữ nguyên.`)) return;
    try { await api.del(`/customers/${c.id}`); toast('Đã xóa khách hàng'); await refreshAll(); navigate('/customers'); } catch (e) { toastError(e); }
  };
  const removeContact = async (ct: CustomerContact) => {
    if (!confirm(`Xóa người liên hệ ${ct.full_name}?`)) return;
    try { await api.del(`/customers/${c.id}/contacts/${ct.id}`); await refreshAll(); } catch (e) { toastError(e); }
  };
  const info: [string, ReactNode][] = [
    ['Loại', c.kind], ['Mã số thuế', c.tax_code], ['Tỉnh/TP', c.province], ['Địa chỉ', c.address],
    ['Điện thoại', c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>], ['Email', c.email && <a href={`mailto:${c.email}`}>{c.email}</a>],
    ['Website', c.website && <a href={/^https?:\/\//.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer noopener">{c.website}</a>],
    ['AM phụ trách', c.am], ['Ghi chú', c.note && <span style={{ whiteSpace: 'pre-wrap' }}>{c.note}</span>],
  ];

  return (
    <div className="page">
      <div className="breadcrumb"><Link to="/customers"><ChevronLeft size={14} /> Khách hàng</Link></div>
      <div className="page-head">
        <h1>{c.name}</h1>
        <span className={lozengeOf(CUSTOMER_STATUSES, c.status)}>{c.status}</span>
        <div className="spacer" />
        {canEdit && <button className="btn" onClick={() => setEditing(true)}><Pencil size={15} /> Sửa</button>}
        {canDelete && <button className="btn btn-subtle" onClick={remove}><Trash2 size={15} /> Xóa</button>}
      </div>

      <div className="two-col">
        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Thông tin chung</h3></div>
            <div className="props">
              {info.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><span className="prop-label">{k}</span><span>{v || <span className="muted">—</span>}</span></div>)}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Người liên hệ ({c.contacts.length})</h3>
              {canEdit && <button className="btn btn-sm" onClick={() => setContact({ is_primary: c.contacts.length ? 0 : 1 })}>+ Thêm</button>}</div>
            {!c.contacts.length ? <p className="muted small">Chưa có người liên hệ</p> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Họ tên</th><th>Chức vụ</th><th>Liên hệ</th>{canEdit && <th />}</tr></thead>
                <tbody>{c.contacts.map((ct) => (
                  <tr key={ct.id}>
                    <td><b>{ct.full_name}</b> {!!ct.is_primary && <Star size={13} fill="currentColor" style={{ color: 'var(--warn)', verticalAlign: -1 }} data-tip="Đầu mối chính" />}
                      {ct.note && <div className="muted small">{ct.note}</div>}</td>
                    <td>{ct.position}</td>
                    <td>{ct.phone && <div><a href={`tel:${ct.phone}`}>{ct.phone}</a></div>}{ct.email && <div className="small"><a href={`mailto:${ct.email}`}>{ct.email}</a></div>}</td>
                    {canEdit && <td className="num nowrap">
                      <button className="icon-btn" aria-label={`Sửa ${ct.full_name}`} data-tip="Sửa" onClick={() => setContact(ct)}><Pencil size={15} /></button>
                      <button className="icon-btn" aria-label={`Xóa ${ct.full_name}`} data-tip="Xóa" onClick={() => removeContact(ct)}><Trash2 size={15} /></button>
                    </td>}
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>

          <div className="card">
            <div className="card-head"><h3>Dự án ({c.projects.length})</h3></div>
            {!c.projects.length ? <p className="muted small">Chưa có dự án nào. Gắn dự án với khách hàng bằng ô "Tên khách hàng" trong Cài đặt dự án → Thông tin chung.</p> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Dự án</th><th>Ưu tiên</th><th>Trạng thái</th><th>BA/PM</th></tr></thead>
                <tbody>{c.projects.map((p) => (
                  <tr key={p.id}>
                    <td><Link to={`/p/${p.key}`} className="row gap-sm"><span className="proj-dot" style={{ background: colorOf(p.key), flexShrink: 0 }}>{p.key.slice(0, 2)}</span> {p.name}</Link>
                      {!!p.is_archived && <span className="muted small"> (đã lưu trữ)</span>}</td>
                    <td>{p.priority && <span className={lozengeOf(PROJECT_PRIORITIES, p.priority)}>{p.priority}</span>}</td>
                    <td>{p.project_status && <span className={lozengeOf(PROJECT_STATUSES, p.project_status)}>{p.project_status}</span>}</td>
                    <td className="small">{p.ba}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </div>

        <Activities customer={c} canAdd={canEdit} canDeleteAll={canDelete} meId={me?.id} />
      </div>

      {editing && <CustomerModal customer={c} onClose={() => setEditing(false)} />}
      {contact && <ContactModal customerId={c.id} contact={contact} onClose={() => setContact(null)} />}
    </div>
  );
}

/** Lịch sử chăm sóc khách hàng — mới nhất ở trên */
function Activities({ customer, canAdd, canDeleteAll, meId }: { customer: Detail; canAdd: boolean; canDeleteAll: boolean; meId?: number }) {
  const [kind, setKind] = useState<ActivityKind>('call');
  const [date, setDate] = useState(today());
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/customers/${customer.id}/activities`, { kind, activity_date: date, content });
      setContent('');
      await refreshAll();
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };
  const remove = async (id: number) => {
    if (!confirm('Xóa hoạt động này?')) return;
    try { await api.del(`/customers/${customer.id}/activities/${id}`); await refreshAll(); } catch (e) { toastError(e); }
  };
  return (
    <div className="card">
      <div className="card-head"><h3>Lịch sử chăm sóc</h3></div>
      {canAdd && (
        <form className="stack-sm mb" onSubmit={add}>
          <div className="row gap-sm" style={{ flexWrap: 'wrap' }}>
            <div className="seg" role="group" aria-label="Loại hoạt động">
              {(Object.keys(ACTIVITY) as ActivityKind[]).map((k) => (
                <button type="button" key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{ACTIVITY[k].icon} {ACTIVITY[k].label}</button>
              ))}
            </div>
            <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} aria-label="Ngày" />
          </div>
          <textarea rows={3} required value={content} onChange={(e) => setContent(e.target.value)} placeholder="Nội dung trao đổi, kết quả, việc cần làm tiếp…" />
          <div className="row"><div className="spacer" /><button className="btn btn-primary btn-sm" disabled={busy || !content.trim()}>Ghi lại</button></div>
        </form>
      )}
      {!customer.activities.length ? <p className="muted small">Chưa có hoạt động nào</p> : (
        <div className="history">
          {customer.activities.map((a) => (
            <div key={a.id} className="history-row">
              <span className="muted" style={{ paddingTop: 2 }}>{ACTIVITY[a.kind]?.icon}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small"><b>{ACTIVITY[a.kind]?.label ?? a.kind}</b> · {fmtDate(a.activity_date)} <span className="muted">· {a.user_name ?? '—'}</span></div>
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{a.content}</div>
              </div>
              {(canDeleteAll || (canAdd && a.user_id === meId)) && (
                <button className="icon-btn" aria-label="Xóa hoạt động" data-tip="Xóa" onClick={() => remove(a.id)}><Trash2 size={14} /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContactModal({ customerId, contact, onClose }: { customerId: number; contact: Partial<CustomerContact>; onClose: () => void }) {
  const [d, setD] = useState({
    full_name: contact.full_name ?? '', position: contact.position ?? '', phone: contact.phone ?? '',
    email: contact.email ?? '', note: contact.note ?? '', is_primary: !!contact.is_primary,
  });
  const set = (k: 'full_name' | 'position' | 'phone' | 'email' | 'note') => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (contact.id) await api.patch(`/customers/${customerId}/contacts/${contact.id}`, d);
      else await api.post(`/customers/${customerId}/contacts`, d);
      toast('Đã lưu');
      await refreshAll();
      onClose();
    } catch (err) { toastError(err); }
  };
  return (
    <Modal title={contact.id ? 'Sửa người liên hệ' : 'Thêm người liên hệ'} onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" form="contact-form">{contact.id ? 'Lưu' : 'Thêm'}</button>
    </>}>
      <form id="contact-form" className="stack" onSubmit={submit}>
        <div className="form-grid">
          <label className="field"><span>Họ tên *</span><input autoFocus required value={d.full_name} onChange={set('full_name')} /></label>
          <label className="field"><span>Chức vụ</span><input value={d.position} onChange={set('position')} placeholder="VD: Phó Giám đốc" /></label>
          <label className="field"><span>Điện thoại</span><input value={d.phone} onChange={set('phone')} /></label>
          <label className="field"><span>Email</span><input type="email" value={d.email} onChange={set('email')} /></label>
        </div>
        <label className="field"><span>Ghi chú</span><input value={d.note} onChange={set('note')} /></label>
        <label className="check"><input type="checkbox" checked={d.is_primary} onChange={(e) => setD({ ...d, is_primary: e.target.checked })} /> Đầu mối liên hệ chính</label>
      </form>
    </Modal>
  );
}
