/**
 * Chụp ảnh minh họa cho Hướng dẫn sử dụng từ một bản chạy thử có dữ liệu mẫu (KHÔNG dùng dữ liệu thật).
 * Mỗi ảnh khai báo trong web/src/help/shots/*.json: đường dẫn, tài khoản chụp (as), phần tử chờ, thao tác bấm trước khi chụp, vùng đánh số.
 * Ảnh lưu vào web/public/help/img/<file>.webp.
 *
 * Chạy: node web/scripts/help-shots.mjs --base http://localhost:3099 --accounts "admin=<mật khẩu>;dev.minh=<mật khẩu>" [--only a.webp,b.webp] [--port 9333]
 *   Tài khoản đầu tiên trong --accounts là tài khoản chụp mặc định.
 * Cần Chrome hoặc Edge trên máy (chạy ẩn qua giao thức DevTools).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://localhost:3099');
const ONLY = arg('only', '');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(HERE, '../src/help/shots');
const SHOTS = fs.readdirSync(SHOT_DIR).filter((f) => f.endsWith('.json')).flatMap((f) => JSON.parse(fs.readFileSync(path.join(SHOT_DIR, f), 'utf8')));
const ACCOUNTS = arg('accounts', '').split(';').filter(Boolean).map((x) => x.split('='));
if (!ACCOUNTS.length) throw new Error('Thiếu --accounts "tên=mật khẩu;…"');
const OUT = path.join(HERE, '../public/help/img');
fs.mkdirSync(OUT, { recursive: true });

const BROWSERS = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const exe = BROWSERS.find((b) => fs.existsSync(b));
if (!exe) throw new Error('Không tìm thấy Chrome / Edge');

// Đăng nhập từng tài khoản lấy cookie phiên
const cookies = new Map();
for (const [username, password] of ACCOUNTS) {
  const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  if (!login.ok) throw new Error(`Đăng nhập ${username} lỗi ${login.status}`);
  cookies.set(username, login.headers.get('set-cookie').split(';')[0].split('='));
}

const port = Number(arg('port', 9333));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-shots-'));
const browser = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars',
  '--force-device-scale-factor=1', '--lang=vi-VN', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* chưa sẵn sàng */ }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
const waitFor = async (sel, ms = 15000) => {
  for (let t = 0; t < ms; t += 150) { if (await evaluate(`!!document.querySelector(${JSON.stringify(sel)})`)) return; await sleep(150); }
  throw new Error(`Không thấy phần tử ${sel}`);
};

await cdp('Page.enable');
await cdp('Network.enable');
// Luôn chụp giao diện sáng (tài khoản chụp nên để giao diện "Theo hệ thống" và đã xem tour)
await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });

// Đánh số vùng: viền + nhãn số tròn ở góc trên trái của phần tử
const MARK = `(marks) => { document.querySelectorAll('.shot-mark').forEach((x) => x.remove());
  for (const m of marks) { const el = document.querySelector(m.sel); if (!el) { console.warn('mark?', m.sel); continue; }
    const r = el.getBoundingClientRect(); const box = document.createElement('div'); box.className = 'shot-mark';
    Object.assign(box.style, { position: 'fixed', left: (r.left - 3) + 'px', top: (r.top - 3) + 'px', width: (r.width + 6) + 'px', height: (r.height + 6) + 'px',
      border: '2px solid #e5484d', borderRadius: '6px', zIndex: 99999, pointerEvents: 'none' });
    const n = document.createElement('div'); n.textContent = m.n; n.className = 'shot-mark';
    Object.assign(n.style, { position: 'fixed', left: Math.max(2, r.left - 12) + 'px', top: Math.max(2, r.top - 12) + 'px', width: '24px', height: '24px',
      borderRadius: '50%', background: '#e5484d', color: '#fff', font: '700 13px/24px system-ui', textAlign: 'center', zIndex: 100000, boxShadow: '0 1px 3px rgba(0,0,0,.4)' });
    document.body.append(box, n); } }`;

const failed = [];
for (const s of SHOTS) {
  if (ONLY && !ONLY.split(',').includes(s.file)) continue;
  try {
    const [w, h] = s.size ?? [1440, 900];
    const [cookieName, cookieValue] = cookies.get(s.as ?? ACCOUNTS[0][0]) ?? [];
    if (!cookieName) throw new Error(`Chưa đăng nhập tài khoản ${s.as}`);
    await cdp('Network.setCookie', { name: cookieName, value: cookieValue, url: BASE });
    await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: BASE + s.path });
    await sleep(600);
    await waitFor(s.wait ?? '.main');
    for (const c of s.clicks ?? []) {
      await waitFor(c);
      await evaluate(`document.querySelector(${JSON.stringify(c)}).click()`);
      await sleep(500);
    }
    if (s.waitAfter) await waitFor(s.waitAfter);
    await sleep(s.delay ?? 700);
    await evaluate(`(${MARK})(${JSON.stringify(s.marks ?? [])})`);
    await sleep(100);
    let clip;
    if (s.clip) {
      const r = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(s.clip)}).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
      const pad = 16;
      clip = { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: Math.min(w, r.width + pad * 2), height: Math.min(h, r.height + pad * 2), scale: 1 };
    }
    const { data } = await cdp('Page.captureScreenshot', { format: 'webp', quality: 82, ...(clip ? { clip } : {}) });
    fs.writeFileSync(path.join(OUT, s.file), Buffer.from(data, 'base64'));
    console.log('✓', s.file);
  } catch (e) {
    failed.push(s.file);
    console.log('✗', s.file, e.message);
  }
}
ws.close();
browser.kill();
if (failed.length) { console.log(`Lỗi ${failed.length} ảnh: ${failed.join(', ')}`); process.exitCode = 1; }
