import { PROJECT_PRIORITIES, PROJECT_STATUSES } from '../util';

// Thông tin quản lý dự án — dùng chung cho form Tạo dự án và Cài đặt dự án
export type ProjectInfo = {
  customer: string; priority: string; project_status: string;
  pm: string; ba: string; dev: string; tester: string; sales: string;
};

export function projectInfoOf(p?: Partial<Record<keyof ProjectInfo, string | null>>): ProjectInfo {
  return {
    customer: p?.customer ?? '', priority: p?.priority ?? '', project_status: p?.project_status ?? '',
    pm: p?.pm ?? '', ba: p?.ba ?? '', dev: p?.dev ?? '', tester: p?.tester ?? '', sales: p?.sales ?? '',
  };
}

const PEOPLE: [keyof ProjectInfo, string][] = [['pm', 'PM'], ['ba', 'BA'], ['dev', 'Dev'], ['tester', 'Tester'], ['sales', 'Kinh doanh']];

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
        <label className="field grow"><span>Trạng thái dự án</span>
          <select value={value.project_status} onChange={(e) => set('project_status', e.target.value)}>
            <option value="">—</option>
            {options(PROJECT_STATUSES, value.project_status).map((n) => <option key={n}>{n}</option>)}
          </select></label>
      </div>
      <div className="field"><span>Nhân sự <small className="muted">(ghi tên, nhiều người cách nhau bằng dấu phẩy)</small></span>
        <div className="info-people">
          {PEOPLE.map(([k, label]) => (
            <label key={k}><small className="muted">{label}</small>
              <input value={value[k]} onChange={(e) => set(k, e.target.value)} /></label>
          ))}
        </div>
      </div>
    </>
  );
}
