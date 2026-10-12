export type StatusCategory = 'todo' | 'inprogress' | 'done';

/**
 * Trạng thái Epic suy ra từ các issue bên trong. Mọi issue đã hoàn thành nhưng Epic còn trong thời gian thực hiện
 * (chưa qua hết ngày kết thúc) thì Epic vẫn Đang thực hiện; Epic không có ngày kết thúc thì hoàn thành ngay.
 */
export function epicTargetCategory(kids: string[], dueDate: string | null, today: string): StatusCategory {
  if (kids.every((k) => k === 'done')) return dueDate && today <= dueDate ? 'inprogress' : 'done';
  return kids.every((k) => k === 'todo') ? 'todo' : 'inprogress';
}
