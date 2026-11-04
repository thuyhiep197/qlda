import test from 'node:test';
import assert from 'node:assert/strict';
import { httpErrorMessage, meOrNull, SERVER_UNAVAILABLE } from './session';

const failWith = (status?: number) => async () => { throw Object.assign(new Error('x'), { status }); };

test('a logged-in account is returned as is', async () => {
  assert.deepEqual(await meOrNull(async () => ({ id: 2 })), { id: 2 });
});

test('only a refusal from the server (4xx) means not logged in', async () => {
  assert.equal(await meOrNull(failWith(401)), null);
  assert.equal(await meOrNull(failWith(403)), null);
});

test('server restarting (502/503/504/500) or no network keeps the session: the error is thrown so it can be retried', async () => {
  for (const status of [500, 502, 503, 504]) await assert.rejects(meOrNull(failWith(status)));
  await assert.rejects(meOrNull(failWith(undefined)));
  await assert.rejects(meOrNull(async () => { throw new TypeError('Failed to fetch'); }));
});

test('gateway errors get a readable message; messages from the server are kept', () => {
  for (const status of [502, 503, 504]) assert.equal(httpErrorMessage(status), SERVER_UNAVAILABLE);
  assert.equal(httpErrorMessage(500), 'Lỗi 500');
  assert.equal(httpErrorMessage(400, 'Sai mật khẩu'), 'Sai mật khẩu');
  assert.equal(httpErrorMessage(502, 'Chi tiết'), 'Chi tiết');
});
