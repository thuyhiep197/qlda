import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, CalendarClock, ChevronLeft, ContactRound, FolderKanban, History, LayoutDashboard, ListTodo, Mail, MessageSquareText,
  Pencil, Phone, Star, Trash2, Users, type LucideIcon,
} from 'lucide-react';
import { api, refreshAll } from '../api';
import { hasPerm, useIssueModal, useMe } from '../hooks';
import type { ActivityKind, CustomerContact, CustomerDetail as Detail, CustomerProject } from '../types';
import { customerKpis, CUSTOMER_STATUSES } from '../customer-filter';
import { colorOf, fmtDate, lozengeOf, PROJECT_PRIORITIES, PROJECT_STATUSES, timeAgo, today } from '../util';
import { CustomerModal } from './Customers';
import { Avatar, Empty, Modal, Spinner, toast, toastError, TypeIcon } from '../components/ui';
import { IssueLine } from '../components/IssueRow';

const ACTIVITY: Record<ActivityKind, { label: string; icon: ReactNode }> = {
  call: { label: 'Gọi điện', icon: <Phone size={14} /> },
  meeting: { label: 'Gặp mặt', icon: <Users size={14} /> },
  email: { label: 'Email', icon: <Mail size={14} /> },
  note: { label: 'Ghi chú', icon: <MessageSquareText size={14} /> },
};

type Tab = 'overview' | 'projects' | 'issues' | 'contacts' | 'care';

/** Trang khách hàng — xem toàn bộ thông tin liên quan: thông tin chung, dự án, công việc, người liên hệ, lịch sử chăm sóc */
export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const [params, setParams] = useSearchParams();
  const { data: c, isLoading, error } = useQuery<Detail>({ queryKey: ['customer', id], queryFn: () => api.get(`/customers/${id}`) });
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState<Partial<CustomerContact> | null>(null);
  const canEdit = hasPerm(me, 'customer.edit'), canDelete = hasPerm(me, 'customer.delete');

  if (isLoading) return <Spinner />;
  if (!c) return <div className="page"><Empty title={error instanceof Error ? error.message : 'Không tìm thấy khách hàng'} /></div>;

  const tab = (params.get('tab') as Tab) || 'overview';
  const go = (t: Tab) => setParams((p) => { const n = new URLSearchParams(p); if (t === 'overview') n.delete('tab'); else n.set('tab', t); return n; }, { replace: true });
  const k = customerKpis(c, today());
  const tabs: [Tab, string, LucideIcon][] = [
    ['overview', 'Tổng quan', LayoutDashboard],
    ['projects', `Dự án (${k.projects})`, FolderKanban],
    ['issues', `Công việc (${k.openIssues})`, ListTodo],
    ['contacts', `Người liên hệ (${c.contacts.length})`, ContactRound],
    ['care', `Lịch sử chăm sóc (${c.activities.length})`, History],
  ];

  const remove = async () => {
    if (!confirm(`Xóa khách hàng ${c.name}? Người liên hệ và lịch sử chăm sóc sẽ bị xóa theo. Các dự án sẽ được gỡ khỏi khách hàng này (dữ liệu dự án vẫn giữ nguyên).`)) return;
    try { await api.del(`/customers/${c.id}`); toast('Đã xóa khách hàng'); await refreshAll(); navigate('/customers'); } catch (e) { toastError(e); }
  };

  return (
    <div className="page">
      <div className="breadcrumb"><Link to="/customers"><ChevronLeft size={14} /> Khách hàng</Link></div>
      <div className="page-head">
        <h1>{c.name}</h1>
        <span className={lozengeOf(CUSTOMER_STATUSES, c.status)}>{c.status}</span>
        {c.kind && <span className="muted small">{c.kind}{c.province ? ` · ${c.province}` : ''}</span>}
        <div className="spacer" />
        {canEdit && <button className="btn" onClick={() => setEditing(true)}><Pencil size={15} /> Sửa</button>}
        {canDelete && <button className="btn btn-subtle" onClick={remove}><Trash2 size={15} /> Xóa</button>}
      </div>
      <nav className="tabs tabs-sm">
        {tabs.map(([t, label, Icon]) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => go(t)}><Icon size={16} /> {label}</button>)}
      </nav>

      {tab === 'overview' && <Overview c={c} k={k} go={go} />}
      {tab === 'projects' && <div className="card"><ProjectTable projects={c.projects} /></div>}
      {tab === 'issues' && <Issues c={c} />}
      {tab === 'contacts' && <Contacts c={c} canEdit={canEdit} onEdit={setContact} />}
      {tab === 'care' && <Activities customer={c} canAdd={canEdit} canDeleteAll={canDelete} meId={me?.id} />}

      {editing && <CustomerModal customer={c} onClose={() => setEditing(false)} />}
      {contact && <ContactModal customerId={c.id} contact={contact} onClose={() => setContact(null)} />}
    </div>
  );
}

function Overview({ c, k, go }: { c: Detail; k: ReturnType<typeof customerKpis>; go: (t: Tab) => void }) {
  const { open } = useIssueModal();
  const primary = c.contacts.find((x) => x.is_primary) ?? c.contacts[0];
  const info: [string, ReactNode][] = [
    ['Loại', c.kind], ['Mã số thuế', c.tax_code], ['Tỉnh/TP', c.province], ['Địa chỉ', c.address],
    ['Điện thoại', c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>], ['Email', c.email && <a href={`mailto:${c.email}`}>{c.email}</a>],
    ['Website', c.website && <a href={/^https?:\/\//.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer noopener">{c.website}</a>],
    ['AM phụ trách', c.am], ['Ghi chú', c.note && <span style={{ whiteSpace: 'pre-wrap' }}>{c.note}</span>],
  ];
  const lastCare = c.activities[0];
  return (
    <div className="stack">
      <div className="kpi-row">
        <a className="kpi" onClick={() => go('projects')}>
          <div className="kpi-label"><FolderKanban size={15} /> Dự án</div>
          <div className="kpi-num">{k.projects}</div>
          <div className="muted small">{k.running} dự án đang thực hiện</div>
        </a>
        <a className="kpi" onClick={() => go('issues')}>
          <div className="kpi-label"><ListTodo size={15} /> Công việc đang mở</div>
          <div className="kpi-num">{k.openIssues}</div>
          <div className="muted small">Chưa hoàn thành, mọi dự án</div>
        </a>
        <a className={`kpi ${k.overdue ? 'kpi-danger' : ''}`} onClick={() => go('issues')}>
          <div className="kpi-label"><AlertTriangle size={15} /> Quá hạn</div>
          <div className="kpi-num">{k.overdue}</div>
          <div className="muted small">Công việc đã qua hạn</div>
        </a>
        <a className="kpi" onClick={() => go('contacts')}>
          <div className="kpi-label"><ContactRound size={15} /> Người liên hệ</div>
          <div className="kpi-num">{c.contacts.length}</div>
          <div className="muted small ellipsis">{primary ? `Đầu mối: ${primary.full_name}` : 'Chưa có đầu mối'}</div>
        </a>
        <a className="kpi" onClick={() => go('care')}>
          <div className="kpi-label"><CalendarClock size={15} /> Chăm sóc gần nhất</div>
          <div className="kpi-num" style={{ fontSize: 20, paddingTop: 6 }}>{k.lastCare ? fmtDate(k.lastCare) : '—'}</div>
          <div className="muted small ellipsis">{lastCare ? `${ACTIVITY[lastCare.kind]?.label}: ${lastCare.content}` : 'Chưa ghi nhận'}</div>
        </a>
      </div>

      <div className="two-col">
        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Thông tin chung</h3></div>
            <div className="props">
              {info.map(([key, v]) => <div key={key} style={{ display: 'contents' }}><span className="prop-label">{key}</span><span>{v || <span className="muted">—</span>}</span></div>)}
            </div>
          </div>
          {primary && (
            <div className="card">
              <div className="card-head"><h3>Đầu mối liên hệ</h3><a className="small" onClick={() => go('contacts')}>Xem tất cả</a></div>
              <ContactLine ct={primary} />
            </div>
          )}
        </div>
        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Dự án</h3><a className="small" onClick={() => go('projects')}>Chi tiết</a></div>
            <ProjectTable projects={c.projects.filter((p) => !p.is_archived)} compact />
          </div>
          <div className="card">
            <div className="card-head"><h3>Hoạt động gần đây trong dự án</h3></div>
            <div className="activity">
              {c.recent.length === 0 && <div className="muted small">Chưa có hoạt động</div>}
              {c.recent.map((a) => (
                <div key={a.id} className="activity-row">
                  <Avatar name={a.user_name} src={a.user_avatar_url} size={24} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div><b>{a.user_name}</b> {a.field === 'created' ? 'đã tạo' : a.field === 'status' ? <>chuyển <b>{a.new_label}</b></> : <>giao cho <b>{a.new_label || 'không ai'}</b></>}</div>
                    <a className="row gap-xs small" onClick={() => open(a.key)}><TypeIcon type={a.type} size={14} /> <span className="nowrap">{a.key}</span> <span className="ellipsis">{a.summary}</span></a>
                    <div className="muted small">{timeAgo(a.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectStatusCell({ p }: { p: CustomerProject }) {
  const v = p.project_status || p.status_auto;
  if (!v) return null;
  return <span className={lozengeOf(PROJECT_STATUSES, v)} data-tip={p.project_status ? 'Trạng thái ghim tay' : `Tự động: ${p.status_reason}`}>{v}</span>;
}

/** Bảng dự án của khách hàng: trạng thái, tiến độ, nhân sự. Dự án mình không là thành viên chỉ xem tên, không mở được. */
function ProjectTable({ projects, compact }: { projects: CustomerProject[]; compact?: boolean }) {
  if (!projects.length) return <p className="muted small">Chưa có dự án nào. Gắn dự án với khách hàng ở Cài đặt dự án → Thông tin chung → Khách hàng.</p>;
  return (
    <div className="table-wrap"><table className="table">
      <thead><tr><th>Dự án</th><th>Trạng thái</th><th>Tiến độ</th>{!compact && <><th>Ưu tiên</th><th>Thời gian</th><th>BA/PM</th><th>Dev</th><th>AM</th></>}</tr></thead>
      <tbody>{projects.map((p) => {
        const pct = p.total_issues ? Math.round((p.done_issues / p.total_issues) * 100) : 0;
        const name = <><span className="proj-dot" style={{ background: colorOf(p.key), flexShrink: 0 }}>{p.key.slice(0, 2)}</span> {p.name}</>;
        return (
          <tr key={p.id}>
            <td>{p.accessible ? <Link to={`/p/${p.key}`} className="row gap-sm">{name}</Link>
              : <span className="row gap-sm" data-tip="Bạn chưa là thành viên dự án này">{name}</span>}
              {!!p.is_archived && <span className="muted small"> (đã lưu trữ)</span>}</td>
            <td><ProjectStatusCell p={p} /></td>
            <td style={{ minWidth: 120 }}>
              {p.total_issues ? <>
                <div className="cust-bar"><div style={{ width: `${pct}%` }} /></div>
                <div className="muted small">{p.done_issues}/{p.total_issues} việc · {pct}%{p.overdue_issues ? <span className="overdue"> · {p.overdue_issues} quá hạn</span> : null}</div>
              </> : <span className="muted small">Chưa có việc</span>}
            </td>
            {!compact && <>
              <td>{p.priority && <span className={lozengeOf(PROJECT_PRIORITIES, p.priority)}>{p.priority}</span>}</td>
              <td className="small nowrap">{p.start_date || p.end_date ? `${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}` : ''}</td>
              <td className="small">{p.ba}</td><td className="small">{p.dev}</td><td className="small">{p.am}</td>
            </>}
          </tr>
        );
      })}</tbody>
    </table></div>
  );
}

/** Công việc chưa hoàn thành của mọi dự án thuộc khách hàng, sắp theo hạn */
function Issues({ c }: { c: Detail }) {
  const { open } = useIssueModal();
  const [project, setProject] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const now = today();
  const list = c.issues.filter((i) => (!project || i.project_key === project) && (!overdueOnly || (i.due_date && i.due_date < now)));
  const hidden = c.projects.filter((p) => !p.accessible && !p.is_archived).length;
  const projectsWithWork = c.projects.filter((p) => c.issues.some((i) => i.project_key === p.key));
  return (
    <div className="card">
      <div className="filter-bar">
        <select value={project} className={project ? 'filter-on' : ''} onChange={(e) => setProject(e.target.value)}>
          <option value="">Dự án: Tất cả</option>
          {projectsWithWork.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} /> Chỉ việc quá hạn</label>
        <span className="muted small">{list.length} việc chưa hoàn thành</span>
      </div>
      {hidden > 0 && <p className="muted small">Có {hidden} dự án bạn chưa là thành viên nên không hiện công việc.</p>}
      {!list.length ? <Empty title="Không có công việc nào đang mở" /> : (
        <div className="issue-lines">{list.map((i) => <IssueLine key={i.id} issue={i} onOpen={() => open(i.key)} />)}</div>
      )}
    </div>
  );
}

function ContactLine({ ct }: { ct: Pick<CustomerContact, 'full_name' | 'position' | 'phone' | 'email' | 'is_primary'> }) {
  return (
    <div>
      <b>{ct.full_name}</b>{ct.position && <span className="muted"> · {ct.position}</span>}
      <div className="row gap-sm small" style={{ flexWrap: 'wrap' }}>
        {ct.phone && <a href={`tel:${ct.phone}`} className="row gap-xs"><Phone size={13} /> {ct.phone}</a>}
        {ct.email && <a href={`mailto:${ct.email}`} className="row gap-xs"><Mail size={13} /> {ct.email}</a>}
      </div>
    </div>
  );
}

function Contacts({ c, canEdit, onEdit }: { c: Detail; canEdit: boolean; onEdit: (ct: Partial<CustomerContact>) => void }) {
  const removeContact = async (ct: CustomerContact) => {
    if (!confirm(`Xóa người liên hệ ${ct.full_name}?`)) return;
    try { await api.del(`/customers/${c.id}/contacts/${ct.id}`); await refreshAll(); } catch (e) { toastError(e); }
  };
  return (
    <div className="card">
      <div className="card-head"><h3>Người liên hệ</h3>
        {canEdit && <button className="btn btn-sm" onClick={() => onEdit({ is_primary: c.contacts.length ? 0 : 1 })}>+ Thêm</button>}</div>
      {!c.contacts.length ? <p className="muted small">Chưa có người liên hệ</p> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Họ tên</th><th>Chức vụ</th><th>Điện thoại</th><th>Email</th><th>Ghi chú</th>{canEdit && <th />}</tr></thead>
          <tbody>{c.contacts.map((ct) => (
            <tr key={ct.id}>
              <td><b>{ct.full_name}</b> {!!ct.is_primary && <Star size={13} fill="currentColor" style={{ color: 'var(--warn)', verticalAlign: -1 }} data-tip="Đầu mối chính" />}</td>
              <td>{ct.position}</td>
              <td>{ct.phone && <a href={`tel:${ct.phone}`}>{ct.phone}</a>}</td>
              <td>{ct.email && <a href={`mailto:${ct.email}`}>{ct.email}</a>}</td>
              <td className="muted small">{ct.note}</td>
              {canEdit && <td className="num nowrap">
                <button className="icon-btn" aria-label={`Sửa ${ct.full_name}`} data-tip="Sửa" onClick={() => onEdit(ct)}><Pencil size={15} /></button>
                <button className="icon-btn" aria-label={`Xóa ${ct.full_name}`} data-tip="Xóa" onClick={() => removeContact(ct)}><Trash2 size={15} /></button>
              </td>}
            </tr>
          ))}</tbody>
        </table></div>
      )}
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
