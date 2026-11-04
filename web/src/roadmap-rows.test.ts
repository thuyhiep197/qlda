import test from 'node:test';
import assert from 'node:assert/strict';
import { allEpicsOpen, initialExpanded, roadmapRows, toggleEpic } from './roadmap-rows';

const epics = [
  { id: 1, children: [{ id: 11 }, { id: 12 }] },
  { id: 2, children: [{ id: 21 }] },
  { id: 3, children: [] as { id: number }[] },
];
const shape = (expanded: Set<number>) => roadmapRows<{ id: number }, (typeof epics)[number]>(epics, expanded).map((r) => (r.kind === 'epic' ? `e${r.e.id}` : `c${r.c.id}`));

test('the overview starts collapsed: only epics are shown', () => {
  assert.deepEqual(shape(initialExpanded()), ['e1', 'e2', 'e3']);
  assert.equal(allEpicsOpen(epics, initialExpanded()), false);
});

test('opening one epic shows only its issues, right under it; closing hides them again', () => {
  const opened = toggleEpic(initialExpanded(), 1);
  assert.deepEqual(shape(opened), ['e1', 'c11', 'c12', 'e2', 'e3']);
  assert.deepEqual(shape(toggleEpic(opened, 1)), ['e1', 'e2', 'e3']);
});

test('expand all shows every issue; an epic without issues does not block "all open"', () => {
  const all = new Set([1, 2]);
  assert.deepEqual(shape(all), ['e1', 'c11', 'c12', 'e2', 'c21', 'e3']);
  assert.equal(allEpicsOpen(epics, all), true);
  assert.equal(allEpicsOpen(epics, new Set([1])), false);
});
