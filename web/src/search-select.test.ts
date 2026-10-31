import test from 'node:test';
import assert from 'node:assert/strict';
import { filterOptions, placePopover } from './search-select';

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

test('the picker follows its field while the page scrolls and only closes once the field leaves the screen', () => {
  // Ô "+ Thêm…" giữa màn hình: bảng mở ngay dưới, rộng tối thiểu 260
  assert.deepEqual(placePopover({ top: 300, bottom: 332, left: 340, width: 170 }, 1280, 705), { top: 334, left: 340, width: 260 });
  // Gần mép dưới (VD Dev thứ 4 trong khung Sửa dự án): mở lên trên, vẫn mở được
  assert.deepEqual(placePopover({ top: 480, bottom: 512, left: 340, width: 170 }, 1280, 705), { bottom: 227, left: 340, width: 260 });
  // Sát mép phải: không tràn ra ngoài
  assert.equal(placePopover({ top: 100, bottom: 132, left: 1200, width: 80 }, 1280, 705)?.left, 1016);
  // Đã cuộn khuất: đóng
  assert.equal(placePopover({ top: -60, bottom: -28, left: 340, width: 170 }, 1280, 705), null);
  assert.equal(placePopover({ top: 720, bottom: 752, left: 340, width: 170 }, 1280, 705), null);
});
