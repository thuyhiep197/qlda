import { all, get, run } from './db.ts';

/**
 * Danh mục sản phẩm loại "Dự án" chính là các dự án của phân hệ Dự án: mỗi dự án có một sản phẩm (products.project_id),
 * tên / mô tả luôn đồng bộ với dự án. Loại sản phẩm "Dự án" nhận biết qua product_types.is_project (đổi tên loại vẫn đúng).
 */
export const projectTypeId = () => get<{ id: number }>('SELECT id FROM product_types WHERE is_project = 1 ORDER BY id LIMIT 1')?.id ?? null;

/** Tên sản phẩm cho dự án: tên dự án; trùng tên với sản phẩm khác cùng loại thì thêm mã dự án */
function productName(typeId: number, project: { id: number; key: string; name: string }) {
  const taken = all<{ name: string; project_id: number | null }>('SELECT name, project_id FROM products WHERE type_id = ?', typeId)
    .some((p) => p.project_id !== project.id && p.name.toLowerCase() === project.name.toLowerCase());
  return taken ? `${project.name} (${project.key})` : project.name;
}

/** Tạo / cập nhật sản phẩm của một dự án theo tên, mô tả hiện tại của dự án */
export function syncProjectProduct(projectId: number) {
  const typeId = projectTypeId();
  const p = get<{ id: number; key: string; name: string; description: string | null }>('SELECT id, key, name, description FROM projects WHERE id = ?', projectId);
  if (!typeId || !p) return;
  const name = productName(typeId, p);
  const existing = get<{ id: number }>('SELECT id FROM products WHERE project_id = ?', p.id);
  if (existing) run('UPDATE products SET name = ?, description = ?, type_id = ? WHERE id = ?', name, p.description, typeId, existing.id);
  else run('INSERT INTO products(type_id, name, description, project_id) VALUES (?,?,?,?)', typeId, name, p.description, p.id);
}

/** Đưa mọi dự án chưa có vào danh mục (chạy khi khởi động — dự án tạo trước khi có danh mục) */
export function syncAllProjectProducts() {
  for (const p of all<{ id: number }>('SELECT id FROM projects WHERE id NOT IN (SELECT project_id FROM products WHERE project_id IS NOT NULL)')) {
    syncProjectProduct(p.id);
  }
}
