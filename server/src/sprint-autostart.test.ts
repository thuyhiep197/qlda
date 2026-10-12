import test from 'node:test';
import assert from 'node:assert/strict';
import { autoStartDates } from './sprint-autostart';

test('keeps planned sprint dates', () => {
  assert.deepEqual(autoStartDates('2026-10-12', '2026-11-30', '2026-10-15'), { start: '2026-10-12', end: '2026-11-30' });
});

test('fills missing dates with today and a two-week sprint', () => {
  assert.deepEqual(autoStartDates(null, null, '2026-10-12'), { start: '2026-10-12', end: '2026-10-25' });
  assert.deepEqual(autoStartDates('2026-10-20', null, '2026-10-12'), { start: '2026-10-20', end: '2026-11-02' });
});

test('never starts after a planned end date that has passed', () => {
  assert.deepEqual(autoStartDates(null, '2026-10-01', '2026-10-12'), { start: '2026-10-01', end: '2026-10-01' });
  assert.deepEqual(autoStartDates(null, '2026-10-30', '2026-10-12'), { start: '2026-10-12', end: '2026-10-30' });
});
