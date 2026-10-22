import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedPositions, positionCodes, primaryCode } from './positions';

test('position codes follow the process template codes in a fixed order', () => {
  assert.deepEqual(positionCodes('tester,ba_pm'), ['BA', 'Tester']);
  assert.deepEqual(positionCodes('am, kd'), ['KD', 'AM']);
  assert.deepEqual(positionCodes('bgd'), ['BGĐ']);
  assert.deepEqual(positionCodes(''), []);
  assert.deepEqual(positionCodes(null), []);
});

test('primary code is the first position, or none', () => {
  assert.equal(primaryCode('dev,ba_pm'), 'BA');
  assert.equal(primaryCode('hc'), 'HC');
  assert.equal(primaryCode(undefined), null);
});

test('positions are limited by department, sub-teams use their department set and preset their own', () => {
  assert.deepEqual(allowedPositions(['P.KD']), { allowed: ['kd', 'am'], preset: null });
  assert.deepEqual(allowedPositions(['P.KD.SALE', 'P.KD', 'BGĐ']), { allowed: ['kd', 'am'], preset: 'kd' });
  assert.deepEqual(allowedPositions(['P.SP.TEST', 'P.SP', 'BGĐ']), { allowed: ['ba_pm', 'dev', 'tester'], preset: 'tester' });
  assert.deepEqual(allowedPositions(['P.HC.KT', 'P.HC', 'BGĐ']), { allowed: ['hc'], preset: 'hc' });
  assert.deepEqual(allowedPositions(['BGĐ']), { allowed: ['bgd', 'kd', 'am'], preset: 'bgd' }); // Ban Giám đốc chọn thêm được Sale, AM
  assert.equal(allowedPositions(['P.MOI', 'BGĐ']).allowed.length, 7, 'new department under the Board is not limited to BGĐ');
  assert.equal(allowedPositions(['KHAC']).allowed.length, 7);
});
