import type { Customer, CustomerDetail, Product } from './types';

// Danh mục của module Khách hàng (khớp với server/src/customer.ts); [tên, màu lozenge]
/** Nhãn tình trạng khách hàng: mọi tình trạng cùng một màu (danh mục Tình trạng khách hàng) */
export const CUSTOMER_STATUS_CLASS = 'lozenge lozenge-default';
/** Màu lozenge cho tình trạng dự án của khách hàng (tự động theo phần I–IV đang chạy của hành trình) */
export function salesStatusClass(status: string | null) {
  const tone = !status ? 'default' : status === 'Hoàn thành' ? 'green' : /^IV\./.test(status) ? 'green' : /^III\./.test(status) ? 'purple'
    : /^II\./.test(status) ? 'yellow' : /^I\./.test(status) ? 'blue' : 'default';
  return `lozenge lozenge-${tone}`;
}
/** Gợi ý nguồn khách hàng (vẫn gõ được nguồn khác) */
export const CUSTOMER_SOURCES = ['BGĐ giao', 'Khách hàng liên hệ', 'Đối tác giới thiệu', 'Kinh doanh tự tìm kiếm', 'Khách hàng cũ', 'Hội thảo, sự kiện', 'Đấu thầu công khai', 'Website'];

/** Bỏ dấu tiếng Việt, chữ thường — để tìm "so tai chinh" ra "Sở Tài chính" */
export const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export interface CustomerFilter { q: string; status: string; province: string; mine?: boolean }

/** Lọc khách hàng theo từ khóa (tên, tỉnh, phường/xã, sản phẩm, nguồn, Kinh doanh, AM, đầu mối, dự án), tình trạng, mã tỉnh ('-' = chưa có), của tôi */
export function filterCustomers<T extends Customer>(list: T[], f: CustomerFilter): T[] {
  const q = fold(f.q.trim());
  return list.filter((c) =>
    (!q || fold([c.name, c.province_name, c.ward_name, c.product_name, c.source, c.kd_names, c.am_names, c.contact_name, c.contact_phone, c.contact_email,
      ...(c.sales_projects ?? []).flatMap((p) => [p.code, p.name, p.kd_names, p.am_names])].filter(Boolean).join(' ')).includes(q)) &&
    (!f.status || c.status === f.status) &&
    (!f.province || (c.province_code || '-') === f.province) &&
    (!f.mine || !!c.is_mine));
}

/** Cây Khách hàng (cấp 1) → Dự án (cấp 2) ở cột trái, lọc theo từ khóa:
 *  khách hàng khớp tên thì giữ mọi dự án; không thì chỉ giữ các dự án khớp tên (và khách hàng chứa chúng) */
export function customerTree<C extends { name: string; sales_projects?: { name: string }[] }>(list: C[], q: string) {
  type P = NonNullable<C['sales_projects']>[number];
  const k = fold(q.trim());
  return list.flatMap((c): { customer: C; projects: P[] }[] => {
    const projects: P[] = c.sales_projects ?? [];
    if (!k || fold(c.name).includes(k)) return [{ customer: c, projects }];
    const hit = projects.filter((p) => fold(p.name).includes(k));
    return hit.length ? [{ customer: c, projects: hit }] : [];
  });
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

/** Số ngày quá hạn của việc chưa hoàn thành (0 = chưa quá hạn / đã xong / không có hạn) */
export function overdueDays(due: string | null | undefined, status: string, today: string) {
  if (!due || status === 'done' || due >= today) return 0;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86400_000);
}

/** Nội dung cảnh báo lịch gọi điện (tooltip trên tên dự án, dòng cảnh báo) */
export function callAlertText(a: { date: string; late: number; count: number }) {
  const when = a.late > 0 ? `Quá hạn gọi khách hàng ${a.late} ngày (lịch ${a.date.split('-').reverse().join('/')})` : 'Hôm nay phải gọi khách hàng';
  return a.count > 1 ? `${when} · ${a.count} lịch chưa xác nhận` : when;
}

/** Cảnh báo gọi điện của khách hàng: dự án trễ lâu nhất trong các dự án đang có lịch đến ngày */
export function worstCallAlert<T extends { call_alert?: { date: string; late: number; count: number } | null }>(projects: T[] | undefined) {
  const alerts = (projects ?? []).map((p) => p.call_alert).filter((a): a is NonNullable<T['call_alert']> => !!a);
  if (!alerts.length) return null;
  const worst = alerts.reduce((m, a) => (a.late > m.late ? a : m));
  return { ...worst, count: alerts.reduce((n, a) => n + a.count, 0), projects: alerts.length };
}

/** Lịch chờ gọi sớm nhất đã đến ngày (hôm nay hoặc trước) — như server: late = số ngày quá */
export function callAlert(planned: string[], today: string) {
  const due = planned.filter((d) => d <= today).sort();
  if (!due.length) return null;
  return { date: due[0], late: Math.round((Date.parse(today) - Date.parse(due[0])) / 86400_000), count: due.length };
}
