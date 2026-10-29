import test from 'node:test';
import assert from 'node:assert/strict';
import { filterOptions } from './search-select';

const opts = [
  { value: '', label: '+ Thêm…', group: null, disabled: false },
  { value: '1', label: 'Đỗ Ngọc Khánh (Dev)', group: null, disabled: false },
  { value: '2', label: 'Nguyễn Hải Bình (Dev)', group: null, disabled: false },
  { value: '3', label: 'Lê Thị Vân Anh', group: 'AM', disabled: false },
];

test('people search ignores Vietnamese accents and case', () => {
  assert.deepEqual(filterOptions(opts, 'do ngoc').map((o) => o.value), ['1']);
  assert.deepEqual(filterOptions(opts, 'BÌNH').map((o) => o.value), ['2']);
});

test('people search also matches the option group (department)', () => {
  assert.deepEqual(filterOptions(opts, 'am').map((o) => o.value), ['3']);
});

test('an empty search keeps every option', () => {
  assert.equal(filterOptions(opts, '  ').length, 4);
});
