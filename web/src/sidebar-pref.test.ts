import test from 'node:test';
import assert from 'node:assert/strict';
import { clampWidth, COLLAPSE_BELOW, DEFAULT_WIDTH, MAX_WIDTH, MIN_WIDTH, readCollapsed, readWidth, saveCollapsed, saveWidth } from './sidebar-pref';

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

test('sidebar width is remembered and kept within bounds', () => {
  const s = memory();
  assert.equal(readWidth(s), DEFAULT_WIDTH);
  saveWidth(300, s);
  assert.equal(readWidth(s), 300);
  saveWidth(9999, s);
  assert.equal(readWidth(s), MAX_WIDTH);
  saveWidth(50, s);
  assert.equal(readWidth(s), MIN_WIDTH);
  assert.equal(clampWidth(255.6), 256);
  assert.ok(COLLAPSE_BELOW < MIN_WIDTH);
});
