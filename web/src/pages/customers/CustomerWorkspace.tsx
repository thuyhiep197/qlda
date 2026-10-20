import { Fragment, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Archive, ChevronDown, ChevronRight, FolderOpen, LayoutList, Plus, Search, Star } from 'lucide-react';
import { api } from '../../api';
import { ManageContext, useCan } from './manage';
import type { Customer, CustomerDetail, SalesProject, SalesProjectDetail, StepDetail } from '../../types';
import { CUSTOMER_STATUSES, customerTree, filterCustomers, salesStatusClass } from '../../customer-filter';
import { colorOf, fmtDate, lozengeOf } from '../../util';
import { useCustomers } from '../Customers';
import { Empty, Spinner } from '../../components/ui';
import JourneyPane from './JourneyPane';
import CustomerSide from './CustomerSide';
import SalesProjectSide, { SalesProjectModal } from './SalesProjectSide';
import StepPanel from './StepPanel';

/**
 * Phân hệ Khách hàng (Phòng Kinh doanh, AM dùng chính) — quản lý theo khách hàng và theo dự án:
 *  - Cột trái: Khách hàng của tôi / Tất cả khách hàng; mỗi khách hàng (cấp 1) mở ra các dự án của khách hàng (cấp 2).
 *  - Danh sách (/customers): bảng khách hàng, dưới mỗi khách hàng là các dự án.
 *  - Khách hàng (/customers/:id): giữa là danh sách dự án của khách hàng; phải là thông tin khách hàng, công việc, tài liệu.
 *  - Dự án (/customers/:id/p/:pid): giữa là hành trình bán hàng (quy trình I–IV) của dự án;
 *    phải là thông tin dự án, hoặc Trao đổi + Tài liệu của bước đang chọn (?step=).
 */
export default function CustomerWorkspace() {
  const { id, pid } = useParams();
  const [archived, setArchived] = useShowArchived();
  const { data: customers, isLoading } = useCustomers(archived);
  const [params] = useSearchParams();
  // Mặc định: Khách hàng của tôi; chưa phụ trách khách hàng nào thì mở Tất cả khách hàng
  const hasMine = (customers || []).some((c) => c.is_mine);
  const group: 'mine' | 'all' = params.get('g') === 'all' || (params.get('g') !== 'mine' && !hasMine) ? 'all' : 'mine';
  const [q, setQ] = useState('');
  const list = filterCustomers(customers || [], { q, status: '', province: '', mine: group === 'mine' });

  if (isLoading) return <Spinner />;
  return (
    <div className="cw">
      <CustomerTree customers={customers || []} group={group} current={id ? Number(id) : null} currentProject={pid ? Number(pid) : null}
        archived={archived} setArchived={setArchived} />
      {id && pid ? <ProjectView id={id} pid={pid} archived={archived} /> : id ? <CustomerView id={id} archived={archived} />
        : <CustomerTable list={list} total={group === 'mine' ? (customers || []).filter((c) => c.is_mine).length : customers?.length ?? 0}
          title={group === 'mine' ? 'Khách hàng của tôi' : 'Tất cả khách hàng'} q={q} setQ={setQ} />}
    </div>
  );
}

const statusTone = (s: string) => CUSTOMER_STATUSES.find(([n]) => n === s)?.[1] ?? 'default';
const salesTone = (s: string | null) => salesStatusClass(s).replace('lozenge lozenge-', '');

/** Cột trái: 2 nhóm Khách hàng của tôi / Tất cả khách hàng; dưới mỗi khách hàng (cấp 1) là các dự án của khách hàng (cấp 2) */
function CustomerTree({ customers, group, current, currentProject, archived, setArchived }: {
  customers: Customer[]; group: 'mine' | 'all'; current: number | null; currentProject: number | null; archived: boolean; setArchived: (v: boolean) => void;
}) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');
  const groups: ['mine' | 'all', string, Customer[], React.ReactNode][] = [
    ['mine', 'Khách hàng của tôi', customers.filter((c) => c.is_mine), <Star size={16} />],
    ['all', 'Tất cả khách hàng', customers, <LayoutList size={16} />],
  ];
  const searching = !!q.trim();
  return (
    <aside className="cw-left">
      <div className="cw-search"><Search size={14} /><input placeholder="Tìm khách hàng, dự án…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <label className="check small cw-arch"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Xem đã lưu trữ</label>
      {groups.map(([key, label, items, icon]) => {
        const open = !closed[key] || searching;
        const tree = customerTree(items, q);
        return (
          <div key={key} className="cw-group">
            <div className={`cw-item ${!current && group === key ? 'active' : ''}`}>
              <button className="cw-caret" aria-label={open ? 'Thu gọn' : 'Mở rộng'} onClick={() => setClosed({ ...closed, [key]: open })}>
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
              <Link to={`/customers?g=${key}`} className="cw-group-link">{icon}<span className="grow ellipsis">{label}</span></Link>
              <span className="cw-count">{items.length}</span>
            </div>
            {open && tree.map(({ customer: c, projects }) => {
              // Dự án của khách hàng: mở sẵn ở khách hàng đang xem, khi tìm kiếm; bấm mũi tên để mở / thu gọn
              const ck = `${key}:${c.id}`;
              const expanded = searching || (closed[ck] === undefined ? c.id === current && group === key : !closed[ck]);
              const here = c.id === current && group === key;
              return (
                <Fragment key={c.id}>
                  <div className={`cw-sub cw-crow ${here && !currentProject ? 'active' : ''}`}>
                    {projects.length ? <button className="cw-caret" aria-label={expanded ? 'Thu gọn dự án' : 'Xem dự án'}
                      onClick={() => setClosed({ ...closed, [ck]: expanded })}>{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
                      : <span className="cw-caret-space" />}
                    <Link to={`/customers/${c.id}?g=${key}`} title={c.name} className="cw-sub-link">
                      <span className={`cw-dot tone-${statusTone(c.status)}`} data-tip={c.status} />
                      <span className="ellipsis grow">{c.name}</span>{!!c.is_archived && <Archive size={12} className="muted" data-tip="Đã lưu trữ" />}
                      {projects.length > 0 && <span className="cw-count">{projects.length}</span>}
                    </Link>
                  </div>
                  {expanded && projects.map((p) => (
                    <Link key={p.id} to={`/customers/${c.id}/p/${p.id}?g=${key}`} title={`${p.code} ${p.name} — ${p.status ?? "Chưa áp dụng quy trình"}`}
                      className={`cw-sub cw-proj ${here && p.id === currentProject ? 'active' : ''}`}>
                      <FolderOpen size={13} className="muted" />
                      <span className="ellipsis grow">{p.name}</span>{!!p.is_archived && <Archive size={12} className="muted" data-tip="Đã lưu trữ" />}
                      <span className={`cw-dot tone-${salesTone(p.status)}`} data-tip={p.status ?? "Chưa áp dụng quy trình"} />
                    </Link>
                  ))}
                </Fragment>
              );
            })}
            {open && !tree.length && <div className="muted small cw-sub-empty">{key === 'mine' && !searching ? 'Bạn chưa phụ trách khách hàng nào' : 'Không có khách hàng phù hợp'}</div>}
          </div>
        );
      })}
    </aside>
  );
}

/** Ô tiến độ hành trình của một dự án */
function JourneyCell({ p }: { p: SalesProject }) {
  if (p.journey_pct == null) return <span className="muted small">Chưa áp dụng quy trình</span>;
  return (
    <>
      <div className="cust-bar"><div style={{ width: `${p.journey_pct}%` }} /></div>
      <div className="small">{p.journey_pct}% bước hoàn thành
        {p.journey_overdue > 0 && <span className="overdue"> · {p.journey_overdue} trễ</span>}</div>
    </>
  );
}

/** Dự án sản xuất đã gắn (phân hệ Dự án) */
const ProductionChip = ({ p }: { p: SalesProject }) => p.project_key
  ? <span className="row gap-xs small" data-tip={`Đã chuyển sang phân hệ Dự án: ${p.project_name}`}><span className="proj-dot sm" style={{ background: colorOf(p.project_key) }}>{p.project_key.slice(0, 2)}</span>{p.project_key}</span>
  : <span className="muted small">—</span>;

/** Bảng khách hàng ở màn danh sách: mỗi khách hàng một dòng, dưới là các dự án của khách hàng */
function CustomerTable({ list, total, title, q, setQ }: { list: Customer[]; total: number; title: string; q: string; setQ: (v: string) => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const g = params.get('g') ? `?g=${params.get('g') === 'all' ? 'all' : 'mine'}` : '';
  const projectCount = list.reduce((n, c) => n + (c.sales_projects?.length ?? 0), 0);
  return (
    <section className="cw-main">
      <div className="cw-toolbar">
        <h2 className="cw-title">{title}</h2>
        <div className="cw-search grow"><Search size={14} /><input placeholder="Tìm theo khách hàng, dự án, tỉnh, sản phẩm, đầu mối, nhân viên phụ trách…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {!list.length ? <Empty title={total ? 'Không có khách hàng phù hợp' : 'Chưa có khách hàng nào bạn được xem'}>
        {!total && <p className="muted small">Bạn chỉ thấy khách hàng mình phụ trách hoặc có việc được giao.</p>}</Empty> : (
        <div className="cw-scroll table-wrap">
          <table className="table cw-table">
            <thead><tr><th className="num">STT</th><th>Khách hàng / Dự án</th><th>Sản phẩm</th><th>Tình trạng</th><th>Hành trình</th><th>Sale</th><th>AM</th><th>Sản xuất</th><th>Đầu mối</th><th>Làm việc gần nhất</th></tr></thead>
            <tbody>{list.map((c, i) => (
              <Fragment key={c.id}>
                <tr className="click-row cw-row-cust" onClick={() => navigate(`/customers/${c.id}${g}`)}>
                  <td className="num muted">{i + 1}</td>
                  <td><Link to={`/customers/${c.id}${g}`} onClick={(e) => e.stopPropagation()}><b>{c.name}</b></Link>
                    {(c.province_name || c.ward_name) && <div className="muted small">{[c.ward_name, c.province_name].filter(Boolean).join(', ')}</div>}</td>
                  <td className="muted small">{c.sales_projects?.length ? `${c.sales_projects.length} dự án` : 'Chưa có dự án'}</td>
                  <td><span className={lozengeOf(CUSTOMER_STATUSES, c.status)}>{c.status}</span></td>
                  <td />
                  <td className="small">{c.kd_names}</td>
                  <td className="small">{c.am_names}</td>
                  <td />
                  <td>{c.contact_name}{c.contact_phone && <div className="muted small">{c.contact_phone}</div>}</td>
                  <td className="nowrap small">{c.last_activity_date ? fmtDate(c.last_activity_date) : <span className="muted">—</span>}</td>
                </tr>
                {c.sales_projects?.map((p) => (
                  <tr key={`p${p.id}`} className="click-row cw-row-proj" onClick={() => navigate(`/customers/${c.id}/p/${p.id}${g}`)}>
                    <td />
                    <td><Link to={`/customers/${c.id}/p/${p.id}${g}`} onClick={(e) => e.stopPropagation()} className="row gap-xs"><FolderOpen size={13} className="muted" /> <span className="muted small">{p.code}</span> {p.name}</Link></td>
                    <td className="small">{p.product_name ?? <span className="muted">{p.product_type_name}</span>}</td>
                    <td><span className={salesStatusClass(p.status)}>{p.status ?? "Chưa áp dụng quy trình"}</span></td>
                    <td style={{ minWidth: 170 }}><JourneyCell p={p} /></td>
                    <td className="small">{p.kd_names}</td>
                    <td className="small">{p.am_names}</td>
                    <td><ProductionChip p={p} /></td>
                    <td /><td />
                  </tr>
                ))}
              </Fragment>
            ))}</tbody>
          </table>
        </div>
      )}
      <div className="cw-foot muted small">Hiển thị {list.length} / {total} khách hàng · {projectCount} dự án</div>
    </section>
  );
}

const useCustomer = (id: string, archived = false) => useQuery<CustomerDetail>({
  queryKey: ['customer', id, archived], queryFn: () => api.get(`/customers/${id}${archived ? '?archived=1' : ''}`),
});

/** Màn khách hàng: giữa là các dự án của khách hàng, phải là thông tin khách hàng */
function CustomerView({ id, archived }: { id: string; archived: boolean }) {
  const { data: c, isLoading, error } = useCustomer(id, archived);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const can = useCan();
  const [adding, setAdding] = useState(false);
  const step = Number(params.get('step')) || null;
  // Đường dẫn cũ /customers/:id?step= (thông báo, Dashboard) → mở dự án chứa bước đó
  useEffect(() => {
    if (!step) return;
    api.get<StepDetail>(`/customers/${id}/journey/${step}`)
      .then((s) => { if (s.sales_project_id) navigate(`/customers/${id}/p/${s.sales_project_id}?step=${step}`, { replace: true }); })
      .catch(() => { /* bước đã bị bỏ → ở lại màn khách hàng */ });
  }, [id, step, navigate]);
  if (isLoading) return <section className="cw-main"><Spinner /></section>;
  if (!c) return <section className="cw-main"><Empty title={error instanceof Error ? error.message : 'Không tìm thấy khách hàng'} /></section>;
  const g = params.get('g') ? `?g=${params.get('g')}` : '';
  const canAddProject = can('sales_project.create') && !!c.can_manage && !c.is_archived;
  return (
    <ManageContext.Provider value={!!c.can_manage}>
      <section className="cw-main">
        <div className="cw-head">
          <div className="grow" style={{ minWidth: 0 }}>
            <h2 className="ellipsis">{c.name}</h2>
            {!!c.is_archived && <div className="cw-archived"><Archive size={15} /> Khách hàng đã lưu trữ — không hiện trong danh sách</div>}
            <div className="row gap-sm small muted" style={{ flexWrap: 'wrap' }}>
              <span className={lozengeOf(CUSTOMER_STATUSES, c.status)}>{c.status}</span>
              {[c.ward_name, c.province_name].filter(Boolean).join(', ')}
              {c.kd_names && <span>· Sale: {c.kd_names}</span>}{c.am_names && <span>· AM: {c.am_names}</span>}
            </div>
          </div>
          {canAddProject && <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={15} /> Thêm dự án</button>}
        </div>
        <div className="cw-toolbar"><h3 className="cw-title" style={{ fontSize: 15 }}>Dự án của khách hàng ({c.sales_projects.length})</h3></div>
        {!c.sales_projects.length ? (
          <div className="cw-scroll"><Empty title="Khách hàng chưa có dự án">
            <p className="muted">Mỗi dự án (sản phẩm có sẵn hoặc dự án làm mới) có tình trạng và hành trình bán hàng riêng theo quy trình I. Giải pháp → II. Hợp đồng → III. Triển khai → IV. Nghiệm thu – Thanh toán.
              Khi ký hợp đồng, dự án được chuyển sang phân hệ Dự án để Dev, BA, Tester sản xuất.</p>
            {canAddProject && <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={15} /> Thêm dự án</button>}
          </Empty></div>
        ) : (
          <div className="cw-scroll table-wrap">
            <table className="table cw-table">
              <thead><tr><th>Mã</th><th>Tên dự án</th><th>Sản phẩm</th><th>Tình trạng</th><th>Hành trình</th><th>Sale</th><th>AM</th><th>Việc đang mở</th><th>Sản xuất</th></tr></thead>
              <tbody>{c.sales_projects.map((p) => (
                <tr key={p.id} className="click-row" onClick={() => navigate(`/customers/${c.id}/p/${p.id}${g}`)}>
                  <td className="nowrap muted small">{p.code}</td>
                  <td><Link to={`/customers/${c.id}/p/${p.id}${g}`} onClick={(e) => e.stopPropagation()}><b>{p.name}</b></Link></td>
                  <td className="small">{p.product_name ?? <span className="muted">{p.product_type_name}</span>}</td>
                  <td><span className={salesStatusClass(p.status)}>{p.status ?? "Chưa áp dụng quy trình"}</span></td>
                  <td style={{ minWidth: 190 }}><JourneyCell p={p} /></td>
                  <td className="small">{p.kd_names}</td>
                  <td className="small">{p.am_names}</td>
                  <td className="num">{p.open_tasks || <span className="muted">—</span>}</td>
                  <td><ProductionChip p={p} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      <aside className="cw-right"><CustomerSide c={c} /></aside>
      {adding && <SalesProjectModal customer={c} onClose={() => setAdding(false)} onSaved={(p) => navigate(`/customers/${c.id}/p/${p}${g}`)} />}
    </ManageContext.Provider>
  );
}

/** Màn dự án của khách hàng: giữa là hành trình bán hàng, phải là thông tin dự án hoặc bước đang chọn */
function ProjectView({ id, pid, archived }: { id: string; pid: string; archived: boolean }) {
  const { data: c } = useCustomer(id, archived);
  const { data: sp, isLoading, error } = useQuery<SalesProjectDetail>({ queryKey: ['sales-project', pid], queryFn: () => api.get(`/customers/${id}/projects/${pid}`) });
  const [params, setParams] = useSearchParams();
  const step = Number(params.get('step')) || null;
  const selectStep = (sid: number | null) => setParams((p) => { const n = new URLSearchParams(p); if (sid) n.set('step', String(sid)); else n.delete('step'); return n; }, { replace: true });
  if (isLoading || !c) return <section className="cw-main"><Spinner /></section>;
  if (!sp) return <section className="cw-main"><Empty title={error instanceof Error ? error.message : 'Không tìm thấy dự án'} /></section>;
  const g = params.get('g') ? `?g=${params.get('g')}` : '';
  return (
    <ManageContext.Provider value={!!sp.can_manage}>
      <section className="cw-main">
        <div className="cw-head">
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="muted small ellipsis"><Link to={`/customers/${c.id}${g}`}>{c.name}</Link> › Dự án</div>
            <h2 className="ellipsis">{sp.name}</h2>
            {!!sp.is_archived && <div className="cw-archived"><Archive size={15} /> Dự án đã lưu trữ — không hiện trong danh sách</div>}
            <div className="row gap-sm small muted" style={{ flexWrap: 'wrap' }}>
              <span className="muted">{sp.code}</span> <span className={salesStatusClass(sp.status)}>{sp.status ?? "Chưa áp dụng quy trình"}</span>
              {sp.product_name ?? sp.product_type_name}
              {sp.kd_names && <span>· Sale: {sp.kd_names}</span>}{sp.am_names && <span>· AM: {sp.am_names}</span>}
              {sp.journey_overdue > 0 && <span className="overdue row gap-xs"><AlertTriangle size={12} /> {sp.journey_overdue} bước quá hạn</span>}
            </div>
          </div>
        </div>
        <JourneyPane customerId={c.id} sp={sp} selected={step} onSelect={selectStep} />
      </section>
      <aside className="cw-right">
        {step ? <StepPanel customer={c} stepId={step} onClose={() => selectStep(null)} /> : <SalesProjectSide customer={c} sp={sp} />}
      </aside>
    </ManageContext.Provider>
  );
}

/** Ô "Xem đã lưu trữ" — nhớ trên máy (trình duyệt chặn lưu trữ thì mặc định không xem) */
const ARCHIVED_KEY = 'qlda-customers-archived';
function useShowArchived(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => { try { return localStorage.getItem(ARCHIVED_KEY) === '1'; } catch { return false; } });
  return [v, (n) => { setV(n); try { localStorage.setItem(ARCHIVED_KEY, n ? '1' : '0'); } catch { /* trình duyệt chặn lưu trữ */ } }];
}
