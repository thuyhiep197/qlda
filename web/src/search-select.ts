import { fold } from './customer-filter';

export interface SelectOption { value: string; label: string; group: string | null; disabled: boolean }

/** Lọc các lựa chọn theo từ khóa (không dấu, không phân biệt hoa thường); bỏ trống → giữ tất cả */
export function filterOptions(options: SelectOption[], q: string): SelectOption[] {
  const k = fold(q.trim());
  if (!k) return options;
  return options.filter((o) => fold(`${o.label} ${o.group ?? ''}`).includes(k));
}

/** Đọc các <option> (kèm nhãn <optgroup>) của một ô select */
export function readOptions(select: HTMLSelectElement): SelectOption[] {
  return Array.from(select.options).map((o) => ({
    value: o.value, label: o.text, disabled: o.disabled,
    group: o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : null,
  }));
}
