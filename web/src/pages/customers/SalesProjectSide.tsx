import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, Pencil, X } from 'lucide-react';
import { api, queryClient, refreshAll } from '../../api';
import { hasPerm, useMe, useProducts, useProductTypes, useUsersBasic } from '../../hooks';
import { useCan, type CustomerRef } from './manage';
import type { Product, SalesProjectDetail } from '../../types';
import { descriptionOf, salesStatusClass } from '../../customer-filter';
import { Modal, toast, toastError } from '../../components/ui';
import { PeoplePicker } from '../../components/PeoplePicker';
import { SearchSelect } from '../../components/SearchSelect';
import { ROLE_LABELS, type PeopleRole } from '../../people';
import { ProductModal } from '../AdminProducts';
import { CreateProjectModal } from '../Projects';
import { Block, FileList, ProductionBlock, Props, Tasks, UploadButton } from './CustomerSide';
import { Talk } from './StepPanel';
import CallSchedule from './CallSchedule';

/** Cột phải của màn dự án (khi chưa chọn bước): thông tin dự án, lịch gọi điện, công việc, tài liệu, trao đổi của dự án.
 *  Khối Liên kết tiến độ sản xuất: dự án sản xuất gắn với dự án này (cần quyền Kế hoạch – Xem). */
export default function SalesProjectSide({ customer, sp }: { customer: CustomerRef; sp: SalesProjectDetail }) {
  const can = useCan();
  const { data: users } = useUsersBasic();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const canEdit = can('sales_project.edit'), canArchive = can('sales_project.delete');
  // Dự án chỉ lưu trữ (không xóa): ẩn khỏi danh sách, mở lại được
  const archive = async (archived: boolean) => {
    if (archived && !confirm(`Lưu trữ dự án ${sp.code} ${sp.name}? Dự án ẩn khỏi danh sách; xem lại bằng ô "Xem đã lưu trữ" và mở lại được.`)) return;
    try { await api.post(`/customers/${customer.id}/projects/${sp.id}/archive`, { archived }); toast(archived ? 'Đã lưu trữ dự án' : 'Đã mở lại dự án'); await refreshAll(); if (archived) navigate(can('customer.view') ? `/customers/${customer.id}` : '/customers'); } catch (e) { toastError(e); }
  };
  return (
    <>
      {/* Thông tin dự án: chỉ khi có quyền Dự án của khách hàng – Xem */}
      {can('sales_project.view') && <Block title="Thông tin dự án" extra={<>
        {canEdit && <button className="icon-btn" aria-label="Sửa dự án" data-tip="Sửa dự án" onClick={() => setEditing(true)}><Pencil size={14} /></button>}
        {canArchive && (sp.is_archived
          ? <button className="icon-btn" aria-label="Mở lại dự án" data-tip="Mở lại dự án" onClick={() => archive(false)}><ArchiveRestore size={14} /></button>
          : <button className="icon-btn" aria-label="Lưu trữ dự án" data-tip="Lưu trữ dự án" onClick={() => archive(true)}><Archive size={14} /></button>)}
      </>}>
        <Props rows={[
          ['Mã dự án', sp.code],
          ['Tình trạng', <span className="nowrap"><span className={salesStatusClass(sp.status)}>{sp.status ?? 'Chưa áp dụng quy trình'}</span> <span className="muted small">⚙ theo hành trình</span></span>],
          ['Khách hàng', customer.name],
          ['Sale', sp.kd_names], ['AM', sp.am_names], ['BA/PM', sp.ba_names], ['Dev', sp.dev_names], ['Tester', sp.tester_names],
          ['Loại sản phẩm', sp.product_type_name], ['Sản phẩm', sp.product_name],
          ['Mô tả sản phẩm', sp.product_description && <span style={{ whiteSpace: 'pre-wrap' }}>{sp.product_description}</span>],
          ['Ghi chú', sp.note && <span style={{ whiteSpace: 'pre-wrap' }}>{sp.note}</span>],
        ]} />
      </Block>}
      {/* Liên kết tiến độ sản xuất = dữ liệu phân hệ Dự án: chỉ khi có quyền Kế hoạch – Xem; bấm mở Kế hoạch chi tiết */}
      {can('plan.view') && <ProductionBlock production={sp.production && !sp.production.is_archived ? [sp.production] : []} />}
      {can('ctalk.view') && <CallSchedule customerId={customer.id} projectId={sp.id} calls={sp.calls} members={sp.member_ids} />}
      {/* Công việc, Tài liệu, Trao đổi: chỉ khi có quyền Xem chức năng đó */}
      {can('ctask.view') && <Tasks customerId={customer.id} tasks={sp.tasks} projectId={sp.id} members={sp.member_ids} />}
      {can('cfile.view') && <Block title={`Tài liệu (${sp.files.length})`} extra={can('cfile.create') && <UploadButton customerId={customer.id} projectId={sp.id} />}>
        <FileList customerId={customer.id} files={sp.files} showWhere />
      </Block>}
      {can('ctalk.view') && <Talk customerId={customer.id} activities={sp.activities} target={{ sales_project_id: sp.id }} empty="Chưa có trao đổi về dự án" canAdd={can('ctalk.create')} users={users ?? []} mentionIds={sp.mention_ids} />}
      {editing && <SalesProjectModal customer={customer} sp={sp} onClose={() => setEditing(false)} />}
    </>
  );
}

/**
 * Thêm / sửa dự án của khách hàng — như form Tạo dự án của phân hệ Dự án; người theo vai trò chọn theo tài khoản;
 * mã dự án tự sinh (mã khách hàng + số); Sale, AM điền sẵn theo khách hàng; tình trạng tự động theo hành trình.
 * Sản phẩm: chọn được nhiều (VD combo nhiều trợ lý) — là căn cứ của Báo cáo khách hàng theo sản phẩm; ô Loại sản phẩm lọc danh sách để chọn.
 */
export function SalesProjectModal({ customer, sp, onClose, onSaved }: { customer: CustomerRef; sp?: SalesProjectDetail; onClose: () => void; onSaved?: (id: number) => void }) {
  const { data: types } = useProductTypes();
  const { data: products } = useProducts();
  const [d, setD] = useState({
    name: sp?.name ?? '', product_type_id: sp?.product_type_id ? String(sp.product_type_id) : '',
    product_description: sp?.product_description ?? '', note: sp?.note ?? '',
  });
  const [productIds, setProductIds] = useState<number[]>(sp?.product_ids ?? []);
  // Người theo vai trò (id tài khoản); dự án mới: Sale, AM điền sẵn theo khách hàng
  const [people, setPeople] = useState<Record<PeopleRole, number[]>>({
    kd: sp?.kd_ids ?? customer.kd_ids ?? [], am: sp?.am_ids ?? customer.am_ids ?? [], ba: sp?.ba_ids ?? [], dev: sp?.dev_ids ?? [], tester: sp?.tester_ids ?? [],
  });
  const person = (r: PeopleRole, hint?: string) => (
    <div className="field"><span>{ROLE_LABELS[r]}{hint && <small className="muted"> ({hint})</small>}</span>
      <PeoplePicker role={r} value={people[r]} onChange={(v) => setPeople({ ...people, [r]: v })} /></div>
  );
  const [busy, setBusy] = useState(false);
  const { data: me } = useMe();
  const isProjectType = !!types?.find((t) => String(t.id) === d.product_type_id)?.is_project;
  const canAddProduct = !!d.product_type_id && hasPerm(me, isProjectType ? 'project.create' : 'product.create');
  const [adding, setAdding] = useState<'product' | 'project' | null>(null);
  // Thêm xong → chọn luôn sản phẩm / dự án vừa tạo (mô tả lấy theo danh mục)
  const selectNew = async (match: (p: Product) => boolean) => {
    const list = await queryClient.fetchQuery<Product[]>({ queryKey: ['products'], queryFn: () => api.get('/products'), staleTime: 0 });
    const p = list.find(match);
    if (p) addProduct(p);
  };
  // Danh sách để chọn thêm: theo loại đang lọc, bỏ sản phẩm đã chọn và dự án đã lưu trữ
  const typeProducts = (products || []).filter((p) => (!d.product_type_id || String(p.type_id) === d.product_type_id) && !p.project_archived && !productIds.includes(p.id));
  const productLabel = (id: number) => { const p = products?.find((x) => x.id === id); return p ? `${p.name}${p.project_key ? ` (${p.project_key})` : ''}` : '…'; };
  // Chọn thêm sản phẩm → mô tả đang trống thì lấy theo danh mục (đã ghi thì giữ nguyên)
  const addProduct = (p: Product) => {
    setProductIds((cur) => (cur.includes(p.id) ? cur : [...cur, p.id]));
    setD((cur) => ({ ...cur, product_description: cur.product_description.trim() ? cur.product_description : descriptionOf(p) }));
  };
  const pickProduct = (v: string) => { const p = products?.find((x) => String(x.id) === v); if (p) addProduct(p); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...d, product_type_id: d.product_type_id || null, product_ids: productIds,
        kd_ids: people.kd, am_ids: people.am, ba_ids: people.ba, dev_ids: people.dev, tester_ids: people.tester };
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
        <div className="form-grid">{person('kd', 'Phòng Kinh doanh')}{person('am', 'Phòng Kinh doanh')}</div>
        {person('ba')}
        <div className="form-grid">{person('dev')}{person('tester')}</div>
        <div className="form-grid">
          <label className="field"><span>Loại sản phẩm</span>
            <select value={d.product_type_id} onChange={(e) => setD({ ...d, product_type_id: e.target.value })}>
              <option value="">—</option>
              {types?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></label>
          <div className="field"><span>Sản phẩm <small className="muted">(chọn được nhiều)</small></span>
            <div className="staff-picker">
              {productIds.map((id) => (
                <span key={id} className="chip">{productLabel(id)}
                  <button type="button" aria-label={`Bỏ ${productLabel(id)}`} onClick={() => setProductIds(productIds.filter((x) => x !== id))}><X size={12} /></button></span>
              ))}
              <SearchSelect value="" onChange={(e) => pickProduct(e.target.value)} aria-label="Thêm sản phẩm">
                <option value="">{typeProducts.length ? '+ Thêm sản phẩm…' : 'Không còn sản phẩm để chọn'}</option>
                {typeProducts.map((p) => <option key={p.id} value={p.id}>{p.name}{p.project_key ? ` (${p.project_key})` : ''}</option>)}
              </SearchSelect>
              {canAddProduct && <button type="button" className="btn btn-sm" data-tip={isProjectType ? 'Tạo dự án mới (tự có trong danh mục)' : 'Thêm sản phẩm vào danh mục'}
                onClick={() => setAdding(isProjectType ? 'project' : 'product')}>+ Thêm mới</button>}
            </div></div>
        </div>
        <label className="field"><span>Mô tả sản phẩm <small className="muted">(tự lấy từ danh mục khi chọn sản phẩm đầu tiên; sửa được)</small></span>
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
