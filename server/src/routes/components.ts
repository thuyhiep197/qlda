/**
 * Mô-đun (Component theo Jira): chia issue theo phân hệ chức năng; mỗi mô-đun có BA phụ trách
 * (theo dõi toàn bộ issue của mô-đun, làm đầu mối nghiệp vụ và kiểm thử) và thuộc side Sở / Trường / Chung.
 */
import { Router } from 'express';
import { all, get, run, tx } from '../db.ts';
import { watch } from '../notify.ts';
import { badRequest, notFound } from '../permissions.ts';
import { loadProject } from './projects.ts';

const r = Router();
const SIDES = ['so', 'truong', 'chung'];

const checkSide = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null;
  if (!SIDES.includes(String(v))) throw badRequest('Side không hợp lệ');
  return String(v);
};
const checkLead = (projectId: number, v: unknown) => {
  if (v === null || v === undefined || v === '') return null;
  if (!get('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?', projectId, Number(v))) {
    throw badRequest('BA phụ trách phải là thành viên dự án');
  }
  return Number(v);
};
/** Thêm BA phụ trách vào người theo dõi của mọi issue trong mô-đun. */
const watchAll = (componentId: number, leadId: number | null) => {
  if (!leadId) return;
  for (const i of all<{ id: number }>('SELECT id FROM issues WHERE component_id = ?', componentId)) watch(i.id, [leadId]);
};

r.get('/:key/components', (req, res) => {
  const { project } = loadProject(req);
  res.json(all(`
    SELECT c.*, u.full_name AS lead_name,
      (SELECT COUNT(*) FROM issues i WHERE i.component_id = c.id AND i.type NOT IN ('epic','subtask')) AS issue_count,
      (SELECT COUNT(*) FROM issues i JOIN statuses s ON s.id = i.status_id
        WHERE i.component_id = c.id AND i.type NOT IN ('epic','subtask') AND s.category = 'done') AS done_count
    FROM components c LEFT JOIN users u ON u.id = c.lead_id
    WHERE c.project_id = ? ORDER BY c.position, c.id`, project.id));
});

r.post('/:key/components', (req, res) => {
  const { project } = loadProject(req, 'component.create');
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (!name) throw badRequest('Tên mô-đun không được để trống');
  if (get('SELECT 1 FROM components WHERE project_id = ? AND name = ?', project.id, name)) throw badRequest('Tên mô-đun đã tồn tại');
  const pos = (get<{ p: number | null }>('SELECT MAX(position) p FROM components WHERE project_id = ?', project.id)!.p ?? 0) + 1;
  const { id } = run('INSERT INTO components(project_id, name, description, side, lead_id, position) VALUES (?,?,?,?,?,?)',
    project.id, name, b.description || null, checkSide(b.side), checkLead(project.id, b.lead_id), pos);
  res.status(201).json(get('SELECT * FROM components WHERE id = ?', id));
});

r.patch('/:key/components/:id', (req, res) => {
  const { project } = loadProject(req, 'component.edit');
  const c = get('SELECT * FROM components WHERE id = ? AND project_id = ?', Number(req.params.id), project.id);
  if (!c) throw notFound('Không tìm thấy mô-đun');
  const b = req.body || {};
  const name = b.name !== undefined ? String(b.name).trim() : c.name;
  if (!name) throw badRequest('Tên mô-đun không được để trống');
  if (get('SELECT 1 FROM components WHERE project_id = ? AND name = ? AND id <> ?', project.id, name, c.id)) throw badRequest('Tên mô-đun đã tồn tại');
  const lead = b.lead_id !== undefined ? checkLead(project.id, b.lead_id) : c.lead_id;
  tx(() => {
    run('UPDATE components SET name = ?, description = ?, side = ?, lead_id = ?, position = ? WHERE id = ?',
      name, b.description !== undefined ? b.description || null : c.description,
      b.side !== undefined ? checkSide(b.side) : c.side, lead,
      b.position !== undefined ? Number(b.position) : c.position, c.id);
    if (lead !== c.lead_id) watchAll(c.id, lead);
  });
  res.json({ ok: true });
});

r.delete('/:key/components/:id', (req, res) => {
  const { project } = loadProject(req, 'component.delete');
  const c = get('SELECT * FROM components WHERE id = ? AND project_id = ?', Number(req.params.id), project.id);
  if (!c) throw notFound('Không tìm thấy mô-đun');
  // Issue của mô-đun được giữ lại, chỉ bỏ trống trường Mô-đun
  run('DELETE FROM components WHERE id = ?', c.id);
  res.json({ ok: true });
});

export default r;
