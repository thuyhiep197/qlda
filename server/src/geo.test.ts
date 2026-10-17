import test from 'node:test';
import assert from 'node:assert/strict';
import { loadUnits, shortName } from './geo';

test('bundled address catalog has 34 provinces and 3,321 wards with unique codes', () => {
  const { provinces } = loadUnits();
  assert.equal(provinces.length, 34);
  const wards = provinces.flatMap(([, , w]) => w);
  assert.equal(wards.length, 3321);
  assert.equal(new Set(wards.map(([c]) => c)).size, 3321);
  assert.equal(new Set(provinces.map(([c]) => c)).size, 34);
  assert.ok(provinces.some(([, n]) => n === 'Thành phố Hà Nội'));
  assert.ok(wards.every(([, n]) => /^(Phường|Xã|Đặc khu) /.test(n)));
});

test('short name drops the unit type for sorting and search', () => {
  assert.equal(shortName('Thành phố Hồ Chí Minh'), 'Hồ Chí Minh');
  assert.equal(shortName('Tỉnh Lào Cai'), 'Lào Cai');
  assert.equal(shortName('Phường Ba Đình'), 'Ba Đình');
  assert.equal(shortName('Đặc khu Phú Quốc'), 'Phú Quốc');
});
