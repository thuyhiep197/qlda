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
