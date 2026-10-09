/**
 * Nhân sự của dự án (projects.dev/tester/am/ba) lưu là danh sách họ tên phân cách bởi dấu phẩy.
 * Trả true khi `name` khớp đúng một mục trong danh sách — không khớp chuỗi con
 * ("An" ≠ "An Nguyễn"), bỏ khoảng trắng thừa quanh từng tên.
 */
export function inStaffList(csv: string | null | undefined, name: string): boolean {
  if (!csv) return false;
  return csv.split(',').map((s) => s.trim()).filter(Boolean).includes(name);
}
