import { fold } from './customer-filter';

export interface SelectOption { value: string; label: string; group: string | null; disabled: boolean }

/** Lọc các lựa chọn theo từ khóa (không dấu, không phân biệt hoa thường); bỏ trống → giữ tất cả */
export function filterOptions(options: SelectOption[], q: string): SelectOption[] {
  const k = fold(q.trim());
  if (!k) return options;
  return options.filter((o) => fold(`${o.label} ${o.group ?? ''}`).includes(k));
}

export interface PopoverPlace { top?: number; bottom?: number; left: number; width: number; maxHeight: number }
/**
 * Vị trí bảng nổi cạnh ô chọn (theo khung nhìn): rộng tối thiểu 260, không tràn mép phải.
 * Mở xuống dưới nếu dưới còn từ 220px hoặc rộng hơn phía trên, ngược lại mở lên trên; chiều cao tối đa (maxHeight)
 * co theo chỗ trống để bảng không bao giờ tràn khỏi màn hình (máy màn hình nhỏ vẫn thấy đủ ô Tìm và danh sách cuộn được).
 * Ô chọn đã cuộn ra khỏi khung nhìn → null (đóng bảng). Gọi lại khi cuộn để bảng bám theo ô thay vì đóng.
 */
export function placePopover(r: { top: number; bottom: number; left: number; width: number }, vw: number, vh: number): PopoverPlace | null {
  if (r.bottom < 0 || r.top > vh) return null;
  const width = Math.max(r.width, 260);
  const left = Math.max(4, Math.min(r.left, vw - width - 4));
  const below = vh - r.bottom - 2 - 8, above = r.top - 2 - 8;
  const down = below >= 220 || below >= above;
  const maxHeight = Math.max(80, Math.min(360, down ? below : above));
  return down ? { top: r.bottom + 2, left, width, maxHeight } : { bottom: vh - r.top + 2, left, width, maxHeight };
}

/** Ô chỉ hiện kết quả khi đã gõ (VD "+ Thêm…" người vào dự án): chưa gõ → không hiện gì; bỏ dòng giữ chỗ (value rỗng) */
export function searchFirstOptions(options: SelectOption[], q: string): SelectOption[] {
  if (!q.trim()) return [];
  return filterOptions(options, q).filter((o) => o.value !== '');
}

/** Đọc các <option> (kèm nhãn <optgroup>) của một ô select */
export function readOptions(select: HTMLSelectElement): SelectOption[] {
  return Array.from(select.options).map((o) => ({
    value: o.value, label: o.text, disabled: o.disabled,
    group: o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : null,
  }));
}
