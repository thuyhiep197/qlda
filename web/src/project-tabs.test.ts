import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { firstTab } from './project-tabs';

const p = (permissions: string[], type: 'scrum' | 'kanban' = 'scrum') => ({ type, permissions });

test('opening a project lands on the Thông tin tab', () => {
  assert.equal(firstTab(p(['project.view', 'plan.view', 'sprint.view', 'search.view', 'backlog.view'])), 'info');
  assert.equal(firstTab(p(['project.view'], 'kanban')), 'info');
});

test('without permission for Thông tin, opens the first tab the user may see', () => {
  assert.equal(firstTab(p(['plan.view', 'search.view'])), 'plan');
  assert.equal(firstTab(p(['search.view', 'sprint.view'])), 'board');
  assert.equal(firstTab(p(['backlog.view'])), 'backlog');
  assert.equal(firstTab(p(['backlog.view'], 'kanban')), null);
  assert.equal(firstTab(p([])), null);
});

test('on phones the sidebar stays hidden until the menu button opens it', () => {
  const css = fs.readFileSync(path.join(import.meta.dirname, 'styles.css'), 'utf8');
  // Quy tắc ẩn phải đứng sau ".sidebar { display: flex }" (cùng độ ưu tiên, quy tắc sau thắng)
  const shown = css.lastIndexOf('.sidebar { display: flex; flex-direction: column; }');
  assert.ok(shown >= 0);
  const rest = css.slice(shown);
  assert.match(rest, /@media \(max-width: 800px\) \{\s*\.sidebar \{ display: none; \}/);
  assert.match(rest, /\.app\.nav-open \.sidebar \{ display: flex; \}/);
});
