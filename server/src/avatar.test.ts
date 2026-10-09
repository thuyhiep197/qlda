import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarMime, avatarUrl, safeAvatarName } from './avatar';

test('detects supported avatar signatures', () => {
  assert.equal(avatarMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(avatarMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(avatarMime(Buffer.from('RIFF1234WEBP')), 'image/webp');
});

test('rejects unsupported content and unsafe stored names', () => {
  assert.equal(avatarMime(Buffer.from('<svg></svg>')), null);
  assert.equal(safeAvatarName('../avatar.png'), false);
  assert.equal(safeAvatarName('abc.png'), false);
  assert.equal(safeAvatarName('b7ba8f21-63c8-4a09-a20f-14594f209c8d.webp'), true);
});

test('builds public URL only for a safe stored name', () => {
  assert.equal(avatarUrl(null), null);
  assert.equal(avatarUrl('../x.png'), null);
  assert.equal(avatarUrl('b7ba8f21-63c8-4a09-a20f-14594f209c8d.webp'), '/api/auth/avatars/b7ba8f21-63c8-4a09-a20f-14594f209c8d.webp');
});
