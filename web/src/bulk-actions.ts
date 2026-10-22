/**
 * Thao tác hàng loạt được phép theo đúng ô quyền của từng thao tác:
 * giao việc → Giao việc, chuyển sprint → Sửa Backlog, đổi trạng thái → Chuyển trạng thái,
 * các trường khác (loại, ưu tiên, Dev, nhãn…) → Sửa issue, xóa → Xóa issue.
 */
export function bulkActions(perms: string[] | undefined, scrum = true) {
  const has = (p: string) => !!perms?.includes(p);
  return {
    assign: has('issue.assign'),
    sprint: scrum && has('sprint.manage'),
    status: has('issue.transition'),
    edit: has('issue.edit'),
    delete: has('issue.delete'),
  };
}

/** Có ít nhất một thao tác hàng loạt → mới cho chọn nhiều issue (ô tick, Ctrl + bấm) */
export const canBulk = (perms: string[] | undefined, scrum = true) => Object.values(bulkActions(perms, scrum)).some(Boolean);
