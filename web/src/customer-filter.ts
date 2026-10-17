import type { Customer, CustomerDetail, Product } from './types';

// Danh mục của module Khách hàng (khớp với server/src/customer.ts); [tên, màu lozenge]
export const CUSTOMER_STATUSES: [string, string][] = [
  ['Tiềm năng', 'purple'], ['Đang hợp tác', 'green'], ['Tạm dừng', 'yellow'], ['Ngừng hợp tác', 'default'],
];
/** 34 tỉnh, thành phố sau sắp xếp đơn vị hành chính (từ 01/7/2025) */
export const PROVINCES = [
  'Hà Nội', 'TP. Hồ Chí Minh', 'Hải Phòng', 'Đà Nẵng', 'Huế', 'Cần Thơ',
  'An Giang', 'Bắc Ninh', 'Cà Mau', 'Cao Bằng', 'Đắk Lắk', 'Điện Biên', 'Đồng Nai', 'Đồng Tháp', 'Gia Lai', 'Hà Tĩnh',
  'Hưng Yên', 'Khánh Hòa', 'Lai Châu', 'Lâm Đồng', 'Lạng Sơn', 'Lào Cai', 'Nghệ An', 'Ninh Bình', 'Phú Thọ', 'Quảng Ngãi',
  'Quảng Ninh', 'Quảng Trị', 'Sơn La', 'Tây Ninh', 'Thái Nguyên', 'Thanh Hóa', 'Tuyên Quang', 'Vĩnh Long',
];
/** Gợi ý nguồn khách hàng (vẫn gõ được nguồn khác) */
export const CUSTOMER_SOURCES = ['BGĐ giao', 'Khách hàng liên hệ', 'Đối tác giới thiệu', 'Kinh doanh tự tìm kiếm', 'Khách hàng cũ', 'Hội thảo, sự kiện', 'Đấu thầu công khai', 'Website'];

/** Bỏ dấu tiếng Việt, chữ thường — để tìm "so tai chinh" ra "Sở Tài chính" */
export const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export interface CustomerFilter { q: string; status: string; productType: string; province: string }

/** Lọc khách hàng theo từ khóa (tên, tỉnh, phường/xã, sản phẩm, nguồn, nhân viên phụ trách, đầu mối), tình trạng, loại sản phẩm, tỉnh ('-' = chưa có) */
export function filterCustomers<T extends Customer>(list: T[], f: CustomerFilter): T[] {
  const q = fold(f.q.trim());
  return list.filter((c) =>
    (!q || fold([c.name, c.province, c.ward, c.product_name, c.source, c.am, c.contact_name, c.contact_phone, c.contact_email].filter(Boolean).join(' ')).includes(q)) &&
    (!f.status || c.status === f.status) &&
    (!f.productType || String(c.product_type_id ?? '-') === f.productType) &&
    (!f.province || (c.province || '-') === f.province));
}

/** Chọn sản phẩm → mô tả lấy theo danh mục; sản phẩm chưa có mô tả thì để trống cho người dùng điền */
export const descriptionOf = (product: Pick<Product, 'description'> | undefined) => product?.description ?? '';

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
