import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, Pencil } from 'lucide-react';
import { api, queryClient, refreshAll } from '../../api';
import { hasPerm, useMe, useProducts, useProductTypes, useUsersBasic } from '../../hooks';
import { useCan } from './manage';
import type { CustomerDetail, Product, SalesProjectDetail } from '../../types';
import { descriptionOf, salesStatusClass } from '../../customer-filter';
import { colorOf, lozengeOf, PROJECT_STATUSES } from '../../util';
import { Modal, toast, toastError } from '../../components/ui';
import { StaffPicker } from '../../components/ProjectInfoFields';
import { OwnerPicker } from '../Customers';
import { ProductModal } from '../AdminProducts';
import { CreateProjectModal } from '../Projects';
import { Block, FileList, Props, Tasks, UploadButton } from './CustomerSide';
import { Talk } from './StepPanel';

/** Cột phải của màn dự án (khi chưa chọn bước): thông tin dự án, dự án sản xuất đã gắn, công việc, tài liệu, trao đổi của dự án */
export default function SalesProjectSide({ customer, sp }: { customer: CustomerDetail; sp: SalesProjectDetail }) {
  const can = useCan();
  const { data: users } = useUsersBasic();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const canEdit = can('sales_project.edit'), canArchive = can('sales_project.delete');
  // Dự án chỉ lưu trữ (không xóa): ẩn khỏi danh sách, mở lại được
  const archive = async (archived: boolean) => {
    if (archived && !confirm(`Lưu trữ dự án ${sp.code} ${sp.name}? Dự án ẩn khỏi danh sách; xem lại bằng ô "Xem đã lưu trữ" và mở lại được.`)) return;
    try { await api.post(`/customers/${customer.id}/projects/${sp.id}/archive`, { archived }); toast(archived ? 'Đã lưu trữ dự án' : 'Đã mở lại dự án'); await refreshAll(); if (archived) navigate(`/customers/${customer.id}`); } catch (e) { toastError(e); }
  };
  const pr = sp.production;
  const prStatus = pr ? pr.project_status || pr.status_auto : null;
  const pct = pr?.total_issues ? Math.round((pr.done_issues / pr.total_issues) * 100) : 0;
  return (
    <>
      <Block title="Thông tin dự án" extra={<>
        {canEdit && <button className="icon-btn" aria-label="Sửa dự án" data-tip="Sửa dự án" onClick={() => setEditing(true)}><Pencil size={14} /></button>}
        {canArchive && (sp.is_archived
          ? <button className="icon-btn" aria-label="Mở lại dự án" data-tip="Mở lại dự án" onClick={() => archive(false)}><ArchiveRestore size={14} /></button>
          : <button className="icon-btn" aria-label="Lưu trữ dự án" data-tip="Lưu trữ dự án" onClick={() => archive(true)}><Archive size={14} /></button>)}
      </>}>
        <Props rows={[
          ['Mã dự án', sp.code],
          ['Tình trạng', <span className="nowrap"><span className={salesStatusClass(sp.status)}>{sp.status ?? 'Chưa áp dụng quy trình'}</span> <span className="muted small">⚙ theo hành trình</span></span>],
          ['Khách hàng', customer.name],
          ['Sale', sp.kd_names], ['AM', sp.am_names], ['BA/PM', sp.ba],
          ['Loại sản phẩm', sp.product_type_name], ['Sản phẩm', sp.product_name],
          ['Mô tả sản phẩm', sp.product_description && <span style={{ whiteSpace: 'pre-wrap' }}>{sp.product_description}</span>],
          ['Ghi chú', sp.note && <span style={{ whiteSpace: 'pre-wrap' }}>{sp.note}</span>],
        ]} />
      </Block>
      <Block title="Dự án sản xuất (phân hệ Dự án)">
        {!pr ? <p className="muted small">Chưa gắn. Phía phân hệ Dự án chọn dự án này của khách hàng khi tạo / sửa dự án.</p> : (() => {
          const body = <>
            <div className="row gap-sm" style={{ minWidth: 0 }}>
              <span className="proj-dot sm" style={{ background: colorOf(pr.key) }}>{pr.key.slice(0, 2)}</span>
              <b className="grow ellipsis">{pr.name}</b>
              {prStatus && <span className={lozengeOf(PROJECT_STATUSES, prStatus)}>{prStatus}</span>}
            </div>
            <div className="cust-bar"><div style={{ width: `${pct}%` }} /></div>
            <div className="muted small">{pr.key} · {pr.done_issues}/{pr.total_issues} việc · {pct}%{pr.accessible ? ' · Mở Kế hoạch chi tiết →' : ' · Bạn chưa là thành viên dự án'}</div>
          </>;
          return pr.accessible ? <Link to={`/p/${pr.key}/plan`} className="cw-project">{body}</Link> : <div className="cw-project">{body}</div>;
        })()}
        {pr && <p className="muted small" style={{ margin: '6px 0 0' }}>Bước ở phần III, IV trùng tên với đầu việc của dự án sản xuất tự cập nhật trạng thái và hạn.</p>}
      </Block>
      <Tasks customerId={customer.id} tasks={sp.tasks} projectId={sp.id} />
      <Block title={`Tài liệu (${sp.files.length})`} extra={can('cfile.create') && <UploadButton customerId={customer.id} projectId={sp.id} />}>
        <FileList customerId={customer.id} files={sp.files} showWhere />
      </Block>
      <Talk customerId={customer.id} activities={sp.activities} target={{ sales_project_id: sp.id }} empty="Chưa có trao đổi về dự án" canAdd={can('ctalk.create')} users={users ?? []} />
      {editing && <SalesProjectModal customer={customer} sp={sp} onClose={() => setEditing(false)} />}
    </>
  );
}

/**
 * Thêm / sửa dự án của khách hàng — như form Tạo dự án của phân hệ Dự án nhưng không có Dev, Tester; Trưởng dự án → Kinh doanh;
 * mã dự án tự sinh (mã khách hàng + số); Kinh doanh, AM điền sẵn theo khách hàng; tình trạng tự động theo hành trình.
 */
export function SalesProjectModal({ customer, sp, onClose, onSaved }: { customer: CustomerDetail; sp?: SalesProjectDetail; onClose: () => void; onSaved?: (id: number) => void }) {
  const { data: types } = useProductTypes();
  const { data: products } = useProducts();
  const [d, setD] = useState({
    name: sp?.name ?? '', product_type_id: sp?.product_type_id ? String(sp.product_type_id) : '', product_id: sp?.product_id ? String(sp.product_id) : '',
    product_description: sp?.product_description ?? '', ba: sp?.ba ?? '', note: sp?.note ?? '',
  });
  const [kd, setKd] = useState<number[]>(sp?.kd_ids ?? customer.kd_ids);
  const [am, setAm] = useState<number[]>(sp?.am_ids ?? customer.am_ids);
  const [busy, setBusy] = useState(false);
  const { data: me } = useMe();
  const isProjectType = !!types?.find((t) => String(t.id) === d.product_type_id)?.is_project;
  const canAddProduct = !!d.product_type_id && hasPerm(me, isProjectType ? 'project.create' : 'product.create');
  const [adding, setAdding] = useState<'product' | 'project' | null>(null);
  // Thêm xong → chọn luôn sản phẩm / dự án vừa tạo (mô tả lấy theo danh mục)
  const selectNew = async (match: (p: Product) => boolean) => {
    const list = await queryClient.fetchQuery<Product[]>({ queryKey: ['products'], queryFn: () => api.get('/products'), staleTime: 0 });
    const p = list.find(match);
    if (p) setD((cur) => ({ ...cur, product_id: String(p.id), product_type_id: String(p.type_id), product_description: descriptionOf(p) }));
  };
  const typeProducts = (products || []).filter((p) => (!d.product_type_id || String(p.type_id) === d.product_type_id) && !p.project_archived);
  const pickType = (v: string) => {
    const keep = products?.find((p) => String(p.id) === d.product_id && String(p.type_id) === v);
    setD({ ...d, product_type_id: v, product_id: keep ? d.product_id : '' });
  };
  // Chọn sản phẩm → mô tả lấy theo danh mục (chưa có thì để trống cho người dùng điền)
  const pickProduct = (v: string) => {
    const p = products?.find((x) => String(x.id) === v);
    setD({ ...d, product_id: v, product_type_id: p ? String(p.type_id) : d.product_type_id, product_description: v ? descriptionOf(p) : d.product_description });
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...d, product_type_id: d.product_type_id || null, product_id: d.product_id || null, kd_ids: kd, am_ids: am };
      let id = sp?.id;
      if (id) await api.patch(`/customers/${customer.id}/projects/${id}`, body);
      else id = (await api.post<{ id: number }>(`/customers/${customer.id}/projects`, body)).id;
      toast(sp ? 'Đã lưu' : 'Đã thêm dự án');
      await refreshAll();
      onClose();
      onSaved?.(id);
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };
  return (
    <Modal title={sp ? `Sửa dự án ${sp.code}` : 'Thêm dự án của khách hàng'} width={720} onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" form="sales-project-form" disabled={busy}>{sp ? 'Lưu' : 'Thêm dự án'}</button>
    </>}>
      <form id="sales-project-form" className="stack" onSubmit={submit}>
        <label className="field"><span>Tên dự án *</span>
          <input autoFocus required value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></label>
        <div className="form-grid">
          <label className="field"><span>Mã dự án</span>
            <input value={sp?.code ?? `${customer.code ?? ''}-… (tự sinh)`} disabled /></label>
          <label className="field"><span>Khách hàng</span><input value={customer.name} disabled /></label>
        </div>
        <div className="form-grid">
          <div className="field"><span>Sale <small className="muted">(nhân sự Sale hoặc BGĐ)</small></span><OwnerPicker position="kd" value={kd} onChange={setKd} /></div>
          <div className="field"><span>AM <small className="muted">(nhân sự AM)</small></span><OwnerPicker position="am" value={am} onChange={setAm} /></div>
        </div>
        <div className="field"><span>BA/PM <small className="muted">(chọn từ Danh mục nhân sự)</small></span>
          <StaffPicker position="ba_pm" value={d.ba} onChange={(v) => setD({ ...d, ba: v })} /></div>
        <div className="form-grid">
          <label className="field"><span>Loại sản phẩm</span>
            <select value={d.product_type_id} onChange={(e) => pickType(e.target.value)}>
              <option value="">—</option>
              {types?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></label>
          <div className="field"><span>Sản phẩm</span>
            <div className="row gap-xs">
              <select className="grow" value={d.product_id} onChange={(e) => pickProduct(e.target.value)} aria-label="Sản phẩm">
                <option value="">{typeProducts.length ? '—' : 'Chưa có sản phẩm trong danh mục'}</option>
                {typeProducts.map((p) => <option key={p.id} value={p.id}>{p.name}{p.project_key ? ` (${p.project_key})` : ''}</option>)}
              </select>
              {canAddProduct && <button type="button" className="btn btn-sm" data-tip={isProjectType ? 'Tạo dự án mới (tự có trong danh mục)' : 'Thêm sản phẩm vào danh mục'}
                onClick={() => setAdding(isProjectType ? 'project' : 'product')}>+ Thêm mới</button>}
            </div></div>
        </div>
        <label className="field"><span>Mô tả sản phẩm <small className="muted">(tự lấy từ danh mục khi chọn sản phẩm; sửa được)</small></span>
          <textarea rows={3} value={d.product_description} onChange={(e) => setD({ ...d, product_description: e.target.value })} /></label>
        <label className="field"><span>Ghi chú</span>
          <textarea rows={3} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></label>
      </form>
      {/* Popup thêm mới đặt ngoài form (tránh form lồng nhau) */}
      {adding === 'product' && <ProductModal types={types ?? []} draft={{ type_id: d.product_type_id, name: '', description: '' }}
        onClose={() => setAdding(null)} onSaved={(id) => selectNew((p) => p.id === id)} />}
      {adding === 'project' && <CreateProjectModal onClose={() => setAdding(null)} onCreated={(pr) => selectNew((p) => p.project_id === pr.id)} />}
    </Modal>
  );
}
