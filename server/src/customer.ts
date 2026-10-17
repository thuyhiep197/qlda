/** Lỗi dữ liệu nhập (route đổi thành HTTP 400) — không import permissions.ts để test không phải mở CSDL */
const badRequest = (msg: string) => new Error(msg);

// Danh mục khách hàng (CRM): tình trạng quan hệ, loại hoạt động chăm sóc
export const CUSTOMER_STATUSES = ['Mới', 'Đang tư vấn', 'Chờ phản hồi', 'Đang làm sản phẩm', 'Đã ký hợp đồng', 'Đã thanh toán'] as const;
/** Trao đổi: làm việc với khách hàng (gọi điện, gặp mặt, email, ghi chú) và thảo luận nội bộ (internal, có @nhắc tên) */
export const ACTIVITY_KINDS = ['call', 'meeting', 'email', 'note', 'internal'] as const;
export const TASK_STATUSES = ['todo', 'doing', 'done'] as const;

const text = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max) || null;
const longText = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max) || null;
const optId = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : NaN);

/** Danh sách id (nhân viên phụ trách…) — bỏ trùng, bỏ giá trị không hợp lệ */
const idList = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];

function email(v: unknown) {
  const e = text(v, 200);
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw badRequest(`Email không hợp lệ: ${e}`);
  return e;
}

function oneOf<T extends string>(v: unknown, list: readonly T[], label: string, fallback: T | null): T | null {
  const s = text(v, 100);
  if (!s) return fallback;
  if (!(list as readonly string[]).includes(s)) throw badRequest(`${label} không hợp lệ`);
  return s as T;
}

/** Kiểm tra & chuẩn hóa thông tin khách hàng (cơ quan/đơn vị). Việc sản phẩm thuộc loại sản phẩm, phường/xã thuộc tỉnh do route kiểm tra với CSDL. */
export function cleanCustomer(b: any) {
  const name = text(b.name, 200);
  if (!name) throw badRequest('Tên cơ quan/đơn vị không được để trống');
  const product_type_id = optId(b.product_type_id), product_id = optId(b.product_id);
  if (Number.isNaN(product_type_id)) throw badRequest('Loại sản phẩm không hợp lệ');
  if (Number.isNaN(product_id)) throw badRequest('Sản phẩm không hợp lệ');
  return {
    name,
    province_code: text(b.province_code, 10),
    ward_code: text(b.ward_code, 10),
    product_type_id,
    product_id,
    product_description: longText(b.product_description, 4000),
    source: text(b.source, 200),
    status: oneOf(b.status, CUSTOMER_STATUSES, 'Tình trạng', 'Mới')!,
    owner_ids: idList(b.owner_ids),
  };
}

/** Đầu mối liên hệ: tên, SĐT, email */
export function cleanContact(b: any) {
  const full_name = text(b.full_name, 100);
  if (!full_name) throw badRequest('Tên đầu mối liên hệ không được để trống');
  return { full_name, phone: text(b.phone, 50), email: email(b.email) };
}

/** Danh sách đầu mối gửi kèm form khách hàng; dòng để trống hoàn toàn được bỏ qua */
export function cleanContacts(list: unknown) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((c) => c && [c.full_name, c.phone, c.email].some((v) => String(v ?? '').trim()))
    .map((c) => ({ id: optId(c.id) || null, ...cleanContact(c) }));
}

/** Hoạt động chăm sóc khách hàng: gọi điện, gặp mặt, email, ghi chú — ngày diễn ra mặc định là hôm nay. */
export function cleanActivity(b: any, today: string) {
  const kind = oneOf(b.kind, ACTIVITY_KINDS, 'Loại hoạt động', 'note')!;
  const content = longText(b.content, 4000);
  if (!content) throw badRequest('Nội dung không được để trống');
  const date = text(b.activity_date, 10) ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw badRequest('Ngày không hợp lệ');
  return { kind, content, activity_date: date };
}

/** Công việc kinh doanh của khách hàng: tên việc, người làm, hạn, trạng thái */
export function cleanTask(b: any) {
  const title = text(b.title, 300);
  if (!title) throw badRequest('Tên công việc không được để trống');
  const due = text(b.due_date, 10);
  if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due)))) throw badRequest('Hạn hoàn thành không hợp lệ');
  const assignee_id = optId(b.assignee_id);
  if (Number.isNaN(assignee_id)) throw badRequest('Người thực hiện không hợp lệ');
  return {
    title, description: longText(b.description, 4000), assignee_id, due_date: due,
    status: oneOf(b.status, TASK_STATUSES, 'Trạng thái', 'todo')!,
  };
}

/** Sản phẩm trong danh mục: tên, loại sản phẩm, mô tả (tự điền vào khách hàng khi chọn sản phẩm) */
export function cleanProduct(b: any) {
  const name = text(b.name, 200);
  if (!name) throw badRequest('Tên sản phẩm không được để trống');
  const type_id = optId(b.type_id);
  if (!type_id) throw badRequest('Chọn loại sản phẩm');
  return { name, type_id, description: longText(b.description, 4000) };
}

/** So tên không phân biệt hoa/thường kể cả chữ có dấu (COLLATE NOCASE của SQLite chỉ xử lý chữ không dấu) */
export const sameName = (a: string, b: string) => a.toLocaleLowerCase('vi') === b.toLocaleLowerCase('vi');
