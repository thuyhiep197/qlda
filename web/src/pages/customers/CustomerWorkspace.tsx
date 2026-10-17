import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, LayoutList, Search, Star } from 'lucide-react';
import { api } from '../../api';
import type { Customer, CustomerDetail } from '../../types';
import { CUSTOMER_STATUSES, filterCustomers, fold } from '../../customer-filter';
import { fmtDate, lozengeOf } from '../../util';
import { useCustomers } from '../Customers';
import { Empty, Spinner } from '../../components/ui';
import JourneyPane from './JourneyPane';
import CustomerSide from './CustomerSide';
import StepPanel from './StepPanel';

/**
 * Phân hệ Khách hàng — bố cục nhiều cột:
 *  - Cột trái (cả 2 màn): Khách hàng của tôi, Tất cả khách hàng — mỗi nhóm hiện luôn tên các khách hàng bên dưới.
 *  - Danh sách (/customers): giữa là bảng khách hàng của nhóm đang chọn.
 *  - Chi tiết (/customers/:id): giữa là Hành trình;
 *    phải là Thông tin khách hàng + Công việc + Tài liệu, hoặc Trao đổi + Tài liệu của bước đang chọn (?step=).
 */
export default function CustomerWorkspace() {
  const { id } = useParams();
  const { data: customers, isLoading } = useCustomers();
  const [params] = useSearchParams();
  // Mặc định: Khách hàng của tôi; chưa phụ trách khách hàng nào thì mở Tất cả khách hàng
  const hasMine = (customers || []).some((c) => c.is_mine);
  const group: 'mine' | 'all' = params.get('g') === 'all' || (params.get('g') !== 'mine' && !hasMine) ? 'all' : 'mine';
  const [q, setQ] = useState('');
  const list = filterCustomers(customers || [], { q, status: '', productType: '', province: '', mine: group === 'mine' });

  if (isLoading) return <Spinner />;
  return (
    <div className="cw">
      <CustomerTree customers={customers || []} group={group} current={id ? Number(id) : null} />
      {id ? <Detail id={id} /> : <CustomerTable list={list} total={group === 'mine' ? (customers || []).filter((c) => c.is_mine).length : customers?.length ?? 0}
        title={group === 'mine' ? 'Khách hàng của tôi' : 'Tất cả khách hàng'} q={q} setQ={setQ} />}
    </div>
  );
}

/** Cột trái: 2 nhóm Khách hàng của tôi / Tất cả khách hàng, mỗi nhóm thu gọn được và hiện tên khách hàng bên dưới */
function CustomerTree({ customers, group, current }: { customers: Customer[]; group: 'mine' | 'all'; current: number | null }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');
  const hit = (c: Customer) => !q.trim() || fold(c.name).includes(fold(q.trim()));
  const groups: ['mine' | 'all', string, Customer[], React.ReactNode][] = [
    ['mine', 'Khách hàng của tôi', customers.filter((c) => c.is_mine), <Star size={16} />],
    ['all', 'Tất cả khách hàng', customers, <LayoutList size={16} />],
  ];
  return (
    <aside className="cw-left">
      <div className="cw-search"><Search size={14} /><input placeholder="Tìm khách hàng…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {groups.map(([key, label, items, icon]) => {
        const open = !closed[key] || !!q.trim();
        return (
          <div key={key} className="cw-group">
            <div className={`cw-item ${!current && group === key ? 'active' : ''}`}>
              <button className="cw-caret" aria-label={open ? 'Thu gọn' : 'Mở rộng'} onClick={() => setClosed({ ...closed, [key]: open })}>
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
              <Link to={`/customers?g=${key}`} className="cw-group-link">{icon}<span className="grow ellipsis">{label}</span></Link>
              <span className="cw-count">{items.length}</span>
            </div>
            {open && items.filter(hit).map((c) => (
              <Link key={c.id} to={`/customers/${c.id}?g=${key}`} title={c.name}
                className={`cw-sub ${c.id === current && group === key ? 'active' : ''}`}>
                <span className={`cw-dot tone-${CUSTOMER_STATUSES.find(([n]) => n === c.status)?.[1] ?? 'default'}`} data-tip={c.status} />
                <span className="ellipsis">{c.name}</span>
              </Link>
            ))}
            {open && !items.some(hit) && <div className="muted small cw-sub-empty">{key === 'mine' ? 'Bạn chưa phụ trách khách hàng nào' : 'Không có khách hàng phù hợp'}</div>}
          </div>
        );
      })}
    </aside>
  );
}

/** Bảng khách hàng ở màn danh sách */
function CustomerTable({ list, total, title, q, setQ }: { list: Customer[]; total: number; title: string; q: string; setQ: (v: string) => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const g = params.get('g') ? `?g=${params.get('g') === 'all' ? 'all' : 'mine'}` : '';
  return (
    <section className="cw-main">
      <div className="cw-toolbar">
        <h2 className="cw-title">{title}</h2>
        <div className="cw-search grow"><Search size={14} /><input placeholder="Tìm theo tên, tỉnh, phường/xã, sản phẩm, đầu mối, nhân viên phụ trách…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
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
