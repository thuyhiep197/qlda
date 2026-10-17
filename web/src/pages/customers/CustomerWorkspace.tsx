import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, LayoutList, Plus, Search, Star } from 'lucide-react';
import { api } from '../../api';
import { hasPerm, useMe, useProductTypes } from '../../hooks';
import type { Customer, CustomerDetail } from '../../types';
import { CUSTOMER_STATUSES, filterCustomers } from '../../customer-filter';
import { fmtDate, lozengeOf } from '../../util';
import { CustomerModal, useCustomers } from '../Customers';
import { Empty, Spinner } from '../../components/ui';
import JourneyPane from './JourneyPane';
import CustomerSide from './CustomerSide';
import StepPanel from './StepPanel';

/**
 * Phân hệ Khách hàng — bố cục nhiều cột:
 *  - Danh sách (/customers): cột trái là nhóm (Tất cả, Của tôi, Tình trạng, Loại sản phẩm); giữa là bảng khách hàng.
 *  - Chi tiết (/customers/:id): cột trái là danh sách khách hàng để chuyển nhanh; giữa là Hành trình;
 *    phải là Thông tin khách hàng + Công việc + Tài liệu, hoặc Trao đổi + Tài liệu của bước đang chọn (?step=).
 */
export default function CustomerWorkspace() {
  const { id } = useParams();
  const { data: customers, isLoading } = useCustomers();
  const [params, setParams] = useSearchParams();
  const group = params.get('g') || '';
  const setGroup = (g: string) => setParams((p) => { const n = new URLSearchParams(p); if (g) n.set('g', g); else n.delete('g'); return n; }, { replace: true });
  const [q, setQ] = useState('');
  const f = { q, status: group.startsWith('s:') ? group.slice(2) : '', productType: group.startsWith('t:') ? group.slice(2) : '', province: '', mine: group === 'mine' };
  const list = filterCustomers(customers || [], f);

  if (isLoading) return <Spinner />;
  return (
    <div className="cw">
      {id ? <CustomerList list={list} q={q} setQ={setQ} current={Number(id)} /> : <GroupPanel customers={customers || []} group={group} setGroup={setGroup} />}
      {id ? <Detail id={id} /> : <CustomerTable list={list} total={customers?.length ?? 0} q={q} setQ={setQ} />}
    </div>
  );
}

/** Cột trái ở màn danh sách: nhóm khách hàng kèm số lượng */
function GroupPanel({ customers, group, setGroup }: { customers: Customer[]; group: string; setGroup: (g: string) => void }) {
  const { data: types } = useProductTypes();
  const item = (key: string, label: string, n: number, icon?: React.ReactNode) => (
    <button key={key} className={`cw-item ${group === key ? 'active' : ''}`} onClick={() => setGroup(key)}>
      {icon}<span className="grow ellipsis">{label}</span><span className="cw-count">{n}</span>
    </button>
  );
  return (
    <aside className="cw-left">
      {item('', 'Tất cả khách hàng', customers.length, <LayoutList size={16} />)}
      {item('mine', 'Tôi phụ trách', customers.filter((c) => c.is_mine).length, <Star size={16} />)}
      <div className="cw-sec">Tình trạng</div>
      {CUSTOMER_STATUSES.map(([s, tone]) => item(`s:${s}`, s, customers.filter((c) => c.status === s).length, <span className={`cw-dot tone-${tone}`} />))}
      {!!types?.length && <div className="cw-sec">Loại sản phẩm</div>}
      {types?.map((t) => item(`t:${t.id}`, t.name, customers.filter((c) => c.product_type_id === t.id).length, <span className="cw-dot" />))}
    </aside>
  );
}

/** Cột trái ở màn chi tiết: danh sách khách hàng (theo nhóm đang lọc) để chuyển nhanh */
function CustomerList({ list, q, setQ, current }: { list: Customer[]; q: string; setQ: (v: string) => void; current: number }) {
  const [params] = useSearchParams();
  const back = params.get('g') ? `/customers?g=${encodeURIComponent(params.get('g')!)}` : '/customers';
  return (
    <aside className="cw-left">
      <Link to={back} className="cw-back"><ChevronLeft size={15} /> Danh sách khách hàng</Link>
      <div className="cw-search"><Search size={14} /><input placeholder="Tìm khách hàng…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {list.map((c) => (
        <Link key={c.id} to={`/customers/${c.id}${params.get('g') ? `?g=${encodeURIComponent(params.get('g')!)}` : ''}`} className={`cw-cust ${c.id === current ? 'active' : ''}`}>
          <span className="ellipsis"><b>{c.name}</b></span>
          <span className="row gap-xs small"><span className={lozengeOf(CUSTOMER_STATUSES, c.status)}>{c.status}</span>
            {c.journey_pct != null && <span className="muted">{c.journey_pct}%</span>}</span>
        </Link>
      ))}
      {!list.length && <div className="muted small pad">Không có khách hàng phù hợp</div>}
    </aside>
  );
}

/** Bảng khách hàng ở màn danh sách */
function CustomerTable({ list, total, q, setQ }: { list: Customer[]; total: number; q: string; setQ: (v: string) => void }) {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const g = params.get('g') ? `?g=${encodeURIComponent(params.get('g')!)}` : '';
  return (
    <section className="cw-main">
      <div className="cw-toolbar">
        <div className="cw-search grow"><Search size={14} /><input placeholder="Tìm theo tên, tỉnh, phường/xã, sản phẩm, đầu mối, nhân viên phụ trách…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {hasPerm(me, 'customer.create') && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> Thêm khách hàng</button>}
      </div>
      {!list.length ? <Empty title={total ? 'Không có khách hàng phù hợp' : 'Chưa có khách hàng nào bạn được xem'}>
        {!total && <p className="muted small">Bạn chỉ thấy khách hàng mình phụ trách hoặc có việc được giao.</p>}</Empty> : (
        <div className="cw-scroll table-wrap">
          <table className="table cw-table">
            <thead><tr><th className="num">STT</th><th>Tên cơ quan/đơn vị</th><th>Tỉnh/TP</th><th>Sản phẩm</th><th>Tình trạng</th><th>Hành trình</th><th>Nhân viên phụ trách</th><th>Đầu mối</th><th>Làm việc gần nhất</th></tr></thead>
            <tbody>{list.map((c, i) => (
              <tr key={c.id} className="click-row" onClick={() => navigate(`/customers/${c.id}${g}`)}>
                <td className="num muted">{i + 1}</td>
                <td><Link to={`/customers/${c.id}${g}`} onClick={(e) => e.stopPropagation()}><b>{c.name}</b></Link></td>
                <td>{c.province_name}{c.ward_name && <div className="muted small">{c.ward_name}</div>}</td>
                <td>{c.product_name ?? <span className="muted">{c.product_type_name}</span>}</td>
                <td><span className={lozengeOf(CUSTOMER_STATUSES, c.status)}>{c.status}</span></td>
                <td style={{ minWidth: 150 }}>{c.journey_pct == null ? <span className="muted small">Chưa áp dụng</span> : <>
                  <div className="cust-bar"><div style={{ width: `${c.journey_pct}%` }} /></div>
                  <div className="small ellipsis" style={{ maxWidth: 220 }} title={c.journey_stage ?? ''}>{c.journey_stage ?? 'Đã hoàn thành'} · {c.journey_pct}%</div>
                </>}</td>
                <td className="small">{c.owner_names}</td>
                <td>{c.contact_name}{c.contact_phone && <div className="muted small">{c.contact_phone}</div>}</td>
                <td className="nowrap small">{c.last_activity_date ? fmtDate(c.last_activity_date) : <span className="muted">—</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div className="cw-foot muted small">Hiển thị {list.length} / {total} khách hàng</div>
      {creating && <CustomerModal onClose={() => setCreating(false)} onSaved={(nid) => navigate(`/customers/${nid}`)} />}
    </section>
  );
}

/** Màn chi tiết: giữa là Hành trình, phải là thông tin khách hàng hoặc bước đang chọn */
function Detail({ id }: { id: string }) {
  const { data: c, isLoading, error } = useQuery<CustomerDetail>({ queryKey: ['customer', id], queryFn: () => api.get(`/customers/${id}`) });
  const [params, setParams] = useSearchParams();
  const step = Number(params.get('step')) || null;
  const selectStep = (sid: number | null) => setParams((p) => { const n = new URLSearchParams(p); if (sid) n.set('step', String(sid)); else n.delete('step'); return n; }, { replace: true });
  if (isLoading) return <section className="cw-main"><Spinner /></section>;
  if (!c) return <section className="cw-main"><Empty title={error instanceof Error ? error.message : 'Không tìm thấy khách hàng'} /></section>;
  return (
    <>
      <section className="cw-main"><JourneyPane c={c} selected={step} onSelect={selectStep} /></section>
      <aside className="cw-right">
        {step ? <StepPanel customer={c} stepId={step} onClose={() => selectStep(null)} /> : <CustomerSide c={c} />}
      </aside>
    </>
  );
}
