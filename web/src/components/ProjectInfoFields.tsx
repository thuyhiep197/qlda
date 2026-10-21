import { useQuery } from '@tanstack/react-query';
import { api, queryClient } from '../api';
import { hasPerm, useCustomerNames, useMe } from '../hooks';
import { toastError } from './ui';
import { PROJECT_PRIORITIES, PROJECT_STATUSES } from '../util';
import { PeoplePicker } from './PeoplePicker';
import { ROLE_LABELS } from '../people';

/** Vai trò người của dự án sản xuất (id tài khoản) — chính là thành viên dự án */
const PROJECT_ROLES = ['ba', 'dev', 'tester', 'am'] as const;

// Thông tin quản lý dự án — dùng chung cho form Tạo dự án và Cài đặt dự án
export type ProjectInfo = {
  /** id khách hàng trong danh mục Khách hàng ('' = chưa gắn); customer = tên cũ để hiển thị */
  customer_id: string; customer: string; priority: string; project_status: string;
  /** Dự án của khách hàng (phía Kinh doanh) được gắn với dự án này ('' = chưa gắn) */
  sales_project_id: string;
  /** Người theo vai trò (id tài khoản) */
  ba_ids: number[]; dev_ids: number[]; tester_ids: number[]; am_ids: number[];
};

export function projectInfoOf(p?: { customer?: string | null; priority?: string | null; project_status?: string | null;
  ba_ids?: number[]; dev_ids?: number[]; tester_ids?: number[]; am_ids?: number[];
  customer_id?: number | null; customer_info?: { sales_project: { id: number } | null } | null;
}): ProjectInfo {
  return {
    customer_id: p?.customer_id ? String(p.customer_id) : '', customer: p?.customer ?? '', priority: p?.priority ?? '', project_status: p?.project_status ?? '',
    ba_ids: p?.ba_ids ?? [], dev_ids: p?.dev_ids ?? [], tester_ids: p?.tester_ids ?? [], am_ids: p?.am_ids ?? [],
    sales_project_id: p?.customer_info?.sales_project ? String(p.customer_info.sales_project.id) : '',
  };
}

export const splitNames = (v: string | null | undefined) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean) : []);

export function ProjectInfoFields({ value, onChange }: { value: ProjectInfo; onChange: (v: ProjectInfo) => void }) {
  const set = (k: 'customer_id' | 'customer' | 'priority' | 'project_status' | 'sales_project_id', v: string) => onChange({ ...value, [k]: v });
  const { data: me } = useMe();
  const { data: customers } = useCustomerNames();
  // Thêm nhanh khách hàng mới ngay trong form dự án
  const pickCustomer = async (v: string) => {
    if (v !== '__new') return onChange({ ...value, customer_id: v, customer: customers?.find((c) => String(c.id) === v)?.name ?? '', sales_project_id: '' });
    const name = prompt('Tên khách hàng mới:')?.trim();
    if (!name) return;
    try {
      const c = await api.post<{ id: number; name: string }>('/customers', { name });
      await queryClient.invalidateQueries({ queryKey: ['customer-names'] });
      onChange({ ...value, customer_id: String(c.id), customer: c.name, sales_project_id: '' });
    } catch (e) { toastError(e); }
  };
  // Giữ được giá trị cũ không có trong danh mục
  const options = (list: [string, string][], cur: string) => [...list.map(([n]) => n), ...(cur && !list.some(([n]) => n === cur) ? [cur] : [])];
  return (
    <>
      <label className="field"><span>Khách hàng</span>
        <select value={value.customer_id} onChange={(e) => pickCustomer(e.target.value)}>
          <option value="">{!value.customer_id && value.customer ? `${value.customer} (không có trong danh mục Khách hàng)` : '— Chưa gắn khách hàng —'}</option>
          {customers?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          {hasPerm(me, 'customer.create') && <option value="__new">+ Thêm khách hàng mới…</option>}
        </select></label>
      {value.customer_id && <SalesProjectPicker customerId={value.customer_id} value={value.sales_project_id} onChange={(v) => set("sales_project_id", v)} />}
      <div className="row gap-sm">
        <label className="field grow"><span>Ưu tiên</span>
          <select value={value.priority} onChange={(e) => set('priority', e.target.value)}>
            <option value="">—</option>
            {options(PROJECT_PRIORITIES, value.priority).map((n) => <option key={n}>{n}</option>)}
          </select></label>
        <label className="field grow"><span data-tip="Tự động: theo giai đoạn (Epic) đang chạy. Ghim: giữ cố định trạng thái đã chọn, dùng khi dự án chưa có công việc trên tool (VD đang trình chủ trương, lập HSYC)">Trạng thái dự án</span>
          <select value={value.project_status} onChange={(e) => set('project_status', e.target.value)}>
            <option value="">⚙ Tự động (theo giai đoạn Epic)</option>
            <optgroup label="Ghim cố định">
              {options(PROJECT_STATUSES, value.project_status).map((n) => <option key={n} value={n}>📌 {n}</option>)}
            </optgroup>
          </select></label>
      </div>
      <div className="field"><span>Nhân sự <small className="muted">(chọn tài khoản theo vị trí — là thành viên dự án)</small></span>
        <div className="info-people">
          {PROJECT_ROLES.map((r) => (
            <div key={r}><small className="muted">{ROLE_LABELS[r]}</small>
              <PeoplePicker role={r} value={value[`${r}_ids`]} onChange={(v) => onChange({ ...value, [`${r}_ids`]: v })} /></div>
          ))}
        </div>
      </div>
    </>
  );
}

/** Dự án của khách hàng (phía Kinh doanh) để gắn với dự án này — chỉ liệt kê các dự án của khách hàng đã chọn */
function SalesProjectPicker({ customerId, value, onChange }: { customerId: string; value: string; onChange: (v: string) => void }) {
  const { data: list } = useQuery<{ id: number; code: string; name: string; project_id: number | null; project_key: string | null }[]>({
    queryKey: ['customer-project-names', customerId], queryFn: () => api.get(`/customers/${customerId}/project-names`),
  });
  return (
    <label className="field"><span>Dự án của khách hàng <small className="muted">(Kinh doanh tạo ở phân hệ Khách hàng)</small></span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{list && !list.length ? '— Khách hàng chưa có dự án —' : '— Chưa gắn —'}</option>
        {list?.map((p) => (
          <option key={p.id} value={p.id} disabled={!!p.project_id && String(p.id) !== value}>
            {p.code} · {p.name}{p.project_key && String(p.id) !== value ? ` (đã gắn ${p.project_key})` : ''}
          </option>
        ))}
      </select></label>
  );
}
