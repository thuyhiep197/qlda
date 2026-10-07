import { X } from 'lucide-react';
import { useStaff } from '../hooks';
import { PROJECT_PRIORITIES, PROJECT_STATUSES, STAFF_POSITIONS } from '../util';

// Thông tin quản lý dự án — dùng chung cho form Tạo dự án và Cài đặt dự án
export type ProjectInfo = {
  customer: string; priority: string; project_status: string;
  ba: string; dev: string; tester: string; am: string;
};

export function projectInfoOf(p?: Partial<Record<keyof ProjectInfo, string | null>>): ProjectInfo {
  return {
    customer: p?.customer ?? '', priority: p?.priority ?? '', project_status: p?.project_status ?? '',
    ba: p?.ba ?? '', dev: p?.dev ?? '', tester: p?.tester ?? '', am: p?.am ?? '',
  };
}

export const splitNames = (v: string | null | undefined) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);

/** Chọn nhiều người từ Danh mục nhân sự theo vị trí; tên cũ không còn trong danh mục vẫn giữ (gạch chân chấm). */
function StaffPicker({ position, value, onChange }: { position: string; value: string; onChange: (v: string) => void }) {
  const { data: staff } = useStaff();
  const chosen = splitNames(value);
  const known = new Set(staff?.map((s) => s.full_name));
  const options = (staff || []).filter((s) => s.positions.split(',').includes(position) && !chosen.includes(s.full_name));
  return (
    <div className="staff-picker">
      {chosen.map((n) => (
        <span key={n} className={`chip ${staff && !known.has(n) ? 'chip-unknown' : ''}`}
          data-tip={staff && !known.has(n) ? 'Không có trong Danh mục nhân sự' : undefined}>
          {n}
          <button type="button" aria-label={`Bỏ ${n}`} onClick={() => onChange(chosen.filter((x) => x !== n).join(', '))}><X size={12} /></button>
        </span>
      ))}
      <select value="" onChange={(e) => e.target.value && onChange([...chosen, e.target.value].join(', '))} aria-label="Thêm người">
        <option value="">+ Thêm…</option>
        {options.map((s) => <option key={s.id} value={s.full_name}>{s.full_name}{s.note ? ` (${s.note})` : ''}</option>)}
      </select>
    </div>
  );
}

export function ProjectInfoFields({ value, onChange }: { value: ProjectInfo; onChange: (v: ProjectInfo) => void }) {
  const set = (k: keyof ProjectInfo, v: string) => onChange({ ...value, [k]: v });
  // Giữ được giá trị cũ không có trong danh mục
  const options = (list: [string, string][], cur: string) => [...list.map(([n]) => n), ...(cur && !list.some(([n]) => n === cur) ? [cur] : [])];
  return (
    <>
      <label className="field"><span>Tên khách hàng</span>
        <input value={value.customer} onChange={(e) => set('customer', e.target.value)} placeholder="VD: Sở Tài chính - Đồng Nai" /></label>
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
      <div className="field"><span>Nhân sự <small className="muted">(chọn từ Danh mục nhân sự)</small></span>
        <div className="info-people">
          {STAFF_POSITIONS.map((p) => (
            <div key={p.key}><small className="muted">{p.label}</small>
              <StaffPicker position={p.key} value={value[p.field]} onChange={(v) => set(p.field, v)} /></div>
          ))}
        </div>
      </div>
    </>
  );
}
