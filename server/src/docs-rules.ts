/** Tài liệu nội bộ: định dạng được tải lên (Excel, PDF, Word, HTML, EXE) */
export const DOC_EXTENSIONS = ['xls', 'xlsx', 'pdf', 'doc', 'docx', 'html', 'htm', 'exe'] as const;

/** Phần mở rộng (chữ thường) của tên tệp, không có → '' */
export const extOf = (filename: string) => (/\.([a-z0-9]+)$/i.exec(filename.trim())?.[1] ?? '').toLowerCase();

export const isAllowedDoc = (filename: string) => (DOC_EXTENSIONS as readonly string[]).includes(extOf(filename));

/** Tên thư mục / tài liệu: bỏ khoảng trắng thừa, không chứa ký tự cấm trong tên tệp */
export function cleanDocName(v: unknown, label: string) {
  const name = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!name) throw new Error(`Tên ${label} không được để trống`);
  if (/[\\/:*?"<>|]/.test(name)) throw new Error(`Tên ${label} không được chứa các ký tự \\ / : * ? " < > |`);
  return name;
}
