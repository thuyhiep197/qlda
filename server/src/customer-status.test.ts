import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-cstatus-'));
const { migrate, run, all } = await import('./db.ts');
const { checkCustomerStatus } = await import('./routes/customer-statuses.ts');
migrate();

test('status catalog starts with the 6 statuses in order', () => {
  assert.deepEqual(all<{ name: string }>('SELECT name FROM customer_statuses ORDER BY position').map((s) => s.name),
    ['Mới', 'Đang tư vấn', 'Chờ phản hồi', 'Đang làm sản phẩm', 'Đã ký hợp đồng', 'Đã thanh toán']);
});

test('customers take an active status from the catalog; a stopped one is kept only when unchanged', () => {
  assert.equal(checkCustomerStatus(null), 'Mới');
  assert.equal(checkCustomerStatus('Đang tư vấn'), 'Đang tư vấn');
  assert.throws(() => checkCustomerStatus('Tiềm năng'), /không có trong danh mục/);
  run("UPDATE customer_statuses SET is_active = 0 WHERE name = 'Chờ phản hồi'");
  assert.throws(() => checkCustomerStatus('Chờ phản hồi', 'Mới'), /ngừng sử dụng/);
  assert.equal(checkCustomerStatus('Chờ phản hồi', 'Chờ phản hồi'), 'Chờ phản hồi');
  // Tình trạng đầu tiên ngừng → mặc định là tình trạng đang dùng kế tiếp
  run("UPDATE customer_statuses SET is_active = 0 WHERE name = 'Mới'");
  assert.equal(checkCustomerStatus(null), 'Đang tư vấn');
});
