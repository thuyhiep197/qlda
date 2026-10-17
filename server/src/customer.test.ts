import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanActivity, cleanContact, cleanContacts, cleanCustomer, cleanProduct, cleanTask, sameName } from './customer';

test('customer needs an organisation name and starts as a new customer', () => {
  assert.throws(() => cleanCustomer({ name: '   ' }), /Tên cơ quan\/đơn vị/);
  const c = cleanCustomer({ name: '  Sở Tài chính   Đồng Nai ', ward_code: '', product_id: '' });
  assert.equal(c.name, 'Sở Tài chính Đồng Nai');
  assert.equal(c.status, 'Mới');
  assert.equal(c.ward_code, null);
  assert.equal(c.product_id, null);
  assert.deepEqual(c.owner_ids, []);
  assert.deepEqual(cleanCustomer({ name: 'A', owner_ids: [3, '3', 5, 'x', -1] }).owner_ids, [3, 5]);
});

test('customer rejects unknown status and bad product ids', () => {
  assert.throws(() => cleanCustomer({ name: 'A', status: 'Tiềm năng' }), /Tình trạng/);
  assert.equal(cleanCustomer({ name: 'A', status: 'Đang làm sản phẩm' }).status, 'Đang làm sản phẩm');
  assert.throws(() => cleanCustomer({ name: 'A', product_id: 'abc' }), /Sản phẩm/);
  assert.throws(() => cleanCustomer({ name: 'A', product_type_id: -1 }), /Loại sản phẩm/);
  const c = cleanCustomer({ name: 'A', product_type_id: '2', product_id: 5, product_description: ' Phần mềm QL ' });
  assert.deepEqual([c.product_type_id, c.product_id, c.product_description], [2, 5, 'Phần mềm QL']);
});

test('contact needs a name and a valid email', () => {
  assert.throws(() => cleanContact({ full_name: '', phone: '09' }), /Tên đầu mối/);
  assert.throws(() => cleanContact({ full_name: 'Lê B', email: 'abc' }), /Email/);
  assert.deepEqual(cleanContact({ full_name: 'Lê B', phone: '0909' }), { full_name: 'Lê B', phone: '0909', email: null });
});

test('contact list skips blank rows and keeps ids of existing contacts', () => {
  const list = cleanContacts([{ id: 3, full_name: 'A' }, { full_name: ' ', phone: '', email: '' }, { full_name: 'B', email: 'b@x.vn' }]);
  assert.deepEqual(list.map((c) => [c.id, c.full_name]), [[3, 'A'], [null, 'B']]);
  assert.throws(() => cleanContacts([{ full_name: '', phone: '0909' }]), /Tên đầu mối/);
  assert.deepEqual(cleanContacts(undefined), []);
});

test('activity defaults to a note dated today and needs content', () => {
  assert.deepEqual(cleanActivity({ content: ' Gọi chốt lịch ' }, '2026-10-16'), { kind: 'note', content: 'Gọi chốt lịch', activity_date: '2026-10-16' });
  assert.throws(() => cleanActivity({ content: '' }, '2026-10-16'), /Nội dung/);
  assert.throws(() => cleanActivity({ content: 'x', kind: 'sms' }, '2026-10-16'), /Loại hoạt động/);
  assert.throws(() => cleanActivity({ content: 'x', activity_date: '16/10/2026' }, '2026-10-16'), /Ngày/);
});

test('product needs a name and a type', () => {
  assert.throws(() => cleanProduct({ name: '', type_id: 1 }), /Tên sản phẩm/);
  assert.throws(() => cleanProduct({ name: 'QLVB' }), /loại sản phẩm/);
  assert.deepEqual(cleanProduct({ name: 'QLVB', type_id: '2', description: '' }), { name: 'QLVB', type_id: 2, description: null });
});

test('names compare case-insensitively including Vietnamese letters', () => {
  assert.equal(sameName('Sở Tài chính Đồng Nai', 'sở tài chính đồng nai'), true);
  assert.equal(sameName('Sở Tài chính Đồng Nai', 'Sở Tài chính Đông Nai'), false);
});

test('sales task needs a title; status, due date and assignee are checked', () => {
  assert.throws(() => cleanTask({ title: ' ' }), /Tên công việc/);
  assert.deepEqual(cleanTask({ title: 'Gửi báo giá', assignee_id: '3', due_date: '2026-10-20' }),
    { title: 'Gửi báo giá', description: null, assignee_id: 3, due_date: '2026-10-20', status: 'todo' });
  assert.throws(() => cleanTask({ title: 'x', due_date: '20/10/2026' }), /Hạn hoàn thành/);
  assert.throws(() => cleanTask({ title: 'x', status: 'xong' }), /Trạng thái/);
  assert.throws(() => cleanTask({ title: 'x', assignee_id: 'abc' }), /Người thực hiện/);
});

test('internal discussion is an accepted conversation kind', () => {
  assert.equal(cleanActivity({ kind: 'internal', content: 'Nhờ @hiep xem lại báo giá' }, '2026-10-17').kind, 'internal');
});
