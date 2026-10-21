import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-people-'));
const { migrate, run, get, all } = await import('./db.ts');
const { seedRoles } = await import('./permissions.ts');
const { checkPeople, peopleOf, savePeople, syncProjectMembers } = await import('./people.ts');
migrate();
seedRoles();

const dev = get<{ id: number }>("SELECT id FROM roles WHERE name = 'Dev'")!.id;
const user = (username: string, positions: string) =>
  run("INSERT INTO users(username, full_name, password_hash, default_role_id, positions) VALUES (?, ?, 'x', ?, ?)", username, username, dev, positions).id;
// Hai tài khoản cùng họ tên, khác vị trí — phân biệt theo id
const nhungBa = user('nhung_ba', 'ba_pm,tester'), nhungAm = user('nhung_am', 'am'), lead = user('lead', 'ba_pm'), coder = user('coder', 'dev');
run("UPDATE users SET full_name = 'Nguyễn Hồng Nhung' WHERE id IN (?, ?)", nhungBa, nhungAm);

test('each role only accepts accounts with the matching position', () => {
  assert.doesNotThrow(() => checkPeople([nhungAm], 'am'));
  assert.throws(() => checkPeople([nhungBa], 'am'), /AM phải là người có vị trí AM/);
  assert.doesNotThrow(() => checkPeople([nhungBa], 'ba'));
  assert.throws(() => checkPeople([coder], 'tester'), /Tester/);
  // Người đã được chọn từ trước được giữ dù nay khác vị trí
  assert.doesNotThrow(() => checkPeople([coder], 'tester', [coder]));
});

test('project members = people in the role fields (no project lead), kept in sync', () => {
  const p = run("INSERT INTO projects(key, name, type, lead_id) VALUES ('PX', 'Dự án X', 'scrum', ?)", lead).id;
  savePeople('project_people', 'project_id', p, { ba: [nhungBa], dev: [coder] });
  syncProjectMembers(p);
  const members = () => all<{ user_id: number }>('SELECT user_id FROM project_members WHERE project_id = ? ORDER BY user_id', p).map((x) => x.user_id);
  assert.deepEqual(members(), [nhungBa, coder].sort((a, b) => a - b)); // người tạo (lead_id) không còn tự là thành viên
  assert.deepEqual(peopleOf('project_people', 'project_id', p).ba?.map((x) => x.id), [nhungBa]);
  // Bỏ Dev → không còn là thành viên; vai trò không gửi lên (BA) giữ nguyên
  savePeople('project_people', 'project_id', p, { dev: [] });
  syncProjectMembers(p);
  assert.deepEqual(members(), [nhungBa]);
});
