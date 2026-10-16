const STANDARD = ['story', 'task', 'bug'];

/**
 * Kiểm tra đổi loại issue. Trả về thông báo lỗi, hoặc null nếu được phép.
 *  - Story/Task/Bug/Sub-task đổi qua lại cho nhau (Sub-task cần chọn issue cha, issue thành Sub-task không được đang có sub-task);
 *  - Story/Task/Bug ↔ Epic: issue thành Epic không được đang có sub-task; Epic đổi loại khi chưa có issue nào bên trong;
 *  - Sub-task ↔ Epic: không đổi trực tiếp.
 */
export function typeChangeError(from: string, to: string, childCount: number): string | null {
  if (from === to) return null;
  const known = [...STANDARD, 'subtask', 'epic'];
  if (!known.includes(from) || !known.includes(to)) return 'Loại issue không hợp lệ';
  if ((from === 'subtask' && to === 'epic') || (from === 'epic' && to === 'subtask')) {
    return 'Sub-task và Epic không đổi trực tiếp cho nhau, hãy đổi sang Story/Task/Bug trước';
  }
  if (from === 'epic' && childCount) return 'Epic đang có issue bên trong, hãy chuyển các issue đó ra trước khi đổi loại';
  if (to === 'epic' && childCount) return 'Issue đang có sub-task, không thể chuyển thành Epic';
  if (to === 'subtask' && childCount) return 'Issue đang có sub-task, không thể chuyển thành Sub-task';
  return null;
}
