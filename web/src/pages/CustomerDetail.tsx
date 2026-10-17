import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, CalendarClock, ChevronLeft, ContactRound, Download, FileText, FolderKanban, History, LayoutDashboard, ListTodo, Mail,
  MessageSquareText, Paperclip, Pencil, Phone, Trash2, Users, type LucideIcon,
} from 'lucide-react';
import { api, refreshAll } from '../api';
import { hasPerm, useIssueModal, useMe } from '../hooks';
import type { ActivityKind, CustomerContact, CustomerDetail as Detail, CustomerProject } from '../types';
import { splitNames } from '../components/ProjectInfoFields';
import { customerKpis, CUSTOMER_STATUSES } from '../customer-filter';
import { colorOf, fmtDate, fmtDateTime, fmtSize, lozengeOf, PROJECT_PRIORITIES, PROJECT_STATUSES, timeAgo, today } from '../util';
import { CustomerModal } from './Customers';
import { Avatar, Empty, Spinner, toast, toastError, TypeIcon } from '../components/ui';
import { IssueLine } from '../components/IssueRow';

const ACTIVITY: Record<ActivityKind, { label: string; icon: ReactNode }> = {
  call: { label: 'Gọi điện', icon: <Phone size={14} /> },
  meeting: { label: 'Gặp mặt', icon: <Users size={14} /> },
  email: { label: 'Email', icon: <Mail size={14} /> },
  note: { label: 'Ghi chú', icon: <MessageSquareText size={14} /> },
};

type Tab = 'overview' | 'projects' | 'issues' | 'contacts' | 'files' | 'care';

/** Trang khách hàng — xem toàn bộ thông tin liên quan: thông tin chung, dự án, công việc, người liên hệ, lịch sử chăm sóc */
export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const [params, setParams] = useSearchParams();
  const { data: c, isLoading, error } = useQuery<Detail>({ queryKey: ['customer', id], queryFn: () => api.get(`/customers/${id}`) });
  const [editing, setEditing] = useState(false);
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
    ['contacts', `Đầu mối liên hệ (${c.contacts.length})`, ContactRound],
    ['files', `Tài liệu (${c.files.length})`, FileText],
    ['care', `Lịch sử chăm sóc (${c.activities.length})`, History],
  ];

  const remove = async () => {
    if (!confirm(`Xóa khách hàng ${c.name}? Đầu mối liên hệ, tài liệu và lịch sử chăm sóc sẽ bị xóa theo. Các dự án sẽ được gỡ khỏi khách hàng này (dữ liệu dự án vẫn giữ nguyên).`)) return;
    try { await api.del(`/customers/${c.id}`); toast('Đã xóa khách hàng'); await refreshAll(); navigate('/customers'); } catch (e) { toastError(e); }
  };

  return (
    <div className="page">
      <div className="breadcrumb"><Link to="/customers"><ChevronLeft size={14} /> Khách hàng</Link></div>
      <div className="page-head">
        <h1>{c.name}</h1>
        <span className={lozengeOf(CUSTOMER_STATUSES, c.status)}>{c.status}</span>
        {(c.province || c.ward) && <span className="muted small">{[c.ward, c.province].filter(Boolean).join(', ')}</span>}
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
      {tab === 'contacts' && <Contacts c={c} canEdit={canEdit} onEdit={() => setEditing(true)} />}
      {tab === 'files' && <Files c={c} canAdd={canEdit} canDeleteAll={canDelete} meId={me?.id} />}
      {tab === 'care' && <Activities customer={c} canAdd={canEdit} canDeleteAll={canDelete} meId={me?.id} />}

      {editing && <CustomerModal customer={c} contacts={c.contacts} onClose={() => setEditing(false)} />}
    </div>
  );
}

function Overview({ c, k, go }: { c: Detail; k: ReturnType<typeof customerKpis>; go: (t: Tab) => void }) {
  const { open } = useIssueModal();
  const primary = c.contacts[0];
  const info: [string, ReactNode][] = [
    ['Tỉnh thành', c.province], ['Phường/Xã', c.ward], ['Loại sản phẩm', c.product_type_name], ['Sản phẩm', c.product_name],
    ['Mô tả sản phẩm', c.product_description && <span style={{ whiteSpace: 'pre-wrap' }}>{c.product_description}</span>],
    ['Nguồn khách hàng', c.source], ['Tình trạng', <span className={lozengeOf(CUSTOMER_STATUSES, c.status)}>{c.status}</span>],
    ['Nhân viên phụ trách', splitNames(c.am).join(', ')],
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
          <div className="kpi-label"><ContactRound size={15} /> Đầu mối liên hệ</div>
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
          <div className="card">
            <div className="card-head"><h3>Đầu mối liên hệ</h3><a className="small" onClick={() => go('contacts')}>Xem tất cả</a></div>
            {!c.contacts.length ? <p className="muted small">Chưa có đầu mối liên hệ</p>
              : <div className="stack-sm">{c.contacts.slice(0, 3).map((ct) => <ContactLine key={ct.id} ct={ct} />)}</div>}
          </div>
          <div className="card">
            <div className="card-head"><h3>Tài liệu</h3><a className="small" onClick={() => go('files')}>Xem tất cả</a></div>
            {!c.files.length ? <p className="muted small">Chưa có tài liệu</p> : <FileRows c={c} files={c.files.slice(0, 5)} />}
          </div>
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

function ContactLine({ ct }: { ct: CustomerContact }) {
  return (
    <div>
      <b>{ct.full_name}</b>
      <div className="row gap-sm small" style={{ flexWrap: 'wrap' }}>
        {ct.phone && <a href={`tel:${ct.phone}`} className="row gap-xs"><Phone size={13} /> {ct.phone}</a>}
        {ct.email && <a href={`mailto:${ct.email}`} className="row gap-xs"><Mail size={13} /> {ct.email}</a>}
      </div>
    </div>
  );
}

/** Đầu mối liên hệ — thêm/sửa/bỏ trong form Sửa thông tin khách hàng */
function Contacts({ c, canEdit, onEdit }: { c: Detail; canEdit: boolean; onEdit: () => void }) {
  return (
    <div className="card">
      <div className="card-head"><h3>Đầu mối liên hệ</h3>
        {canEdit && <button className="btn btn-sm" onClick={onEdit}><Pencil size={14} /> Thêm / sửa đầu mối</button>}</div>
      {!c.contacts.length ? <p className="muted small">Chưa có đầu mối liên hệ</p> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Tên</th><th>SĐT</th><th>Email</th></tr></thead>
          <tbody>{c.contacts.map((ct) => (
            <tr key={ct.id}>
              <td><b>{ct.full_name}</b></td>
              <td>{ct.phone && <a href={`tel:${ct.phone}`}>{ct.phone}</a>}</td>
              <td>{ct.email && <a href={`mailto:${ct.email}`}>{ct.email}</a>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

function FileRows({ c, files, canDelete }: { c: Detail; files: Detail['files']; canDelete?: (f: Detail['files'][number]) => boolean }) {
  const remove = async (id: number, name: string) => {
    if (!confirm(`Xóa tài liệu ${name}?`)) return;
    try { await api.del(`/customers/${c.id}/files/${id}`); await refreshAll(); } catch (e) { toastError(e); }
  };
  return (
    <div className="file-list">
      {files.map((f) => (
        <div key={f.id} className="file-row">
          <FileText size={16} className="muted" />
          <div className="grow" style={{ minWidth: 0 }}>
            <a className="ellipsis" style={{ display: 'block' }} href={`/api/customers/${c.id}/files/${f.id}`}>{f.filename}</a>
            <div className="muted small">{fmtSize(f.size)} · {f.uploader_name ?? '—'} · {fmtDateTime(f.created_at)}</div>
          </div>
          <a className="icon-btn" aria-label={`Tải ${f.filename}`} data-tip="Tải về" href={`/api/customers/${c.id}/files/${f.id}`}><Download size={15} /></a>
          {canDelete?.(f) && <button className="icon-btn" aria-label={`Xóa ${f.filename}`} data-tip="Xóa" onClick={() => remove(f.id, f.filename)}><Trash2 size={15} /></button>}
        </div>
      ))}
    </div>
  );
}

/** Tài liệu của khách hàng: tải lên nhiều tệp; người tải lên tự xóa được, xóa tệp của người khác cần quyền xóa khách hàng */
function Files({ c, canAdd, canDeleteAll, meId }: { c: Detail; canAdd: boolean; canDeleteAll: boolean; meId?: number }) {
  const [busy, setBusy] = useState(false);
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      Array.from(list).forEach((f) => fd.append('files', f));
      await api.post(`/customers/${c.id}/files`, fd);
      toast('Đã tải lên');
      await refreshAll();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <div className="card">
      <div className="card-head"><h3>Tài liệu</h3>
        {canAdd && <label className="btn btn-sm"><Paperclip size={14} /> {busy ? 'Đang tải…' : 'Tải tài liệu lên'}
          <input type="file" multiple hidden disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} /></label>}</div>
      {!c.files.length ? <p className="muted small">Chưa có tài liệu</p>
        : <FileRows c={c} files={c.files} canDelete={(f) => canDeleteAll || (canAdd && f.uploader_id === meId)} />}
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
