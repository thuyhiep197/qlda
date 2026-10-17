/**
 * Nhận biết nhóm quyền còn lưu kiểu cũ (danh sách quyền phẳng trước khi có ma trận chức năng × hành động).
 * Kiểu cũ: chưa có 'issue.view', chỉ gồm mã quyền cũ và không có mã quyền nào chỉ có ở kiểu mới.
 * (Trước đây chỉ xét 'issue.view' nên nhóm mới không xem issue — VD nhóm Kinh doanh chỉ có quyền Khách hàng — bị đặt lại mỗi lần khởi động.)
 */
export function isLegacyPermissionList(p: string[], oldKeys: readonly string[], allPermissions: readonly string[]) {
  if (p.includes('issue.view')) return false;
  const old = new Set(oldKeys);
  const newOnly = allPermissions.filter((k) => !old.has(k));
  return p.every((k) => old.has(k)) && !p.some((k) => newOnly.includes(k));
}
