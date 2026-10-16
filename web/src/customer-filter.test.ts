import test from 'node:test';
import assert from 'node:assert/strict';
import { customerKpis, filterCustomers } from './customer-filter';
import type { Customer } from './types';

const c = (o: Partial<Customer>): Customer => ({
  id: 1, name: '', kind: null, status: 'Đang hợp tác', tax_code: null, province: null, address: null, phone: null, email: null,
  website: null, am: null, note: null, created_at: '', updated_at: '', ...o,
});
const list = [
  c({ id: 1, name: 'Sở Tài chính Đồng Nai', kind: 'Cơ quan nhà nước', province: 'Đồng Nai', contact_name: 'Lê Văn B' }),
  c({ id: 2, name: 'Trường THPT Chu Văn An', kind: 'Trường học', status: 'Tiềm năng', am: 'Phạm Văn Phương' }),
  c({ id: 3, name: 'Công ty ABC', tax_code: '0101234567' }),
];
const ids = (f: Partial<{ q: string; status: string; kind: string }>) => filterCustomers(list, { q: '', status: '', kind: '', ...f }).map((x) => x.id);

test('search ignores Vietnamese accents and matches contact, AM, tax code', () => {
  assert.deepEqual(ids({ q: 'so tai chinh' }), [1]);
  assert.deepEqual(ids({ q: 'le van b' }), [1]);
  assert.deepEqual(ids({ q: 'phuong' }), [2]);
  assert.deepEqual(ids({ q: '0101' }), [3]);
});

test('filters by status and by kind, with "-" for unclassified', () => {
  assert.deepEqual(ids({ status: 'Tiềm năng' }), [2]);
  assert.deepEqual(ids({ kind: 'Trường học' }), [2]);
  assert.deepEqual(ids({ kind: '-' }), [3]);
});

test('overview counts live projects, running ones, open and overdue work, last care date', () => {
  const p = (o: object) => ({ is_archived: 0, project_status: null, status_auto: 'Xây dựng', ...o }) as any;
  const k = customerKpis({
    projects: [p({}), p({ status_auto: 'Chưa bắt đầu' }), p({ is_archived: 1 }), p({ status_auto: 'Chưa bắt đầu', project_status: 'Lập HSYC' })],
    issues: [{ due_date: '2026-10-01' }, { due_date: '2026-10-16' }, { due_date: null }] as any,
    activities: [{ activity_date: '2026-09-01' }, { activity_date: '2026-10-05' }] as any,
  }, '2026-10-16');
  assert.deepEqual(k, { projects: 3, running: 2, openIssues: 3, overdue: 1, lastCare: '2026-10-05' });
});
