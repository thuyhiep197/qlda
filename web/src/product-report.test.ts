import test from 'node:test';
import assert from 'node:assert/strict';
import { daysSince, filterReport, statusColumns, summarize } from './product-report';
import type { ProductReportCustomer, ProductReportGroup } from './types';

const c = (o: Partial<ProductReportCustomer>): ProductReportCustomer => ({ id: 1, name: 'KH', code: null, province_name: null, status: 'Mới', kd_names: null, am_names: null, projects: [], ...o });
const talk = (date: string) => ({ date, content: 'x', user_name: null });

test('days since the last conversation', () => {
  assert.equal(daysSince('2026-10-11', '2026-11-10'), 30);
  assert.equal(daysSince('2026-11-10', '2026-11-10'), 0);
});

test('summary counts status, conversation recency, journey, calls and open tasks', () => {
  const s = summarize([
    c({ status: 'Mới', last_activity: talk('2026-10-11'), projects: [{ id: 1, code: 'A-01', name: 'a', status: 'I. Giải pháp' }], open_tasks: 2, calls_due: 1 }),
    c({ status: 'Mới', last_activity: talk('2026-10-10'), projects: [{ id: 2, code: 'A-02', name: 'b', status: null }], open_tasks: 1 }),
    c({ status: 'Đang tư vấn', last_activity: null }),
    c({ status: null }),
  ], '2026-11-10', 30);
  assert.deepEqual(s, { customers: 4, byStatus: { 'Mới': 2, 'Đang tư vấn': 1 }, recent: 1, stale: 1, silent: 2, journey: 1, callsDue: 1, openTasks: 3 });
});

const groups: ProductReportGroup[] = [
  { key: 'p1', product_id: 1, name: 'Trợ lý công chức AI', type_name: 'Sản phẩm có sẵn', customers: [c({ id: 1, name: 'Xã Lâm Thao', status: 'Mới' }), c({ id: 2, name: 'Sở B', status: 'Khác' })] },
  { key: 'p2', product_id: 2, name: 'EduPay', type_name: 'Dự án', customers: [c({ id: 3, name: 'Sở Giáo dục', status: 'Đang tư vấn', projects: [{ id: 9, code: 'SGD-01', name: 'Học phí', status: null }] })] },
];

test('search keeps a whole product on a product match, otherwise the matching customers', () => {
  assert.deepEqual(filterReport(groups, 'cong chuc').map((g) => g.customers.length), [2]);
  assert.deepEqual(filterReport(groups, 'lam thao').map((g) => [g.key, g.customers.map((x) => x.id)]), [['p1', [1]]]);
  assert.deepEqual(filterReport(groups, 'sgd-01').map((g) => g.key), ['p2']);
  assert.equal(filterReport(groups, '  ').length, 2);
  assert.deepEqual(filterReport(groups, 'không có'), []);
});

test('status columns follow the catalogue order, unknown statuses last', () => {
  assert.deepEqual(statusColumns({ statuses: ['Mới', 'Đang tư vấn', 'Đã thanh toán'], groups }), ['Mới', 'Đang tư vấn', 'Khác']);
});
