import test from 'node:test';
import assert from 'node:assert/strict';
import { candidates, personLabel, projectDevOptions } from './people';

// Hai tài khoản cùng họ tên ở hai phòng — hiện kèm phòng ban để phân biệt
const users = [
  { id: 3, full_name: 'Nguyễn Hồng Nhung', positions: ['ba_pm', 'tester'], department_short: 'BA' },
  { id: 23, full_name: 'Nguyễn Hồng Nhung', positions: ['am'], department_short: 'AM' },
  { id: 9, full_name: 'Lưu Văn Đông', positions: ['dev'], department_short: 'Dev' },
  { id: 11, full_name: 'Chưa xếp phòng', positions: [], department_short: null },
];

test('a person shows as "Họ tên (Phòng ban)"', () => {
  assert.equal(personLabel(users[0]), 'Nguyễn Hồng Nhung (BA)');
  assert.equal(personLabel(users[3]), 'Chưa xếp phòng');
});

test('each role lists only accounts with the matching position, minus the chosen ones', () => {
  assert.deepEqual(candidates(users, 'am', []).map((u) => u.id), [23]);
  assert.deepEqual(candidates(users, 'ba', []).map((u) => u.id), [3]);
  assert.deepEqual(candidates(users, 'tester', [3]).map((u) => u.id), []);
  assert.deepEqual(candidates(users, 'kd', []).map((u) => u.id), []);
});

test('issue Dev options: the project Devs, or every Dev without a project', () => {
  assert.deepEqual(projectDevOptions(users, [9]).map((u) => u.id), [9]);
  assert.deepEqual(projectDevOptions(users, []).map((u) => u.id), []);
  assert.deepEqual(projectDevOptions(users, undefined).map((u) => u.id), [9]);
});
