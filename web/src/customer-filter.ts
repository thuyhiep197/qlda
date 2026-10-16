import type { Customer, CustomerDetail } from './types';

// Danh mục của module Khách hàng (khớp với server/src/customer.ts); [tên, màu lozenge]
export const CUSTOMER_KINDS = ['Cơ quan nhà nước', 'Trường học', 'Doanh nghiệp', 'Khác'];
export const CUSTOMER_STATUSES: [string, string][] = [
  ['Tiềm năng', 'purple'], ['Đang hợp tác', 'green'], ['Tạm dừng', 'yellow'], ['Ngừng hợp tác', 'default'],
];

/** Bỏ dấu tiếng Việt, chữ thường — để tìm "so tai chinh" ra "Sở Tài chính" */
export const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export interface CustomerFilter { q: string; status: string; kind: string }

/** Lọc khách hàng theo từ khóa (tên, MST, tỉnh, SĐT, email, AM, người liên hệ), trạng thái, loại ('-' = chưa phân loại) */
export function filterCustomers<T extends Customer>(list: T[], f: CustomerFilter): T[] {
  const q = fold(f.q.trim());
  return list.filter((c) =>
    (!q || fold([c.name, c.tax_code, c.province, c.phone, c.email, c.am, c.contact_name, c.contact_phone].filter(Boolean).join(' ')).includes(q)) &&
    (!f.status || c.status === f.status) &&
    (!f.kind || (c.kind || '-') === f.kind));
}

/** Chỉ số tổng quan của một khách hàng: dự án đang làm, công việc đang mở / quá hạn, lần chăm sóc gần nhất */
export function customerKpis(d: Pick<CustomerDetail, 'projects' | 'issues' | 'activities'>, today: string) {
  const live = d.projects.filter((p) => !p.is_archived);
  return {
    projects: live.length,
    running: live.filter((p) => (p.project_status || p.status_auto || 'Chưa bắt đầu') !== 'Chưa bắt đầu').length,
    openIssues: d.issues.length,
    overdue: d.issues.filter((i) => i.due_date && i.due_date < today).length,
    lastCare: d.activities.reduce<string | null>((m, a) => (!m || a.activity_date > m ? a.activity_date : m), null),
  };
}
