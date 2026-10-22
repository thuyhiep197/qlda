export interface AssigneeAccessInput {
  canAssign: boolean;
}

/** Đổi người thực hiện (giao, tự nhận, bỏ giao) chỉ với quyền Giao việc — không suy từ quyền sửa issue hay là thành viên */
export function assigneeAccess({ canAssign }: AssigneeAccessInput) {
  return { editable: canAssign, allowUnassign: canAssign };
}
