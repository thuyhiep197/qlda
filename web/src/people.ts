/**
 * Người phụ trách theo tài khoản (id người dùng): Sale, AM, BA/PM, Dev, Tester.
 * Mỗi vai trò chỉ chọn tài khoản có vị trí tương ứng (Quản trị → Phòng ban & Nhân sự); hiện "Họ tên (Phòng ban)".
 */
export type PeopleRole = 'kd' | 'am' | 'ba' | 'dev' | 'tester';
export const ROLE_POSITIONS: Record<PeopleRole, string[]> = { kd: ['kd'], am: ['am'], ba: ['ba_pm'], dev: ['dev'], tester: ['tester'] };
export const ROLE_LABELS: Record<PeopleRole, string> = { kd: 'Sale', am: 'AM', ba: 'BA/PM', dev: 'Dev', tester: 'Tester' };

export interface Person { id: number; full_name: string; positions?: string[]; department_short?: string | null }

/** "Họ tên (Phòng ban)" — phòng ban là tên nhóm / phòng gần nhất (VD BA, AM); chưa xếp phòng thì chỉ họ tên */
export const personLabel = (u: Person) => (u.department_short ? `${u.full_name} (${u.department_short})` : u.full_name);

/** Tài khoản chọn được cho một vai trò (đúng vị trí), trừ người đã chọn */
export const candidates = <T extends Person>(users: T[], role: PeopleRole, chosen: number[]) =>
  users.filter((u) => !chosen.includes(u.id) && (u.positions ?? []).some((p) => ROLE_POSITIONS[role].includes(p)));

/** Dev phụ trách issue: Dev của dự án (devIds); không có dự án (undefined) → mọi tài khoản vị trí Dev */
export const projectDevOptions = <T extends Person>(users: T[] | undefined, devIds: number[] | undefined) =>
  (users ?? []).filter((u) => (devIds === undefined ? (u.positions ?? []).includes('dev') : devIds.includes(u.id)));

/** Gợi ý phòng ban (mã) + vị trí theo nhóm người dùng khi tạo / sửa tài khoản — người dùng vẫn sửa lại được */
const GROUP_PLACEMENT: Record<string, { code: string; position: string }> = {
  'kinh doanh': { code: 'P.KD.SALE', position: 'kd' }, am: { code: 'P.KD.AM', position: 'am' },
  ba: { code: 'P.DA.BA', position: 'ba_pm' }, dev: { code: 'P.DA.DEV', position: 'dev' }, tester: { code: 'P.DA.TEST', position: 'tester' },
  'ban giám đốc': { code: 'BGĐ', position: 'bgd' },
};
export function suggestPlacement(groupName: string | null | undefined, deps: { id: number; code: string }[]) {
  const rule = GROUP_PLACEMENT[(groupName ?? '').trim().toLowerCase()];
  const dep = rule && deps.find((d) => d.code.toUpperCase() === rule.code.toUpperCase());
  return dep ? { department_id: dep.id, positions: [rule.position] } : null;
}
