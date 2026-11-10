import type { ProductReport, ProductReportCustomer, ProductReportGroup } from './types';
import { fold } from './customer-filter';

/** Số ngày từ ngày trao đổi gần nhất tới hôm nay */
export const daysSince = (date: string, today: string) => Math.round((Date.parse(today) - Date.parse(date)) / 86400_000);

/** Ngưỡng "trao đổi gần đây" (ngày) cho người dùng chọn */
export const RECENT_DAYS = [7, 14, 30, 60, 90];

export interface ProductSummary {
  customers: number;
  /** Số khách hàng theo tình trạng khách hàng */
  byStatus: Record<string, number>;
  /** Đã có trao đổi: trong N ngày / quá N ngày; chưa có trao đổi nào */
  recent: number; stale: number; silent: number;
  /** Có dự án đã áp dụng hành trình */
  journey: number;
  /** Có lịch gọi đã đến ngày mà chưa xác nhận */
  callsDue: number;
  openTasks: number;
}

/** Số liệu tổng hợp của một nhóm sản phẩm */
export function summarize(customers: ProductReportCustomer[], today: string, recentDays: number): ProductSummary {
  const s: ProductSummary = { customers: customers.length, byStatus: {}, recent: 0, stale: 0, silent: 0, journey: 0, callsDue: 0, openTasks: 0 };
  for (const c of customers) {
    if (c.status) s.byStatus[c.status] = (s.byStatus[c.status] ?? 0) + 1;
    if (!c.last_activity) s.silent++;
    else if (daysSince(c.last_activity.date, today) <= recentDays) s.recent++;
    else s.stale++;
    if (c.projects.some((p) => p.status !== null)) s.journey++;
    if ((c.calls_due ?? 0) > 0) s.callsDue++;
    s.openTasks += c.open_tasks ?? 0;
  }
  return s;
}

/** Lọc theo từ khóa (không cần gõ dấu): khớp tên sản phẩm / loại → giữ cả nhóm; không thì giữ các khách hàng khớp tên, tỉnh, Sale, AM, dự án */
export function filterReport(groups: ProductReportGroup[], q: string): ProductReportGroup[] {
  const k = fold(q.trim());
  if (!k) return groups;
  return groups.flatMap((g) => {
    if (fold(`${g.name} ${g.type_name ?? ''}`).includes(k)) return [g];
    const customers = g.customers.filter((c) => fold([c.name, c.code, c.province_name, c.status, c.kd_names, c.am_names, ...c.projects.map((p) => `${p.code} ${p.name}`)]
      .filter(Boolean).join(' ')).includes(k));
    return customers.length ? [{ ...g, customers }] : [];
  });
}

/** Tình trạng khách hàng có mặt trong báo cáo, theo thứ tự danh mục (tình trạng ngoài danh mục xếp sau) */
export function statusColumns(r: Pick<ProductReport, 'statuses' | 'groups'>): string[] {
  const present = new Set(r.groups.flatMap((g) => g.customers.map((c) => c.status).filter((s): s is string => !!s)));
  return [...r.statuses.filter((s) => present.has(s)), ...[...present].filter((s) => !r.statuses.includes(s)).sort()];
}
