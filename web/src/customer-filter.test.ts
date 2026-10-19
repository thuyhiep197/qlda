import test from 'node:test';
import assert from 'node:assert/strict';
import { customerKpis, customerTree, salesStatusClass, descriptionOf, filterCustomers, filterSteps, overdueDays, wardCodeOf } from './customer-filter';
import type { Customer } from './types';

const c = (o: Partial<Customer>): Customer => ({
  id: 1, code: null, name: '', province_code: null, ward_code: null, is_archived: 0,
  source: null, status: 'Mới', created_at: '', updated_at: '', ...o,
});
const list = [
  c({ id: 1, name: 'Sở Tài chính Đồng Nai', province_code: '75', province_name: 'Thành phố Đồng Nai', ward_name: 'Phường Trấn Biên', contact_name: 'Lê Văn B' }),
  c({ id: 2, name: 'Trường THPT Chu Văn An', status: 'Đang tư vấn', kd_names: 'Phạm Văn Phương', is_mine: 1, product_name: 'Phần mềm QL thiết bị' }),
  c({ id: 3, name: 'Công ty ABC', source: 'Đối tác giới thiệu', contact_email: 'kd@abc.vn' }),
];
const ids = (f: Partial<{ q: string; status: string; province: string; mine: boolean }>) =>
  filterCustomers(list, { q: '', status: '', province: '', ...f }).map((x) => x.id);

test('search ignores Vietnamese accents and matches ward, contact, staff, product, source', () => {
  assert.deepEqual(ids({ q: 'so tai chinh' }), [1]);
  assert.deepEqual(ids({ q: 'tran bien' }), [1]);
  assert.deepEqual(ids({ q: 'le van b' }), [1]);
  assert.deepEqual(ids({ q: 'pham van phuong' }), [2]);
  assert.deepEqual(ids({ q: 'thiet bi' }), [2]);
  assert.deepEqual(ids({ q: 'gioi thieu' }), [3]);
  assert.deepEqual(ids({ q: 'kd@abc' }), [3]);
});

test('filters by status and province, with "-" for not set', () => {
  assert.deepEqual(ids({ status: 'Đang tư vấn' }), [2]);
  assert.deepEqual(ids({ province: '75' }), [1]);
  assert.deepEqual(ids({ province: '-' }), [2, 3]);
  assert.deepEqual(ids({ mine: true }), [2]);
});

test('picking a product fills its catalog description, or leaves it blank', () => {
  assert.equal(descriptionOf({ description: 'Quản lý văn bản đi/đến' }), 'Quản lý văn bản đi/đến');
  assert.equal(descriptionOf({ description: null }), '');
  assert.equal(descriptionOf(undefined), '');
});

test('typed ward name resolves to its catalog code', () => {
  const wards = [{ code: '26041', name: 'Phường Trấn Biên' }, { code: '26068', name: 'Phường Biên Hòa' }];
  assert.equal(wardCodeOf(wards, '  phường trấn   biên '), '26041');
  assert.equal(wardCodeOf(wards, 'Trấn Biên'), undefined);
  assert.equal(wardCodeOf(wards, ''), undefined);
});

test('overview counts live projects, running ones, open and overdue work, last care date', () => {
  const p = (o: object) => ({ is_archived: 0, project_status: null, status_auto: 'Xây dựng', ...o }) as any;
  const k = customerKpis({
    projects: [p({}), p({ status_auto: 'Chưa bắt đầu' }), p({ is_archived: 1 }), p({ status_auto: 'Chưa bắt đầu', project_status: 'Lập HSYC' })],
    issues: [{ due_date: '2026-10-01' }, { due_date: '2026-10-16' }, { due_date: null }] as any,
    activities: [{ activity_date: '2026-09-01', kind: 'call' }, { activity_date: '2026-10-05', kind: 'meeting' }, { activity_date: '2026-10-10', kind: 'internal' }] as any,
    tasks: [{ status: 'todo', due_date: '2026-10-01' }, { status: 'doing', due_date: null }, { status: 'done', due_date: '2026-09-01' }] as any,
  }, '2026-10-16');
  assert.deepEqual(k, { projects: 3, running: 2, openTasks: 2, overdueTasks: 1, openIssues: 3, overdue: 1, lastCare: '2026-10-05' });
});

test('journey steps filter by status, unit (performing or supporting), mine and keyword; no filter keeps the tree', () => {
  const st = (id: number, o: object) => ({ id, depth: 2, status: 'todo', unit: null, support: null, assignee_id: null, title: '', ...o });
  const steps = [st(1, { depth: 0, title: 'GIẢI PHÁP' }), st(2, { unit: 'AM', support: 'BA+DEV', title: 'Giải pháp V.2' }),
    st(3, { unit: 'KD', support: 'BGĐ', status: 'done', assignee_id: 7, title: 'Tiếp nhận thông tin' })];
  const ids = (f: Partial<{ status: string; unit: string; mine: number | null; q: string }>) =>
    filterSteps(steps, { status: '', unit: '', mine: null, q: '', ...f })?.map((s) => s.id) ?? null;
  assert.equal(ids({}), null);
  assert.deepEqual(ids({ status: 'done' }), [3]);
  assert.deepEqual(ids({ unit: 'DEV' }), [2]);
  assert.deepEqual(ids({ unit: 'KD' }), [3]);
  assert.deepEqual(ids({ mine: 7 }), [3]);
  assert.deepEqual(ids({ q: 'giai phap' }), [2]);
});

test('overdue days count only unfinished work past its due date', () => {
  assert.equal(overdueDays('2026-10-14', 'doing', '2026-10-17'), 3);
  assert.equal(overdueDays('2026-10-17', 'todo', '2026-10-17'), 0);
  assert.equal(overdueDays('2026-10-01', 'done', '2026-10-17'), 0);
  assert.equal(overdueDays(null, 'todo', '2026-10-17'), 0);
});

test('customer tree keeps all projects of a matching customer, or only the matching projects', () => {
  const tree = [
    { name: 'Sở GD & ĐT HCM', sales_projects: [{ name: 'EduPay' }, { name: 'Quản lý thiết bị' }] },
    { name: 'Sở Tài chính Đồng Nai', sales_projects: [{ name: 'Thu phí VSMT' }] },
    { name: 'UBND Đà Nẵng' },
  ];
  const view = (q: string) => customerTree(tree, q).map((x) => [x.customer.name, x.projects.map((p) => p.name)]);
  assert.equal(view('').length, 3);
  assert.deepEqual(view('so gd'), [['Sở GD & ĐT HCM', ['EduPay', 'Quản lý thiết bị']]]);
  assert.deepEqual(view('thiet bi'), [['Sở GD & ĐT HCM', ['Quản lý thiết bị']]]);
  assert.deepEqual(view('da nang'), [['UBND Đà Nẵng', []]]);
  assert.deepEqual(view('khong co'), []);
});

test('customer search also finds a customer by the name of one of its projects', () => {
  const withProjects = [c({ id: 9, name: 'Sở GD', sales_projects: [{ code: 'SGD-01', name: 'EduPay', am_names: 'Trần Thị Kinh Doanh' } as never] })];
  assert.deepEqual(filterCustomers(withProjects, { q: 'edupay', status: '', province: '' }).map((x) => x.id), [9]);
  assert.deepEqual(filterCustomers(withProjects, { q: 'kinh doanh', status: '', province: '' }).map((x) => x.id), [9]);
});

test('customer project status colour follows the running part of the journey', () => {
  assert.equal(salesStatusClass(null), 'lozenge lozenge-default');
  assert.equal(salesStatusClass('Chưa bắt đầu'), 'lozenge lozenge-default');
  assert.equal(salesStatusClass('I. Giải pháp'), 'lozenge lozenge-blue');
  assert.equal(salesStatusClass('II. Hợp đồng'), 'lozenge lozenge-yellow');
  assert.equal(salesStatusClass('III. Triển khai'), 'lozenge lozenge-purple');
  assert.equal(salesStatusClass('IV. Nghiệm thu - Thanh toán'), 'lozenge lozenge-green');
  assert.equal(salesStatusClass('Hoàn thành'), 'lozenge lozenge-green');
});
