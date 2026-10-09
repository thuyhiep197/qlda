import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api, refreshAll } from '../api';
import { useMe, useUsersBasic, hasPerm } from '../hooks';
import type { ProjectSummary } from '../types';
import { colorOf, lozengeOf, PROJECT_PRIORITIES, PROJECT_STATUSES, STAFF_POSITIONS } from '../util';
import { ProjectInfoFields, projectInfoOf, splitNames } from '../components/ProjectInfoFields';
import { Empty, Modal, Spinner, toast, toastError } from '../components/ui';

export default function Projects() {
  const { data: me } = useMe();
  const [archived, setArchived] = useState(false);
  const { data: projects, isLoading } = useQuery<ProjectSummary[]>({
    queryKey: ['projects', archived],
    queryFn: () => api.get(`/projects${archived ? '?archived=1' : ''}`),
  });
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('');
  const [statusF, setStatusF] = useState('');
  const [priorityF, setPriorityF] = useState('');

  const toggleArchive = async (p: ProjectSummary) => {
    const action = p.is_archived ? 'Khôi phục' : 'Lưu trữ';
    if (!confirm(`${action} dự án ${p.name}?${p.is_archived ? '' : ' Dự án sẽ bị ẩn khỏi danh sách của mọi người.'}`)) return;
    try {
      await api.post(`/projects/${p.key}/archive`, { archived: !p.is_archived });
      toast(`Đã ${action.toLowerCase()} dự án`);
      await refreshAll();
    } catch (e) { toastError(e); }
  };

  // Sắp: dự án đang chạy trước, chưa chạy (Chưa bắt đầu / chưa rõ trạng thái) sau; trong mỗi nhóm theo ưu tiên (Rất cao trước) rồi theo tên
  const rank = (v: string | null) => { const i = PROJECT_PRIORITIES.findIndex(([n]) => n === v); return i < 0 ? 99 : i; };
  const q = filter.trim().toLowerCase();
  const statusOf = (p: ProjectSummary) => p.project_status || p.status_auto || '';
  const notRunning = (p: ProjectSummary) => (!statusOf(p) || statusOf(p) === 'Chưa bắt đầu' ? 1 : 0);
  const list = projects
    ?.filter((p) => !q || [p.name, p.key, p.customer, p.ba, p.dev, p.tester, p.am].join(' ').toLowerCase().includes(q))
    .filter((p) => !statusF || statusOf(p) === (statusF === '-' ? '' : statusF))
    .filter((p) => !priorityF || (p.priority || '') === (priorityF === '-' ? '' : priorityF))
    .sort((a, b) => notRunning(a) - notRunning(b) || rank(a.priority) - rank(b.priority) || a.name.localeCompare(b.name, 'vi'));
  const canArchive = hasPerm(me, 'project.delete');

  return (
    <div className="page">
      <div className="page-head">
        <h1>Dự án</h1>
        <div className="spacer" />
        {hasPerm(me, 'project.delete') && <label className="check"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Xem dự án đã lưu trữ</label>}
        {hasPerm(me, 'project.create') && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Tạo dự án</button>}
      </div>
      <div className="filter-bar">
        <input className="filter-input" style={{ marginBottom: 0 }} placeholder="Lọc theo tên, mã, khách hàng, nhân sự" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <select value={statusF} className={statusF ? 'filter-on' : ''} onChange={(e) => setStatusF(e.target.value)}>
          <option value="">Trạng thái: Tất cả</option>
          {PROJECT_STATUSES.map(([n]) => <option key={n} value={n}>{n}</option>)}
          <option value="-">(Chưa xác định)</option>
        </select>
        <select value={priorityF} className={priorityF ? 'filter-on' : ''} onChange={(e) => setPriorityF(e.target.value)}>
          <option value="">Ưu tiên: Tất cả</option>
          {PROJECT_PRIORITIES.map(([n]) => <option key={n} value={n}>{n}</option>)}
          <option value="-">(Chưa có ưu tiên)</option>
        </select>
        {list && projects && <span className="muted small">{list.length}/{projects.length} dự án</span>}
      </div>
      {isLoading ? <Spinner /> : !list?.length ? (
        <Empty title={archived ? 'Không có dự án lưu trữ' : 'Chưa có dự án nào'}>
          {!me?.is_admin && <p className="muted">Liên hệ quản trị viên để được thêm vào dự án.</p>}
        </Empty>
      ) : (
        <div className="table-wrap">
        <table className="table table-projects">
          <thead>
            <tr><th>Tên dự án</th><th>Tên khách hàng</th><th>Ưu tiên</th><th>Trạng thái</th><th>BA/PM</th><th>Dev</th><th>Tester</th><th>AM</th><th>Loại</th>{canArchive && <th />}</tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td className="proj-name"><Link to={`/p/${p.key}`} className="row gap-sm" style={{ alignItems: 'flex-start' }}><span className="proj-dot" style={{ background: colorOf(p.key), flexShrink: 0 }}>{p.key.slice(0, 2)}</span> <b>{p.name}</b></Link></td>
                <td>{p.customer}</td>
                <td>{p.priority && <span className={lozengeOf(PROJECT_PRIORITIES, p.priority)}>{p.priority}</span>}</td>
                <td><ProjectStatus p={p} /></td>
                {STAFF_POSITIONS.map((sp) => <td key={sp.key} className="people">{splitNames(p[sp.field]).map((n) => <div key={n}>{n}</div>)}</td>)}
                <td>{p.type === 'scrum' ? 'Scrum' : 'Kanban'}</td>
                {canArchive && <td className="num"><button className="btn btn-subtle btn-sm" onClick={() => toggleArchive(p)}>{p.is_archived ? 'Khôi phục' : 'Lưu trữ'}</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      {creating && <CreateProjectModal onClose={() => setCreating(false)} />}
    </div>
  );
}

/** Trạng thái dự án: ghim tay (📌) hoặc tự tính theo giai đoạn Epic đang chạy (⚙, rê chuột xem lý do) */
function ProjectStatus({ p }: { p: ProjectSummary }) {
  const pinned = !!p.project_status;
  const v = p.project_status || p.status_auto;
  const tip = pinned ? 'Trạng thái ghim tay (đổi trong Cài đặt dự án → Thông tin chung; chọn "Tự động" để hệ thống tự cập nhật)' : `Tự động: ${p.status_reason}`;
  if (!v) return <span className="muted small" data-tip={tip}>⚙ Chưa xác định</span>;
  return <span className="nowrap" data-tip={tip}><span className={lozengeOf(PROJECT_STATUSES, v)}>{v}</span> <span className="muted small">{pinned ? '📌' : '⚙'}</span></span>;
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { data: users } = useUsersBasic();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [type, setType] = useState<'scrum' | 'kanban'>('scrum');
  const [lead, setLead] = useState(String(me?.id ?? ''));
  const [description, setDescription] = useState('');
  const [info, setInfo] = useState(projectInfoOf());

  const suggestKey = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'D')
    .split(/\s+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/projects', { name, key, type, lead_id: Number(lead), description, ...info });
      toast('Đã tạo dự án');
      await refreshAll();
      onClose();
      navigate(`/p/${key.toUpperCase()}`);
    } catch (err) { toastError(err); }
  };

  return (
    <Modal title="Tạo dự án" onClose={onClose} footer={<>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" form="create-project">Tạo dự án</button>
    </>}>
      <form id="create-project" onSubmit={submit} className="stack">
        <label className="field"><span>Tên dự án *</span>
          <input autoFocus value={name} required onChange={(e) => { setName(e.target.value); if (!keyTouched) setKey(suggestKey(e.target.value)); }} /></label>
        <label className="field"><span>Mã dự án * <small className="muted">(dùng làm tiền tố mã issue, VD: QLVB-12)</small></span>
          <input value={key} required pattern="[A-Za-z][A-Za-z0-9]{1,9}" onChange={(e) => { setKeyTouched(true); setKey(e.target.value.toUpperCase()); }} /></label>
        <div className="field"><span>Mô hình quản lý</span>
          <div className="choice-cards">
            <label className={`choice ${type === 'scrum' ? 'active' : ''}`}>
              <input type="radio" checked={type === 'scrum'} onChange={() => setType('scrum')} />
              <b>Scrum</b><span className="muted small">Làm việc theo sprint, có backlog, biểu đồ khối lượng còn lại, năng suất sprint</span>
            </label>
            <label className={`choice ${type === 'kanban' ? 'active' : ''}`}>
              <input type="radio" checked={type === 'kanban'} onChange={() => setType('kanban')} />
              <b>Kanban</b><span className="muted small">Luồng công việc liên tục, giới hạn việc đang thực hiện</span>
            </label>
          </div>
        </div>
        <label className="field"><span>Trưởng dự án <small className="muted">(tự được thêm vào dự án)</small></span>
          <select value={lead} onChange={(e) => setLead(e.target.value)}>
            {users?.map((u) => <option key={u.id} value={u.id}>{u.full_name} (@{u.username}){u.default_role_name ? ` · ${u.default_role_name}` : ''}</option>)}
          </select></label>
        <ProjectInfoFields value={info} onChange={setInfo} />
        <label className="field"><span>Mô tả</span>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      </form>
    </Modal>
  );
}
