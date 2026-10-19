import { all, get, run } from './db.ts';
import { isLegacyPermissionList } from './perm-legacy.ts';

// ---------------------------------------------------------------------------
// Danh mục phân quyền: Phân hệ → Module → Chức năng → Hành động (Xem, Thêm, Sửa, Xóa, Tải, Import).
// Mã quyền = "<chức năng>.<hành động>", VD: issue.create, plan.export.
// Ô nào mang nghĩa riêng (VD cột Xóa = Lưu trữ) thì ghi trong actionLabels và hiện ngay trong ô.
// Nhóm người dùng (vai trò) là một tập mã quyền; mỗi người dùng có thể được cho phép thêm / chặn riêng từng quyền.
// ---------------------------------------------------------------------------
export const ACTIONS = { view: 'Xem', create: 'Thêm', edit: 'Sửa', delete: 'Xóa', export: 'Tải', import: 'Import' } as const;
export type Action = keyof typeof ACTIONS;

export interface FeatureDef {
  key: string; label: string; hint?: string; actions: Action[];
  actionHints?: Partial<Record<Action, string>>;
  /** Tên riêng của hành động ở chức năng này (hiện trong ô), VD delete → Lưu trữ */
  actionLabels?: Partial<Record<Action, string>>;
}
/** Module (nhóm chức năng) thuộc một phân hệ */
export interface FeatureGroup { key: string; label: string; subsystem: string; features: FeatureDef[] }

export const SUBSYSTEMS = [
  { key: 'customer', label: 'Phân hệ Khách hàng' },
  { key: 'project', label: 'Phân hệ Dự án' },
  { key: 'docs', label: 'Phân hệ Tài liệu nội bộ' },
  { key: 'admin', label: 'Phân hệ Quản trị' },
] as const;

export const FEATURE_GROUPS: FeatureGroup[] = [
  // ---- Phân hệ Khách hàng ----
  {
    key: 'crm', label: 'Module Khách hàng', subsystem: 'customer', features: [
      { key: 'customer', label: 'Thông tin khách hàng', hint: 'Cơ quan/đơn vị, đầu mối, Kinh doanh phụ trách, AM hỗ trợ', actions: ['view', 'create', 'edit', 'delete'],
        actionLabels: { delete: 'Lưu trữ' }, actionHints: { delete: 'Lưu trữ / mở lại khách hàng (ẩn khỏi danh sách)' } },
      { key: 'customer_all', label: 'Phạm vi: Tất cả khách hàng', hint: 'Tích thì các quyền đang có (xem, thêm, sửa, lưu trữ, tải…) áp dụng trên mọi khách hàng, dự án của khách hàng; không tích thì chỉ khách hàng, dự án mình phụ trách, thực hiện hoặc phối hợp', actions: ['view'] },
    ],
  },
  {
    key: 'crm_project', label: 'Module Dự án của khách hàng', subsystem: 'customer', features: [
      { key: 'sales_project', label: 'Dự án của khách hàng', actions: ['view', 'create', 'edit', 'delete'],
        actionLabels: { delete: 'Lưu trữ' }, actionHints: { delete: 'Lưu trữ / mở lại dự án (ẩn khỏi danh sách)' } },
    ],
  },
  {
    key: 'crm_journey', label: 'Module Hành trình', subsystem: 'customer', features: [
      { key: 'journey', label: 'Hành trình (quy trình I–IV)', actions: ['view', 'create', 'edit', 'delete'],
        actionLabels: { create: 'Áp dụng mẫu, thêm bước', edit: 'Cập nhật bước', delete: 'Bỏ bước' },
        actionHints: { edit: 'Trạng thái, người thực hiện / phối hợp, hạn, nhắc nhở của bước' } },
    ],
  },
  {
    key: 'crm_task', label: 'Module Công việc', subsystem: 'customer', features: [
      { key: 'ctask', label: 'Công việc', hint: 'Việc chung của khách hàng và việc của từng dự án', actions: ['view', 'create', 'edit', 'delete'],
        actionHints: { delete: 'Xóa việc của người khác (việc mình tạo luôn xóa được)' } },
    ],
  },
  {
    key: 'crm_file', label: 'Module Tài liệu', subsystem: 'customer', features: [
      { key: 'cfile', label: 'Tài liệu', hint: 'Tài liệu của khách hàng, của dự án, kết quả của bước', actions: ['view', 'create', 'delete', 'export'],
        actionLabels: { create: 'Tải lên', export: 'Tải về' }, actionHints: { delete: 'Xóa tài liệu của người khác (của mình luôn xóa được)' } },
    ],
  },
  {
    key: 'crm_talk', label: 'Module Trao đổi', subsystem: 'customer', features: [
      { key: 'ctalk', label: 'Trao đổi', hint: 'Làm việc với khách hàng và thảo luận nội bộ', actions: ['view', 'create', 'delete'],
        actionHints: { delete: 'Xóa trao đổi của người khác (của mình luôn xóa được)' } },
    ],
  },
  // ---- Phân hệ Dự án ----
  {
    key: 'project', label: 'Module Thông tin dự án', subsystem: 'project', features: [
      { key: 'project', label: 'Dự án', hint: 'Thông tin, thành viên, trạng thái & quy trình', actions: ['create', 'edit', 'delete'],
        actionLabels: { delete: 'Lưu trữ' }, actionHints: { delete: 'Lưu trữ dự án' } },
      { key: 'project_all', label: 'Phạm vi: Tất cả dự án', hint: 'Tích thì các quyền đang có áp dụng trên mọi dự án; không tích thì chỉ dự án mình là thành viên', actions: ['view'] },
      { key: 'component', label: 'Mô-đun & BA phụ trách', actions: ['view', 'create', 'edit', 'delete'] },
    ],
  },
  {
    key: 'monitor', label: 'Module Dashboard & Kế hoạch', subsystem: 'project', features: [
      { key: 'dashboard', label: 'Dashboard dự án', actions: ['view'] },
      { key: 'plan', label: 'Kế hoạch chi tiết & tổng quan', actions: ['view', 'export'], actionHints: { export: 'Xuất Excel kế hoạch' } },
    ],
  },
  {
    key: 'planning', label: 'Module Sprint & Backlog', subsystem: 'project', features: [
      { key: 'sprint', label: 'Sprint', hint: 'Bảng sprint đang chạy; tạo, sửa, bắt đầu, hoàn thành, xóa sprint', actions: ['view', 'create', 'edit', 'delete'] },
      { key: 'backlog', label: 'Backlog', hint: 'Sắp xếp, kéo issue vào sprint', actions: ['view', 'edit'] },
    ],
  },
  {
    key: 'work', label: 'Module Công việc', subsystem: 'project', features: [
      { key: 'search', label: 'Danh sách & tìm kiếm issue', actions: ['view', 'export'], actionHints: { export: 'Xuất Excel danh sách issue' } },
      { key: 'issue', label: 'Issue (Epic, Story, Task, Bug, Sub-task)', actions: ['view', 'create', 'edit', 'delete', 'import'],
        actionHints: { view: 'Mở xem chi tiết issue, xem kế hoạch', edit: 'Sửa mọi issue', import: 'Nhập issue hàng loạt từ Excel/CSV' } },
      { key: 'issue_own', label: 'Issue của mình', hint: 'Issue do mình tạo hoặc được giao', actions: ['edit'] },
      { key: 'assign', label: 'Giao việc', hint: 'Đổi người thực hiện', actions: ['edit'] },
      { key: 'transition', label: 'Chuyển trạng thái', actions: ['edit'] },
      { key: 'comment', label: 'Bình luận', actions: ['view', 'create', 'edit', 'delete'],
        actionHints: { edit: 'Sửa bình luận của người khác (của mình luôn sửa được)', delete: 'Xóa bình luận của người khác' } },
      { key: 'attachment', label: 'Tệp đính kèm', actions: ['view', 'create', 'delete', 'export'],
        actionHints: { delete: 'Xóa tệp của người khác (của mình luôn xóa được)', export: 'Tải tệp về máy' } },
      { key: 'worklog', label: 'Ghi thời gian làm việc', actions: ['view', 'create', 'edit', 'delete'],
        actionHints: { edit: 'Sửa giờ của người khác', delete: 'Xóa giờ của người khác' } },
    ],
  },
  {
    key: 'report_m', label: 'Module Báo cáo', subsystem: 'project', features: [
      { key: 'report', label: 'Báo cáo', hint: 'Khối lượng còn lại, báo cáo sprint, năng suất, giờ công', actions: ['view', 'export'], actionHints: { export: 'Xuất Excel giờ công' } },
    ],
  },
  // ---- Phân hệ Tài liệu nội bộ ----
  {
    key: 'docs', label: 'Module Tài liệu', subsystem: 'docs', features: [
      { key: 'document', label: 'Tài liệu nội bộ', hint: 'Mọi người đều tra cứu, tạo thư mục, tải lên, tải xuống và sửa / xóa của mình; các quyền dưới đây là sửa / xóa của người khác',
        actions: ['edit', 'delete'], actionHints: { edit: 'Đổi tên, chuyển thư mục / tài liệu của người khác', delete: 'Xóa thư mục / tài liệu của người khác' } },
    ],
  },
  // ---- Phân hệ Quản trị ----
  {
    key: 'system', label: 'Module Người dùng & phân quyền', subsystem: 'admin', features: [
      { key: 'user', label: 'Người dùng', hint: 'Tài khoản, đặt lại mật khẩu', actions: ['view', 'create', 'edit', 'delete'], actionLabels: { delete: 'Khóa' }, actionHints: { delete: 'Khóa tài khoản' } },
      { key: 'role', label: 'Nhóm người dùng & phân quyền', actions: ['view', 'create', 'edit', 'delete'] },
    ],
  },
  {
    key: 'catalog', label: 'Module Danh mục', subsystem: 'admin', features: [
      { key: 'department', label: 'Phòng ban (sơ đồ tổ chức)', hint: 'Ban Giám đốc và các phòng; nhân sự thuộc phòng ban', actions: ['view', 'create', 'edit', 'delete'] },
      { key: 'geo', label: 'Danh mục địa chính', hint: 'Tỉnh/thành phố, phường/xã dùng để chọn địa chỉ khách hàng', actions: ['view', 'create', 'edit', 'delete'] },
      { key: 'product', label: 'Danh mục Loại sản phẩm & Sản phẩm', hint: 'Sản phẩm kèm mô tả, dùng để chọn cho dự án của khách hàng', actions: ['view', 'create', 'edit', 'delete'] },
      { key: 'staff', label: 'Nhân sự', hint: 'Nhân sự trong từng phòng ban: vị trí (BGĐ, KD, AM, BA/PM, Dev, Tester, HC), tài khoản đăng nhập', actions: ['view', 'create', 'edit', 'delete'] },
    ],
  },
];

export type Permission = string;
export const ALL_PERMISSIONS: Permission[] = FEATURE_GROUPS.flatMap((g) => g.features.flatMap((f) => f.actions.map((a) => `${f.key}.${a}`)));
const VALID = new Set(ALL_PERMISSIONS);

/**
 * Mã quyền gộp dùng trong code từ trước (vẫn kiểm tra ở nhiều nơi) — suy ra từ quyền mới.
 * VD 'sprint.manage' = được sắp xếp backlog/đổi sprint của issue.
 */
const DERIVED: Record<string, string[]> = {
  'issue.edit_own': ['issue_own.edit'],
  'issue.assign': ['assign.edit'],
  'issue.transition': ['transition.edit'],
  'sprint.manage': ['backlog.edit'],
  'project.admin': ['project.edit'],
  'attachment.delete_any': ['attachment.delete'],
};
function withDerived(set: Set<Permission>) {
  for (const [k, from] of Object.entries(DERIVED)) if (from.some((p) => set.has(p))) set.add(k);
  return set;
}

// ---------------------------------------------------------------------------
// Chuyển quyền kiểu cũ (danh sách quyền phẳng) sang ma trận chức năng × hành động — chạy 1 lần khi khởi động
// ---------------------------------------------------------------------------
const OLD_KEYS = ['project.admin', 'sprint.manage', 'issue.create', 'issue.edit', 'issue.edit_own', 'issue.assign', 'issue.transition',
  'issue.delete', 'issue.import', 'comment.create', 'comment.delete_any', 'attachment.create', 'attachment.delete_any'];
const OLD_MAP: Record<string, string[]> = {
  'issue.create': ['issue.create'], 'issue.edit': ['issue.edit'], 'issue.edit_own': ['issue_own.edit'], 'issue.assign': ['assign.edit'],
  'issue.transition': ['transition.edit', 'worklog.create'], 'issue.delete': ['issue.delete'], 'issue.import': ['issue.import'],
  'sprint.manage': ['sprint.create', 'sprint.edit', 'sprint.delete', 'backlog.edit'],
  'project.admin': ['project.edit', 'component.create', 'component.edit', 'component.delete', 'worklog.edit', 'worklog.delete'],
  'comment.create': ['comment.create'], 'comment.delete_any': ['comment.edit', 'comment.delete'],
  'attachment.create': ['attachment.create'], 'attachment.delete_any': ['attachment.delete'],
};
// Người trực tiếp làm việc thấy mọi màn hình; người chỉ theo dõi (Người xem, Phối hợp) chỉ thấy Dashboard & Kế hoạch
const VIEW_WORKER = ['dashboard.view', 'plan.view', 'plan.export', 'report.view', 'report.export', 'search.view', 'search.export',
  'issue.view', 'comment.view', 'attachment.view', 'attachment.export', 'worklog.view', 'sprint.view', 'backlog.view', 'component.view'];
const VIEW_FOLLOWER = ['dashboard.view', 'plan.view', 'plan.export', 'issue.view', 'comment.view', 'attachment.view', 'attachment.export', 'component.view'];

export function convertLegacyPermissions(old: string[]): Permission[] {
  const worker = old.some((p) => ['issue.create', 'issue.edit', 'issue.edit_own', 'issue.transition'].includes(p));
  const out = new Set<Permission>(worker ? VIEW_WORKER : VIEW_FOLLOWER);
  for (const p of old) for (const n of OLD_MAP[p] ?? []) out.add(n);
  if (OLD_KEYS.every((k) => old.includes(k))) ALL_PERMISSIONS.forEach((p) => out.add(p)); // vai trò toàn quyền cũ (BA Lead)
  return ALL_PERMISSIONS.filter((p) => out.has(p));
}

/** Nhóm người dùng còn lưu quyền kiểu cũ → chuyển sang kiểu mới, giữ nguyên năng lực (xem perm-legacy.ts). */
export function upgradeRolePermissions() {
  for (const r of all<{ id: number; name: string; permissions: string }>('SELECT id, name, permissions FROM roles')) {
    let p: string[] = [];
    try { p = JSON.parse(r.permissions); } catch { /* quyền hỏng → coi như rỗng */ }
    if (!isLegacyPermissionList(p, OLD_KEYS, ALL_PERMISSIONS)) continue;
    run('UPDATE roles SET permissions = ? WHERE id = ?', JSON.stringify(convertLegacyPermissions(p)), r.id);
    console.log(`[permissions] chuyển nhóm "${r.name}" sang phân quyền theo chức năng`);
  }
}

export const cleanPermissionList = (v: unknown): Permission[] => (Array.isArray(v) ? ALL_PERMISSIONS.filter((p) => v.includes(p)) : []);
export const isPermission = (p: string) => VALID.has(p);

/** Xem tiến độ phân hệ Dự án (không sửa) */
const PROJECT_VIEW: Permission[] = ['dashboard.view', 'plan.view', 'plan.export', 'issue.view', 'comment.view', 'attachment.view', 'attachment.export', 'component.view'];
/** Nhóm Kinh doanh / AM: dùng phân hệ Khách hàng (khách hàng mình phụ trách, thực hiện, phối hợp); phân hệ Dự án chỉ xem tiến độ (khớp migration v22) */
export const SALES_PERMISSIONS: Permission[] = [...PROJECT_VIEW,
  'customer.view', 'customer.create', 'customer.edit', 'sales_project.view', 'sales_project.create', 'sales_project.edit',
  'journey.view', 'journey.create', 'journey.edit', 'journey.delete', 'ctask.view', 'ctask.create', 'ctask.edit',
  'cfile.view', 'cfile.create', 'cfile.export', 'ctalk.view', 'ctalk.create', 'product.view', 'geo.view', 'department.view', 'staff.view'];
/** Nhóm Ban Giám đốc: như Kinh doanh (thêm / sửa trên khách hàng, dự án mình phụ trách) + xem tất cả khách hàng */
export const BOARD_PERMISSIONS: Permission[] = [...SALES_PERMISSIONS, 'customer_all.view'];

export const DEFAULT_ROLES: { name: string; description: string; permissions: Permission[] }[] = [
  { name: 'BA Lead', description: 'Toàn quyền: quản trị dự án, xóa issue, quản trị hệ thống', permissions: ALL_PERMISSIONS },
  { name: 'BA', description: 'Kiêm PM, BA và Tester: quản lý backlog/sprint, giao việc, sửa mọi issue, kiểm thử',
    permissions: convertLegacyPermissions(['sprint.manage', 'issue.create', 'issue.edit', 'issue.edit_own', 'issue.assign', 'issue.transition', 'issue.import', 'comment.create', 'attachment.create']) },
  { name: 'Techlead', description: 'Lập kế hoạch kỹ thuật, giao việc cho Dev, quản lý sprint',
    permissions: convertLegacyPermissions(['sprint.manage', 'issue.create', 'issue.edit', 'issue.edit_own', 'issue.assign', 'issue.transition', 'issue.import', 'comment.create', 'attachment.create']) },
  { name: 'Dev', description: 'Thực hiện công việc được giao',
    permissions: convertLegacyPermissions(['issue.create', 'issue.edit_own', 'issue.transition', 'comment.create', 'attachment.create']) },
  { name: 'Người xem', description: 'Khách hàng/lãnh đạo: xem tiến độ và bình luận', permissions: convertLegacyPermissions(['comment.create']) },
  { name: 'Kinh doanh', description: 'Phòng Kinh doanh (Sale): khách hàng, dự án của khách hàng, hành trình bán hàng; xem tiến độ dự án sản xuất', permissions: SALES_PERMISSIONS },
  { name: 'AM', description: 'Phòng Kinh doanh (AM): chăm sóc khách hàng, dự án của khách hàng, hành trình bán hàng; xem tiến độ dự án sản xuất', permissions: SALES_PERMISSIONS },
  { name: 'Ban Giám đốc', description: 'Như Kinh doanh (thêm, sửa trên khách hàng, dự án mình phụ trách) + xem tất cả khách hàng, dự án của khách hàng', permissions: BOARD_PERMISSIONS },
];

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export const forbidden = (msg = 'Bạn không có quyền thực hiện thao tác này') => new HttpError(403, msg);
export const notFound = (msg = 'Không tìm thấy') => new HttpError(404, msg);
export const badRequest = (msg: string) => new HttpError(400, msg);

export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  is_admin: number;
  must_change_password: number;
}

/** Quyền thực tế của tài khoản (mọi dự án): quyền của nhóm người dùng + quyền cho phép thêm − quyền bị chặn. */
export function userPermissions(user: Pick<AuthUser, 'id' | 'is_admin'>, fallbackRoleId?: number | null): Set<Permission> {
  if (user.is_admin) return withDerived(new Set(ALL_PERMISSIONS));
  const row = get<{ permissions: string }>(
    'SELECT r.permissions FROM roles r WHERE r.id = COALESCE((SELECT default_role_id FROM users WHERE id = ?), ?)', user.id, fallbackRoleId ?? null);
  let base: string[] = [];
  try { base = row ? JSON.parse(row.permissions) : []; } catch { /* nhóm lỗi → không có quyền */ }
  const set = new Set<Permission>(base.filter(isPermission));
  for (const o of all<{ permission: string; effect: string }>('SELECT permission, effect FROM user_permissions WHERE user_id = ?', user.id)) {
    if (o.effect === 'allow') set.add(o.permission); else set.delete(o.permission);
  }
  return withDerived(set);
}

/** Tập quyền của user trong dự án; null nếu user không phải thành viên và không có phạm vi "Tất cả dự án". */
export function projectPermissions(user: AuthUser, projectId: number): Set<Permission> | null {
  if (user.is_admin) return userPermissions(user);
  // Quyền theo tài khoản (nhóm + quyền riêng); thành viên dự án chỉ quyết định có được vào dự án hay không
  const m = get<{ role_id: number }>('SELECT role_id FROM project_members WHERE project_id = ? AND user_id = ?', projectId, user.id);
  // Phạm vi Tất cả dự án: vào mọi dự án, áp dụng quyền của tài khoản
  if (!m) { const own = userPermissions(user); return own.has('project_all.view') ? own : null; }
  return userPermissions(user, m.role_id);
}

/** Bắt buộc có quyền (không gắn với dự án), VD quản trị người dùng, tạo dự án. */
export function requireUserPerm(user: AuthUser, perm: Permission) {
  if (!userPermissions(user).has(perm)) throw forbidden();
}

export function requireProjectAccess(user: AuthUser, projectId: number) {
  const perms = projectPermissions(user, projectId);
  if (!perms) throw forbidden('Bạn không phải thành viên của dự án này');
  return perms;
}

export function requirePerm(user: AuthUser, projectId: number, perm: Permission) {
  const perms = requireProjectAccess(user, projectId);
  if (!perms.has(perm)) throw forbidden();
  return perms;
}

/** Quyền sửa một issue cụ thể: issue.edit, hoặc issue.edit_own nếu là người tạo/người được giao. */
export function canEditIssue(user: AuthUser, perms: Set<Permission>, issue: { reporter_id: number | null; assignee_id: number | null }) {
  return perms.has('issue.edit') ||
    (perms.has('issue.edit_own') && (issue.reporter_id === user.id || issue.assignee_id === user.id));
}

/** Vai trò của tài khoản; tài khoản cũ chưa có vai trò thì lấy vai trò đầu tiên. */
export function accountRoleId(userId: number): number {
  return get<{ id: number }>('SELECT default_role_id AS id FROM users WHERE id = ? AND default_role_id IS NOT NULL', userId)?.id
    ?? get<{ id: number }>('SELECT id FROM roles ORDER BY id LIMIT 1')!.id;
}

export function accessibleProjectIds(user: AuthUser): number[] | 'all' {
  if (user.is_admin || userPermissions(user).has('project_all.view')) return 'all';
  return all<{ project_id: number }>('SELECT project_id FROM project_members WHERE user_id = ?', user.id)
    .map((r) => r.project_id);
}

export function seedRoles() {
  const count = get<{ c: number }>('SELECT COUNT(*) c FROM roles')!.c;
  if (count > 0) return;
  for (const r of DEFAULT_ROLES) {
    run('INSERT INTO roles(name, description, permissions) VALUES (?, ?, ?)', r.name, r.description, JSON.stringify(r.permissions));
  }
}
