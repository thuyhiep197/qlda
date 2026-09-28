import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, db } from './db.ts';

export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP = Number(process.env.BACKUP_KEEP || 14);

/** Sao lưu CSDL an toàn khi đang chạy (VACUUM INTO), giữ lại KEEP bản gần nhất. */
export function backupNow() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString();
  const file = path.join(BACKUP_DIR, `qlda-${d.slice(0, 10)}_${d.slice(11, 16).replace(':', '')}.db`);
  if (fs.existsSync(file)) fs.rmSync(file);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const old = fs.readdirSync(BACKUP_DIR).filter((f) => /^qlda-.*\.db$/.test(f)).sort().reverse().slice(KEEP);
  for (const f of old) fs.rmSync(path.join(BACKUP_DIR, f));
  return file;
}

export function scheduleBackups() {
  if (KEEP <= 0) return;
  const run = () => {
    try { console.log(`[backup] ${backupNow()}`); } catch (e) { console.error('[backup] lỗi:', e); }
  };
  setTimeout(run, 60_000);
  setInterval(run, 24 * 3600_000).unref();
}

// Chạy trực tiếp: npx tsx src/backup.ts
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  console.log(`Đã sao lưu: ${backupNow()}`);
}
