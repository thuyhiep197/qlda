import test from 'node:test';
import assert from 'node:assert/strict';
import { callAlert, callPingDue, cleanActivity, cleanCall, cleanCallConfirm, cleanContact, cleanContacts, cleanCustomer, cleanProduct, cleanSalesProject, cleanTask, customerCode, fold, salesProjectCode, sameName } from './customer';

test('customer needs an organisation name; status is checked against the status catalog', () => {
  assert.throws(() => cleanCustomer({ name: '   ' }), /Tên cơ quan\/đơn vị/);
  const c = cleanCustomer({ name: '  Sở Tài chính   Đồng Nai ', ward_code: '', product_id: '' });
  assert.equal(c.name, 'Sở Tài chính Đồng Nai');
  assert.equal(c.status, null); // trống → tình trạng đầu tiên đang dùng (route)
  assert.equal(c.ward_code, null);
  assert.equal(c.product_id, null);
  assert.deepEqual(c.kd_ids, []);
  assert.deepEqual(c.am_ids, []);
  assert.deepEqual(cleanCustomer({ name: 'A', kd_ids: [3, '3', 5, 'x', -1] }).kd_ids, [3, 5]);
});

test('customer rejects bad product ids', () => {
  assert.equal(cleanCustomer({ name: 'A', status: ' Đang làm sản phẩm ' }).status, 'Đang làm sản phẩm');
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

test('fold strips Vietnamese accents for search', () => {
  assert.equal(fold('Sở Tài chính Đồng Nai'), 'so tai chinh dong nai');
});

test('a customer project needs a name and keeps product, people (account ids) and note', () => {
  assert.throws(() => cleanSalesProject({ name: ' ' }), /Tên dự án/);
  assert.throws(() => cleanSalesProject({ name: 'A', product_id: 'x' }), /Sản phẩm/);
  const people = cleanSalesProject({ name: 'A', dev_ids: [12, '12', 'x'], tester_ids: [] });
  assert.deepEqual(people.dev_ids, [12]);
  assert.deepEqual(people.tester_ids, []);
  assert.deepEqual(people.ba_ids, []);
  const p = cleanSalesProject({ name: '  Phần mềm  QL chợ ', product_type_id: '2', product_id: 5, kd_ids: [3, '3', 4, 0], am_ids: [7], ba_ids: [9, 10], note: ' ghi chú ' });
  assert.equal(p.name, 'Phần mềm QL chợ');
  assert.equal(p.product_type_id, 2);
  assert.equal(p.product_id, 5);
  assert.deepEqual(p.kd_ids, [3, 4]);
  assert.deepEqual(p.am_ids, [7]);
  assert.deepEqual(p.ba_ids, [9, 10]);
  assert.equal(p.note, 'ghi chú');
});

test('customer code comes from the initials of the name, numbered when taken', () => {
  assert.equal(customerCode('Sở Giáo dục và Đào tạo', []), 'SGDVDT');
  assert.equal(customerCode('Sở GD & ĐT HCM', []), 'SGDH');
  assert.equal(customerCode('Sở GD & ĐT HCM', ['SGDH', 'sgdh2']), 'SGDH3');
  assert.equal(customerCode('& !', []), 'KH');
});

test('customer project code is the customer code plus the next two-digit number', () => {
  assert.equal(salesProjectCode('SGDH', []), 'SGDH-01');
  assert.equal(salesProjectCode('SGDH', ['SGDH-01', 'SGDH-03', 'BTC-07']), 'SGDH-04');
});

test('call schedule needs a valid date; confirming needs called / not reached', () => {
  assert.throws(() => cleanCall({}), /Chọn ngày gọi/);
  assert.throws(() => cleanCall({ call_date: '2026-13-40' }), /Ngày gọi/);
  assert.deepEqual(cleanCall({ call_date: '2026-10-21', assignee_id: '', note: ' hỏi lịch demo ' }), { call_date: '2026-10-21', assignee_id: null, note: 'hỏi lịch demo' });
  assert.throws(() => cleanCallConfirm({}), /Đã gọi hoặc Chưa gọi được/);
  assert.throws(() => cleanCallConfirm({ status: 'planned' }), /Kết quả/);
  const v = cleanCallConfirm({ status: 'failed', result: 'Không nghe máy', next: { call_date: '2026-10-23' } });
  assert.equal(v.status, 'failed');
  assert.equal(v.next?.call_date, '2026-10-23');
  assert.equal(cleanCallConfirm({ status: 'done' }).next, null);
});

test('call alert starts on the call date and counts days late', () => {
  assert.equal(callAlert([], '2026-10-21'), null);
  assert.equal(callAlert(['2026-10-22'], '2026-10-21'), null);
  assert.deepEqual(callAlert(['2026-10-21'], '2026-10-21'), { date: '2026-10-21', late: 0, count: 1 });
  assert.deepEqual(callAlert(['2026-10-25', '2026-10-18', '2026-10-20'], '2026-10-21'), { date: '2026-10-18', late: 3, count: 2 });
});

test('call reminder rings the caller once a day from the call date until confirmed', () => {
  const k = { status: 'planned', call_date: '2026-10-21', assignee_id: 5, pinged_on: null };
  assert.equal(callPingDue(k, '2026-10-20'), false);
  assert.equal(callPingDue(k, '2026-10-21'), true);
  assert.equal(callPingDue({ ...k, pinged_on: '2026-10-21' }, '2026-10-21'), false);
  assert.equal(callPingDue({ ...k, pinged_on: '2026-10-21' }, '2026-10-22'), true);
  assert.equal(callPingDue({ ...k, status: 'done' }, '2026-10-22'), false);
  assert.equal(callPingDue({ ...k, assignee_id: null }, '2026-10-22'), false);
});
