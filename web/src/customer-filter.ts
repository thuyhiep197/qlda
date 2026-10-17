import type { Customer, CustomerDetail, Product } from './types';

// Danh mục của module Khách hàng (khớp với server/src/customer.ts); [tên, màu lozenge]
export const CUSTOMER_STATUSES: [string, string][] = [
  ['Mới', 'default'], ['Đang tư vấn', 'blue'], ['Chờ phản hồi', 'yellow'], ['Đang làm sản phẩm', 'purple'], ['Đã ký hợp đồng', 'green'], ['Đã thanh toán', 'green'],
];
/** Gợi ý nguồn khách hàng (vẫn gõ được nguồn khác) */
export const CUSTOMER_SOURCES = ['BGĐ giao', 'Khách hàng liên hệ', 'Đối tác giới thiệu', 'Kinh doanh tự tìm kiếm', 'Khách hàng cũ', 'Hội thảo, sự kiện', 'Đấu thầu công khai', 'Website'];

/** Bỏ dấu tiếng Việt, chữ thường — để tìm "so tai chinh" ra "Sở Tài chính" */
export const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export interface CustomerFilter { q: string; status: string; productType: string; province: string }

/** Lọc khách hàng theo từ khóa (tên, tỉnh, phường/xã, sản phẩm, nguồn, nhân viên phụ trách, đầu mối), tình trạng, loại sản phẩm, mã tỉnh ('-' = chưa có) */
export function filterCustomers<T extends Customer>(list: T[], f: CustomerFilter): T[] {
  const q = fold(f.q.trim());
  return list.filter((c) =>
    (!q || fold([c.name, c.province_name, c.ward_name, c.product_name, c.source, c.am, c.contact_name, c.contact_phone, c.contact_email].filter(Boolean).join(' ')).includes(q)) &&
    (!f.status || c.status === f.status) &&
    (!f.productType || String(c.product_type_id ?? '-') === f.productType) &&
    (!f.province || (c.province_code || '-') === f.province));
}

/** Tên phường/xã gõ vào ô chọn → mã trong danh mục (không phân biệt hoa/thường, dấu cách thừa); không khớp → undefined */
export function wardCodeOf(wards: { code: string; name: string }[] | undefined, typed: string) {
  const t = typed.replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
  return t ? wards?.find((w) => w.name.toLocaleLowerCase('vi') === t)?.code : undefined;
}

/** Chọn sản phẩm → mô tả lấy theo danh mục; sản phẩm chưa có mô tả thì để trống cho người dùng điền */
export const descriptionOf = (product: Pick<Product, 'description'> | undefined) => product?.description ?? '';

/** Chỉ số tổng quan của một khách hàng: dự án đang làm, việc kinh doanh đang mở / quá hạn, việc dự án quá hạn, lần làm việc với KH gần nhất */
export function customerKpis(d: Pick<CustomerDetail, 'projects' | 'issues' | 'activities' | 'tasks'>, today: string) {
  const live = d.projects.filter((p) => !p.is_archived);
  const openTasks = d.tasks.filter((t) => t.status !== 'done');
  return {
    projects: live.length,
    running: live.filter((p) => (p.project_status || p.status_auto || 'Chưa bắt đầu') !== 'Chưa bắt đầu').length,
    openTasks: openTasks.length,
    overdueTasks: openTasks.filter((t) => t.due_date && t.due_date < today).length,
    openIssues: d.issues.length,
    overdue: d.issues.filter((i) => i.due_date && i.due_date < today).length,
    lastCare: d.activities.filter((a) => a.kind !== 'internal').reduce<string | null>((m, a) => (!m || a.activity_date > m ? a.activity_date : m), null),
  };
}

/** Lọc bước hành trình: trạng thái, đơn vị (thực hiện hoặc phối hợp), việc của tôi, từ khóa; không lọc gì → null (hiện dạng cây) */
export function filterSteps<T extends { depth: number; status: string; unit: string | null; support: string | null; assignee_id: number | null; title: string }>(
  steps: T[], f: { status: string; unit: string; mine: number | null; q: string },
): T[] | null {
  if (!f.status && !f.unit && !f.mine && !f.q.trim()) return null;
  const q = fold(f.q.trim());
  return steps.filter((s) => s.depth > 0 &&
    (!f.status || s.status === f.status) &&
    (!f.unit || `${s.unit ?? ''}+${s.support ?? ''}`.split('+').map((x) => x.trim()).includes(f.unit)) &&
    (!f.mine || s.assignee_id === f.mine) &&
    (!q || fold(s.title).includes(q)));
}
