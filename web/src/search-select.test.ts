import test from 'node:test';
import assert from 'node:assert/strict';
import { filterOptions, placePopover, searchFirstOptions } from './search-select';

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
  assert.deepEqual(placePopover({ top: 300, bottom: 332, left: 340, width: 170 }, 1280, 705), { top: 334, left: 340, width: 260, maxHeight: 360 });
  // Gần mép dưới (VD Dev thứ 4 trong khung Sửa dự án): mở lên trên, vẫn mở được
  assert.deepEqual(placePopover({ top: 480, bottom: 512, left: 340, width: 170 }, 1280, 705), { bottom: 227, left: 340, width: 260, maxHeight: 360 });
  // Sát mép phải: không tràn ra ngoài
  assert.equal(placePopover({ top: 100, bottom: 132, left: 1200, width: 80 }, 1280, 705)?.left, 1016);
  // Đã cuộn khuất: đóng
  assert.equal(placePopover({ top: -60, bottom: -28, left: 340, width: 170 }, 1280, 705), null);
  assert.equal(placePopover({ top: 720, bottom: 752, left: 340, width: 170 }, 1280, 705), null);
});

test('the picker never runs off a small screen: its height shrinks to the space left', () => {
  // Ô Dev trong khung Sửa dự án, máy màn hình nhỏ: dưới còn 300px → mở xuống, cao tối đa 290 (không tràn mép dưới)
  const p = placePopover({ top: 640, bottom: 676, left: 530, width: 250 }, 1366, 976)!;
  assert.equal(p.top, 678);
  assert.equal(p.maxHeight, 290);
  assert.ok(p.top! + p.maxHeight <= 976);
  // Dưới chỉ còn 150px nhưng trên rộng hơn → mở lên, cao vừa chỗ trống phía trên
  const up = placePopover({ top: 300, bottom: 332, left: 10, width: 200 }, 1280, 482)!;
  assert.equal(up.bottom, 184);
  assert.equal(up.maxHeight, 290);
});

test('"+ Thêm…" pickers show nobody until a name is typed, and never the placeholder row', () => {
  assert.deepEqual(searchFirstOptions(opts, ''), []);
  assert.deepEqual(searchFirstOptions(opts, '   '), []);
  assert.deepEqual(searchFirstOptions(opts, 'thêm'), []);
  assert.deepEqual(searchFirstOptions(opts, 'binh').map((o) => o.value), ['2']);
});
