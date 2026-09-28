import { all, get, run } from './db.ts';

/** Danh mục quyền trong phạm vi dự án. Vai trò (role) là một tập các quyền này. */
export const PERMISSIONS = [
  { key: 'project.admin', group: 'Dự án', label: 'Quản trị dự án (thông tin, thành viên, workflow)' },
  { key: 'sprint.manage', group: 'Dự án', label: 'Quản lý sprint và sắp xếp backlog' },
  { key: 'issue.create', group: 'Issue', label: 'Tạo issue' },
  { key: 'issue.edit', group: 'Issue', label: 'Sửa mọi issue' },
  { key: 'issue.edit_own', group: 'Issue', label: 'Sửa issue do mình tạo hoặc được giao' },
  { key: 'issue.assign', group: 'Issue', label: 'Giao việc (đổi người thực hiện)' },
  { key: 'issue.transition', group: 'Issue', label: 'Chuyển trạng thái issue' },
  { key: 'issue.delete', group: 'Issue', label: 'Xóa issue' },
  { key: 'comment.create', group: 'Bình luận & tệp', label: 'Bình luận' },
  { key: 'comment.delete_any', group: 'Bình luận & tệp', label: 'Sửa/xóa bình luận của người khác' },
  { key: 'attachment.create', group: 'Bình luận & tệp', label: 'Đính kèm tệp' },
  { key: 'attachment.delete_any', group: 'Bình luận & tệp', label: 'Xóa tệp của người khác' },
] as const;

export type Permission = (typeof PERMISSIONS)[number]['key'];
export const ALL_PERMISSIONS = PERMISSIONS.map((p) => p.key) as Permission[];

export const DEFAULT_ROLES: { name: string; description: string; permissions: Permission[] }[] = [
  {
    name: 'BA Lead',
    description: 'Toàn quyền trong dự án: quản trị dự án, xóa issue, xóa bình luận/tệp của người khác',
    permissions: ALL_PERMISSIONS,
  },
  {
    name: 'BA',
    description: 'Kiêm PM, BA và Tester: quản lý backlog/sprint, giao việc, sửa mọi issue, kiểm thử',
    permissions: ['sprint.manage', 'issue.create', 'issue.edit', 'issue.edit_own', 'issue.assign', 'issue.transition',
      'comment.create', 'attachment.create'],
  },
  {
    name: 'Techlead',
    description: 'Lập kế hoạch kỹ thuật, giao việc cho Dev, quản lý sprint',
    permissions: ['sprint.manage', 'issue.create', 'issue.edit', 'issue.edit_own', 'issue.assign', 'issue.transition',
      'comment.create', 'attachment.create'],
  },
  {
    name: 'Dev',
    description: 'Thực hiện công việc được giao',
    permissions: ['issue.create', 'issue.edit_own', 'issue.transition', 'comment.create', 'attachment.create'],
  },
  {
    name: 'Người xem',
    description: 'Khách hàng/lãnh đạo: chỉ xem và bình luận',
    permissions: ['comment.create'],
  },
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

/** Trả về tập quyền của user trong dự án, hoặc null nếu user không được truy cập dự án. */
export function projectPermissions(user: AuthUser, projectId: number): Set<Permission> | null {
  if (user.is_admin) return new Set(ALL_PERMISSIONS);
  const m = get<{ permissions: string }>(
    `SELECT r.permissions FROM project_members pm JOIN roles r ON r.id = pm.role_id
     WHERE pm.project_id = ? AND pm.user_id = ?`,
    projectId, user.id,
  );
  if (!m) return null;
  return new Set(JSON.parse(m.permissions) as Permission[]);
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

export function accessibleProjectIds(user: AuthUser): number[] | 'all' {
  if (user.is_admin) return 'all';
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
