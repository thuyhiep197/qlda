import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanActivity, cleanContact, cleanCustomer, sameName } from './customer';

test('customer needs a name and defaults to an active relationship', () => {
  assert.throws(() => cleanCustomer({ name: '   ' }), /Tên khách hàng/);
  const c = cleanCustomer({ name: '  Sở Tài chính   Đồng Nai ', phone: '', note: '' });
  assert.equal(c.name, 'Sở Tài chính Đồng Nai');
  assert.equal(c.status, 'Đang hợp tác');
  assert.equal(c.phone, null);
  assert.equal(c.note, null);
});

test('customer rejects unknown kind, status and bad email', () => {
  assert.throws(() => cleanCustomer({ name: 'A', kind: 'Ngân hàng' }), /Loại khách hàng/);
  assert.throws(() => cleanCustomer({ name: 'A', status: 'Hết' }), /Trạng thái/);
  assert.throws(() => cleanCustomer({ name: 'A', email: 'abc' }), /Email/);
  assert.equal(cleanCustomer({ name: 'A', kind: 'Trường học', email: 'a@b.vn' }).kind, 'Trường học');
});

test('contact needs a name and stores primary as 0/1', () => {
  assert.throws(() => cleanContact({ full_name: '' }), /Họ tên/);
  assert.equal(cleanContact({ full_name: 'Lê B', is_primary: true }).is_primary, 1);
  assert.equal(cleanContact({ full_name: 'Lê B' }).is_primary, 0);
});

test('activity defaults to a note dated today and needs content', () => {
  assert.deepEqual(cleanActivity({ content: ' Gọi chốt lịch ' }, '2026-10-16'), { kind: 'note', content: 'Gọi chốt lịch', activity_date: '2026-10-16' });
  assert.throws(() => cleanActivity({ content: '' }, '2026-10-16'), /Nội dung/);
  assert.throws(() => cleanActivity({ content: 'x', kind: 'sms' }, '2026-10-16'), /Loại hoạt động/);
  assert.throws(() => cleanActivity({ content: 'x', activity_date: '16/10/2026' }, '2026-10-16'), /Ngày/);
  assert.equal(cleanActivity({ content: 'x', kind: 'meeting', activity_date: '2026-10-01' }, '2026-10-16').activity_date, '2026-10-01');
});

test('customer names compare case-insensitively including Vietnamese letters', () => {
  assert.equal(sameName('Sở Tài chính Đồng Nai', 'sở tài chính đồng nai'), true);
  assert.equal(sameName('Sở Tài chính Đồng Nai', 'Sở Tài chính Đông Nai'), false);
});
