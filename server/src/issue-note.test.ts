import test from 'node:test';
import assert from 'node:assert/strict';
import { checkIssueNote } from './issue-note';

test('normalizes an empty or whitespace-only issue note to null', () => {
  assert.equal(checkIssueNote(undefined), null);
  assert.equal(checkIssueNote('   '), null);
});

test('trims and accepts an issue note up to 100 characters', () => {
  assert.equal(checkIssueNote('  Gọi khách hàng  '), 'Gọi khách hàng');
  assert.equal(checkIssueNote('a'.repeat(100)), 'a'.repeat(100));
});

test('rejects an issue note longer than 100 characters', () => {
  assert.throws(() => checkIssueNote('a'.repeat(101)), /100 ký tự/);
});
