import { fold } from './customer-filter';

export interface SelectOption { value: string; label: string; group: string | null; disabled: boolean }

/** Lọc các lựa chọn theo từ khóa (không dấu, không phân biệt hoa thường); bỏ trống → giữ tất cả */
export function filterOptions(options: SelectOption[], q: string): SelectOption[] {
  const k = fold(q.trim());
  if (!k) return options;
  return options.filter((o) => fold(`${o.label} ${o.group ?? ''}`).includes(k));
}

export interface PopoverPlace { top?: number; bottom?: number; left: number; width: number }
/**
 * Vị trí bảng nổi cạnh ô chọn (theo khung nhìn): rộng tối thiểu 260, không tràn mép phải; gần mép dưới (dưới 220px) thì mở lên trên.
 * Ô chọn đã cuộn ra khỏi khung nhìn → null (đóng bảng). Gọi lại khi cuộn để bảng bám theo ô thay vì đóng.
 */
export function placePopover(r: { top: number; bottom: number; left: number; width: number }, vw: number, vh: number): PopoverPlace | null {
  if (r.bottom < 0 || r.top > vh) return null;
  const width = Math.max(r.width, 260);
  const left = Math.max(4, Math.min(r.left, vw - width - 4));
  return vh - r.bottom < 220 ? { bottom: vh - r.top + 2, left, width } : { top: r.bottom + 2, left, width };
}

/** Đọc các <option> (kèm nhãn <optgroup>) của một ô select */
export function readOptions(select: HTMLSelectElement): SelectOption[] {
  return Array.from(select.options).map((o) => ({
    value: o.value, label: o.text, disabled: o.disabled,
    group: o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : null,
  }));
}
