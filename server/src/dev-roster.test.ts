import test from 'node:test';
import assert from 'node:assert/strict';
import { inStaffList } from './dev-roster';

test('matches an exact name in the project staff list', () => {
  assert.equal(inStaffList('Trần Văn A, Lê Thị B', 'Lê Thị B'), true);
  assert.equal(inStaffList('  Trần Văn A  ', 'Trần Văn A'), true);
});

test('rejects names not in the project staff list or empty lists', () => {
  assert.equal(inStaffList('Trần Văn A', 'Nguyễn Văn C'), false);
  assert.equal(inStaffList(null, 'Trần Văn A'), false);
  assert.equal(inStaffList('', 'Trần Văn A'), false);
});

test('never matches a substring of a longer name', () => {
  assert.equal(inStaffList('Nguyễn Văn An', 'Văn An'), false);
  assert.equal(inStaffList('Nguyễn An', 'Nguyễn'), false);
});
