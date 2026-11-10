import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Download, PhoneCall, Search } from 'lucide-react';
import { api } from '../../api';
import type { ProductReport as Report, ProductReportCustomer, ProductReportGroup } from '../../types';
import { CUSTOMER_STATUS_CLASS, salesStatusClass } from '../../customer-filter';
import { daysSince, filterReport, RECENT_DAYS, statusColumns, summarize } from '../../product-report';
import { fmtDate } from '../../util';
import { hasPerm, useMe } from '../../hooks';
import { Empty, Spinner, toastError } from '../../components/ui';
import { SearchSelect } from '../../components/SearchSelect';
import { HelpButton } from '../../help/HelpMenu';

const Num = ({ n, tone }: { n: number; tone?: 'bad' }) => (n ? <span className={tone === 'bad' ? 'overdue' : undefined}>{n}</span> : <span className="muted">–</span>);
const ago = (days: number) => (days <= 0 ? 'hôm nay' : `${days} ngày trước`);
const projectText = (c: ProductReportCustomer) => c.projects.map((p) => `${p.code} ${p.name} — ${p.status ?? 'Chưa áp dụng quy trình'}${p.journey_pct != null ? ` (${p.journey_pct}%)` : ''}`).join('\n');

/**
 * Báo cáo khách hàng theo sản phẩm (/customers/report): mỗi sản phẩm có bao nhiêu khách hàng (qua các dự án của khách hàng đã chọn sản phẩm đó)
 * và hiện trạng tương tác — tình trạng khách hàng, trao đổi gần nhất, hành trình, lịch gọi, việc đang mở. Bấm một sản phẩm để xem từng khách hàng.
 * Một khách hàng dùng nhiều sản phẩm được đếm ở từng sản phẩm. Cột hiện theo ô quyền Xem của từng chức năng.
 */
export default function ProductReport() {
  const { data: r, isLoading, error } = useQuery<Report>({ queryKey: ['customers', 'product-report'], queryFn: () => api.get('/customers/report/by-product') });
  const { data: me } = useMe();
  const [q, setQ] = useState('');
  const [days, setDays] = useState(30);
  // Lọc theo một sản phẩm ('' = tất cả): chỉ còn dòng sản phẩm đó, mở sẵn danh sách khách hàng
  const [product, setProduct] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (isLoading) return <section className="cw-main"><Spinner /></section>;
  if (!r) return <section className="cw-main"><Empty title={error instanceof Error ? error.message : 'Không tải được báo cáo'} /></section>;
  const picked = r.groups.some((g) => g.key === product) ? product : '';
  const groups = filterReport(picked ? r.groups.filter((g) => g.key === picked) : r.groups, q);
  const statuses = statusColumns(r);
  const searching = !!q.trim();
  const canCustomer = hasPerm(me, 'customer.view');
  const cols = 2 + statuses.length + (r.can.talk ? 4 : 0) + 1 + (r.can.task ? 1 : 0);
  const products = r.groups.filter((g) => g.product_id).length;

  const exportExcel = async () => {
    try {
      const mod: any = await import('exceljs');
      const ExcelJS = mod.default ?? mod;
      const wb = new ExcelJS.Workbook();
      const sum = wb.addWorksheet('Tổng hợp', { views: [{ state: 'frozen', ySplit: 1 }] });
      sum.columns = [
        { header: 'Loại sản phẩm', key: 'type', width: 20 }, { header: 'Sản phẩm', key: 'name', width: 44 }, { header: 'Số khách hàng', key: 'n', width: 14 },
        ...statuses.map((s, i) => ({ header: `TT: ${s}`, key: `s${i}`, width: 16 })),
        ...(r.can.talk ? [{ header: `Trao đổi trong ${days} ngày`, key: 'recent', width: 16 }, { header: `Quá ${days} ngày chưa trao đổi`, key: 'stale', width: 18 },
          { header: 'Chưa có trao đổi', key: 'silent', width: 16 }, { header: 'Có lịch gọi đến hạn', key: 'calls', width: 16 }] : []),
        { header: 'Đã áp dụng hành trình', key: 'journey', width: 18 },
        ...(r.can.task ? [{ header: 'Việc đang mở', key: 'tasks', width: 13 }] : []),
      ];
      const det = wb.addWorksheet('Chi tiết', { views: [{ state: 'frozen', ySplit: 1 }] });
      det.columns = [
        { header: 'Loại sản phẩm', key: 'type', width: 20 }, { header: 'Sản phẩm', key: 'product', width: 36 }, { header: 'Khách hàng', key: 'name', width: 36 },
        { header: 'Mã KH', key: 'code', width: 11 }, { header: 'Tỉnh/TP', key: 'province', width: 18 },
        ...(r.can.info ? [{ header: 'Tình trạng khách hàng', key: 'status', width: 20 }] : []),
        { header: 'Sale', key: 'kd', width: 20 }, { header: 'AM', key: 'am', width: 20 }, { header: 'Dự án của khách hàng — tình trạng', key: 'projects', width: 50 },
        ...(r.can.talk ? [{ header: 'Số lần trao đổi', key: 'count', width: 12 }, { header: 'Ngày trao đổi gần nhất', key: 'date', width: 14 },
          { header: 'Số ngày chưa trao đổi', key: 'days', width: 13 }, { header: 'Người trao đổi', key: 'who', width: 20 }, { header: 'Nội dung trao đổi gần nhất', key: 'content', width: 60 },
          { header: 'Lịch gọi kế tiếp', key: 'call', width: 14 }, { header: 'Lịch gọi đến hạn', key: 'due', width: 13 }] : []),
        ...(r.can.task ? [{ header: 'Việc đang mở', key: 'tasks', width: 12 }] : []),
      ];
      for (const g of groups) {
        const s = summarize(g.customers, r.today, days);
        sum.addRow({ type: g.type_name ?? '', name: g.name, n: s.customers, ...Object.fromEntries(statuses.map((st, i) => [`s${i}`, s.byStatus[st] ?? 0])),
          recent: s.recent, stale: s.stale, silent: s.silent, calls: s.callsDue, journey: s.journey, tasks: s.openTasks });
        for (const c of g.customers) {
          det.addRow({ type: g.type_name ?? '', product: g.name, name: c.name, code: c.code ?? '', province: c.province_name ?? '', status: c.status ?? '',
            kd: c.kd_names ?? '', am: c.am_names ?? '', projects: projectText(c), count: c.activity_count ?? 0,
            date: c.last_activity ? fmtDate(c.last_activity.date) : '', days: c.last_activity ? daysSince(c.last_activity.date, r.today) : '',
            who: c.last_activity?.user_name ?? '', content: c.last_activity?.content ?? '', call: c.next_call_date ? fmtDate(c.next_call_date) : '',
            due: c.calls_due ?? 0, tasks: c.open_tasks ?? 0 });
        }
      }
      sum.addRow({});
      sum.addRow({ name: 'Tổng số khách hàng (không trùng — một khách hàng dùng nhiều sản phẩm được đếm ở từng sản phẩm)', n: new Set(groups.flatMap((g) => g.customers.map((c) => c.id))).size });
      for (const ws of [sum, det]) { ws.getRow(1).font = { bold: true }; ws.eachRow((row: any) => { row.alignment = { vertical: 'top', wrapText: true }; }); }
      const buf = await wb.xlsx.writeBuffer();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.download = `Khach-hang-theo-san-pham-${r.today}.xlsx`;
      a.click();
    } catch (e) { toastError(e); }
  };

  return (
    <section className="cw-main">
      <div className="cw-toolbar">
        <h2 className="cw-title">Báo cáo khách hàng theo sản phẩm <HelpButton /></h2>
        <div className="cw-search grow"><Search size={14} /><input placeholder="Tìm sản phẩm, khách hàng, dự án, tỉnh, Sale, AM…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <SearchSelect className="pr-filter" value={picked} onChange={(e) => setProduct(e.target.value)} aria-label="Lọc theo sản phẩm" data-tip="Lọc theo sản phẩm">
          <option value="">Tất cả sản phẩm</option>
          {r.groups.map((g) => <option key={g.key} value={g.key}>{g.name} ({g.customers.length})</option>)}
        </SearchSelect>
        {r.can.talk && <label className="row gap-xs small nowrap">Trao đổi gần đây trong
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Ngưỡng trao đổi gần đây">
            {RECENT_DAYS.map((d) => <option key={d} value={d}>{d} ngày</option>)}
          </select></label>}
        <button className="btn btn-sm" onClick={exportExcel} disabled={!groups.length}><Download size={14} /> Xuất Excel</button>
      </div>
      {!groups.length ? <Empty title={r.groups.length ? 'Không có sản phẩm, khách hàng phù hợp' : 'Chưa có dữ liệu trong phạm vi bạn được xem'}>
        {!r.groups.length && <p className="muted small">Báo cáo tính theo sản phẩm đã chọn ở từng dự án của khách hàng.</p>}</Empty> : (
        <div className="cw-scroll table-wrap">
          <table className="table cw-table pr-table">
            <thead><tr>
              <th>Sản phẩm</th><th className="num">Số khách hàng</th>
              {statuses.map((s) => <th key={s} className="num">{s}</th>)}
              {r.can.talk && <><th className="num" data-tip={`Khách hàng có trao đổi trong ${days} ngày gần đây`}>Trong {days} ngày</th>
                <th className="num" data-tip={`Khách hàng đã từng trao đổi nhưng quá ${days} ngày chưa trao đổi lại`}>Quá {days} ngày</th>
                <th className="num">Chưa trao đổi</th><th className="num" data-tip="Khách hàng có lịch gọi đã đến ngày mà chưa xác nhận">Lịch gọi đến hạn</th></>}
              <th className="num" data-tip="Khách hàng có dự án đã áp dụng hành trình bán hàng">Có hành trình</th>
              {r.can.task && <th className="num">Việc đang mở</th>}
            </tr></thead>
            <tbody>{groups.map((g) => {
              const s = summarize(g.customers, r.today, days);
              const shown = searching || (open[g.key] ?? !!picked);
              return (
                <Fragment key={g.key}>
                  <tr className={`click-row pr-row ${g.product_id ? '' : 'pr-row-rest'}`} onClick={() => setOpen({ ...open, [g.key]: !shown })} aria-expanded={shown}>
                    <td><span className="row gap-xs">{shown ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span><b>{g.name}</b>{g.type_name && <span className="muted small"> · {g.type_name}</span>}</span></span></td>
                    <td className="num"><b>{s.customers}</b></td>
                    {statuses.map((st) => <td key={st} className="num"><Num n={s.byStatus[st] ?? 0} /></td>)}
                    {r.can.talk && <><td className="num"><Num n={s.recent} /></td><td className="num"><Num n={s.stale} tone="bad" /></td>
                      <td className="num"><Num n={s.silent} tone="bad" /></td><td className="num"><Num n={s.callsDue} tone="bad" /></td></>}
                    <td className="num"><Num n={s.journey} /></td>
                    {r.can.task && <td className="num"><Num n={s.openTasks} /></td>}
                  </tr>
                  {shown && <tr className="pr-detail"><td colSpan={cols}><CustomerRows g={g} r={r} days={days} canCustomer={canCustomer} /></td></tr>}
                </Fragment>
              );
            })}</tbody>
          </table>
        </div>
      )}
      <div className="cw-foot muted small">{r.total} khách hàng · {products} sản phẩm có khách hàng · một khách hàng dùng nhiều sản phẩm được đếm ở từng sản phẩm · bấm một dòng để xem từng khách hàng</div>
    </section>
  );
}

/** Các khách hàng của một sản phẩm kèm hiện trạng tương tác */
function CustomerRows({ g, r, days, canCustomer }: { g: ProductReportGroup; r: Report; days: number; canCustomer: boolean }) {
  return (
    <table className="table pr-sub">
      <thead><tr><th>Khách hàng</th>{r.can.info && <th>Tình trạng</th>}<th>Dự án của khách hàng</th><th>Sale / AM</th>
        {r.can.talk && <><th>Trao đổi gần nhất</th><th>Lịch gọi</th></>}{r.can.task && <th className="num">Việc mở</th>}</tr></thead>
      <tbody>{g.customers.map((c) => {
        const since = c.last_activity ? daysSince(c.last_activity.date, r.today) : null;
        return (
          <tr key={c.id}>
            <td>{canCustomer ? <Link to={`/customers/${c.id}?g=all`}><b>{c.name}</b></Link> : <b>{c.name}</b>}
              {c.province_name && <div className="muted small">{c.province_name}</div>}</td>
            {r.can.info && <td>{c.status && <span className={CUSTOMER_STATUS_CLASS}>{c.status}</span>}</td>}
            <td className="small">{c.projects.length ? c.projects.map((p) => (
              <div key={p.id} className="pr-proj"><Link to={`/customers/${c.id}/p/${p.id}?g=all`}><span className="muted">{p.code}</span> {p.name}</Link>{' '}
                <span className={salesStatusClass(p.status)}>{p.status ?? 'Chưa áp dụng quy trình'}</span>
                {p.journey_pct != null && <span className="muted"> {p.journey_pct}%</span>}
                {(p.journey_overdue ?? 0) > 0 && <span className="overdue"> · {p.journey_overdue} bước trễ</span>}</div>
            )) : <span className="muted">Chưa có dự án</span>}</td>
            <td className="small">{c.kd_names && <div>Sale: {c.kd_names}</div>}{c.am_names && <div>AM: {c.am_names}</div>}</td>
            {r.can.talk && <><td className="small pr-talk">{c.last_activity ? <>
              <div className="nowrap">{fmtDate(c.last_activity.date)} <span className={since! > days ? 'overdue' : 'muted'}>· {ago(since!)}</span>
                {c.last_activity.user_name && <span className="muted"> · {c.last_activity.user_name}</span>}
                {(c.activity_count ?? 0) > 1 && <span className="muted"> · {c.activity_count} lần</span>}</div>
              <div className="pr-content" title={c.last_activity.content}>{c.last_activity.content}</div>
            </> : <span className="overdue">Chưa có trao đổi</span>}</td>
            <td className="small nowrap">{c.next_call_date ? <span className={(c.calls_due ?? 0) > 0 ? 'overdue row gap-xs' : 'row gap-xs'}><PhoneCall size={12} /> {fmtDate(c.next_call_date)}</span>
              : <span className="muted">—</span>}</td></>}
            {r.can.task && <td className="num">{c.open_tasks || <span className="muted">–</span>}</td>}
          </tr>
        );
      })}</tbody>
    </table>
  );
}
