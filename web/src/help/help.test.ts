import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  HELP_SECTIONS, articleForRoute, fold, latestNewsKey, mergeOverrides, parseArticle, permCodes, permOk, routeScore, searchArticles, splitBlocks, visibleArticles,
} from './help-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.join(HERE, 'content');
const IMG = path.join(HERE, '../../public/help/img');
const articles = fs.readdirSync(CONTENT).filter((f) => f.endsWith('.md'))
  .map((f) => parseArticle(f.replace(/\.md$/, ''), fs.readFileSync(path.join(CONTENT, f), 'utf8')));
const byId = new Map(articles.map((a) => [a.id, a]));

// ---------------------------------------------------------------------------
// Xử lý bài viết
// ---------------------------------------------------------------------------
test('parses the article header and body', () => {
  const a = parseArticle('da-plan', '---\ntitle: Kế hoạch chi tiết\nsection: project\nmodule: Kế hoạch\norder: 3\nroutes: /p/:key/plan, /issues\nneed: plan.view\n---\n\nNội dung');
  assert.deepEqual([a.title, a.section, a.module, a.order, a.routes, a.need, a.body], ['Kế hoạch chi tiết', 'project', 'Kế hoạch', 3, ['/p/:key/plan', '/issues'], 'plan.view', 'Nội dung']);
  assert.equal(parseArticle('x', '---\nsection: lạ\n---\nA').section, 'general');
});

test('permission conditions: comma = all, | = any, sub: = subsystem, admin = system admin only', () => {
  const v = { permissions: ['plan.view', 'issue.view'], subsystems: ['project'] };
  assert.equal(permOk(v, ''), true);
  assert.equal(permOk(v, 'plan.view'), true);
  assert.equal(permOk(v, 'plan.export'), false);
  assert.equal(permOk(v, 'plan.export | issue.view'), true);
  assert.equal(permOk(v, 'plan.view, issue.create'), false);
  assert.equal(permOk(v, 'sub:project'), true);
  assert.equal(permOk(v, 'sub:customer'), false);
  assert.equal(permOk(v, 'admin'), false);
  assert.equal(permOk({ is_admin: 1 }, 'admin, plan.export'), true);
  assert.equal(permOk(null, 'plan.view'), false);
});

test('splits permission blocks out of the body', () => {
  assert.deepEqual(splitBlocks('Mở đầu\n:::perm issue.create\n### Tạo issue\n1. Bấm\n:::\nKết'), [
    { need: null, text: 'Mở đầu' }, { need: 'issue.create', text: '### Tạo issue\n1. Bấm' }, { need: null, text: 'Kết' }]);
});

test('context help picks the most specific matching screen', () => {
  const list = [parseArticle('a', '---\nroutes: /p/:key/plan\n---\nx'), parseArticle('b', '---\nroutes: /p/:key/:tab\n---\nx'),
    parseArticle('c', '---\nroutes: ?issue\n---\nx')];
  assert.equal(articleForRoute(list, '/p/DEMO/plan')?.id, 'a');
  assert.equal(articleForRoute(list, '/p/DEMO/board')?.id, 'b');
  assert.equal(articleForRoute(list, '/p/DEMO/plan', '?issue=DEMO-1')?.id, 'c');
  assert.equal(articleForRoute(list, '/docs'), null);
  assert.equal(routeScore('/admin/users', '/admin/roles'), -1);
});

test('search ignores Vietnamese accents and ranks title matches first', () => {
  assert.equal(fold('Kế hoạch Đông'), 'ke hoach dong');
  const list = [parseArticle('a', '---\ntitle: Danh sách issue\n---\nXuất Excel kế hoạch'), parseArticle('b', '---\ntitle: Kế hoạch chi tiết\n---\nCây công việc')];
  assert.deepEqual(searchArticles(list, 'ke hoach').map((h) => h.article.id), ['b', 'a']);
  assert.deepEqual(searchArticles(list, 'xuat excel').map((h) => h.article.id), ['a']);
  assert.deepEqual(searchArticles(list, '  '), []);
});

test('articles are filtered by permission and ordered by section', () => {
  const list = [parseArticle('qt', '---\nsection: admin\nneed: user.view\n---\nx'), parseArticle('bd', '---\nsection: start\n---\nx'),
    parseArticle('kh', '---\nsection: customer\nneed: sub:customer\n---\nx')];
  assert.deepEqual(visibleArticles(list, { permissions: [], subsystems: ['customer'] }).map((a) => a.id), ['bd', 'kh']);
  assert.deepEqual(visibleArticles(list, { is_admin: 1 }).map((a) => a.id), ['bd', 'kh', 'qt']);
});

test('articles edited on the tool replace the built-in one; new ones are added', () => {
  const base = [parseArticle('a', '---\ntitle: A\nsection: project\nroutes: /projects\n---\ncũ')];
  const m = mergeOverrides(base, [
    { id: 'a', title: 'A mới', section: 'project', module: null, body: 'mới', is_custom: 0, updated_by_name: 'QT', updated_at: '2026-10-31' },
    { id: 'b', title: 'B', section: 'customer', module: 'Quy trình', body: 'thêm', is_custom: 1, updated_at: '2026-10-31' }]);
  assert.deepEqual(m.map((a) => [a.id, a.title, a.body, a.section, !!a.custom]), [['a', 'A mới', 'mới', 'project', false], ['b', 'B', 'thêm', 'customer', true]]);
  assert.deepEqual(m[0].routes, ['/projects']);
  assert.equal(latestNewsKey('Mở đầu\n## 31/10/2026 — Hướng dẫn\n- a\n## 30/10/2026\n'), '31/10/2026 — Hướng dẫn');
});

// ---------------------------------------------------------------------------
// Nội dung: mọi bài hợp lệ, mọi màn hình có bài hướng dẫn
// ---------------------------------------------------------------------------
test('every article has a title, a valid section and well-formed permission blocks', () => {
  assert.ok(articles.length > 0, 'chưa có bài nào');
  for (const a of articles) {
    assert.match(a.id, /^[a-z0-9][a-z0-9-]+$/, a.id);
    assert.ok(a.title && a.title !== a.id, `${a.id}: thiếu title`);
    assert.ok(HELP_SECTIONS.some((s) => s.key === a.section), `${a.id}: section`);
    const opens = (a.body.match(/^:::perm\s+\S/gm) ?? []).length;
    const closes = (a.body.match(/^:::\s*$/gm) ?? []).length;
    assert.equal(opens, closes, `${a.id}: khối :::perm chưa đóng`);
    assert.ok(!splitBlocks(a.body).some((b) => /^:::/m.test(b.text)), `${a.id}: khối :::perm lồng nhau`);
  }
});

test('permission codes in articles exist in the permission catalog', async () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-help-web-'));
  const catalog = await import(pathToFileURL(path.join(HERE, '../../../server/src/permissions.ts')).href);
  const valid = new Set<string>([...catalog.ALL_PERMISSIONS, ...catalog.SUBSYSTEMS.map((s: { key: string }) => `sub:${s.key}`), 'admin']);
  for (const a of articles) {
    const needs = [a.need, ...splitBlocks(a.body).map((b) => b.need ?? '')];
    for (const code of needs.flatMap(permCodes)) assert.ok(valid.has(code), `${a.id}: mã quyền không có "${code}"`);
  }
});

test('images and links to other articles exist', () => {
  for (const a of articles) {
    for (const [, src] of a.body.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
      assert.ok(src.startsWith('/help/img/'), `${a.id}: ảnh phải nằm trong /help/img/: ${src}`);
      assert.ok(fs.existsSync(path.join(IMG, src.slice('/help/img/'.length))), `${a.id}: thiếu ảnh ${src}`);
    }
    for (const [, id] of a.body.matchAll(/\]\(\/help\/([a-z0-9-]+)\)/g)) assert.ok(byId.has(id), `${a.id}: liên kết tới bài không có "${id}"`);
  }
});

test('every screen of the tool has a help article', () => {
  const screens = ['/home', '/customers', '/customers/1', '/customers/1/p/2', '/projects', '/issues', '/p/DEMO/info', '/p/DEMO/roadmap', '/p/DEMO/plan',
    '/p/DEMO/board', '/p/DEMO/issues', '/p/DEMO/backlog', '/browse/DEMO-1', '/docs', '/profile', '/admin/users', '/admin/roles', '/admin/org',
    '/admin/geo', '/admin/products', '/admin/customer-statuses', '/admin/audit'];
  for (const s of screens) assert.ok(articleForRoute(articles, s), `màn hình ${s} chưa có bài hướng dẫn`);
  assert.equal(articleForRoute(articles, '/p/DEMO/plan', '?issue=DEMO-1')?.id, 'da-issue');
  for (const id of ['bat-dau', 'co-gi-moi', 'quyen-cua-toi', 'cau-hoi-thuong-gap']) assert.ok(byId.has(id), `thiếu bài ${id}`);
  assert.ok(latestNewsKey(byId.get('co-gi-moi')!.body), 'co-gi-moi cần ít nhất một mục "## …"');
});
