import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAvatarFile } from './avatar-client';

test('accepts JPEG PNG and WebP up to 2 MB', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) assert.equal(validateAvatarFile({ type, size: 2 * 1024 * 1024 }), null);
});

test('rejects unsupported and oversized avatar files', () => {
  assert.match(validateAvatarFile({ type: 'image/svg+xml', size: 100 }) || '', /JPEG, PNG hoặc WebP/);
  assert.match(validateAvatarFile({ type: 'image/png', size: 2 * 1024 * 1024 + 1 }) || '', /2 MB/);
});
