import test from 'node:test';
import assert from 'node:assert/strict';
import { positionCodes, primaryCode } from './positions';

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
