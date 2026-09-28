/** Phiên bản phát hành (Release / Fix version) theo Jira: gom issue theo đợt bàn giao, phát hành khi xong. */
import { Router } from 'express';
import { all, get, now, run, tx } from '../db.ts';
import { addHistory } from '../issues.ts';
import { badRequest, notFound } from '../permissions.ts';
import { loadProject } from './projects.ts';

const r = Router();

const checkDate = (v: unknown, label: string) => {
  if (v === null || v === undefined || v === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw badRequest(`${label} không hợp lệ`);
  return String(v);
};

r.get('/:key/versions', (req, res) => {
  const { project } = loadProject(req);
  res.json(all(`
    SELECT v.*,
      (SELECT COUNT(*) FROM issues i WHERE i.version_id = v.id AND i.type <> 'subtask') AS issue_count,
      (SELECT COUNT(*) FROM issues i JOIN statuses s ON s.id = i.status_id
        WHERE i.version_id = v.id AND i.type <> 'subtask' AND s.category = 'done') AS done_count,
      (SELECT COUNT(*) FROM issues i JOIN statuses s ON s.id = i.status_id
        WHERE i.version_id = v.id AND i.type <> 'subtask' AND s.category = 'inprogress') AS inprogress_count,
      (SELECT COALESCE(SUM(i.story_points), 0) FROM issues i WHERE i.version_id = v.id AND i.type <> 'subtask') AS points,
      (SELECT COALESCE(SUM(i.story_points), 0) FROM issues i JOIN statuses s ON s.id = i.status_id
        WHERE i.version_id = v.id AND i.type <> 'subtask' AND s.category = 'done') AS done_points
    FROM versions v WHERE v.project_id = ?
    ORDER BY CASE v.status WHEN 'unreleased' THEN 0 WHEN 'released' THEN 1 ELSE 2 END,
      v.release_date IS NULL, v.release_date, v.id`, project.id));
});

r.post('/:key/versions', (req, res) => {
  const { project } = loadProject(req, 'sprint.manage');
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (!name) throw badRequest('Tên phiên bản không được để trống');
  if (get('SELECT 1 FROM versions WHERE project_id = ? AND name = ?', project.id, name)) throw badRequest('Tên phiên bản đã tồn tại');
  const start = checkDate(b.start_date, 'Ngày bắt đầu'), release = checkDate(b.release_date, 'Ngày phát hành');
  if (start && release && release < start) throw badRequest('Ngày phát hành phải sau ngày bắt đầu');
  const { id } = run('INSERT INTO versions(project_id, name, description, start_date, release_date) VALUES (?,?,?,?,?)',
    project.id, name, b.description || null, start, release);
  res.status(201).json(get('SELECT * FROM versions WHERE id = ?', id));
});

function loadVersion(req: any) {
  const { project } = loadProject(req, 'sprint.manage');
  const v = get('SELECT * FROM versions WHERE id = ? AND project_id = ?', Number(req.params.id), project.id);
  if (!v) throw notFound('Không tìm thấy phiên bản');
  return { project, v };
}

r.patch('/:key/versions/:id', (req, res) => {
  const { project, v } = loadVersion(req);
  const b = req.body || {};
  const name = b.name !== undefined ? String(b.name).trim() : v.name;
  if (!name) throw badRequest('Tên phiên bản không được để trống');
  if (get('SELECT 1 FROM versions WHERE project_id = ? AND name = ? AND id <> ?', project.id, name, v.id)) throw badRequest('Tên phiên bản đã tồn tại');
  const start = b.start_date !== undefined ? checkDate(b.start_date, 'Ngày bắt đầu') : v.start_date;
  const release = b.release_date !== undefined ? checkDate(b.release_date, 'Ngày phát hành') : v.release_date;
  if (start && release && release < start) throw badRequest('Ngày phát hành phải sau ngày bắt đầu');
  let status = v.status;
  if (b.status !== undefined) {
    if (!['unreleased', 'released', 'archived'].includes(b.status)) throw badRequest('Trạng thái phiên bản không hợp lệ');
    status = b.status;
  }
  run('UPDATE versions SET name = ?, description = ?, start_date = ?, release_date = ?, status = ?, released_at = ? WHERE id = ?',
    name, b.description !== undefined ? b.description || null : v.description, start, release, status,
    status === 'released' ? v.released_at ?? now() : status === 'unreleased' ? null : v.released_at, v.id);
  res.json({ ok: true });
});

/** Phát hành: issue chưa xong được chuyển sang phiên bản khác (move_open_to) hoặc giữ nguyên. */
r.post('/:key/versions/:id/release', (req, res) => {
  const { project, v } = loadVersion(req);
  if (v.status !== 'unreleased') throw badRequest('Phiên bản đã phát hành hoặc đã lưu trữ');
  const moveTo = req.body?.move_open_to ? Number(req.body.move_open_to) : null;
  const target = moveTo ? get("SELECT * FROM versions WHERE id = ? AND project_id = ? AND status = 'unreleased'", moveTo, project.id) : null;
  if (moveTo && (!target || target.id === v.id)) throw badRequest('Phiên bản đích không hợp lệ');
  let moved = 0;
  tx(() => {
    if (target) {
      const open = all<{ id: number }>(`SELECT i.id FROM issues i JOIN statuses s ON s.id = i.status_id
        WHERE i.version_id = ? AND s.category <> 'done'`, v.id);
      for (const i of open) {
        run('UPDATE issues SET version_id = ?, updated_at = ? WHERE id = ?', target.id, now(), i.id);
        addHistory(i.id, req.user.id, 'version', v.id, target.id, v.name, target.name);
      }
      moved = open.length;
    }
    run("UPDATE versions SET status = 'released', released_at = ?, release_date = COALESCE(release_date, ?) WHERE id = ?",
      now(), now().slice(0, 10), v.id);
  });
  res.json({ ok: true, moved });
});

r.delete('/:key/versions/:id', (req, res) => {
  const { v } = loadVersion(req);
  tx(() => {
    for (const i of all<{ id: number }>('SELECT id FROM issues WHERE version_id = ?', v.id)) {
      addHistory(i.id, req.user.id, 'version', v.id, null, v.name, null);
    }
    run('UPDATE issues SET version_id = NULL WHERE version_id = ?', v.id);
    run('DELETE FROM versions WHERE id = ?', v.id);
  });
  res.json({ ok: true });
});

export default r;
