import test from 'node:test';
import assert from 'node:assert/strict';
import { canDo } from './manage';

test('viewing everything does not grant editing customers one does not manage', () => {
  assert.equal(canDo(true, 'customer.view', false), true);
  assert.equal(canDo(true, 'cfile.export', false), true);
  assert.equal(canDo(true, 'customer.edit', false), false);
  assert.equal(canDo(true, 'sales_project.delete', false), false);
  assert.equal(canDo(true, 'journey.edit', true), true);
  assert.equal(canDo(false, 'journey.edit', true), false);
});
