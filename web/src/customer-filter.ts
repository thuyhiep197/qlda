import type { Customer } from './types';

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

/** Tên khách hàng của dự án có trong danh mục Khách hàng không (không phân biệt hoa/thường) */
export function findCustomer<T extends { name: string }>(list: T[] | undefined, name: string | null | undefined): T | undefined {
  const n = name?.trim().toLowerCase();
  return n ? list?.find((c) => c.name.toLowerCase() === n) : undefined;
}
