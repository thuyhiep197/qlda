/**
 * Vị trí của nhân sự (Danh mục Phòng ban & Nhân sự) và mã hiện trong hành trình khách hàng.
 * Mã khớp với cột Đơn vị thực hiện / phối hợp của quy trình mẫu: KD, AM, BA, DEV, HC, BGĐ.
 */
export const POSITIONS = ['bgd', 'kd', 'am', 'ba_pm', 'dev', 'tester', 'hc'] as const;
export type Position = (typeof POSITIONS)[number];
export const POSITION_CODES: Record<Position, string> = { bgd: 'BGĐ', kd: 'KD', am: 'AM', ba_pm: 'BA', dev: 'DEV', tester: 'Tester', hc: 'HC' };

/** Mã các vị trí của một nhân sự (positions = danh sách cách nhau dấu phẩy), theo thứ tự chuẩn */
export function positionCodes(positions: string | null | undefined): string[] {
  const list = (positions ?? '').split(',').map((x) => x.trim());
  return POSITIONS.filter((p) => list.includes(p)).map((p) => POSITION_CODES[p]);
}

/** Mã hiện cạnh tên người (vị trí đầu tiên theo thứ tự chuẩn), không có → null */
export const primaryCode = (positions: string | null | undefined) => positionCodes(positions)[0] ?? null;

/** Vị trí được chọn theo phòng (mã phòng cấp phòng trong sơ đồ tổ chức); phòng do người dùng tự thêm, không có trong bảng → mọi vị trí */
export const DEPARTMENT_POSITIONS: Record<string, Position[]> = {
  'BGĐ': ['bgd'], 'P.KD': ['kd', 'am'], 'P.DA': ['ba_pm', 'dev', 'tester'], 'P.SP': ['ba_pm', 'dev', 'tester'], 'P.HC': ['hc'],
};
/** Vị trí mặc định của nhóm con (tích sẵn khi thêm nhân sự vào nhóm) theo đuôi mã nhóm */
const TEAM_POSITION: Record<string, Position> = { SALE: 'kd', AM: 'am', DEV: 'dev', BA: 'ba_pm', TEST: 'tester' };

/**
 * Vị trí được chọn cho phòng ban, xét từ chính nó lên các cấp trên (codes = [mã phòng ban, mã cấp trên, …]):
 * lấy theo phòng gần nhất có trong bảng; nhóm con dùng bộ vị trí của phòng chứa nó.
 */
export function allowedPositions(codes: string[]): { allowed: Position[]; preset: Position | null } {
  // Ban Giám đốc chỉ áp dụng cho chính nó (phòng mới thêm dưới Ban Giám đốc không bị giới hạn chỉ còn BGĐ)
  const rule = codes.map((c, i) => (i > 0 && c.toUpperCase() === 'BGĐ' ? undefined : DEPARTMENT_POSITIONS[c.toUpperCase()])).find(Boolean);
  const allowed = rule ?? [...POSITIONS];
  const team = TEAM_POSITION[(codes[0] ?? '').toUpperCase().split('.').pop() ?? ''];
  const preset = team && allowed.includes(team) ? team : allowed.length === 1 ? allowed[0] : null;
  return { allowed, preset };
}
