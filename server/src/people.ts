import { all, get, run, tx } from './db.ts';
import { badRequest } from './permissions.ts';

/**
 * Người phụ trách theo tài khoản (id người dùng): Sale, AM của khách hàng; Sale, AM, BA/PM, Dev, Tester của dự án của khách hàng;
 * BA/PM, Dev, Tester, AM của dự án sản xuất. Mỗi vai trò chỉ chọn được tài khoản có vị trí tương ứng (phòng ban & vị trí của tài khoản).
 */
export const PEOPLE_ROLES = ['kd', 'am', 'ba', 'dev', 'tester'] as const;
export type PeopleRole = (typeof PEOPLE_ROLES)[number];
/** Vai trò → vị trí của tài khoản được chọn (Sale, AM: người của Phòng Kinh doanh) */
export const ROLE_POSITIONS: Record<PeopleRole, string[]> = { kd: ['kd'], am: ['am'], ba: ['ba_pm'], dev: ['dev'], tester: ['tester'] };
export const ROLE_LABELS: Record<PeopleRole, string> = { kd: 'Sale', am: 'AM', ba: 'BA/PM', dev: 'Dev', tester: 'Tester' };
export type People = Partial<Record<PeopleRole, number[]>>;

/** Danh sách id tài khoản gửi lên — bỏ trùng, bỏ giá trị không hợp lệ */
export const idList = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];

/** Vị trí của tài khoản (bgd, kd, am, ba_pm, dev, tester, hc) */
export const userPositions = (userId: number) => (get<{ positions: string }>('SELECT positions FROM users WHERE id = ?', userId)?.positions ?? '').split(',').filter(Boolean);

/** Người mới được chọn (chưa có trong before) phải là tài khoản đang hoạt động có vị trí đúng vai trò */
export function checkPeople(ids: number[], role: PeopleRole, before: number[] = []) {
  for (const id of ids) {
    if (before.includes(id)) continue;
    const u = get<{ positions: string; is_active: number }>('SELECT positions, is_active FROM users WHERE id = ?', id);
    if (!u || !u.is_active) throw badRequest(`${ROLE_LABELS[role]}: tài khoản không hợp lệ`);
    if (!u.positions.split(',').some((p) => ROLE_POSITIONS[role].includes(p))) throw badRequest(`${ROLE_LABELS[role]} phải là người có vị trí ${ROLE_LABELS[role]} (Quản trị → Phòng ban & Nhân sự)`);
  }
}

/** Người của một bảng phụ trách (customer_owners / sales_project_owners / project_people) theo vai trò: { kd: [{ id, full_name }], … } */
export function peopleOf(table: 'customer_owners' | 'sales_project_owners' | 'project_people', key: string, id: number) {
  const out: Partial<Record<PeopleRole, { id: number; full_name: string }[]>> = {};
  for (const r of all<{ role: PeopleRole; id: number; full_name: string }>(
    `SELECT o.role, u.id, u.full_name FROM ${table} o JOIN users u ON u.id = o.user_id WHERE o.${key} = ? ORDER BY u.full_name`, id)) {
    (out[r.role] ??= []).push({ id: r.id, full_name: r.full_name });
  }
  return out;
}

/** Thay người ở các vai trò được gửi lên (vai trò không gửi giữ nguyên) */
export function savePeople(table: 'customer_owners' | 'sales_project_owners' | 'project_people', key: string, id: number, people: People) {
  tx(() => {
    for (const [role, ids] of Object.entries(people) as [PeopleRole, number[]][]) {
      run(`DELETE FROM ${table} WHERE ${key} = ? AND role = ?`, id, role);
      for (const uid of ids) run(`INSERT OR IGNORE INTO ${table}(${key}, user_id, role) VALUES (?,?,?)`, id, uid, role);
    }
  });
}

/** SQL: họ tên những người ở một vai trò, cách nhau dấu phẩy (cột col là id khóa) */
export const namesSql = (table: string, key: string, col: string, role: PeopleRole) =>
  `(SELECT GROUP_CONCAT(u.full_name, ', ') FROM ${table} o JOIN users u ON u.id = o.user_id WHERE o.${key} = ${col} AND o.role = '${role}')`;

/** Thành viên dự án sản xuất = Trưởng dự án + người ở các vai trò BA/PM, Dev, Tester, AM (vai trò trong dự án theo nhóm của tài khoản) */
export function syncProjectMembers(projectId: number) {
  tx(() => {
    run('DELETE FROM project_members WHERE project_id = ?', projectId);
    run(`INSERT OR IGNORE INTO project_members(project_id, user_id, role_id)
      SELECT p.id, u.id, u.default_role_id FROM projects p JOIN users u ON u.id = p.lead_id WHERE p.id = ? AND u.default_role_id IS NOT NULL`, projectId);
    run(`INSERT OR IGNORE INTO project_members(project_id, user_id, role_id)
      SELECT pp.project_id, u.id, u.default_role_id FROM project_people pp JOIN users u ON u.id = pp.user_id WHERE pp.project_id = ? AND u.default_role_id IS NOT NULL`, projectId);
  });
}
