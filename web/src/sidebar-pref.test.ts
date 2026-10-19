import test from 'node:test';
import assert from 'node:assert/strict';
import { readCollapsed, saveCollapsed } from './sidebar-pref';

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

test('sidebar starts expanded and remembers the collapsed choice', () => {
  const s = memory();
  assert.equal(readCollapsed(s), false);
  saveCollapsed(true, s);
  assert.equal(readCollapsed(s), true);
  saveCollapsed(false, s);
  assert.equal(readCollapsed(s), false);
});

test('blocked storage falls back to expanded without throwing', () => {
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(readCollapsed(blocked), false);
  assert.doesNotThrow(() => saveCollapsed(true, blocked));
  assert.equal(readCollapsed(undefined), false);
});
