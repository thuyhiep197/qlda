import test from 'node:test';
import assert from 'node:assert/strict';
import { hasAccent } from './password';

test('passwords with Vietnamese accents (typed with the Vietnamese keyboard on) are caught', () => {
  assert.equal(hasAccent('Matkhau2026â'), true);
  assert.equal(hasAccent('Đăngnhập123'), true);
  assert.equal(hasAccent('Matkhau2026aa'), false);
  assert.equal(hasAccent('qlda@868686 !#$%^&*()_+-=[]{};:,.<>/?~`|'), false);
});
