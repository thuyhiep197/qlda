/** Lỗi dữ liệu nhập (route đổi thành HTTP 400) — không import permissions.ts để test không phải mở CSDL */
const badRequest = (msg: string) => new Error(msg);

// Danh mục khách hàng (CRM): phân loại, trạng thái quan hệ, loại hoạt động chăm sóc
export const CUSTOMER_KINDS = ['Cơ quan nhà nước', 'Trường học', 'Doanh nghiệp', 'Khác'] as const;
export const CUSTOMER_STATUSES = ['Tiềm năng', 'Đang hợp tác', 'Tạm dừng', 'Ngừng hợp tác'] as const;
export const ACTIVITY_KINDS = ['call', 'meeting', 'email', 'note'] as const;

const text = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max) || null;
const longText = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max) || null;

function email(v: unknown) {
  const e = text(v, 200);
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw badRequest('Email không hợp lệ');
  return e;
}

function oneOf<T extends string>(v: unknown, list: readonly T[], label: string, fallback: T | null): T | null {
  const s = text(v, 100);
  if (!s) return fallback;
  if (!(list as readonly string[]).includes(s)) throw badRequest(`${label} không hợp lệ`);
  return s as T;
}

/** Kiểm tra & chuẩn hóa thông tin khách hàng. */
export function cleanCustomer(b: any) {
  const name = text(b.name, 200);
  if (!name) throw badRequest('Tên khách hàng không được để trống');
  return {
    name,
    kind: oneOf(b.kind, CUSTOMER_KINDS, 'Loại khách hàng', null),
    status: oneOf(b.status, CUSTOMER_STATUSES, 'Trạng thái', 'Đang hợp tác')!,
    tax_code: text(b.tax_code, 30),
    province: text(b.province, 100),
    address: text(b.address, 300),
    phone: text(b.phone, 50),
    email: email(b.email),
    website: text(b.website, 200),
    am: text(b.am, 500),
    note: longText(b.note, 4000),
  };
}

export function cleanContact(b: any) {
  const full_name = text(b.full_name, 100);
  if (!full_name) throw badRequest('Họ tên người liên hệ không được để trống');
  return {
    full_name,
    position: text(b.position, 150),
    phone: text(b.phone, 50),
    email: email(b.email),
    is_primary: b.is_primary ? 1 : 0,
    note: text(b.note, 500),
  };
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

/** So tên khách hàng không phân biệt hoa/thường kể cả chữ có dấu (COLLATE NOCASE của SQLite chỉ xử lý chữ không dấu) */
export const sameName = (a: string, b: string) => a.toLocaleLowerCase('vi') === b.toLocaleLowerCase('vi');
